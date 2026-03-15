"""Core plan -> tool -> observe -> answer loop."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Iterable

from agentic_workflow_agent.agent.prompts import SYSTEM_PROMPT
from agentic_workflow_agent.agent.tools import StructuredTool, tool_schemas
from agentic_workflow_agent.agent.safe_ops import AuditLog
from agentic_workflow_agent.llm.client import ChatModelClient
from agentic_workflow_agent.schemas import AgentRunResult, ChatMessage, ToolResult
from agentic_workflow_agent.tracing import TraceWriter

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AgentLoop:
    llm_client: ChatModelClient
    tools: dict[str, StructuredTool]
    max_iterations: int = 6
    system_prompt: str = SYSTEM_PROMPT
    tracer: TraceWriter = field(default_factory=TraceWriter)
    safe_ops_audit: AuditLog = field(default_factory=AuditLog)

    def run(self, user_input: str, history: Iterable[ChatMessage] | None = None) -> AgentRunResult:
        transcript = list(history or [])
        if not transcript:
            transcript.append(ChatMessage(role="system", content=self.system_prompt))
        transcript.append(ChatMessage(role="user", content=user_input))

        tool_results: list[ToolResult] = []
        schemas = tool_schemas(list(self.tools.values()))

        for iteration in range(1, self.max_iterations + 1):
            self.tracer.iteration(iteration)
            try:
                response = self.llm_client.complete(transcript, tools=schemas)
            except Exception as exc:
                error_msg = f"LLM call failed on iteration {iteration}: {exc}"
                logger.error(error_msg)
                return AgentRunResult(
                    answer=error_msg,
                    iterations=iteration,
                    transcript=transcript,
                    tool_results=tool_results,
                    audit_log=[e.to_dict() for e in self.safe_ops_audit.entries],
                )
            transcript.append(response.assistant_message)

            if response.tool_calls:
                for tool_call in response.tool_calls:
                    self.tracer.tool(tool_call.name, tool_call.arguments)
                    output = self._execute_tool(tool_call.name, tool_call.arguments)
                    self.tracer.tool_result(tool_call.name, output)
                    tool_results.append(ToolResult(name=tool_call.name, output=output))
                    transcript.append(
                        ChatMessage(
                            role="tool",
                            name=tool_call.name,
                            tool_call_id=tool_call.id,
                            content=output,
                        )
                    )
                continue

            answer = response.final_text or response.assistant_message.content
            if answer:
                self.tracer.final(answer)
                return AgentRunResult(
                    answer=answer,
                    iterations=iteration,
                    transcript=transcript,
                    tool_results=tool_results,
                    audit_log=[e.to_dict() for e in self.safe_ops_audit.entries],
                )

        fallback = (
            "The agent reached the maximum number of reasoning steps without producing "
            "a final answer."
        )
        self.tracer.final(fallback)
        return AgentRunResult(
            answer=fallback,
            iterations=self.max_iterations,
            transcript=transcript,
            tool_results=tool_results,
            audit_log=[e.to_dict() for e in self.safe_ops_audit.entries],
        )

    def _execute_tool(self, name: str, arguments: dict[str, object]) -> str:
        tool = self.tools.get(name)
        if tool is None:
            return f"Unknown tool requested: {name}"
        try:
            return tool.run(arguments)
        except Exception as exc:  # pragma: no cover - defensive for runtime integrations
            return f"Tool execution failed: {exc}"


@dataclass(slots=True)
class AgentSession:
    loop: AgentLoop
    history: list[ChatMessage] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.history:
            self.history.append(ChatMessage(role="system", content=self.loop.system_prompt))

    def ask(self, user_input: str) -> AgentRunResult:
        result = self.loop.run(user_input, history=self.history)
        self.history = result.transcript
        return result
