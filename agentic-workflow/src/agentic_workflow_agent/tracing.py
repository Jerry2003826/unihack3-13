"""Simple console tracing for demo-friendly agent execution logs."""

from __future__ import annotations

from dataclasses import dataclass
import json


@dataclass(slots=True)
class TraceWriter:
    enabled: bool = True

    def write(self, label: str, payload: str | dict[str, object]) -> None:
        if not self.enabled:
            return
        if isinstance(payload, dict):
            rendered = json.dumps(payload, ensure_ascii=False, indent=2)
        else:
            rendered = payload
        print(f"[{label}] {rendered}")

    def iteration(self, number: int) -> None:
        self.write("iteration", str(number))

    def tool(self, name: str, payload: dict[str, object]) -> None:
        self.write(f"tool:{name}", payload)

    def tool_result(self, name: str, payload: str) -> None:
        self.write(f"tool-result:{name}", payload)

    def final(self, answer: str) -> None:
        self.write("final", answer)
