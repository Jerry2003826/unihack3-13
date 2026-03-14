from __future__ import annotations

import pytest

from agentic_workflow_agent.config import ConfigurationError, Settings


def test_settings_require_connection_target() -> None:
    with pytest.raises(ConfigurationError):
        Settings.from_env({"ELASTIC_API_KEY": "token"})


def test_settings_require_authentication() -> None:
    with pytest.raises(ConfigurationError):
        Settings.from_env({"ELASTIC_URL": "http://localhost:9200"})


def test_settings_build_elastic_client_options() -> None:
    settings = Settings.from_env(
        {
            "ELASTIC_URL": "http://localhost:9200",
            "ELASTIC_API_KEY": "token",
            "SEARCH_TOP_K": "7",
            "MAX_AGENT_ITERATIONS": "3",
            "HYBRID_SEARCH_ENABLED": "false",
            "OPENAI_EMBEDDING_DIMENSIONS": "1536",
        }
    )

    assert settings.search_top_k == 7
    assert settings.max_agent_iterations == 3
    assert settings.hybrid_search_enabled is False
    assert settings.openai_embedding_dimensions == 1536
    assert settings.elastic_client_options() == {
        "hosts": ["http://localhost:9200"],
        "api_key": "token",
        "verify_certs": True,
        "request_timeout": 30,
    }
