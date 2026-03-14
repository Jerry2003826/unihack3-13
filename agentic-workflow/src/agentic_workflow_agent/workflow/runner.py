"""Execution engine for the demo YAML workflows."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol

import yaml

from agentic_workflow_agent.config import Settings
from agentic_workflow_agent.elastic.search import SearchMode
from agentic_workflow_agent.workflow.models import WorkflowDefinition, WorkflowStep


class SearchWorkflowRuntime(Protocol):
    def search(
        self,
        index_name: str,
        query: str,
        *,
        top_k: int | None = None,
        mode: SearchMode = "hybrid",
    ) -> list[Any]: ...

    def format_hits(self, hits: list[Any]) -> str: ...


class AgentResultLike(Protocol):
    answer: str


class AgentRuntime(Protocol):
    def run(self, prompt: str) -> AgentResultLike: ...


class KibanaWorkflowRuntime(Protocol):
    def converse(
        self,
        message: str,
        *,
        agent_id: str,
        conversation_id: str | None = None,
        connector_id: str | None = None,
    ) -> dict[str, Any]: ...

    def extract_response_text(self, response: Mapping[str, Any]) -> str: ...


@dataclass(slots=True)
class WorkflowRunner:
    settings: Settings
    search_service: SearchWorkflowRuntime
    agent_loop: AgentRuntime
    kibana_client: KibanaWorkflowRuntime | None = None
    max_steps: int = 25

    def load_definition(self, path: str | Path) -> WorkflowDefinition:
        with Path(path).open("r", encoding="utf-8") as handle:
            payload = yaml.safe_load(handle)
        return WorkflowDefinition.model_validate(payload)

    def run_file(self, path: str | Path, user_input: str) -> str:
        definition = self.load_definition(path)
        return self.run(definition, user_input=user_input)

    def run(self, definition: WorkflowDefinition, *, user_input: str) -> str:
        context: dict[str, Any] = {"input": user_input, "last_output": ""}
        step_map = {step.id: step for step in definition.steps}
        current_step_id = definition.entrypoint

        for _ in range(self.max_steps):
            step = step_map[current_step_id]
            output, next_step_id = self._execute_step(step, context)
            context["last_output"] = output
            if step.save_as:
                context[step.save_as] = output
            if step.type == "final":
                return output
            if not next_step_id:
                return output
            current_step_id = next_step_id

        raise RuntimeError("Workflow exceeded the maximum allowed number of steps.")

    def _execute_step(
        self,
        step: WorkflowStep,
        context: dict[str, Any],
    ) -> tuple[str, str | None]:
        if step.type == "search":
            query = self._render(step.query or "{input}", context)
            hits = self.search_service.search(
                index_name=self._resolve_index_name(step.index or "knowledge_base"),
                query=query,
                top_k=step.top_k,
                mode=step.mode,
            )
            return self.search_service.format_hits(hits), step.next

        if step.type == "agent":
            prompt = self._render(step.prompt or "{input}", context)
            result = self.agent_loop.run(prompt)
            return result.answer, step.next

        if step.type == "elastic_agent":
            if self.kibana_client is None:
                raise RuntimeError(
                    "Elastic agent step requested but Kibana client is not configured."
                )
            message = self._render(step.message or "{input}", context)
            response = self.kibana_client.converse(
                message,
                agent_id=step.agent_id or self.settings.elastic_agent_id,
            )
            return self.kibana_client.extract_response_text(response), step.next

        if step.type == "condition":
            haystack = str(context.get(step.variable or "last_output", ""))
            matched = step.contains is not None and step.contains in haystack
            next_step_id = step.then if matched else step.otherwise
            return haystack, next_step_id

        if step.type == "final":
            return self._render(step.template or "{last_output}", context), None

        raise RuntimeError(f"Unsupported workflow step type: {step.type}")

    def _render(self, template: str, context: dict[str, Any]) -> str:
        safe_context = {key: value for key, value in context.items()}
        return template.format(**safe_context)

    def _resolve_index_name(self, raw_name: str) -> str:
        aliases = {
            "knowledge_base": self.settings.knowledge_base_index,
            "kb": self.settings.knowledge_base_index,
            "incidents": self.settings.incident_index,
            "incident": self.settings.incident_index,
        }
        return aliases.get(raw_name, raw_name)
