import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

try:
    from .scene_params import TEMPLATE_PARAM_MODELS
except ImportError:
    from scene_params import TEMPLATE_PARAM_MODELS

MIN_SYLLABLES = 5
MAX_SYLLABLES = 11


class SongLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=240)
    beats: int = Field(ge=1, le=16)
    scene: str = Field(min_length=1)
    fact_id: str = Field(min_length=1)
    params: dict[str, Any] = Field(default_factory=dict)


class PredictQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    after_line: int = Field(ge=1)
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=3, max_length=4)
    correct: int = Field(ge=0)
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
    unknown_templates = sorted(set(scene_menu) - TEMPLATE_PARAM_MODELS.keys())
    if unknown_templates:
        errors.append(f"scene_menu contains unknown template(s): {', '.join(unknown_templates)}")

    if not 8 <= len(plan.lines) <= 12:
        errors.append(f"line count must be 8-12; got {len(plan.lines)}")

    fact_ids = {fact["id"] for fact in facts}
    used_fact_ids = {line.fact_id for line in plan.lines}
    for index, line in enumerate(plan.lines, start=1):
        if re.search(r"\d", line.text):
            errors.append(f"line {index} contains a digit; write numbers as words")
        if line.scene not in scene_menu:
            errors.append(f"line {index} has unknown scene {line.scene!r}; allowed scenes: {', '.join(scene_menu)}")
        elif line.scene in TEMPLATE_PARAM_MODELS:
            try:
                TEMPLATE_PARAM_MODELS[line.scene].model_validate(line.params)
            except ValidationError as error:
                errors.append(f"line {index} has invalid params for {line.scene!r}: {error}")
        if line.fact_id not in fact_ids:
            errors.append(f"line {index} has unknown fact_id {line.fact_id!r}")
        syllables = estimate_syllables(line.text)
        if not MIN_SYLLABLES <= syllables <= MAX_SYLLABLES:
            errors.append(
                f"line {index} has {syllables} estimated syllables; expects {MIN_SYLLABLES}-{MAX_SYLLABLES}"
            )

    missing_facts = sorted(fact_ids - used_fact_ids)
    if missing_facts:
        errors.append(f"every fact must be used; missing fact_id(s): {', '.join(missing_facts)}")
    if plan.predict.after_line > len(plan.lines):
        errors.append(
            f"predict.after_line must refer to an existing line (1-{len(plan.lines)}); "
            f"got {plan.predict.after_line}"
        )
    if plan.predict.correct >= len(plan.predict.options):
        errors.append(
            f"predict.correct must refer to an available option "
            f"(0-{len(plan.predict.options) - 1}); got {plan.predict.correct}"
        )
    if any(not option.strip() for option in plan.predict.options):
        errors.append("predict.options must not contain empty options")
    if "gate_fire" in scene_menu:
        pause_line = plan.predict.after_line
        if pause_line >= len(plan.lines):
            errors.append("predict.after_line must be before the final line to pause inside gate_fire")
        elif (
            plan.lines[pause_line - 1].scene != "gate_fire"
            or plan.lines[pause_line].scene != "gate_fire"
        ):
            errors.append("predict.after_line must fall between two consecutive gate_fire lines")
    return errors


def validate_quiz_content(quiz: Any, facts: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    fact_numbers = {
        number
        for fact in facts
        for number in re.findall(r"(?<![A-Za-z])[-+]?\d+(?:\.\d+)?", fact["text"])
    }

    for index, question in enumerate(quiz.questions, start=1):
        options = [option.strip().casefold() for option in question.options]
        if not isinstance(question.correct_index, int) or not 0 <= question.correct_index < len(question.options):
            errors.append(f"question {index} must designate exactly one correct option with a valid correct_index")
        if len(set(options)) != len(options):
            errors.append(f"question {index} has duplicate options")
        if any(re.search(r"\b(?:all|none) of the above\b", option) for option in options):
            errors.append(f"question {index} uses a prohibited all/none-of-the-above option")
        if not any(
            re.search(rf"(?<![\w.]){re.escape(number)}(?![\w.])", question.explanation)
            for number in fact_numbers
        ):
            errors.append(f"question {index} explanation must include a number from the facts")

    return errors
