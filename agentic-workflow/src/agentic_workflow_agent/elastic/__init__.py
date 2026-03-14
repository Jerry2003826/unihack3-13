"""Elasticsearch integration helpers."""

from .embeddings import EmbeddingClient, OpenAIEmbeddingClient, build_embedding_client
from .es_client import ElasticStore, create_elasticsearch_client
from .indexing import (
    bootstrap_default_indices,
    enrich_documents_with_embeddings,
    load_jsonl_documents,
)
from .search import ElasticSearchService, SearchMode

__all__ = [
    "ElasticSearchService",
    "ElasticStore",
    "EmbeddingClient",
    "OpenAIEmbeddingClient",
    "SearchMode",
    "bootstrap_default_indices",
    "build_embedding_client",
    "create_elasticsearch_client",
    "enrich_documents_with_embeddings",
    "load_jsonl_documents",
]
