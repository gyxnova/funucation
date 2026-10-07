import os
import unittest
from unittest.mock import patch

from api.llm import DEFAULT_MODEL_LIST, PROVIDERS, ModelTarget, configured_models


class ConfiguredModelsTests(unittest.TestCase):
    def test_providers_registered(self) -> None:
        self.assertIn("groq", PROVIDERS)
        self.assertIn("openrouter", PROVIDERS)

    def test_prefixed_entries_parse(self) -> None:
        with patch.dict(os.environ, {"MODEL_LIST": "groq:test-model,openrouter:vendor/model"}, clear=True):
            self.assertEqual(
                configured_models(),
                [ModelTarget("groq", "test-model"), ModelTarget("openrouter", "vendor/model")],
            )

    def test_unprefixed_entries_become_openrouter(self) -> None:
        with patch.dict(os.environ, {"MODEL_LIST": "legacy/model,openrouter:vendor/model"}, clear=True):
            self.assertEqual(
                configured_models(),
                [ModelTarget("openrouter", "legacy/model"), ModelTarget("openrouter", "vendor/model")],
            )

    def test_quotes_and_whitespace_are_stripped(self) -> None:
        with patch.dict(os.environ, {"MODEL_LIST": ' "groq:test-model" , groq:other '}, clear=True):
            self.assertEqual(
                configured_models(),
                [ModelTarget("groq", "test-model"), ModelTarget("groq", "other")],
            )

    def test_empty_list_falls_back_to_default(self) -> None:
        with patch.dict(os.environ, {"MODEL_LIST": ""}, clear=True):
            targets = configured_models()
        self.assertEqual(len(targets), 3)
        self.assertTrue(all(target.provider == "groq" for target in targets))

    def test_default_list_is_groq_only(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            parsed = ",".join(f"{target.provider}:{target.model}" for target in configured_models())
        self.assertEqual(parsed, DEFAULT_MODEL_LIST)
        self.assertTrue(DEFAULT_MODEL_LIST.startswith("groq:"))
        self.assertNotIn("featherless:", DEFAULT_MODEL_LIST)


if __name__ == "__main__":
    unittest.main()