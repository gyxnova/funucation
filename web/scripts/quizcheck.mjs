import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/quiz/gen.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const quizGenerator = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

let seed = 0x13579bdf;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};

for (let index = 0; index < 500; index += 1) {
  const [question] = quizGenerator.generateQuestions(random, 1);
  assert.ok(question, `Question ${index + 1} was not generated`);
  assert.equal(new Set(question.options).size, question.options.length, `Question ${index + 1} has duplicate options`);
  assert.equal(
    question.options.filter((option) => option === question.expectedAnswer).length,
    1,
    `Question ${index + 1} does not have exactly one correct option`,
  );
  assert.equal(
    question.options[question.correct_index],
    question.expectedAnswer,
    `Question ${index + 1} has an incorrect answer index`,
  );
  assert.ok(quizGenerator.hasCorrectArithmetic(question), `Question ${index + 1} has incorrect arithmetic`);
}

console.log("Validated 500 generated quiz questions.");
