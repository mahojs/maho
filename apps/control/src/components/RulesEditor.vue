<script setup lang="ts">
import { computed, reactive, watch, DeepReadonly } from "vue";
import type { Ruleset } from "@maho/shared";

const props = defineProps<{
  serverRules: DeepReadonly<Ruleset> | null;
  connected: boolean;
  lastError?: string;
}>();

const emit = defineEmits<{
  (e: "apply", rules: Ruleset): void;
  (e: "reset"): void;
}>();

const ui = reactive({
  dirty: false,
  hasSnapshot: false,
  parseError: "" as string | null,
});

const draftText = reactive({ value: "" });

function pretty(v: unknown) {
  return JSON.stringify(v, null, 2);
}

function fromServer(r: DeepReadonly<Ruleset>) {
  draftText.value = pretty(r);
  ui.dirty = false;
  ui.hasSnapshot = true;
  ui.parseError = null;
}

watch(
  () => props.serverRules,
  (r) => {
    if (!r) return;
    if (!ui.hasSnapshot) {
      fromServer(r);
      return;
    }
    if (!ui.dirty) fromServer(r);
  },
  { immediate: true }
);

watch(
  () => draftText.value,
  () => {
    if (!ui.hasSnapshot) return;
    ui.dirty = true;
  }
);

const canApply = computed(() => props.connected && !!props.serverRules);

function onReset() {
  if (!props.serverRules) return;
  fromServer(props.serverRules);
  emit("reset");
}

function onFormat() {
  ui.parseError = null;
  try {
    const parsed = JSON.parse(draftText.value);
    draftText.value = pretty(parsed);
  } catch (e) {
    ui.parseError = e instanceof Error ? e.message : String(e);
  }
}

function onApply() {
  ui.parseError = null;
  if (!props.serverRules) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(draftText.value);
  } catch (e) {
    ui.parseError = e instanceof Error ? e.message : String(e);
    return;
  }

  emit("apply", parsed as Ruleset);
}
</script>

<template>
  <section class="space-y-4">
    <header class="mb-3 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-slate-700">Rules</h2>

      <span
        class="rounded-full px-2 py-1 text-xs font-semibold"
        :class="ui.dirty ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'"
      >
        {{ ui.dirty ? "Draft modified" : "In sync" }}
      </span>
    </header>

    <p v-if="!serverRules" class="text-sm text-slate-500">Waiting for server snapshot…</p>

    <fieldset :disabled="!serverRules" class="space-y-3">
      <label class="space-y-1">
        <div class="text-xs text-slate-600">Ruleset (JSON)</div>
        <textarea
          v-model="draftText.value"
          class="min-h-72 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs leading-snug outline-none focus:border-blue-500"
        ></textarea>
      </label>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          @click="onReset"
          :disabled="!serverRules"
        >
          Reset draft
        </button>

        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          @click="onFormat"
          :disabled="!serverRules"
        >
          Format
        </button>

        <button
          type="button"
          class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          @click="onApply"
          :disabled="!canApply"
        >
          Apply
        </button>
      </div>

      <p v-if="ui.parseError" class="text-sm text-red-700">JSON error: {{ ui.parseError }}</p>
      <p v-else-if="lastError" class="text-sm text-red-700">{{ lastError }}</p>
    </fieldset>
  </section>
</template>