import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecipheriv, createHash } from 'node:crypto';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const payloadDir=path.join(ROOT,'payload');
const keyHex=process.env.BUNDLE_KEY;
if(!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error('BUNDLE_KEY missing or invalid');
const files=['part00','part01','part02','part03a','part03b','part04','part05','part06a','part06b','part07'];
for(const f of files){ if(!fs.existsSync(path.join(payloadDir,f))) throw new Error(`Encrypted payload part missing: ${f}`); }
const b64=files.map(f=>fs.readFileSync(path.join(payloadDir,f),'utf8')).join('');
const blob=Buffer.from(b64,'base64');
if(blob.subarray(0,4).toString()!=='EKI1') throw new Error('Invalid encrypted bundle header');
const nonce=blob.subarray(4,16);
const encrypted=blob.subarray(16);
const tag=encrypted.subarray(encrypted.length-16);
const ciphertext=encrypted.subarray(0,encrypted.length-16);
const key=Buffer.from(keyHex,'hex');
const d=createDecipheriv('aes-256-gcm',key,nonce);
d.setAAD(Buffer.from('EKATMA-INTELLIGENCE-OS-V2'));
d.setAuthTag(tag);
const plain=Buffer.concat([d.update(ciphertext),d.final()]);
const sha=createHash('sha256').update(plain).digest('hex');
if(sha!=='80d6549680998a74bc941a50778dddf9fab6a44ba9a9b8d627f0b099d0ca359e') throw new Error('Bundle integrity check failed');
fs.writeFileSync(path.join(ROOT,'bundle.tgz'),plain);
console.log('Encrypted Ekatma base bundle verified and decrypted.');
