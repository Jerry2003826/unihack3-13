"""Configuration loading and validation."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Callable, Mapping


class ConfigurationError(ValueError):
    """Raised when the project configuration is incomplete or invalid."""


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: str | None, default: int) -> int:
    if value is None or value.strip() == "":
        return default
    return int(value)


@dataclass(slots=True)
class Settings:
    elastic_cloud_id: str | None
    elastic_url: str | None
    elastic_api_key: str | None
    elastic_username: str | None
    elastic_password: str | None
    elastic_verify_certs: bool
    elastic_request_timeout: int
    knowledge_base_index: str
    incident_index: str
    search_top_k: int
    max_agent_iterations: int
    hybrid_search_enabled: bool
    openai_api_key: str | None
    openai_base_url: str | None
    openai_chat_model: str
    openai_embedding_model: str
    openai_embedding_dimensions: int | None
    kibana_url: str | None
    kibana_api_key: str | None
    kibana_space_id: str | None
    elastic_agent_id: str
    trace_enabled: bool
    llm_request_timeout: int
    llm_max_retries: int

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        """Build settings from environment variables with sensible defaults."""
        source = dict(os.environ if env is None else env)
        _dim_raw = source.get("OPENAI_EMBEDDING_DIMENSIONS")
        _dim = int(_dim_raw) if _dim_raw and _dim_raw.strip() else None
        settings = cls(
            elastic_cloud_id=source.get("ELASTIC_CLOUD_ID") or None,
            elastic_url=source.get("ELASTIC_URL") or None,
            elastic_api_key=source.get("ELASTIC_API_KEY") or None,
            elastic_username=source.get("ELASTIC_USERNAME") or None,
            elastic_password=source.get("ELASTIC_PASSWORD") or None,
            elastic_verify_certs=_parse_bool(source.get("ELASTIC_VERIFY_CERTS"), True),
            elastic_request_timeout=_parse_int(source.get("ELASTIC_REQUEST_TIMEOUT"), 30),
            knowledge_base_index=source.get("KNOWLEDGE_BASE_INDEX", "agentic-kb"),
            incident_index=source.get("INCIDENT_INDEX", "agentic-incidents"),
            search_top_k=_parse_int(source.get("SEARCH_TOP_K"), 5),
            max_agent_iterations=_parse_int(source.get("MAX_AGENT_ITERATIONS"), 15),
            hybrid_search_enabled=_parse_bool(source.get("HYBRID_SEARCH_ENABLED"), False),
            openai_api_key=source.get("OPENAI_API_KEY") or None,
            openai_base_url=source.get("OPENAI_BASE_URL") or None,
            openai_chat_model=source.get("OPENAI_CHAT_MODEL", "glm-5"),
            openai_embedding_model=source.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
            openai_embedding_dimensions=_dim,
            kibana_url=source.get("KIBANA_URL") or None,
            kibana_api_key=source.get("KIBANA_API_KEY") or None,
            kibana_space_id=source.get("KIBANA_SPACE_ID") or None,
            elastic_agent_id=source.get("ELASTIC_AGENT_ID", "elastic-ai-agent"),
            trace_enabled=_parse_bool(source.get("TRACE_ENABLED"), True),
            llm_request_timeout=_parse_int(source.get("LLM_REQUEST_TIMEOUT"), 120),
            llm_max_retries=_parse_int(source.get("LLM_MAX_RETRIES"), 3),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if not self.elastic_cloud_id and not self.elastic_url:
            raise ConfigurationError("Set ELASTIC_CLOUD_ID or ELASTIC_URL.")
        if not self.elastic_api_key and not (self.elastic_username and self.elastic_password):
            raise ConfigurationError("Set ELASTIC_API_KEY or ELASTIC_USERNAME/ELASTIC_PASSWORD.")
        if self.search_top_k < 1:
            raise ConfigurationError("SEARCH_TOP_K must be greater than 0.")
        if self.max_agent_iterations < 1:
            raise ConfigurationError("MAX_AGENT_ITERATIONS must be greater than 0.")
        if self.openai_embedding_dimensions is not None and self.openai_embedding_dimensions < 1:
            raise ConfigurationError("OPENAI_EMBEDDING_DIMENSIONS must be greater than 0.")

    @property
    def llm_enabled(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def embedding_enabled(self) -> bool:
        return bool(self.openai_api_key and self.openai_embedding_model)

    @property
    def kibana_enabled(self) -> bool:
        return bool(self.kibana_url and self.kibana_api_key)

    def elastic_client_options(self) -> dict[str, object]:
        options: dict[str, object] = {
            "verify_certs": self.elastic_verify_certs,
            "request_timeout": self.elastic_request_timeout,
        }
        if self.elastic_cloud_id:
            options["cloud_id"] = self.elastic_cloud_id
        elif self.elastic_url:
            options["hosts"] = [self.elastic_url]

        if self.elastic_api_key:
            options["api_key"] = self.elastic_api_key
        else:
            options["basic_auth"] = (self.elastic_username or "", self.elastic_password or "")
        return options

    def require_llm(self) -> None:
        if not self.llm_enabled:
            raise ConfigurationError("OPENAI_API_KEY is required for the agent loop.")

    def require_kibana(self) -> None:
        if not self.kibana_enabled:
            raise ConfigurationError("KIBANA_URL and KIBANA_API_KEY are required.")


def load_settings(env_file: str | Path | None = None) -> Settings:
    """Load environment variables and construct a validated Settings object."""

    dotenv_loader: Callable[..., bool] | None
    try:
        from dotenv import load_dotenv as dotenv_loader
    except ImportError:
        dotenv_loader = None

    if env_file:
        env_path = Path(env_file)
        if env_path.exists():
            if dotenv_loader is None:  # pragma: no cover - exercised in integration use
                raise ConfigurationError("python-dotenv is not installed.")
            dotenv_loader(env_path, override=False)
    else:
        default_file = Path(".env")
        if default_file.exists():
            if dotenv_loader is not None:
                dotenv_loader(default_file, override=False)
    return Settings.from_env()
