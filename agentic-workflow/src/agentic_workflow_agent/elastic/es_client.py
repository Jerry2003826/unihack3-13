"""Low-level Elasticsearch client and store wrapper."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any, cast

from agentic_workflow_agent.config import Settings
from agentic_workflow_agent.schemas import IndexedDocument


def create_elasticsearch_client(settings: Settings) -> Any:
    """Construct an Elasticsearch client from validated settings."""

    try:
        from elasticsearch import Elasticsearch
    except ImportError as exc:  # pragma: no cover - depends on runtime environment
        raise RuntimeError("elasticsearch is not installed.") from exc
    return Elasticsearch(**cast(Any, settings.elastic_client_options()))


class ElasticStore:
    """Small wrapper around the Elasticsearch Python client."""

    def __init__(self, client: Any) -> None:
        self.client = client

    @classmethod
    def from_settings(cls, settings: Settings) -> "ElasticStore":
        return cls(create_elasticsearch_client(settings))

    def ping(self) -> bool:
        return bool(self.client.ping())

    def index_exists(self, index_name: str) -> bool:
        return bool(self.client.indices.exists(index=index_name))

    def ensure_index(
        self,
        index_name: str,
        mappings: dict[str, object],
        settings: dict[str, object] | None = None,
    ) -> bool:
        if self.index_exists(index_name):
            return False
        self.client.indices.create(
            index=index_name,
            mappings=mappings,
            settings=settings or {},
        )
        return True

    def bulk_index(self, index_name: str, documents: Iterable[IndexedDocument]) -> int:
        docs = list(documents)
        if not docs:
            return 0
        try:
            from elasticsearch.helpers import bulk
        except ImportError as exc:  # pragma: no cover - depends on runtime environment
            raise RuntimeError("elasticsearch is not installed.") from exc

        actions = [
            {
                "_op_type": "index",
                "_index": index_name,
                "_id": document.doc_id,
                "_source": document.model_dump(exclude_none=True, exclude={"doc_id"}),
            }
            for document in docs
        ]
        indexed_count, _ = bulk(self.client, actions)
        return int(indexed_count)

    def search(self, index_name: str, body: dict[str, object]) -> dict[str, Any]:
        return dict(self.client.search(index=index_name, body=body))

    def get_document(self, index_name: str, doc_id: str) -> dict[str, Any]:
        response = self.client.get(index=index_name, id=doc_id)
        return dict(response["_source"])
