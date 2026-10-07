import copy
import unittest

from api.validate import SongPlan, validate_song_plan


FACTS = [
    {"id": "inputs", "text": "Numeric input values."},
    {"id": "weights", "text": "Each input has a weight."},
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
        self.assertTrue(any("estimated syllables" in error and "4 beats expects 8" in error for error in errors), errors)

    def test_gate_pause_must_fall_between_gate_lines(self) -> None:
        plan = copy.deepcopy(GOOD_PLAN)
        plan["predict"]["after_line"] = 4
        errors = self.validate(plan)
        self.assertTrue(any("between two consecutive gate_fire lines" in error for error in errors), errors)

    def test_three_option_predict_question_passes(self) -> None:
        self.assertEqual(self.validate(copy.deepcopy(GOOD_PLAN)), [])


if __name__ == "__main__":
    unittest.main()
