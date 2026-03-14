"""Shared Pydantic models used across the project."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

MessageRole = Literal["system", "user", "assistant", "tool"]


class IndexedDocument(BaseModel):
    doc_id: str
    title: str
    content: str
    summary: str | None = None
    tags: list[str] = Field(default_factory=list)
    severity: str | None = None
    service: str | None = None
    timestamp: str | None = None
    source: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    embedding: list[float] | None = None

    def searchable_text(self) -> str:
        return "\n".join(part for part in [self.title, self.summary, self.content] if part)


class SearchHit(BaseModel):
    index_name: str
    doc_id: str
    score: float
    title: str
    content: str
    summary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ToolCallRequest(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    role: MessageRole
    content: str | None = None
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[ToolCallRequest] = Field(default_factory=list)


class LLMResponse(BaseModel):
    assistant_message: ChatMessage
    final_text: str | None = None
    tool_calls: list[ToolCallRequest] = Field(default_factory=list)


class ToolResult(BaseModel):
    name: str
    output: str


class AgentRunResult(BaseModel):
    answer: str
    iterations: int
    transcript: list[ChatMessage]
    tool_results: list[ToolResult] = Field(default_factory=list)
