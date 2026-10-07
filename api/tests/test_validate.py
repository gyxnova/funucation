import copy
import unittest

from api.validate import SongPlan, validate_quiz_content, validate_song_plan
from types import SimpleNamespace


FACTS = [
    {"id": "inputs", "text": "Input values are 1, 0, and 1."},
    {"id": "weights", "text": "Weights are 0.5, -1, and 2."},
]
SCENES = ["inputs_bounce", "weights_light", "gate_fire"]
GOOD_PLAN = {
    "title": "Signals and Weights",
    "lines": [
        {"text": "Inputs roll into the light", "beats": 4, "scene": "inputs_bounce", "fact_id": "inputs"},
        {"text": "Each weight bends the line", "beats": 4, "scene": "weights_light", "fact_id": "weights"},
        {"text": "Inputs roll into the light", "beats": 4, "scene": "inputs_bounce", "fact_id": "inputs"},
        {"text": "Each weight bends the line", "beats": 4, "scene": "weights_light", "fact_id": "weights"},
        {"text": "Inputs roll into the light", "beats": 4, "scene": "gate_fire", "fact_id": "inputs"},
        {"text": "Each weight bends the line", "beats": 4, "scene": "gate_fire", "fact_id": "weights"},
        {"text": "Inputs roll into the light", "beats": 4, "scene": "inputs_bounce", "fact_id": "inputs"},
        {"text": "Each weight bends the line", "beats": 4, "scene": "weights_light", "fact_id": "weights"},
    ],
    "predict": {
        "after_line": 5,
        "question": "What happens if input 2 doubles?",
        "options": ["It doubles", "It halves", "It stays fixed"],
        "correct": 0,
        "explain": "The input value is doubled.",
    },
}


class ValidateSongPlanTests(unittest.TestCase):
    def validate(self, data: dict[str, object]) -> list[str]:
        return validate_song_plan(SongPlan.model_validate(data), FACTS, SCENES)

    def test_good_plan_passes(self) -> None:
        self.assertEqual(self.validate(copy.deepcopy(GOOD_PLAN)), [])

    def test_wrong_scene_name_fails_clearly(self) -> None:
        plan = copy.deepcopy(GOOD_PLAN)
        plan["lines"][0]["scene"] = "made_up_scene"
        errors = self.validate(plan)
        self.assertTrue(any("unknown scene 'made_up_scene'" in error for error in errors), errors)

    def test_unknown_fact_id_fails_clearly(self) -> None:
        plan = copy.deepcopy(GOOD_PLAN)
        plan["lines"][0]["fact_id"] = "made_up_fact"
        errors = self.validate(plan)
        self.assertTrue(any("unknown fact_id 'made_up_fact'" in error for error in errors), errors)

    def test_missing_fact_fails_clearly(self) -> None:
        plan = copy.deepcopy(GOOD_PLAN)
        for line in plan["lines"]:
            line["fact_id"] = "inputs"
        errors = self.validate(plan)
        self.assertTrue(any("missing fact_id(s): weights" in error for error in errors), errors)

    def test_bad_syllable_count_fails_clearly(self) -> None:
        plan = copy.deepcopy(GOOD_PLAN)
        plan["lines"][0]["text"] = "No"
        errors = self.validate(plan)
        self.assertTrue(any("estimated syllables" in error and "expects 5-11" in error for error in errors), errors)

    def test_gate_pause_must_fall_between_gate_lines(self) -> None:
        plan = copy.deepcopy(GOOD_PLAN)
        plan["predict"]["after_line"] = 4
        errors = self.validate(plan)
        self.assertTrue(any("between two consecutive gate_fire lines" in error for error in errors), errors)

    def test_three_option_predict_question_passes(self) -> None:
        self.assertEqual(self.validate(copy.deepcopy(GOOD_PLAN)), [])

    def test_song_lyric_rejects_digits(self) -> None:
        plan = copy.deepcopy(GOOD_PLAN)
        plan["lines"][0]["text"] = "Inputs 1, 0, 1 roll in"
        errors = self.validate(plan)
        self.assertTrue(any("line 1 contains a digit" in error for error in errors), errors)

    def test_quiz_rejects_invalid_correct_option_count(self) -> None:
        question = SimpleNamespace(
            options=["one", "two", "three"],
            correct_index=4,
            explanation="2.5 plus -1 is 1.5",
        )
        errors = validate_quiz_content(SimpleNamespace(questions=[question]), FACTS)
        self.assertTrue(any("exactly one correct option" in error for error in errors), errors)

    def test_quiz_rejects_duplicate_options(self) -> None:
        question = SimpleNamespace(
            options=["2.5", "2.5", "1.5"],
            correct_index=0,
            explanation="2.5 plus -1 is 1.5",
        )
        errors = validate_quiz_content(SimpleNamespace(questions=[question]), FACTS)
        self.assertTrue(any("duplicate options" in error for error in errors), errors)

    def test_quiz_rejects_all_or_none_option(self) -> None:
        question = SimpleNamespace(
            options=["2.5", "none of the above", "1.5"],
            correct_index=0,
            explanation="2.5 plus -1 is 1.5",
        )
        errors = validate_quiz_content(SimpleNamespace(questions=[question]), FACTS)
        self.assertTrue(any("prohibited all/none-of-the-above" in error for error in errors), errors)

    def test_quiz_explanation_must_include_fact_number(self) -> None:
        question = SimpleNamespace(
            options=["2.5", "1.5", "0"],
            correct_index=1,
            explanation="The total stays above zero.",
        )
        errors = validate_quiz_content(SimpleNamespace(questions=[question]), FACTS)
        self.assertTrue(any("must include a number from the facts" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
