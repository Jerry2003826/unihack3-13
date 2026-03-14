"""Embedding helpers for optional vector retrieval."""

from __future__ import annotations

from typing import Protocol, Sequence

from agentic_workflow_agent.config import Settings


class EmbeddingClient(Protocol):
    """Minimal embedding client contract."""

    def embed_text(self, text: str) -> list[float]: ...

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]: ...


class OpenAIEmbeddingClient:
    """Embedding client backed by the OpenAI embeddings API."""

    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - depends on runtime environment
            raise RuntimeError("openai is not installed.") from exc

        self._client = OpenAI(api_key=api_key, base_url=base_url or None)
        self.model = model

    def embed_text(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        response = self._client.embeddings.create(model=self.model, input=list(texts))
        return [list(item.embedding) for item in response.data]


def build_embedding_client(settings: Settings) -> EmbeddingClient | None:
    if not settings.embedding_enabled:
        return None
    return OpenAIEmbeddingClient(
        api_key=settings.openai_api_key or "",
        model=settings.openai_embedding_model,
        base_url=settings.openai_base_url,
    )
