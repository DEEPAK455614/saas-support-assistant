import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class KnowledgeDocument:
    id: str
    title: str
    content: str


class KnowledgeBaseError(RuntimeError):
    pass


def load_knowledge_base(path: Path) -> list[KnowledgeDocument]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise KnowledgeBaseError(f"Unable to load knowledge base: {exc}") from exc

    if not isinstance(raw, list) or len(raw) < 5:
        raise KnowledgeBaseError("Knowledge base must contain at least 5 entries")

    documents: list[KnowledgeDocument] = []
    for item in raw:
        if not all(isinstance(item.get(k), str) and item[k].strip() for k in ("id", "title", "content")):
            raise KnowledgeBaseError("Each knowledge-base entry needs non-empty id, title and content")
        documents.append(KnowledgeDocument(item["id"], item["title"], item["content"]))
    return documents
