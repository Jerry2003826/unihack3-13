"""Client for Kibana Agent Builder APIs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

import httpx

from agentic_workflow_agent.config import Settings


@dataclass(slots=True)
class KibanaAgentBuilderClient:
    base_url: str
    api_key: str
    space_id: str | None = None
    timeout: float = 30.0
    _client: httpx.Client | None = None

    @classmethod
    def from_settings(cls, settings: Settings) -> "KibanaAgentBuilderClient":
        settings.require_kibana()
        return cls(
            base_url=settings.kibana_url or "",
            api_key=settings.kibana_api_key or "",
            space_id=settings.kibana_space_id,
            timeout=float(settings.elastic_request_timeout),
        )

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                timeout=self.timeout,
                headers={
                    "Authorization": f"ApiKey {self.api_key}",
                    "Content-Type": "application/json",
                    "kbn-xsrf": "true",
                },
            )
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()

    def create_agent(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/agent_builder/agents", json=dict(payload))

    def list_agents(self) -> dict[str, Any]:
        return self._request("GET", "/api/agent_builder/agents")

    def get_agent(self, agent_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/agent_builder/agents/{agent_id}")

    def converse(
        self,
        message: str,
        *,
        agent_id: str = "elastic-ai-agent",
        conversation_id: str | None = None,
        connector_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "input": message,
            "agent_id": agent_id,
        }
        if conversation_id:
            payload["conversation_id"] = conversation_id
        if connector_id:
            payload["connector_id"] = connector_id
        return self._request("POST", "/api/agent_builder/converse", json=payload)

    def extract_response_text(self, response: Mapping[str, Any]) -> str:
        body = response.get("response", {})
        if isinstance(body, dict):
            message = body.get("message")
            if isinstance(message, str):
                return message
        return ""

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        prefix = f"/s/{self.space_id}" if self.space_id else ""
        url = f"{self.base_url.rstrip('/')}{prefix}{path}"
        response = self.client.request(method, url, **kwargs)
        response.raise_for_status()
        return dict(response.json())
