<script setup lang="ts">
import { computed, ref, watch, type DeepReadonly } from "vue";
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

const draftText = ref("");
const dirty = ref(false);
const parseError = ref<string | null>(null);
const hasSnapshot = ref(false);

function pretty(v: unknown) {
  return JSON.stringify(v, null, 2);
}

function loadFromServer(r: DeepReadonly<Ruleset>) {
  draftText.value = pretty(r);
  dirty.value = false;
  parseError.value = null;
  hasSnapshot.value = true;
}

watch(
  () => props.serverRules,
  (r) => {
    if (!r) return;
    // Only overwrite local draft if we don't have one yet, or user hasn't modified it.
    if (!hasSnapshot.value || !dirty.value) loadFromServer(r);
  },
  { immediate: true }
);

watch(
  draftText,
  () => {
    if (hasSnapshot.value) dirty.value = true;
  },
  { flush: "sync" }
);

const canEdit = computed(() => !!props.serverRules);
const canApply = computed(
  () => props.connected && !!props.serverRules && dirty.value
);

function onReset() {
  if (!props.serverRules) return;
  loadFromServer(props.serverRules);
  emit("reset");
}

function onFormat() {
  parseError.value = null;
  try {
    draftText.value = pretty(JSON.parse(draftText.value));
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e);
  }
}

function onApply() {
  parseError.value = null;
  if (!props.serverRules) return;

  try {
    emit("apply", JSON.parse(draftText.value) as Ruleset);
    dirty.value = false;
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e);
  }
}

const syncPillClass = computed(() =>
  dirty.value
    ? "bg-amber-100 text-amber-700"
    : "bg-emerald-100 text-emerald-700"
);
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-slate-900">Rules</div>
        <div v-if="!serverRules" class="text-xs text-slate-500">
          Waiting for server snapshot…
        </div>
      </div>

      <span
        class="rounded-full px-2 py-1 text-xs font-semibold"
        :class="syncPillClass"
      >
        {{ dirty ? "Draft modified" : "In sync" }}
      </span>
    </header>

    <fieldset :disabled="!canEdit" class="space-y-3">
      <textarea
        v-model="draftText"
        spellcheck="false"
        class="min-h-72 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-snug outline-none focus:border-accent focus:bg-white"
        placeholder="{}"
      ></textarea>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-xs">
          <p v-if="parseError" class="text-red-600">
            JSON error: {{ parseError }}
          </p>
          <p v-else-if="lastError" class="text-red-600">{{ lastError }}</p>
          <p v-else class="text-slate-500">
            Format before applying to catch JSON issues
          </p>
        </div>

        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            @click="onReset"
            :disabled="!dirty"
          >
            Reset
          </button>

          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            @click="onFormat"
            :disabled="!canEdit"
          >
            Format
          </button>

          <button
            type="button"
            class="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
            @click="onApply"
            :disabled="!canApply"
          >
            Save & apply
          </button>
        </div>
      </div>
    </fieldset>
  </section>
</template>
