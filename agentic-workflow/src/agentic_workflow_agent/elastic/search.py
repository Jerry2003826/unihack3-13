"""Search services for BM25, vector, and hybrid retrieval."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from agentic_workflow_agent.elastic.embeddings import EmbeddingClient
from agentic_workflow_agent.schemas import SearchHit

SearchMode = Literal["bm25", "vector", "hybrid"]


class SearchStore(Protocol):
    def search(self, index_name: str, body: dict[str, object]) -> dict[str, object]: ...


@dataclass(slots=True)
class ElasticSearchService:
    store: SearchStore
    embedding_client: EmbeddingClient | None = None
    default_top_k: int = 5

    def search(
        self,
        index_name: str,
        query: str,
        *,
        top_k: int | None = None,
        mode: SearchMode = "hybrid",
    ) -> list[SearchHit]:
        limit = top_k or self.default_top_k
        if mode == "bm25":
            return self.bm25_search(index_name, query, top_k=limit)
        if mode == "vector":
            return self.vector_search(index_name, query, top_k=limit)
        return self.hybrid_search(index_name, query, top_k=limit)

    def bm25_search(self, index_name: str, query: str, *, top_k: int) -> list[SearchHit]:
        body = {
            "size": top_k,
            "query": {
                "multi_match": {
                    "query": query,
                    "fields": ["title^3", "summary^2", "content", "tags^2", "service"],
                    "type": "best_fields",
                }
            },
        }
        response = self.store.search(index_name, body)
        return self._parse_hits(index_name, response)

    def vector_search(self, index_name: str, query: str, *, top_k: int) -> list[SearchHit]:
        if self.embedding_client is None:
            raise RuntimeError("Vector search requested but no embedding client is configured.")
        vector = self.embedding_client.embed_text(query)
        body = {
            "size": top_k,
            "knn": {
                "field": "embedding",
                "query_vector": vector,
                "k": top_k,
                "num_candidates": max(top_k * 4, 20),
            },
        }
        response = self.store.search(index_name, body)
        return self._parse_hits(index_name, response)

    def hybrid_search(self, index_name: str, query: str, *, top_k: int) -> list[SearchHit]:
        bm25_hits = self.bm25_search(index_name, query, top_k=top_k)
        if self.embedding_client is None:
            return bm25_hits
        vector_hits = self.vector_search(index_name, query, top_k=top_k)
        return reciprocal_rank_fusion([bm25_hits, vector_hits], top_k=top_k)

    def format_hits(self, hits: list[SearchHit]) -> str:
        if not hits:
            return "No search results found."
        lines: list[str] = []
        for position, hit in enumerate(hits, start=1):
            excerpt = hit.content.strip().replace("\n", " ")
            excerpt = excerpt[:280] + ("..." if len(excerpt) > 280 else "")
            lines.extend(
                [
                    f"{position}. {hit.title} [{hit.doc_id}] score={hit.score:.3f}",
                    f"   summary: {hit.summary or 'n/a'}",
                    f"   excerpt: {excerpt}",
                ]
            )
            if hit.metadata:
                lines.append(f"   metadata: {hit.metadata}")
        return "\n".join(lines)

    def _parse_hits(self, index_name: str, response: dict[str, object]) -> list[SearchHit]:
        raw_hits = response.get("hits", {}) if isinstance(response, dict) else {}
        entries = raw_hits.get("hits", []) if isinstance(raw_hits, dict) else []
        hits: list[SearchHit] = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            source = entry.get("_source", {})
            if not isinstance(source, dict):
                source = {}
            metadata = {
                key: value
                for key, value in source.items()
                if key not in {"title", "content", "summary", "embedding"}
            }
            hits.append(
                SearchHit(
                    index_name=index_name,
                    doc_id=str(entry.get("_id", "")),
                    score=float(entry.get("_score") or 0.0),
                    title=str(source.get("title", "")),
                    content=str(source.get("content", "")),
                    summary=source.get("summary"),
                    metadata=metadata,
                )
            )
        return hits


def reciprocal_rank_fusion(
    result_sets: list[list[SearchHit]],
    *,
    top_k: int,
    rank_constant: int = 60,
) -> list[SearchHit]:
    scores: dict[str, float] = {}
    canonical: dict[str, SearchHit] = {}
    for hits in result_sets:
        for rank, hit in enumerate(hits, start=1):
            key = f"{hit.index_name}:{hit.doc_id}"
            scores[key] = scores.get(key, 0.0) + 1.0 / (rank_constant + rank)
            canonical.setdefault(key, hit)
    fused = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:top_k]
    return [canonical[key].model_copy(update={"score": score}) for key, score in fused]
