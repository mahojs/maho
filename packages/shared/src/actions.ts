import type { AppEvent } from "./schema/events";
import type { RenderAction } from "./schema/rules";

export type { RenderAction };

export type EvaluatedEvent = {
  event: AppEvent;
  actions: RenderAction[];
};
