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
const activationSource = await readFile(new URL("../src/quiz/gen_activation.ts", import.meta.url), "utf8");
const activationJavascript = ts.transpileModule(activationSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const activationGenerator = await import(
  `data:text/javascript;base64,${Buffer.from(activationJavascript).toString("base64")}`
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

const referenceValue = (activation, z) => {
  switch (activation) {
    case "step": return z >= 0 ? 1 : 0;
    case "sigmoid": return 1 / (1 + Math.exp(-z));
    case "tanh": return Math.tanh(z);
    case "ReLU": return z > 0 ? z : 0;
    case "Leaky ReLU (alpha = 0.1)": return z >= 0 ? z : 0.1 * z;
    case "PReLU (alpha = 0.25)": return z >= 0 ? z : 0.25 * z;
    case "ELU (alpha = 1)": return z >= 0 ? z : Math.exp(z) - 1;
    case "swish": return z / (1 + Math.exp(-z));
    default: throw new Error(`Unknown activation ${activation}`);
  }
};
const referenceCases = [
  ["sigmoid", 2, 0.8808],
  ["tanh", -2, -0.9640],
  ["Leaky ReLU (alpha = 0.1)", -2, -0.2],
  ["ELU (alpha = 1)", -2, -0.8647],
  ["swish", 2, 1.7616],
];
const activationSeek = {
  step: 0,
  sigmoid: 19.88,
  tanh: 28.68,
  ReLU: 56.84,
  "Leaky ReLU (alpha = 0.1)": 66.94,
  "PReLU (alpha = 0.25)": 71.66,
  "ELU (alpha = 1)": 94.17,
  swish: 106.30,
};
for (const [activation, z, expected] of referenceCases) {
  assert.equal(Number(referenceValue(activation, z).toFixed(4)), expected, `${activation}(${z}) reference value`);
}

const activationTypes = new Set();
for (let index = 0; index < 500; index += 1) {
  const [question] = activationGenerator.generateActivationQuestions(random, 1);
  assert.ok(question, `Activation question ${index + 1} was not generated`);
  activationTypes.add(question.calculation.kind === "range"
    ? "range"
    : question.question.startsWith("Which function gives ")
      ? "function"
      : "output");
  assert.equal(new Set(question.options).size, question.options.length, `Activation question ${index + 1} has duplicate options`);
  assert.equal(
    question.options.filter((option) => option === question.expectedAnswer).length,
    1,
    `Activation question ${index + 1} does not have exactly one correct option`,
  );
  assert.equal(
    question.options[question.correct_index],
    question.expectedAnswer,
    `Activation question ${index + 1} has an incorrect answer index`,
  );
  assert.ok(activationGenerator.hasCorrectActivationArithmetic(question), `Activation question ${index + 1} has incorrect arithmetic`);
  if (question.calculation.kind === "output") {
    const { activation, z, value } = question.calculation;
    assert.equal(
      Number(referenceValue(activation, z).toFixed(2)),
      Number(value.toFixed(2)),
      `Activation question ${index + 1} differs from the independent reference`,
    );
    assert.equal(question.seek, activationSeek[activation]);
    assert.ok(question.question.includes(String(z)), `Activation question ${index + 1} omits z`);
    if (question.question.startsWith("Which function gives ")) {
      assert.ok(question.question.includes(Number(value.toFixed(2)).toFixed(2)));
    }
  } else {
    assert.match(question.question, /-1/);
    assert.match(question.question, /\b1\b/);
    assert.equal(question.seek, activationSeek.tanh);
  }
}
assert.deepEqual([...activationTypes].sort(), ["function", "output", "range"]);
const playQuestions = activationGenerator.generateActivationQuestions(random, 3);
assert.equal(playQuestions.filter((question) => question.calculation.kind === "range").length, 1);
const nextPlayQuestions = activationGenerator.generateActivationQuestions(
  random,
  3,
  playQuestions.map((question) => question.id),
);
assert.ok(nextPlayQuestions.every((question) => !playQuestions.some((previous) => previous.id === question.id)));

console.log("Validated 500 generated activation-function quiz questions.");
