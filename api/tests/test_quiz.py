import unittest
from unittest.mock import patch

from api.main import QuizContent, QuizQuestion, shuffle_options


class ShuffleQuizOptionsTests(unittest.TestCase):
    def test_shuffling_preserves_correct_answer(self) -> None:
        quiz = QuizContent(
            questions=[
                QuizQuestion(
                    question="What is the result?",
                    options=["wrong A", "right answer", "wrong B", "wrong C"],
                    correct_index=1,
                    explanation="The arithmetic gives the right answer.",
                )
            ] + [
                QuizQuestion(question=f"Question {index}", options=["a", "b"], correct_index=0, explanation="Explanation.")
                for index in range(4)
            ],
        )
        with patch("api.main.random.shuffle", side_effect=lambda options: options.reverse()):
            shuffle_options(quiz)

        question = quiz.questions[0]
        self.assertEqual(question.options[question.correct_index], "right answer")
        self.assertEqual(question.options, ["wrong C", "wrong B", "right answer", "wrong A"])
        self.assertTrue(all(item.correct_index == 1 for item in quiz.questions[1:]))


if __name__ == "__main__":
    unittest.main()
