import type { AppEvent, MessagePart } from "./schema/events";
import type { RenderAction } from "./schema/rules";

export type RenderLayer = {
  id: string;
  parts: MessagePart[];
};

export type PresentationPayload = {
  layout: "chat" | "alert";
  styleHint?: string;
  layers: RenderLayer[];
};

export type EvaluatedEvent = {
  event: AppEvent;
  actions: RenderAction[];
  presentation: PresentationPayload;
};
