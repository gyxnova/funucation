import json
import os
import re
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

if __package__:
    from .llm import ModelCallError, call_model
    from .validate import SongPlan, validate_song_plan
else:
    from llm import ModelCallError, call_model
    from validate import SongPlan, validate_song_plan


ROOT_DIR = Path(__file__).resolve().parent.parent
API_DIR = Path(__file__).resolve().parent
CACHE_DIR = API_DIR / "cache"
SYLLABUS_DIR = API_DIR / "data" / "syllabus"
SONG_DIR = API_DIR / "data" / "songs"
load_dotenv(ROOT_DIR / ".env")

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


class QuizContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questions: list[QuizQuestion] = Field(min_length=5, max_length=5)


class QuizResponse(QuizContent):
    topic_id: TopicId


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


def safe_cache_path(topic_id: str) -> Path:
    safe_topic_id = re.sub(r"[^a-zA-Z0-9_-]", "_", topic_id)
    return CACHE_DIR / f"{safe_topic_id}.json"


def quiz_cache_path(topic_id: str) -> Path:
    return CACHE_DIR / f"{re.sub(r'[^a-zA-Z0-9_-]', '_', topic_id)}-quiz.json"


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


def read_cached_quiz(topic_id: str) -> QuizResponse | None:
    path = quiz_cache_path(topic_id)
    if not path.is_file():
        return None
    try:
        cached = json.loads(path.read_text(encoding="utf-8"))
        return QuizResponse.model_validate({"topic_id": topic_id, **cached})
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=500, detail="Cached quiz is invalid") from error


def write_cached_quiz(topic_id: str, quiz: QuizContent) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    destination = quiz_cache_path(topic_id)
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


def song_prompt(syllabus: dict[str, object]) -> str:
    facts = json.dumps(syllabus["facts"], ensure_ascii=False)
    scenes = json.dumps(syllabus["scene_menu"], ensure_ascii=False)
    option_count = 3 if syllabus["topic_id"] == "perceptron" else 4
    options = json.dumps(["..."] * option_count)
    return (
        f"Write an educational song plan for {syllabus['title']} ({syllabus['topic_id']}).\n"
        f"Facts to teach: {facts}\n"
        f"Allowed scene names: {scenes}\n"
        "Return JSON only, with exactly this structure: "
        '{"title":"...","lines":[{"text":"...","beats":4,"scene":"...","fact_id":"..."}],'
        f'"predict":{{"after_line":6,"question":"...","options":{options},'
        '"correct":0,"explain":"..."}}.\n'
        "Rules: write 8-12 lyric lines; make each line 6-10 syllables at 4 beats; "
        "use each provided fact_id at least once; every scene must be from the allowed menu; "
        "after_line is a one-based line number; include one application-style predict question "
        f"with concrete numbers, exactly {option_count} options, a zero-based correct index, and a brief explanation. "
        "When gate_fire is in the scene menu, put after_line between two consecutive gate_fire lines. "
        "Do not invent facts."
    )


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
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/quiz", response_model=QuizResponse)
async def create_quiz(request: QuizRequest) -> QuizResponse:
    cached_quiz = read_cached_quiz(request.topic_id)
    if cached_quiz is not None:
        return cached_quiz

    messages = [
        {
            "role": "system",
            "content": "You create concise educational quizzes. Return only valid JSON matching the requested shape.",
        },
        {"role": "user", "content": quiz_prompt(request.topic_id)},
    ]
    try:
        quiz, _model_used = await call_model(messages, QuizContent)
    except ModelCallError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    write_cached_quiz(request.topic_id, quiz)
    return QuizResponse(topic_id=request.topic_id, questions=quiz.questions)


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

    messages = [
        {
            "role": "system",
            "content": "You write accurate educational songs. Return only valid JSON, without markdown fences.",
        },
        {"role": "user", "content": song_prompt(syllabus)},
    ]
    errors: list[str] = []
    model_used = "fallback"
    repairs_used = 0
    plan: SongPlan | None = None
    try:
        plan, model_used = await call_model(messages, SongPlan)
        for repairs_used in range(3):
            errors = validate_song_plan(plan, syllabus["facts"], syllabus["scene_menu"])
            if not errors:
                break
            if repairs_used == 2:
                break
            messages = [
                *messages,
                {"role": "assistant", "content": plan.model_dump_json()},
                {
                    "role": "user",
                    "content": (
                        "Repair the song plan and return the entire corrected JSON object. "
                        f"Fix these exact validation errors: {json.dumps(errors)}"
                    ),
                },
            ]
            plan, model_used = await call_model(messages, SongPlan)
            repairs_used += 1
    except ModelCallError as error:
        errors = [str(error)]

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
