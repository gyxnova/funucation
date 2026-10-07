import asyncio
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any, TypeVar
from xml.parsers.expat import errors

import httpx
from pydantic import BaseModel, ValidationError


T = TypeVar("T", bound=BaseModel)
DEFAULT_MODEL_LIST = (
    "groq:openai/gpt-oss-120b,"
    "groq:qwen/qwen3.8-27b,"
    "groq:openai/gpt-oss-20b"
)
PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "featherless": ("https://api.featherless.ai/v1", "FEATHERLESS_API_KEY"),
}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelTarget:
    provider: str
    model: str


class ModelCallError(RuntimeError):
    pass


def configured_models() -> list[ModelTarget]:
    configured = os.getenv("MODEL_LIST")
    if configured is None or not configured.strip():
        configured = DEFAULT_MODEL_LIST
    targets: list[ModelTarget] = []
    for raw in configured.split(","):
        entry = raw.strip().strip("'\"")
        if not entry:
            continue
        provider, separator, model = entry.partition(":")
        if separator and provider in PROVIDERS and model.strip():
            targets.append(ModelTarget(provider=provider, model=model.strip()))
        else:
            # legacy entry without a provider prefix: treat the whole thing as an OpenRouter model
            targets.append(ModelTarget(provider="openrouter", model=entry))
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


async def call_model(
    messages: list[dict[str, str]],
    schema_model: type[T],
    temperature: float = 0.2,
    max_tokens: int = 4000,
) -> tuple[T, str]:
    targets = configured_models()
    if not targets:
        raise ModelCallError("MODEL_LIST contains no supported provider:model entries")

    errors: list[str] = []
    async with httpx.AsyncClient(timeout=25.0) as client:
        for target in targets:
            base_url, _ = PROVIDERS[target.provider]
            api_key = _api_key(target.provider)
            if not api_key:
                errors.append(f"{target.provider}:{target.model} exception=MissingAPIKey")
                logger.info(
                    "%s:%s attempt=0 exception=MissingAPIKey seconds=0.000",
                    target.provider, target.model,
                )
                continue

            retry_messages = list(messages)
            for attempt in range(2):
                started = time.perf_counter()
                response: httpx.Response | None = None
                try:
                    response = await client.post(
                        f"{base_url}/chat/completions",
                        headers={"Authorization": f"Bearer {api_key}"},
                        json={
                            "model": target.model,
                            "messages": retry_messages,
                            "temperature": temperature,
                            "max_tokens": max_tokens,
                            "response_format": {"type": "json_object"},
                        },
                    )
                    elapsed = time.perf_counter() - started
                    if response.status_code == 429 or response.status_code >= 500:
                        errors.append(f"{target.provider}:{target.model} HTTP {response.status_code}")
                        logger.info(
                            "%s:%s attempt=%d HTTP %d seconds=%.3f",
                            target.provider, target.model, attempt + 1, response.status_code, elapsed,
                        )
                        await asyncio.sleep(2)
                        break
                    response.raise_for_status()
                    content = _strip_code_fences(_response_content(response.json()))
                    result = schema_model.model_validate(json.loads(content))
                    logger.info(
                        "%s:%s attempt=%d HTTP %d seconds=%.3f",
                        target.provider, target.model, attempt + 1, response.status_code, elapsed,
                    )
                    return result, f"{target.provider}:{target.model}"
                except (json.JSONDecodeError, ValidationError, KeyError, IndexError, TypeError, ValueError) as error:
                    error_type = type(error).__name__
                    errors.append(f"{target.provider}:{target.model} exception={error_type}")
                    status_text = f"HTTP {response.status_code} " if response is not None else ""
                    logger.info(
                        "%s:%s attempt=%d %sexception=%s seconds=%.3f",
                        target.provider, target.model, attempt + 1, status_text, error_type,
                        time.perf_counter() - started,
                    )
                    if attempt == 0:
                        retry_messages = [
                            *retry_messages,
                            {
                                "role": "user",
                                "content": "Return corrected JSON only. The prior response failed parsing or validation.",
                            },
                        ]
                except httpx.HTTPStatusError as error:
                    detail = error.response.text[:300].replace("\n", " ")
                    errors.append(f"{target.provider}:{target.model} HTTP {error.response.status_code} {detail}")
                    logger.info(
                        "%s:%s attempt=%d HTTP %d seconds=%.3f",
                        target.provider, target.model, attempt + 1, status_code,
                        time.perf_counter() - started,
                    )
                    break
                except httpx.HTTPError as error:
                    error_type = type(error).__name__
                    errors.append(f"{target.provider}:{target.model} exception={error_type}")
                    logger.info(
                        "%s:%s attempt=%d exception=%s seconds=%.3f",
                        target.provider, target.model, attempt + 1, error_type,
                        time.perf_counter() - started,
                    )
                    break

    raise ModelCallError("; ".join(errors) or "All configured models failed")
