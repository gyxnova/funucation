import { inputsBounce } from "./inputs_bounce";
import { gateFire } from "./gate_fire";
import { sumNode } from "./sum_node";
import { weightUpdate } from "./weight_update";
import { weightsLight } from "./weights_light";
import { PALETTE } from "../engine/style";
import { drawSceneLabel } from "./_layout";
import type { SceneTemplate } from "../engine/engine";

const registeredTemplates: Record<string, SceneTemplate> = {
  inputs_bounce: inputsBounce,
  weights_light: weightsLight,
  sum_node: sumNode,
  gate_fire: gateFire,
  weight_update: weightUpdate,
};

const warnedMissing = new Set<string>();
const missingTemplates = new Map<string, SceneTemplate>();

export const templates: Readonly<Record<string, SceneTemplate>> = new Proxy(registeredTemplates, {
  get(target, property) {
    if (typeof property !== "string") return Reflect.get(target, property);
    if (Object.prototype.hasOwnProperty.call(target, property)) return target[property];

    if (!warnedMissing.has(property)) {
      warnedMissing.add(property);
      console.warn(`Unknown scene template: ${property}`);
    }
    let missingTemplate = missingTemplates.get(property);
    if (!missingTemplate) {
      missingTemplate = (context) => {
        drawSceneLabel(context, `missing scene: ${property}`, 96, 96, 24, PALETTE.ember);
      };
      missingTemplates.set(property, missingTemplate);
    }
    return missingTemplate;
  },
});
