# Project rules

- Every scene is a pure function of time `t`; do not use `Math.random` or `Date.now`.
- Use vanilla 2D canvas only; no WebGL or Three.js.
- Look lyrics up by their content through the lyrics API and never hard-code times inside scenes.
- Follow [docs/TREATMENT.md](docs/TREATMENT.md).
- Always render a still and look at it before saying a scene is done.
- Make one small change per task.
- Never edit files outside the task scope.
- Run the TypeScript typecheck and start the dev server before saying a web change is done.
