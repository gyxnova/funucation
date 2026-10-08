import json
from typing import Any

from pydantic import BaseModel

try:
    from .scene_params import TEMPLATE_PARAM_MODELS
    from .validate import MAX_SYLLABLES, MIN_SYLLABLES
except ImportError:
    from scene_params import TEMPLATE_PARAM_MODELS
    from validate import MAX_SYLLABLES, MIN_SYLLABLES


def _schema_json(schema_model: type[BaseModel]) -> str:
    return json.dumps(schema_model.model_json_schema(), ensure_ascii=False, indent=2)


def quiz_messages(
    schema_model: type[BaseModel],
    facts: list[dict[str, Any]],
    question_count: int,
) -> tuple[str, str]:
    system = f"""You write quiz questions for a short animated explainer. Output ONE JSON object, no markdown, no commentary, matching this schema exactly (field order matters, keep it):
{_schema_json(schema_model)}
Rules:
1. Use ONLY the facts and numbers in FACTS. Never invent numbers, terms or examples.
2. Each question must need a small calculation or a prediction using the example values. Do not ask for a definition.
3. Put the arithmetic in "work" first (e.g. "2.5 + (-3) = -0.5"), then choose the answer.
4. Exactly one option is correct. Wrong options are real learner mistakes: wrong sign, forgetting the bias, mixing up step and sigmoid. No "all of the above" or "none of the above".
5. Question under 25 words. Each option under 6 words. "explanation" must repeat the arithmetic.
6. State every number a calculation needs inside the question itself.
7. Return exactly {question_count} questions.
"""
    user = f"FACTS: {json.dumps(facts, ensure_ascii=False)}. Return JSON only."
    return system, user


def song_messages(
    schema_model: type[BaseModel],
    facts: list[dict[str, Any]],
    scenes: list[str],
) -> tuple[str, str]:
    system = f"""You are a songwriter for a classroom explainer. Output ONE JSON object, no markdown, matching this schema exactly:
{_schema_json(schema_model)}
Rules:
1. Use ONLY FACTS. Cover every fact in FACTS at least once. Every line gets a scene from SCENE_MENU. No filler lines.
2. Structure: verse, verse, chorus, verse, verse, instrumental break, bridge, chorus. The chorus repeats word for word, names the steps in order and ends on the action word.
3. Each four-beat line has {MIN_SYLLABLES} to {MAX_SYLLABLES} syllables, end rhymes (AABB or ABAB), simple words.
4. Write every number as words ("two point five"). No digits, symbols or formulas. Say variable names as spoken ("zee").
5. Chorus lines may carry a one-word echo in parentheses, like "(fire!)".
6. Never state anything FACTS does not say.
7. Each line has a "params" object. Use the matching scene parameter schema below; known legacy scenes use an empty object. Numeric node x/y values in flow_boxes are normalized canvas coordinates from 0 to 1.
SCENE PARAMETER SCHEMAS:
{json.dumps({name: model.model_json_schema() for name, model in TEMPLATE_PARAM_MODELS.items()}, ensure_ascii=False, indent=2)}
"""
    user = (
        f"SCENE_MENU: {json.dumps(scenes, ensure_ascii=False)}. "
        f"FACTS: {json.dumps(facts, ensure_ascii=False)}. Return JSON only."
    )
    return system, user


def repair_message(errors: list[str]) -> str:
    return f"Your JSON failed validation: {json.dumps(errors, ensure_ascii=False)}. Return the full corrected JSON only. Change only the parts at fault."
