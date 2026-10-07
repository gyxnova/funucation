import json
import os
import re
from pathlib import Path
from typing import Annotated
import random

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

if __package__:
    from .llm import ModelCallError, call_model
    from .prompts import quiz_messages, repair_message, song_messages
    from .validate import SongPlan, validate_quiz_content, validate_song_plan
else:
    from llm import ModelCallError, call_model
    from prompts import quiz_messages, repair_message, song_messages
    from validate import SongPlan, validate_quiz_content, validate_song_plan


ROOT_DIR = Path(__file__).resolve().parent.parent
API_DIR = Path(__file__).resolve().parent
CACHE_DIR = API_DIR / "cache"
SYLLABUS_DIR = API_DIR / "data" / "syllabus"
SONG_DIR = API_DIR / "data" / "songs"
TopicId = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,80}$")]


class QuizRequest(BaseModel):
    topic_id: TopicId


class QuizQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=6)
    work: str | None = Field(default=None, max_length=300)
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


class QuizContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questions: list[QuizQuestion] = Field(min_length=5, max_length=5)


class PublicQuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    explanation: str


class PublicQuizResponse(BaseModel):
    topic_id: TopicId
    questions: list[PublicQuizQuestion]
    model_used: str
    repairs_used: int


class SongRequest(BaseModel):
    topic_id: TopicId


class TimedLyric(BaseModel):
    text: str
    start: float
    end: float
    scene: str | None = None


class SongScene(BaseModel):
    template: str
    start: float
    end: float
    params: dict[str, object] = Field(default_factory=dict)


class SongPause(BaseModel):
    at: float
    question: str
    options: list[str]
    correct: int
    explain: str


class SongResponse(BaseModel):
    topic_id: TopicId
    title: str
    bpm: int
    lyrics: list[TimedLyric]
    scenes: list[SongScene]
    pauses: list[SongPause]
    model_used: str
    repairs_used: int



def shuffle_options(quiz: QuizContent) -> None:
    for q in quiz.questions:
        correct_option = q.options[q.correct_index]
        random.shuffle(q.options)
        q.correct_index = q.options.index(correct_option)


def safe_cache_path(topic_id: str) -> Path:
    safe_topic_id = re.sub(r"[^a-zA-Z0-9_-]", "_", topic_id)
    return CACHE_DIR / f"{safe_topic_id}.json"


def load_syllabus(topic_id: str) -> dict[str, object]:
    syllabus_path = SYLLABUS_DIR / f"{topic_id}.json"
    if not syllabus_path.is_file():
        raise HTTPException(status_code=404, detail=f"No syllabus is configured for topic {topic_id!r}")
    try:
        data = json.loads(syllabus_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"Syllabus for {topic_id!r} is invalid") from error
    if data.get("topic_id") != topic_id:
        raise HTTPException(status_code=500, detail=f"Syllabus topic_id does not match {topic_id!r}")
    return data


def song_response(
    topic_id: str,
    syllabus: dict[str, object],
    plan: SongPlan,
    model_used: str,
    repairs_used: int,
) -> SongResponse:
    bpm = int(syllabus["bpm"])
    seconds_per_beat = 60 / bpm
    lyrics: list[TimedLyric] = []
    scenes: list[SongScene] = []
    elapsed_beats = 0
    line_end_times: list[float] = []
    current_scene: SongScene | None = None
    for line in plan.lines:
        start = elapsed_beats * seconds_per_beat
        elapsed_beats += line.beats
        end = elapsed_beats * seconds_per_beat
        lyrics.append(TimedLyric(text=line.text, start=round(start, 4), end=round(end, 4), scene=line.scene))
        if current_scene is not None and current_scene.template == line.scene and current_scene.end == round(start, 4):
            current_scene.end = round(end, 4)
        else:
            current_scene = SongScene(template=line.scene, start=round(start, 4), end=round(end, 4))
            scenes.append(current_scene)
        line_end_times.append(end)

    predict = plan.predict
    pause_time = line_end_times[predict.after_line - 1]
    return SongResponse(
        topic_id=topic_id,
        title=plan.title,
        bpm=bpm,
        lyrics=lyrics,
        scenes=scenes,
        pauses=[
            SongPause(
                at=round(pause_time, 4),
                question=predict.question,
                options=predict.options,
                correct=predict.correct,
                explain=predict.explain,
            )
        ],
        model_used=model_used,
        repairs_used=repairs_used,
    )


def fallback_song(topic_id: str, syllabus: dict[str, object]) -> SongResponse | None:
    path = SONG_DIR / f"{topic_id}.json"
    if not path.is_file():
        return None
    try:
        plan = SongPlan.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=500, detail=f"Fallback song for {topic_id!r} is invalid") from error
    errors = validate_song_plan(plan, syllabus["facts"], syllabus["scene_menu"])
    if errors:
        raise HTTPException(status_code=500, detail=f"Fallback song failed validation: {errors}")
    return song_response(topic_id, syllabus, plan, "fallback", 0)


def write_cached_song(song: SongResponse) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    destination = safe_cache_path(song.topic_id)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(song.model_dump_json(indent=2), encoding="utf-8")
    temporary.replace(destination)


def read_cached_song(topic_id: str) -> SongResponse | None:
    path = safe_cache_path(topic_id)
    if not path.is_file():
        return None
    try:
        return SongResponse.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=500, detail="Cached song is invalid") from error


app = FastAPI(title="learn-by-song API")


@app.get("/api/health")
async def health() -> dict[str, bool]:
    return {
        "groq_key_present": bool(os.getenv("GROQ_API_KEY", "").strip()),
        "openrouter_key_present": bool(os.getenv("OPENROUTER_API_KEY", "").strip()),
    }


@app.post("/api/quiz", response_model=PublicQuizResponse)
async def create_quiz(request: QuizRequest) -> PublicQuizResponse:
    syllabus = load_syllabus(request.topic_id)
    system_prompt, user_prompt = quiz_messages(QuizContent, syllabus["facts"], 5)
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    try:
        quiz, model_used = await call_model(messages, QuizContent, temperature=0.2, max_tokens=4000)
    except ModelCallError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    errors = validate_quiz_content(quiz, syllabus["facts"])
    if errors:
        raise HTTPException(status_code=502, detail="; ".join(errors))
    shuffle_options(quiz)
    return PublicQuizResponse(
        topic_id=request.topic_id,
        questions=[PublicQuizQuestion(**question.model_dump(exclude={"work"})) for question in quiz.questions],
        model_used=model_used,
        repairs_used=0,
    )


@app.post("/api/song", response_model=SongResponse)
async def create_song(
    request: SongRequest,
    fresh: Annotated[bool, Query()] = False,
) -> SongResponse:
    syllabus = load_syllabus(request.topic_id)
    if not fresh:
        cached = read_cached_song(request.topic_id)
        if cached is not None:
            return cached

    system_prompt, user_prompt = song_messages(SongPlan, syllabus["facts"], syllabus["scene_menu"])
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    errors: list[str] = []
    model_used = "fallback"
    repairs_used = 0
    plan: SongPlan | None = None
    try:
        plan, model_used = await call_model(messages, SongPlan, temperature=0.7, max_tokens=4000)
        for repairs_used in range(3):
            errors = validate_song_plan(plan, syllabus["facts"], syllabus["scene_menu"])
            if not errors:
                break
            if repairs_used == 2:
                break
            messages = [
                *messages,
                {"role": "assistant", "content": plan.model_dump_json()},
                {"role": "user", "content": repair_message(errors)},
            ]
            plan, model_used = await call_model(messages, SongPlan, temperature=0.7, max_tokens=4000)
            repairs_used += 1
    except ModelCallError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    if plan is not None and not errors:
        song = song_response(request.topic_id, syllabus, plan, model_used, repairs_used)
        write_cached_song(song)
        return song

    stale_cache = read_cached_song(request.topic_id)
    if stale_cache is not None:
        return stale_cache

    fallback = fallback_song(request.topic_id, syllabus)
    if fallback is not None:
        return fallback
    raise HTTPException(status_code=502, detail=f"Could not generate a valid song plan: {errors}")
