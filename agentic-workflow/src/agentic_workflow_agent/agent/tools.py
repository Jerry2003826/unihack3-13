"""Structured tools exposed to the agent loop."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Callable, Mapping, Protocol, Sequence

from pydantic import BaseModel, Field

from agentic_workflow_agent.config import Settings
from agentic_workflow_agent.elastic.search import SearchMode


class SearchRuntime(Protocol):
    def search(
        self,
        index_name: str,
        query: str,
        *,
        top_k: int | None = None,
        mode: SearchMode = "hybrid",
    ) -> list[Any]: ...

    def format_hits(self, hits: list[Any]) -> str: ...


class DocumentRuntime(Protocol):
    def get_document(self, index_name: str, doc_id: str) -> dict[str, Any]: ...


class KibanaRuntime(Protocol):
    def converse(
        self,
        message: str,
        *,
        agent_id: str,
        conversation_id: str | None = None,
        connector_id: str | None = None,
    ) -> dict[str, Any]: ...

    def extract_response_text(self, response: Mapping[str, Any]) -> str: ...


class SearchInput(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=10)
    mode: SearchMode = "hybrid"


class DocumentInput(BaseModel):
    index_name: str
    doc_id: str


class ElasticAgentInput(BaseModel):
    message: str
    agent_id: str | None = None
    conversation_id: str | None = None
    connector_id: str | None = None


@dataclass(slots=True)
class StructuredTool:
    name: str
    description: str
    input_model: type[BaseModel]
    handler: Callable[[Any], str]

    def openai_schema(self) -> dict[str, object]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_model.model_json_schema(),
            },
        }

    def run(self, arguments: Mapping[str, Any]) -> str:
        validated = self.input_model.model_validate(arguments)
        return self.handler(validated)

class SystemLogsInput(BaseModel):
    lines: int = Field(default=50, ge=10, le=200, description="Number of tail log lines to fetch.")
    priority: str = Field(default="err", description="Syslog priority level (e.g., err, warning, info).")

class BashCommandInput(BaseModel):
    command: str = Field(..., description="The bash command to execute.")

class WebSearchInput(BaseModel):
    query: str = Field(..., description="The query to search the internet for solutions or bug reports.")
    max_results: int = Field(default=3, ge=1, le=5, description="Number of web search results to fetch.")

class SearchInput(BaseModel):
    query: str = Field(..., description="The query to search the internal knowledge base for.")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of results to return.")
    mode: SearchMode = Field(default="hybrid", description="Search mode to use.")

class LearnResolutionInput(BaseModel):
    issue_title: str = Field(..., description="A concise title describing the bug or issue.")
    symptoms: str = Field(..., description="The error messages, logs, or symptoms that caused the issue.")
    resolution: str = Field(..., description="The step-by-step commands or actions taken to successfully resolve the issue.")

def build_default_tools(
    settings: Settings,
    search_service: SearchRuntime,
    store: DocumentRuntime,
    kibana_client: KibanaRuntime | None = None,
) -> dict[str, StructuredTool]:
    def search_web_ddg(payload: WebSearchInput) -> str:
        import urllib.request
        import urllib.parse
        import json
        
        # Using a simple DuckDuckGo HTML scrape or an open API for demo purposes without requiring a key
        # We will use DuckDuckGo Lite HTML interface to extract search result snippets
        try:
            query = urllib.parse.quote(payload.query)
            url = f"https://html.duckduckgo.com/html/?q={query}"
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                html = response.read().decode('utf-8')
            
            # Very basic extraction of result snippets
            results = []
            parts = html.split('class="result__snippet')
            for part in parts[1:]:
                # Extract text between > and <
                snippet_start = part.find('>') + 1
                snippet_end = part.find('</a>', snippet_start)
                if snippet_end == -1:
                    snippet_end = part.find('</span>', snippet_start)
                
                if snippet_start != 0 and snippet_end != -1:
                    snippet = part[snippet_start:snippet_end].strip()
                    # Clean basic HTML tags
                    snippet = snippet.replace('<b>', '').replace('</b>', '')
                    if snippet and snippet not in results:
                        results.append(snippet)
                        if len(results) >= payload.max_results:
                            break
                            
            if not results:
                return "No useful web search results found for the query."
            
            return "Web Search Results:\n" + "\n---\n".join(results)
        except Exception as e:
            return f"Web search failed: {str(e)}"

    def execute_bash_command(payload: BashCommandInput) -> str:
        import subprocess
        try:
            result = subprocess.run(
                payload.command,
                shell=True,
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = result.stdout
            if result.stderr:
                output += f"\n[STDERR]:\n{result.stderr}"
            if result.returncode != 0:
                output += f"\n[EXIT CODE]: {result.returncode}"
            return output if output.strip() else "Command executed successfully with no output."
        except subprocess.TimeoutExpired:
            return f"Command timed out after 30 seconds: {payload.command}"
        except Exception as e:
            return f"Error executing command: {str(e)}"

    def fetch_system_logs(payload: SystemLogsInput) -> str:
        import subprocess
        try:
            result = subprocess.run(
                f"journalctl -p 3 -xb -n {payload.lines}",
                shell=True,
                check=False,
                capture_output=True,
                text=True,
                timeout=15,
            )
            return result.stdout if result.stdout.strip() else "No recent error logs found."
        except Exception as e:
            return f"Failed to fetch system logs: {str(e)}"

    def render_search(index_name: str, payload: SearchInput) -> str:
        hits = search_service.search(
            index_name=index_name,
            query=payload.query,
            top_k=payload.top_k,
            mode=payload.mode,
        )
        return search_service.format_hits(hits)

    def learn_resolution(payload: LearnResolutionInput) -> str:
        import uuid
        from datetime import datetime
        from agentic_workflow_agent.schemas import IndexedDocument
        
        try:
            # We assume store has bulk_index based on es_client.py 
            # and that we can access it if the property exists.
            bulk_index = getattr(store, "bulk_index", None)
            if not callable(bulk_index):
                return "Error: store does not support bulk_index for learning."
                
            doc = IndexedDocument(
                doc_id=f"learned-{uuid.uuid4().hex[:8]}",
                title=payload.issue_title,
                content=f"Symptoms/Errors:\n{payload.symptoms}\n\nResolution/Commands:\n{payload.resolution}",
                summary=payload.issue_title,
                tags=["auto-learned", "ops"],
                timestamp=datetime.utcnow().isoformat(),
            )
            
            # Write to the knowledge base index
            count = bulk_index(settings.knowledge_base_index, [doc])
            if count > 0:
                return f"Successfully learned and saved the resolution to the knowledge base ({settings.knowledge_base_index})."
            return "Failed to save the resolution."
        except Exception as e:
            return f"Error while trying to learn resolution: {str(e)}"

    tools = {
        "execute_bash_command": StructuredTool(
            name="execute_bash_command",
            description="Execute real bash commands on the Ubuntu server to fetch metrics, check statuses, or run self-healing actions.",
            input_model=BashCommandInput,
            handler=execute_bash_command,
        ),
        "fetch_system_logs": StructuredTool(
            name="fetch_system_logs",
            description="Fetch recent high severity (error level) system logs from journalctl.",
            input_model=SystemLogsInput,
            handler=fetch_system_logs,
        ),
        "search_web": StructuredTool(
            name="search_web",
            description="Search the internet via DuckDuckGo for solutions to complex bugs or unknown error codes.",
            input_model=WebSearchInput,
            handler=search_web_ddg,
        ),
        "search_knowledge_base": StructuredTool(
            name="search_knowledge_base",
            description="Search the internal knowledge base index for operational guidance and runbooks. ALWAYS use this before web search.",
            input_model=SearchInput,
            handler=lambda payload: render_search(
                settings.knowledge_base_index,
                payload,
            ),
        ),
        "learn_resolution": StructuredTool(
            name="learn_resolution",
            description="CRITICAL RAG TOOL: If you successfully resolve an unfamiliar or complex issue, use this to document your successful fix into the internal Elasticsearch knowledge base for future runs.",
            input_model=LearnResolutionInput,
            handler=learn_resolution,
        ),
    }
    if kibana_client is not None:
        tools["invoke_elastic_agent"] = StructuredTool(
            name="invoke_elastic_agent",
            description="Delegate a focused sub-task to Kibana Agent Builder.",
            input_model=ElasticAgentInput,
            handler=lambda payload: _invoke_elastic_agent(
                kibana_client,
                settings,
                payload,
            ),
        )
    return tools


def tool_schemas(tools: Sequence[StructuredTool]) -> list[dict[str, object]]:
    return [tool.openai_schema() for tool in tools]


def _resolve_index_name(settings: Settings, raw_name: str) -> str:
    aliases = {
        "knowledge_base": settings.knowledge_base_index,
        "kb": settings.knowledge_base_index,
        "incidents": settings.incident_index,
        "incident": settings.incident_index,
    }
    return aliases.get(raw_name, raw_name)


def _invoke_elastic_agent(
    client: KibanaRuntime,
    settings: Settings,
    payload: ElasticAgentInput,
) -> str:
    response = client.converse(
        payload.message,
        agent_id=payload.agent_id or settings.elastic_agent_id,
        conversation_id=payload.conversation_id,
        connector_id=payload.connector_id,
    )
    rendered = {
        "conversation_id": response.get("conversation_id"),
        "message": client.extract_response_text(response),
        "steps": response.get("steps", []),
    }
    return json.dumps(rendered, ensure_ascii=False, indent=2)
