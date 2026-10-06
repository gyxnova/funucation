import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class SongLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=240)
    beats: int = Field(ge=1, le=16)
    scene: str = Field(min_length=1)
    fact_id: str = Field(min_length=1)


class PredictQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    after_line: int = Field(ge=1)
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=4, max_length=4)
    correct: int = Field(ge=0, le=3)
    explain: str = Field(min_length=1, max_length=500)


class SongPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    lines: list[SongLine]
    predict: PredictQuestion


def estimate_syllables(text: str) -> int:
    words = re.findall(r"[a-z]+", text.lower())
    if not words:
        return 1
    count = 0
    for word in words:
        groups = re.findall(r"[aeiouy]+", word)
        syllables = len(groups)
        if word.endswith("e") and not word.endswith(("le", "ye")) and syllables > 1:
            syllables -= 1
        count += max(1, syllables)
    return count


def validate_song_plan(
    plan: SongPlan | dict[str, Any],
    facts: list[dict[str, str]],
    scene_menu: list[str],
) -> list[str]:
    if isinstance(plan, dict):
        try:
            plan = SongPlan.model_validate(plan)
        except ValidationError as error:
            return [f"Song plan schema is invalid: {error}"]

    errors: list[str] = []
    if not 8 <= len(plan.lines) <= 12:
        errors.append(f"line count must be 8-12; got {len(plan.lines)}")

    fact_ids = {fact["id"] for fact in facts}
    used_fact_ids = {line.fact_id for line in plan.lines}
    for index, line in enumerate(plan.lines, start=1):
        if line.scene not in scene_menu:
            errors.append(f"line {index} has unknown scene {line.scene!r}; allowed scenes: {', '.join(scene_menu)}")
        if line.fact_id not in fact_ids:
            errors.append(f"line {index} has unknown fact_id {line.fact_id!r}")
        expected = line.beats * 2
        syllables = estimate_syllables(line.text)
        if abs(syllables - expected) > 3:
            errors.append(
                f"line {index} has {syllables} estimated syllables; "
                f"{line.beats} beats expects {expected} (+/-3)"
            )

    missing_facts = sorted(fact_ids - used_fact_ids)
    if missing_facts:
        errors.append(f"every fact must be used; missing fact_id(s): {', '.join(missing_facts)}")
    if plan.predict.after_line > len(plan.lines):
        errors.append(
            f"predict.after_line must refer to an existing line (1-{len(plan.lines)}); "
            f"got {plan.predict.after_line}"
        )
    if any(not option.strip() for option in plan.predict.options):
        errors.append("predict.options must not contain empty options")
    return errors
