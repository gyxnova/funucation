import asyncio
import json
import os
import re
from dataclasses import dataclass
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError


T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL_LIST = (
    "openrouter:qwen/qwen3.8-27b:free,"
    "openrouter:nvidia/nemotron-3-super-120b-a12b:free,"
    "openrouter:google/gemma-4-31b-it:free"
)
PROVIDERS = {
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "featherless": ("https://api.featherless.ai/v1", "FEATHERLESS_API_KEY"),
}


@dataclass(frozen=True)
class ModelTarget:
    provider: str
    model: str


class ModelCallError(RuntimeError):
    pass


def configured_models() -> list[ModelTarget]:
    configured = os.getenv("MODEL_LIST") or DEFAULT_MODEL_LIST
    targets: list[ModelTarget] = []
    for entry in configured.split(","):
        provider, separator, model = entry.strip().partition(":")
        if not separator or provider not in PROVIDERS or not model.strip():
            continue
        targets.append(ModelTarget(provider=provider, model=model.strip()))
    return targets


def _strip_code_fences(content: str) -> str:
    match = re.fullmatch(r"\s*```(?:json)?\s*(.*?)\s*```\s*", content, flags=re.IGNORECASE | re.DOTALL)
    return match.group(1) if match else content


def _response_content(payload: dict[str, Any]) -> str:
    content = payload["choices"][0]["message"]["content"]
    if not isinstance(content, str):
        raise ValueError("Model response content must be a JSON string")
    return content


def _api_key(provider: str) -> str:
    _, environment_name = PROVIDERS[provider]
    return os.getenv(environment_name, "").strip()


async def call_model(messages: list[dict[str, str]], schema_model: type[T]) -> tuple[T, str]:
    targets = configured_models()
    if not targets:
        raise ModelCallError("MODEL_LIST contains no supported provider:model entries")

    errors: list[str] = []
    async with httpx.AsyncClient(timeout=25.0) as client:
        for target in targets:
            base_url, _ = PROVIDERS[target.provider]
            api_key = _api_key(target.provider)
            if not api_key:
                errors.append(f"{target.provider} API key is not configured")
                continue

            retry_messages = list(messages)
            for attempt in range(2):
                try:
                    response = await client.post(
                        f"{base_url}/chat/completions",
                        headers={"Authorization": f"Bearer {api_key}"},
                        json={
                            "model": target.model,
                            "messages": retry_messages,
                            "response_format": {"type": "json_object"},
                        },
                    )
                    if response.status_code == 429 or response.status_code >= 500:
                        errors.append(f"{target.provider}:{target.model} returned HTTP {response.status_code}")
                        await asyncio.sleep(2)
                        break
                    response.raise_for_status()
                    content = _strip_code_fences(_response_content(response.json()))
                    result = schema_model.model_validate(json.loads(content))
                    return result, f"{target.provider}:{target.model}"
                except (json.JSONDecodeError, ValidationError, KeyError, IndexError, TypeError, ValueError) as error:
                    errors.append(f"{target.provider}:{target.model} returned invalid JSON: {error}")
                    if attempt == 0:
                        retry_messages = [
                            *retry_messages,
                            {
                                "role": "user",
                                "content": f"Return corrected JSON only. The prior response failed parsing or validation: {error}",
                            },
                        ]
                except httpx.HTTPStatusError as error:
                    errors.append(f"{target.provider}:{target.model} returned HTTP {error.response.status_code}")
                    break
                except httpx.HTTPError as error:
                    errors.append(f"{target.provider}:{target.model} request failed: {type(error).__name__}")
                    break

    raise ModelCallError("; ".join(errors) or "All configured models failed")
