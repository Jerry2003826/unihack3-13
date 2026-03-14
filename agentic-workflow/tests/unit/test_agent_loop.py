from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from agentic_workflow_agent.agent.loop import AgentLoop, AgentSession
from agentic_workflow_agent.agent.tools import StructuredTool
from agentic_workflow_agent.schemas import ChatMessage, LLMResponse, ToolCallRequest
from agentic_workflow_agent.tracing import TraceWriter


class FakeLLMClient:
    def __init__(self, responses: list[LLMResponse]) -> None:
        self.responses = responses
        self.calls = 0

    def complete(
        self,
        messages: Sequence[ChatMessage],
        tools: Sequence[Mapping[str, Any]],
    ) -> LLMResponse:
        self.calls += 1
        return self.responses.pop(0)


def build_tool() -> StructuredTool:
    from pydantic import BaseModel

    class ToolInput(BaseModel):
        query: str

    return StructuredTool(
        name="search_incidents",
        description="Search incidents",
        input_model=ToolInput,
        handler=lambda payload: f"found:{payload.query}",
    )


def test_agent_loop_executes_tool_before_answering() -> None:
    llm = FakeLLMClient(
        [
            LLMResponse(
                assistant_message=ChatMessage(
                    role="assistant",
                    content=None,
                    tool_calls=[
                        ToolCallRequest(
                            id="call-1",
                            name="search_incidents",
                            arguments={"query": "red status"},
                        )
                    ],
                ),
                tool_calls=[
                    ToolCallRequest(
                        id="call-1",
                        name="search_incidents",
                        arguments={"query": "red status"},
                    )
                ],
            ),
            LLMResponse(
                assistant_message=ChatMessage(
                    role="assistant",
                    content="The likely issue is disk pressure. Evidence: inc-003.",
                ),
                final_text="The likely issue is disk pressure. Evidence: inc-003.",
            ),
        ]
    )
    loop = AgentLoop(
        llm_client=llm,
        tools={"search_incidents": build_tool()},
        tracer=TraceWriter(enabled=False),
    )

    result = loop.run("Why is the cluster red?")

    assert result.answer == "The likely issue is disk pressure. Evidence: inc-003."
    assert result.tool_results[0].output == "found:red status"
    assert llm.calls == 2


def test_agent_session_persists_history_between_turns() -> None:
    llm = FakeLLMClient(
        [
            LLMResponse(
                assistant_message=ChatMessage(role="assistant", content="First answer."),
                final_text="First answer.",
            ),
            LLMResponse(
                assistant_message=ChatMessage(role="assistant", content="Second answer."),
                final_text="Second answer.",
            ),
        ]
    )
    session = AgentSession(
        AgentLoop(
            llm_client=llm,
            tools={"search_incidents": build_tool()},
            tracer=TraceWriter(enabled=False),
        )
    )

    first = session.ask("first question")
    second = session.ask("second question")

    assert first.answer == "First answer."
    assert second.answer == "Second answer."
    assert len(session.history) >= 5
