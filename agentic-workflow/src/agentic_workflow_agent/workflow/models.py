"""Workflow schema used by the demo YAML runner."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

WorkflowStepType = Literal["search", "agent", "elastic_agent", "condition", "final"]


class WorkflowStep(BaseModel):
    id: str
    type: WorkflowStepType
    next: str | None = None
    save_as: str | None = None
    query: str | None = None
    prompt: str | None = None
    message: str | None = None
    index: str | None = None
    mode: Literal["bm25", "vector", "hybrid"] = "hybrid"
    top_k: int | None = None
    variable: str | None = None
    contains: str | None = None
    then: str | None = None
    otherwise: str | None = None
    template: str | None = None
    agent_id: str | None = None


class WorkflowDefinition(BaseModel):
    name: str
    description: str | None = None
    entrypoint: str
    steps: list[WorkflowStep]
