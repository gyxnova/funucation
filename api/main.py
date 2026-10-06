import json
import os
import re
from pathlib import Path
from typing import Annotated

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, model_validator


ROOT_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = Path(__file__).resolve().parent / "cache"
load_dotenv(ROOT_DIR / ".env")

DEFAULT_MODELS = [
    "qwen/qwen3.8-27b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "google/gemma-4-31b-it:free",
]
MODEL_LIST = [
    model.strip()
    for model in os.getenv("MODEL_LIST", ",".join(DEFAULT_MODELS)).split(",")
    if model.strip()
]
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

TopicId = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,80}$")]


class QuizRequest(BaseModel):
    topic_id: TopicId


class QuizQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=6)
    correct_index: int = Field(ge=0)
    explanation: str = Field(min_length=1, max_length=300)

    @model_validator(mode="after")
    def validate_answer(self) -> "QuizQuestion":
        if self.correct_index >= len(self.options):
            raise ValueError("correct_index must refer to an available option")
        if any(not option.strip() for option in self.options):
            raise ValueError("options must not be empty")
        if "\n" in self.explanation or "\r" in self.explanation:
            raise ValueError("explanation must be one line")
        return self


class QuizResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: TopicId
    questions: list[QuizQuestion] = Field(min_length=5, max_length=5)


def cache_path(topic_id: str) -> Path:
    safe_topic_id = re.sub(r"[^a-zA-Z0-9_-]", "_", topic_id)
    return CACHE_DIR / f"{safe_topic_id}.json"


def read_cached_quiz(topic_id: str) -> QuizResponse | None:
    path = cache_path(topic_id)
    if not path.is_file():
        return None
    try:
        return QuizResponse.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValidationError, ValueError) as error:
        raise HTTPException(status_code=500, detail="Cached quiz is invalid") from error


def write_cached_quiz(quiz: QuizResponse) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    destination = cache_path(quiz.topic_id)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(quiz.model_dump_json(indent=2), encoding="utf-8")
    temporary.replace(destination)


def quiz_prompt(topic_id: str) -> str:
    return (
        f'Create exactly 5 application-style multiple-choice questions about "{topic_id}". '
        "Ask what happens when a learner changes or applies a concept, not for definitions. "
        "Each question must have 4 concise options, a zero-based correct_index, and a one-line "
        "explanation. Return only a JSON object with this shape: "
        '{"questions":[{"question":"...","options":["...","...","...","..."],'
        '"correct_index":0,"explanation":"..."}]}.'
    )


async def request_quiz(client: httpx.AsyncClient, topic_id: str, model: str) -> QuizResponse:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Quiz generation requires OPENROUTER_API_KEY in the repository .env",
        )

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You create concise educational quizzes. Follow the requested JSON schema exactly.",
            },
            {"role": "user", "content": quiz_prompt(topic_id)},
        ],
        "response_format": {"type": "json_object"},
    }
    response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload)
    response.raise_for_status()
    body = response.json()
    content = body["choices"][0]["message"]["content"]
    decoded = json.loads(content)
    quiz_data = {"topic_id": topic_id, **decoded}
    return QuizResponse.model_validate(quiz_data)


app = FastAPI(title="learn-by-song API")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/quiz", response_model=QuizResponse)
async def create_quiz(request: QuizRequest) -> QuizResponse:
    cached_quiz = read_cached_quiz(request.topic_id)
    if cached_quiz is not None:
        return cached_quiz

    if not MODEL_LIST:
        raise HTTPException(status_code=500, detail="MODEL_LIST does not contain any models")

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=45.0) as client:
        for model in MODEL_LIST:
            for _attempt in range(2):
                try:
                    quiz = await request_quiz(client, request.topic_id, model)
                    write_cached_quiz(quiz)
                    return quiz
                except HTTPException:
                    raise
                except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, ValidationError) as error:
                    last_error = error

    raise HTTPException(
        status_code=502,
        detail=f"Quiz generation failed for all configured models: {last_error}",
    )
