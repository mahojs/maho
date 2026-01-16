import type {
  AppConfig,
  Ruleset,
  EvaluatedEvent,
  AppEvent,
} from "@maho/shared";
import { setRuleset, type State, evaluateEvent } from "./state";

export type EventLogEntry = { revision: number; payload: EvaluatedEvent };

export function appendEvent(
  state: State,
  payload: EvaluatedEvent
): EventLogEntry {
  state.eventSequence++;
  const entry = { seq: state.eventSequence, payload };

  state.eventLog.push(entry);
  if (state.eventLog.length > state.eventLogMax) {
    state.eventLog.splice(0, state.eventLog.length - state.eventLogMax);
  }

  return entry;
}

export function commitConfigInMemory(state: State, next: AppConfig) {
  state.config = next;
}

export function commitRulesInMemory(state: State, next: Ruleset) {
  setRuleset(state, next);
}

export function revertRulesInMemory(state: State, prev: Ruleset) {
  setRuleset(state, prev);
}

export function evaluateAndAppendEvent(
  state: State,
  ev: AppEvent
): EventLogEntry {
  const payload = evaluateEvent(state, ev);
  return appendEvent(state, payload);
}
