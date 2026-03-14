"""Index creation and demo data loading helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from agentic_workflow_agent.config import Settings
from agentic_workflow_agent.elastic.embeddings import EmbeddingClient
from agentic_workflow_agent.elastic.es_client import ElasticStore
from agentic_workflow_agent.schemas import IndexedDocument


def build_index_mapping(vector_dimensions: int | None = None) -> dict[str, object]:
    properties: dict[str, object] = {
        "title": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
        "content": {"type": "text"},
        "summary": {"type": "text"},
        "tags": {"type": "keyword"},
        "severity": {"type": "keyword"},
        "service": {"type": "keyword"},
        "timestamp": {"type": "date"},
        "source": {"type": "keyword"},
        "metadata": {"type": "object", "enabled": True},
    }
    if vector_dimensions:
        properties["embedding"] = {
            "type": "dense_vector",
            "dims": vector_dimensions,
            "index": True,
            "similarity": "cosine",
        }
    return {
        "dynamic": True,
        "properties": properties,
    }


def bootstrap_default_indices(
    store: ElasticStore,
    settings: Settings,
    vector_dimensions: int | None = None,
) -> dict[str, bool]:
    mapping = build_index_mapping(vector_dimensions=vector_dimensions)
    return {
        settings.knowledge_base_index: store.ensure_index(
            settings.knowledge_base_index,
            mappings=mapping,
        ),
        settings.incident_index: store.ensure_index(
            settings.incident_index,
            mappings=mapping,
        ),
    }


def load_jsonl_documents(path: str | Path) -> list[IndexedDocument]:
    documents: list[IndexedDocument] = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            documents.append(IndexedDocument.model_validate(payload))
    return documents


def enrich_documents_with_embeddings(
    documents: Iterable[IndexedDocument],
    embedding_client: EmbeddingClient,
) -> list[IndexedDocument]:
    docs = list(documents)
    vectors = embedding_client.embed_texts([doc.searchable_text() for doc in docs])
    enriched: list[IndexedDocument] = []
    for document, vector in zip(docs, vectors, strict=True):
        enriched.append(document.model_copy(update={"embedding": vector}))
    return enriched
