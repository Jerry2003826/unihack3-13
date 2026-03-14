from __future__ import annotations

from collections.abc import Sequence

from agentic_workflow_agent.elastic.search import ElasticSearchService


class FakeEmbeddingClient:
    def embed_text(self, text: str) -> list[float]:
        return [0.1, 0.2, 0.3]

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        return [[0.1, 0.2, 0.3] for _ in texts]


class FakeStore:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def search(self, index_name: str, body: dict[str, object]) -> dict[str, object]:
        self.calls.append(body)
        if "knn" in body:
            return {
                "hits": {
                    "hits": [
                        {
                            "_id": "doc-b",
                            "_score": 0.9,
                            "_source": {
                                "title": "Vector result",
                                "content": "Vector match content",
                                "summary": "vector summary",
                                "service": "elasticsearch",
                            },
                        },
                        {
                            "_id": "doc-a",
                            "_score": 0.8,
                            "_source": {
                                "title": "Shared result",
                                "content": "Shared vector content",
                                "summary": "shared summary",
                                "service": "elasticsearch",
                            },
                        },
                    ]
                }
            }
        return {
            "hits": {
                "hits": [
                    {
                        "_id": "doc-a",
                        "_score": 2.0,
                        "_source": {
                            "title": "Shared result",
                            "content": "Shared bm25 content",
                            "summary": "shared summary",
                            "service": "elasticsearch",
                        },
                    },
                    {
                        "_id": "doc-c",
                        "_score": 1.0,
                        "_source": {
                            "title": "BM25 result",
                            "content": "BM25 match content",
                            "summary": "bm25 summary",
                            "service": "kibana",
                        },
                    },
                ]
            }
        }


def test_bm25_search_uses_multi_match_query() -> None:
    store = FakeStore()
    service = ElasticSearchService(store=store, default_top_k=3)

    hits = service.bm25_search("agentic-kb", "red cluster", top_k=3)

    assert len(hits) == 2
    query_body = store.calls[0].get("query")
    assert isinstance(query_body, dict)
    assert "multi_match" in query_body
    assert hits[0].doc_id == "doc-a"


def test_hybrid_search_uses_rrf_when_embeddings_available() -> None:
    store = FakeStore()
    service = ElasticSearchService(
        store=store,
        embedding_client=FakeEmbeddingClient(),
        default_top_k=2,
    )

    hits = service.hybrid_search("agentic-kb", "red cluster", top_k=2)

    assert [hit.doc_id for hit in hits] == ["doc-a", "doc-b"]
    assert len(store.calls) == 2
    assert "knn" in store.calls[1]


def test_format_hits_renders_readable_output() -> None:
    store = FakeStore()
    service = ElasticSearchService(store=store, default_top_k=2)
    hits = service.bm25_search("agentic-kb", "red cluster", top_k=2)

    rendered = service.format_hits(hits)

    assert "Shared result [doc-a]" in rendered
    assert "metadata:" in rendered
