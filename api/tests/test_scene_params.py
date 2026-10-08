import json
import math
import unittest
from pathlib import Path

from pydantic import ValidationError

from api.main import song_response
from api.scene_params import CurveDotParams, EquationBuildParams, FlowBoxesParams
from api.validate import PredictQuestion, SongLine, SongPlan


class SceneParameterTests(unittest.TestCase):
    def test_equation_build_requires_ordered_reveal_times(self) -> None:
        EquationBuildParams.model_validate({
            "lines": [
                {"text": "first = 1", "reveal_at": 0.1},
                {"text": "second = 2", "reveal_at": 0.8},
            ],
            "highlight_last": True,
        })
        with self.assertRaises(ValidationError):
            EquationBuildParams.model_validate({
                "lines": [
                    {"text": "first = 1", "reveal_at": 0.8},
                    {"text": "second = 2", "reveal_at": 0.1},
                ],
                "highlight_last": True,
            })

    def test_curve_dot_rejects_unknown_fields_and_out_of_range_markers(self) -> None:
        good_params = {
            "fn": "sigmoid",
            "morph_from": "step",
            "x_min": -4,
            "x_max": 4,
            "markers": [{"x": 0, "label": "zero"}],
            "caption": "smooth curve",
        }
        CurveDotParams.model_validate(good_params)
        with self.assertRaises(ValidationError):
            CurveDotParams.model_validate({**good_params, "extra": "not allowed"})
        with self.assertRaises(ValidationError):
            CurveDotParams.model_validate({
                **good_params,
                "markers": [{"x": 5, "label": "outside"}],
            })

    def test_flow_boxes_requires_a_connected_order(self) -> None:
        good_params = {
            "nodes": [
                {"id": "a", "label": "A", "value": "1", "x": 0.2, "y": 0.5},
                {"id": "b", "label": "B", "value": "2", "x": 0.8, "y": 0.5},
            ],
            "edges": [{"from": "a", "to": "b"}],
            "order": ["a", "b"],
            "caption": "from a to b",
        }
        FlowBoxesParams.model_validate(good_params)
        with self.assertRaises(ValidationError):
            FlowBoxesParams.model_validate({**good_params, "unexpected": True})
        with self.assertRaises(ValidationError):
            FlowBoxesParams.model_validate({**good_params, "order": ["b", "a"]})

    def test_activation_function_facts_match_computed_values(self) -> None:
        syllabus_path = Path(__file__).resolve().parents[1] / "data" / "syllabus" / "activation_functions.json"
        syllabus = json.loads(syllabus_path.read_text(encoding="utf-8"))
        facts = {fact["id"]: fact["text"] for fact in syllabus["facts"]}

        def step(z: float) -> int:
            return 1 if z >= 0 else 0

        def sigmoid(z: float) -> float:
            return 1 / (1 + math.exp(-z))

        def relu(z: float) -> float:
            return max(0, z)

        def sigmoid_slope(z: float) -> float:
            value = sigmoid(z)
            return value * (1 - value)

        self.assertEqual((step(-1), step(0), step(1)), (0, 1, 1))
        self.assertIn("1 when z >= 0 and 0 otherwise", facts["step"])
        self.assertAlmostEqual(sigmoid(-2), 0.1192, places=4)
        self.assertAlmostEqual(sigmoid(0), 0.5, places=4)
        self.assertAlmostEqual(sigmoid(2), 0.8808, places=4)
        self.assertIn("0.1192", facts["sigmoid_values"])
        self.assertIn("0.5", facts["sigmoid_values"])
        self.assertIn("0.8808", facts["sigmoid_values"])
        self.assertEqual((relu(-2), relu(3)), (0, 3))
        self.assertIn("max(0,z)", facts["relu_values"])
        step_slope = lambda z: (step(z + 0.001) - step(z - 0.001)) / 0.002
        self.assertEqual((step_slope(-1), step_slope(1)), (0, 0))
        self.assertIn("zero slope almost everywhere", facts["step_gradient"])
        self.assertIn("gradient learning cannot use it", facts["step_gradient"])
        self.assertGreater(sigmoid_slope(0), 0)
        self.assertLess(sigmoid_slope(-4), sigmoid_slope(0))
        self.assertLess(sigmoid_slope(4), sigmoid_slope(0))
        self.assertIn("smooth but flattens at both ends", facts["sigmoid_shape"])
        self.assertEqual((relu(1), relu(3), relu(8)), (1, 3, 8))
        self.assertIn("passes positive values unchanged", facts["relu_shape"])

    def test_generated_song_keeps_scene_params_and_splits_changed_params(self) -> None:
        plan = SongPlan(
            title="Activation functions",
            lines=[
                SongLine(
                    text="First equation line",
                    beats=4,
                    scene="equation_build",
                    fact_id="step",
                    params={"lines": [{"text": "step(z) = 1", "reveal_at": 0.1}], "highlight_last": True},
                ),
                SongLine(
                    text="Second equation line",
                    beats=4,
                    scene="equation_build",
                    fact_id="step",
                    params={"lines": [{"text": "step(z) = 0", "reveal_at": 0.2}], "highlight_last": True},
                ),
            ],
            predict=PredictQuestion(
                after_line=1,
                question="Which line is active?",
                options=["First", "Second", "Neither"],
                correct=0,
                explain="The first is revealed.",
            ),
        )
        song = song_response("activation_functions", {"bpm": 100}, plan, "test", 0)
        self.assertEqual(len(song.scenes), 2)
        self.assertEqual(song.scenes[0].params, plan.lines[0].params)
        self.assertEqual(song.scenes[1].params, plan.lines[1].params)


if __name__ == "__main__":
    unittest.main()
