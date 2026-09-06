// Compatibility shim: server.mjs still imports polishWithGemini, but the active
// production composer is OpenRouter. Gemini is no longer used for final answers.
export { polishWithOpenRouter as polishWithGemini } from './openrouter-composer.mjs';
