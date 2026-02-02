import type { AppEvent, MessagePart, RenderAction } from "./schema";

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
