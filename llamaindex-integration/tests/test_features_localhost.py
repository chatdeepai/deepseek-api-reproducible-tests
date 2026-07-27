from __future__ import annotations

import unittest

from pydantic import BaseModel, Field
from llama_index.core import Document, VectorStoreIndex
from llama_index.core.embeddings import MockEmbedding
from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.prompts import PromptTemplate
from llama_index.core.tools import FunctionTool

from src.models import build_model
from tests.mock_server import MockServer, start_mock_server


class StructuredAnswer(BaseModel):
    label: str
    score: int = Field(ge=0, le=1)


def lookup_policy(key: str) -> str:
    """Read a synthetic policy record by key."""
    return "Synthetic retention is 30 days." if key == "retention" else "Not found."


class FeatureLocalhostTests(unittest.TestCase):
    server: MockServer

    def setUp(self) -> None:
        self.server = start_mock_server()

    def tearDown(self) -> None:
        self.server.close()

    def model(self, **kwargs):
        return build_model(
            model=kwargs.pop("model", "deepseek-v4-flash"),
            api_base=self.server.base_url,
            **kwargs,
        )

    def test_structured_predict_uses_schema_valid_tool_arguments(self) -> None:
        answer = self.model(function_calling=True).structured_predict(
            StructuredAnswer,
            PromptTemplate("Return a label and binary score for {topic}."),
            topic="a synthetic fixture",
        )
        self.assertEqual(answer, StructuredAnswer(label="synthetic", score=1))
        body = self.server.requests[-1]["body"]
        self.assertTrue(body["tools"])
        self.assertIn(body["tool_choice"], ("required", {"type": "function"}))

    def test_tool_call_arguments_are_typed_and_extractable(self) -> None:
        model = self.model(function_calling=True)
        tool = FunctionTool.from_defaults(fn=lookup_policy)
        response = model.chat_with_tools(
            [tool],
            user_msg="Read the synthetic retention policy.",
            tool_required=True,
        )
        calls = model.get_tool_calls_from_response(response)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].tool_name, "lookup_policy")
        self.assertEqual(calls[0].tool_kwargs, {"key": "retention"})

    def test_tool_continuation_replays_matching_identifier(self) -> None:
        model = self.model(function_calling=True)
        tool = FunctionTool.from_defaults(fn=lookup_policy)
        user = ChatMessage(
            role=MessageRole.USER,
            content="Read the synthetic retention policy.",
        )
        first = model.chat_with_tools([tool], user_msg=user, tool_required=True)
        selection = model.get_tool_calls_from_response(first)[0]
        result = lookup_policy(**selection.tool_kwargs)
        tool_message = ChatMessage(
            role=MessageRole.TOOL,
            content=result,
            additional_kwargs={"tool_call_id": selection.tool_id},
        )
        final = model.chat([user, first.message, tool_message])
        self.assertEqual(final.message.content, "Synthetic final.")
        sent = self.server.requests[-1]["body"]["messages"]
        self.assertEqual(sent[-1]["tool_call_id"], selection.tool_id)

    def test_local_rag_uses_mock_embeddings_and_one_llm_request(self) -> None:
        document = Document(
            text="Synthetic records are retained for 30 days and then deleted.",
            metadata={"record_id": "policy-retention", "tenant": "tenant-alpha"},
        )
        index = VectorStoreIndex.from_documents(
            [document],
            embed_model=MockEmbedding(embed_dim=8),
        )
        response = index.as_query_engine(
            llm=self.model(),
            similarity_top_k=1,
        ).query("How long are synthetic records retained?")
        self.assertTrue(str(response))
        self.assertEqual(len(response.source_nodes), 1)
        self.assertEqual(len(self.server.requests), 1)


if __name__ == "__main__":
    unittest.main()
