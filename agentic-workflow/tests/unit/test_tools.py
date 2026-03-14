from __future__ import annotations

from typing import Mapping

from agentic_workflow_agent.agent.tools import build_default_tools
from agentic_workflow_agent.config import Settings


class FakeSearchService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, int | None, str]] = []

    def search(
        self, index_name: str, query: str, *, top_k: int | None = None, mode: str = "hybrid"
    ) -> list[str]:
        self.calls.append((index_name, query, top_k, mode))
        return [f"{index_name}:{query}:{top_k}:{mode}"]

    def format_hits(self, hits: list[str]) -> str:
        return "|".join(hits)


class FakeStore:
    def get_document(self, index_name: str, doc_id: str) -> dict[str, str]:
        return {"index_name": index_name, "doc_id": doc_id}


class FakeKibanaClient:
    def converse(
        self,
        message: str,
        *,
        agent_id: str,
        conversation_id: str | None = None,
        connector_id: str | None = None,
    ) -> dict[str, object]:
        return {
            "conversation_id": conversation_id or "conv-1",
            "response": {"message": f"{agent_id}:{message}"},
            "steps": [],
        }

    def extract_response_text(self, response: Mapping[str, object]) -> str:
        payload = response.get("response")
        assert isinstance(payload, dict)
        return str(payload["message"])


def build_settings() -> Settings:
    return Settings.from_env(
        {
            "ELASTIC_URL": "http://localhost:9200",
            "ELASTIC_API_KEY": "token",
            "KIBANA_URL": "http://localhost:5601",
            "KIBANA_API_KEY": "kibana-token",
        }
    )


def test_build_default_tools_exposes_expected_handlers() -> None:
    settings = build_settings()
    search_service = FakeSearchService()
    tools = build_default_tools(
        settings,
        search_service,
        FakeStore(),
        FakeKibanaClient(),
    )

    output = tools["search_knowledge_base"].run(
        {"query": "disk watermark", "top_k": 2, "mode": "bm25"}
    )

    assert "agentic-kb:disk watermark:2:bm25" in output
    assert "invoke_elastic_agent" in tools


def test_get_document_tool_resolves_index_alias() -> None:
    settings = build_settings()
    tools = build_default_tools(settings, FakeSearchService(), FakeStore())

    output = tools["get_document"].run({"index_name": "incidents", "doc_id": "inc-003"})

    assert '"index_name": "agentic-incidents"' in output
    assert '"doc_id": "inc-003"' in output


def test_invoke_elastic_agent_tool_returns_response_payload() -> None:
    settings = build_settings()
    tools = build_default_tools(
        settings,
        FakeSearchService(),
        FakeStore(),
        FakeKibanaClient(),
    )

    output = tools["invoke_elastic_agent"].run({"message": "triage this issue"})

    assert "elastic-ai-agent:triage this issue" in output
