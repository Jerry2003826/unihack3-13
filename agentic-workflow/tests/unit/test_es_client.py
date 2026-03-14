from __future__ import annotations

from agentic_workflow_agent.elastic.es_client import ElasticStore


class FakeIndicesClient:
    def __init__(self) -> None:
        self.created: list[tuple[str, dict[str, object], dict[str, object]]] = []
        self.existing: set[str] = set()

    def exists(self, *, index: str) -> bool:
        return index in self.existing

    def create(
        self,
        *,
        index: str,
        mappings: dict[str, object],
        settings: dict[str, object],
    ) -> None:
        self.created.append((index, mappings, settings))
        self.existing.add(index)


class FakeClient:
    def __init__(self) -> None:
        self.indices = FakeIndicesClient()

    def ping(self) -> bool:
        return True

    def search(self, *, index: str, body: dict[str, object]) -> dict[str, object]:
        return {
            "hits": {
                "hits": [
                    {
                        "_id": "doc-1",
                        "_score": 1.0,
                        "_source": {"title": index, "content": str(body)},
                    }
                ]
            }
        }

    def get(self, *, index: str, id: str) -> dict[str, object]:
        return {"_source": {"index": index, "id": id}}


def test_ensure_index_creates_missing_index() -> None:
    store = ElasticStore(FakeClient())

    created = store.ensure_index(
        "agentic-kb", mappings={"properties": {}}, settings={"number_of_shards": 1}
    )

    assert created is True
    assert store.client.indices.created == [
        ("agentic-kb", {"properties": {}}, {"number_of_shards": 1})
    ]


def test_ensure_index_is_noop_when_index_exists() -> None:
    client = FakeClient()
    client.indices.existing.add("agentic-kb")
    store = ElasticStore(client)

    created = store.ensure_index("agentic-kb", mappings={"properties": {}})

    assert created is False
    assert client.indices.created == []


def test_get_document_returns_source() -> None:
    store = ElasticStore(FakeClient())

    payload = store.get_document("agentic-kb", "doc-1")

    assert payload == {"index": "agentic-kb", "id": "doc-1"}
