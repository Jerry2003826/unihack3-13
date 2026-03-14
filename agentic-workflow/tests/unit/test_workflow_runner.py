from __future__ import annotations

from dataclasses import dataclass

from agentic_workflow_agent.config import Settings
from agentic_workflow_agent.workflow.models import WorkflowDefinition
from agentic_workflow_agent.workflow.runner import WorkflowRunner


class FakeSearchService:
    def search(
        self, index_name: str, query: str, *, top_k: int | None = None, mode: str = "hybrid"
    ) -> list[str]:
        return [f"{index_name}:{query}:{mode}:{top_k}"]

    def format_hits(self, hits: list[str]) -> str:
        return "\n".join(hits)


@dataclass
class FakeAgentResult:
    answer: str


class FakeAgentLoop:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    def run(self, prompt: str) -> FakeAgentResult:
        self.prompts.append(prompt)
        return FakeAgentResult(answer=f"analysis::{prompt}")


def build_settings() -> Settings:
    return Settings.from_env(
        {
            "ELASTIC_URL": "http://localhost:9200",
            "ELASTIC_API_KEY": "token",
        }
    )


def test_workflow_runner_executes_search_then_agent_then_final() -> None:
    definition = WorkflowDefinition.model_validate(
        {
            "name": "incident_triage",
            "entrypoint": "search_step",
            "steps": [
                {
                    "id": "search_step",
                    "type": "search",
                    "index": "incidents",
                    "query": "{input}",
                    "save_as": "incident_hits",
                    "next": "agent_step",
                },
                {
                    "id": "agent_step",
                    "type": "agent",
                    "prompt": "Question: {input}\nResults:\n{incident_hits}",
                    "save_as": "analysis",
                    "next": "final_step",
                },
                {
                    "id": "final_step",
                    "type": "final",
                    "template": "Done\n{analysis}",
                },
            ],
        }
    )

    agent_loop = FakeAgentLoop()
    runner = WorkflowRunner(
        settings=build_settings(),
        search_service=FakeSearchService(),
        agent_loop=agent_loop,
    )

    output = runner.run(definition, user_input="cluster red status")

    assert "Done" in output
    assert "agentic-incidents:cluster red status:hybrid:None" in output
    assert agent_loop.prompts
