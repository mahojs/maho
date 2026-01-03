import type {
  AppConfig,
  Ruleset,
  EvaluatedEvent,
  AppEvent,
} from "@maho/shared";
import { setRuleset, type State } from "./state";
import { evaluateEvent } from "./state"; // move evaluateEvent somewhere else later

export type EventLogEntry = { revision: number; payload: EvaluatedEvent };

function bumpRevision(state: State): number {
  state.revision++;
  return state.revision;
}

export function appendEvent(
  state: State,
  payload: EvaluatedEvent
): EventLogEntry {
  const revision = bumpRevision(state);
  const entry = { revision, payload };

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
