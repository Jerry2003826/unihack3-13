from __future__ import annotations

import pytest

from agentic_workflow_agent import cli
from agentic_workflow_agent.cli import resolve_embedding_dimensions
from agentic_workflow_agent.config import Settings


class FakeEmbeddingClient:
    def __init__(self, dimensions: int) -> None:
        self.dimensions = dimensions

    def embed_text(self, text: str) -> list[float]:
        return [0.1] * self.dimensions


class FakeKibanaClient:
    def __init__(self) -> None:
        self.closed = False
        self.messages: list[tuple[str, str, str | None, str | None]] = []

    def close(self) -> None:
        self.closed = True

    def list_agents(self) -> dict[str, object]:
        return {
            "results": [
                {
                    "id": "elastic-ai-agent",
                    "name": "Elastic AI Agent",
                    "description": "Default helper",
                }
            ]
        }

    def converse(
        self,
        message: str,
        *,
        agent_id: str,
        conversation_id: str | None = None,
        connector_id: str | None = None,
    ) -> dict[str, object]:
        self.messages.append((message, agent_id, conversation_id, connector_id))
        return {"response": {"message": f"{agent_id}:{message}"}}

    def extract_response_text(self, response: dict[str, object]) -> str:
        payload = response.get("response")
        assert isinstance(payload, dict)
        return str(payload["message"])


def build_settings(extra: dict[str, str] | None = None) -> Settings:
    env = {
        "ELASTIC_URL": "http://localhost:9200",
        "ELASTIC_API_KEY": "token",
        "OPENAI_API_KEY": "test-key",
    }
    env.update(extra or {})
    return Settings.from_env(env)


def test_resolve_embedding_dimensions_prefers_configured_value() -> None:
    settings = build_settings({"OPENAI_EMBEDDING_DIMENSIONS": "1024"})

    dimensions = resolve_embedding_dimensions(settings, FakeEmbeddingClient(1536))

    assert dimensions == 1024


def test_resolve_embedding_dimensions_probes_client_when_missing_config() -> None:
    settings = build_settings()

    dimensions = resolve_embedding_dimensions(settings, FakeEmbeddingClient(768))

    assert dimensions == 768


def test_resolve_embedding_dimensions_requires_client_without_config() -> None:
    settings = build_settings()

    with pytest.raises(RuntimeError):
        resolve_embedding_dimensions(settings, None)


def test_list_elastic_agents_command_prints_agents(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_client = FakeKibanaClient()
    settings = build_settings(
        {
            "KIBANA_URL": "https://example.kb",
            "KIBANA_API_KEY": "kb-key",
        }
    )
    monkeypatch.setattr(
        cli.KibanaAgentBuilderClient,
        "from_settings",
        classmethod(lambda cls, settings: fake_client),
    )

    exit_code = cli.list_elastic_agents_command(settings)

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "elastic-ai-agent" in captured.out
    assert fake_client.closed is True


def test_invoke_elastic_agent_command_prints_response(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_client = FakeKibanaClient()
    settings = build_settings(
        {
            "KIBANA_URL": "https://example.kb",
            "KIBANA_API_KEY": "kb-key",
            "ELASTIC_AGENT_ID": "elastic-ai-agent",
        }
    )
    monkeypatch.setattr(
        cli.KibanaAgentBuilderClient,
        "from_settings",
        classmethod(lambda cls, settings: fake_client),
    )

    exit_code = cli.invoke_elastic_agent_command(
        settings,
        message="summarize this incident",
        agent_id=None,
        conversation_id="conv-123",
        connector_id="connector-1",
    )

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "elastic-ai-agent:summarize this incident" in captured.out
    assert fake_client.messages == [
        ("summarize this incident", "elastic-ai-agent", "conv-123", "connector-1")
    ]
    assert fake_client.closed is True
