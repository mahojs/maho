import type { AppEvent } from "./events";

export type RenderAction =
  | { type: "addClass"; value: string }
  | { type: "setVar"; name: string; value: string }
  | { type: "suppress" };

export type EvaluatedEvent = {
  event: AppEvent;
  actions: RenderAction[];
};
