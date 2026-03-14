"""LLM client abstraction with an OpenAI tool-calling implementation."""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Mapping, Protocol, Sequence

from agentic_workflow_agent.schemas import ChatMessage, LLMResponse, ToolCallRequest

logger = logging.getLogger(__name__)


class ChatModelClient(Protocol):
    """Minimal interface used by the agent loop."""

    def complete(
        self,
        messages: Sequence[ChatMessage],
        tools: Sequence[Mapping[str, Any]],
    ) -> LLMResponse: ...


class OpenAIChatClient:
    """OpenAI chat-completions wrapper with timeout and retry support."""

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        base_url: str | None = None,
        temperature: float = 0.2,
        request_timeout: int = 120,
        max_retries: int = 3,
    ) -> None:
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("openai is not installed.") from exc

        self._client = OpenAI(
            api_key=api_key,
            base_url=base_url or None,
            timeout=request_timeout,
            max_retries=0,
        )
        self.model = model
        self.temperature = temperature
        self._max_retries = max_retries
        self._request_timeout = request_timeout

    def complete(
        self,
        messages: Sequence[ChatMessage],
        tools: Sequence[Mapping[str, Any]],
    ) -> LLMResponse:
        import uuid
        
        payload: dict[str, Any] = {
            "model": self.model,
            "temperature": self.temperature,
            "messages": [self._to_openai_message(message) for message in messages],
        }
        
        if tools:
            tools_json = json.dumps(list(tools), ensure_ascii=False)
            system_instruction = (
                "You have access to the following tools:\n"
                f"{tools_json}\n\n"
                "To use a tool, you MUST reply ONLY with a raw JSON object in this exact format:\n"
                "{\"call_tool\": \"tool_name\", \"arguments\": {\"param\": \"value\"}}\n"
                "Do NOT wrap it in markdown block quotes. If you have the final answer, reply in ordinary text."
            )
            payload["messages"].insert(0, {"role": "system", "content": system_instruction})

        response = self._call_with_retries(payload)
        choice = response.choices[0]
        message = choice.message
        
        tool_calls: list[ToolCallRequest] = []
        
        # 1. Try native tool calls first (if supported in future)
        for tool_call in message.tool_calls or []:
            arguments = tool_call.function.arguments or "{}"
            parsed_arguments = json.loads(arguments)
            tool_calls.append(
                ToolCallRequest(
                    id=tool_call.id,
                    name=tool_call.function.name,
                    arguments=parsed_arguments,
                )
            )
            
        # 2. Manual JSON parsing fallback from content
        content = message.content or ""
        candidate_content = content.strip()
        
        # sometimes LLMs wrap JSON in ```json ... ```
        if candidate_content.startswith("```json"):
            candidate_content = candidate_content[7:]
            if candidate_content.endswith("```"):
                candidate_content = candidate_content[:-3]
            candidate_content = candidate_content.strip()
            
        if not tool_calls and candidate_content.startswith("{") and '"call_tool"' in candidate_content:
            try:
                parsed = json.loads(candidate_content)
                if "call_tool" in parsed:
                    tool_calls.append(
                        ToolCallRequest(
                            id=f"call_{uuid.uuid4().hex[:8]}",
                            name=parsed["call_tool"],
                            arguments=parsed.get("arguments", {})
                        )
                    )
                    # Clear content so we don't treat it as final answer
                    content = "" 
            except json.JSONDecodeError:
                pass
                
        assistant_message = ChatMessage(
            role="assistant",
            content=content if not tool_calls else None,
            tool_calls=tool_calls,
        )
        
        final_text = None
        if not tool_calls:
            if content:
                final_text = content
            else:
                final_text = "⚠️ [System Alarm] The LLM returned an empty response. Suspending agent loop."
            
        logger.debug("LLM raw content: %.200s", message.content or "")
        logger.debug("LLM tool calls: %d, final_text: %s", len(tool_calls), bool(final_text))
            
        return LLMResponse(
            assistant_message=assistant_message,
            final_text=final_text,
            tool_calls=tool_calls,
        )

    def _call_with_retries(self, payload: dict[str, Any]) -> Any:
        """Call the OpenAI API with exponential backoff on transient errors."""
        from openai import APIConnectionError, APITimeoutError, InternalServerError

        last_exc: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                return self._client.chat.completions.create(**payload)
            except (APITimeoutError, APIConnectionError, InternalServerError) as exc:
                last_exc = exc
                wait = min(2 ** attempt, 30)
                logger.warning(
                    "LLM request failed (attempt %d/%d): %s – retrying in %ds",
                    attempt, self._max_retries, exc, wait,
                )
                time.sleep(wait)
        raise RuntimeError(
            f"LLM request failed after {self._max_retries} attempts: {last_exc}"
        ) from last_exc

    def _to_openai_message(self, message: ChatMessage) -> dict[str, Any]:
        if message.role == "tool":
            return {
                "role": "user",
                "content": f"[Tool Execution Result for '{message.name}']:\n{message.content}"
            }
        
        content = message.content or ""
        if message.role == "assistant" and message.tool_calls:
            # Reconstruct the tool call JSON string as part of the assistant's context memory
            traces = []
            for call in message.tool_calls:
                traces.append(json.dumps({"call_tool": call.name, "arguments": call.arguments}, ensure_ascii=False))
            content = "\n".join(traces)
            
        return {
            "role": message.role,
            "content": content
        }
