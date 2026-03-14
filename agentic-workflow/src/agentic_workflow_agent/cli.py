"""Command-line entry points for the standalone Elastic workflow agent."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import sys
from pathlib import Path
from typing import Sequence

from agentic_workflow_agent.agent.loop import AgentLoop, AgentSession
from agentic_workflow_agent.agent.tools import build_default_tools
from agentic_workflow_agent.config import Settings, load_settings
from agentic_workflow_agent.elastic import (
    ElasticSearchService,
    ElasticStore,
    bootstrap_default_indices,
    build_embedding_client,
    enrich_documents_with_embeddings,
    load_jsonl_documents,
)
from agentic_workflow_agent.kibana import KibanaAgentBuilderClient
from agentic_workflow_agent.llm import OpenAIChatClient
from agentic_workflow_agent.tracing import TraceWriter
from agentic_workflow_agent.workflow.runner import WorkflowRunner
import sys

# PyInstaller compatibility for finding the workflows directory
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    # Running in a PyInstaller bundle
    PROJECT_ROOT = Path(sys._MEIPASS)
else:
    # Running in normal python environment
    PROJECT_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_WORKFLOW_FILE = PROJECT_ROOT / "workflows" / "ubuntu_auto_ops.yaml"


@dataclass(slots=True)
class Runtime:
    settings: Settings
    store: ElasticStore
    search_service: ElasticSearchService
    agent_loop: AgentLoop | None = None
    kibana_client: KibanaAgentBuilderClient | None = None


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    settings = load_settings(args.env_file)

    if args.command == "bootstrap-indices":
        return bootstrap_indices_command(settings, with_embeddings=args.with_embeddings)
    if args.command == "list-elastic-agents":
        return list_elastic_agents_command(settings)
    if args.command == "invoke-elastic-agent":
        return invoke_elastic_agent_command(
            settings,
            message=args.message,
            agent_id=args.agent_id,
            conversation_id=args.conversation_id,
            connector_id=args.connector_id,
        )
    if args.command == "ask":
        runtime = build_runtime(settings, require_llm=True)
        try:
            result = runtime.agent_loop.run(args.question)  # type: ignore[union-attr]
            print(result.answer)
        finally:
            close_runtime(runtime)
        return 0
    if args.command == "chat":
        runtime = build_runtime(settings, require_llm=True)
        try:
            run_repl(runtime)
        finally:
            close_runtime(runtime)
        return 0
    if args.command == "run-workflow":
        runtime = build_runtime(settings, require_llm=True)
        try:
            workflow_path = Path(args.workflow or DEFAULT_WORKFLOW_FILE)
            runner = WorkflowRunner(
                settings=settings,
                search_service=runtime.search_service,
                agent_loop=runtime.agent_loop,  # type: ignore[arg-type]
                kibana_client=runtime.kibana_client,
            )
            output = runner.run_file(workflow_path, user_input=args.user_input)
            print(output)
        finally:
            close_runtime(runtime)
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Elastic-themed agentic workflow demo project.")
    parser.add_argument("--env-file", default=None, help="Optional path to a .env file.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    bootstrap_parser = subparsers.add_parser(
        "bootstrap-indices",
        help="Create the Elasticsearch indices used by the demo.",
    )
    bootstrap_parser.add_argument(
        "--with-embeddings",
        action="store_true",
        help="Create indices with a dense_vector mapping.",
    )

    subparsers.add_parser(
        "list-elastic-agents",
        help="List available Kibana Agent Builder agents.",
    )

    invoke_parser = subparsers.add_parser(
        "invoke-elastic-agent",
        help="Send a message directly to Kibana Agent Builder.",
    )
    invoke_parser.add_argument("--message", required=True, help="Message to send to Kibana.")
    invoke_parser.add_argument(
        "--agent-id",
        default=None,
        help="Optional Kibana Agent Builder agent ID. Defaults to ELASTIC_AGENT_ID or the default agent.",
    )
    invoke_parser.add_argument(
        "--conversation-id",
        default=None,
        help="Optional conversation ID to continue an existing Agent Builder conversation.",
    )
    invoke_parser.add_argument(
        "--connector-id",
        default=None,
        help="Optional connector ID to force a specific model connector in Kibana.",
    )

    ask_parser = subparsers.add_parser("ask", help="Ask a single question.")
    ask_parser.add_argument("question", help="Question to pass to the agent.")

    subparsers.add_parser("chat", help="Start an interactive REPL session.")

    workflow_parser = subparsers.add_parser(
        "run-workflow",
        help="Run a YAML workflow against the current Elastic environment.",
    )
    workflow_parser.add_argument(
        "--workflow",
        default=str(DEFAULT_WORKFLOW_FILE),
        help="Path to the workflow YAML file.",
    )
    workflow_parser.add_argument(
        "--input", dest="user_input", required=True, help="Workflow input text."
    )

    return parser


def build_runtime(settings: Settings, *, require_llm: bool) -> Runtime:
    store = ElasticStore.from_settings(settings)
    embedding_client = build_embedding_client(settings) if settings.embedding_enabled else None
    search_service = ElasticSearchService(
        store=store,
        embedding_client=embedding_client if settings.hybrid_search_enabled else None,
        default_top_k=settings.search_top_k,
    )

    kibana_client = (
        KibanaAgentBuilderClient.from_settings(settings) if settings.kibana_enabled else None
    )
    agent_loop = None
    if require_llm:
        settings.require_llm()
        llm_client = OpenAIChatClient(
            api_key=settings.openai_api_key or "",
            model=settings.openai_chat_model,
            base_url=settings.openai_base_url,
            request_timeout=settings.llm_request_timeout,
            max_retries=settings.llm_max_retries,
        )
        tools = build_default_tools(settings, search_service, store, kibana_client)
        agent_loop = AgentLoop(
            llm_client=llm_client,
            tools=tools,
            max_iterations=settings.max_agent_iterations,
            tracer=TraceWriter(enabled=settings.trace_enabled),
        )

    return Runtime(
        settings=settings,
        store=store,
        search_service=search_service,
        agent_loop=agent_loop,
        kibana_client=kibana_client,
    )


def bootstrap_indices_command(settings: Settings, *, with_embeddings: bool) -> int:
    store = ElasticStore.from_settings(settings)
    vector_dimensions = None
    if with_embeddings:
        settings.require_llm()
        embedding_client = build_embedding_client(settings)
        if embedding_client is None:
            raise RuntimeError("Embeddings requested but no embedding client is configured.")
        vector_dimensions = resolve_embedding_dimensions(settings, embedding_client)

    results = bootstrap_default_indices(store, settings, vector_dimensions=vector_dimensions)
    for index_name, created in results.items():
        state = "created" if created else "already exists"
        print(f"{index_name}: {state}")
    return 0


def list_elastic_agents_command(settings: Settings) -> int:
    settings.require_kibana()
    client = KibanaAgentBuilderClient.from_settings(settings)
    try:
        response = client.list_agents()
        results = response.get("results")
        if not isinstance(results, list):
            print(json.dumps(response, ensure_ascii=False, indent=2))
            return 0
        for item in results:
            if not isinstance(item, dict):
                continue
            agent_id = str(item.get("id", ""))
            name = str(item.get("name", ""))
            description = str(item.get("description", ""))
            print(f"{agent_id}\t{name}\t{description}")
        return 0
    finally:
        client.close()


def invoke_elastic_agent_command(
    settings: Settings,
    *,
    message: str,
    agent_id: str | None,
    conversation_id: str | None,
    connector_id: str | None,
) -> int:
    settings.require_kibana()
    client = KibanaAgentBuilderClient.from_settings(settings)
    try:
        response = client.converse(
            message,
            agent_id=agent_id or settings.elastic_agent_id,
            conversation_id=conversation_id,
            connector_id=connector_id,
        )
        text = client.extract_response_text(response)
        if text:
            print(text)
        else:
            print(json.dumps(response, ensure_ascii=False, indent=2))
        return 0
    finally:
        client.close()


def run_repl(runtime: Runtime) -> None:
    loop = runtime.agent_loop
    if loop is None:
        raise RuntimeError("Agent loop is not configured.")
    session = AgentSession(loop)
    print("Agentic Workflow Agent REPL. Type 'exit' to quit.")
    while True:
        try:
            user_input = input("you> ").strip()
        except EOFError:
            print()
            break
        if not user_input:
            continue
        if user_input.lower() in {"exit", "quit"}:
            break
        result = session.ask(user_input)
        print(f"agent> {result.answer}")


def close_runtime(runtime: Runtime) -> None:
    if runtime.kibana_client is not None:
        runtime.kibana_client.close()


def resolve_embedding_dimensions(
    settings: Settings,
    embedding_client: object | None,
) -> int:
    if settings.openai_embedding_dimensions is not None:
        return settings.openai_embedding_dimensions
    if embedding_client is None:
        raise RuntimeError("Embedding dimensions are unavailable without an embedding client.")
    probe = getattr(embedding_client, "embed_text", None)
    if not callable(probe):
        raise RuntimeError("Embedding client does not provide embed_text().")
    return len(probe("elastic vector dimension probe"))


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
