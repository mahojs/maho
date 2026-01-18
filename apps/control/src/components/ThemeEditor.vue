<script setup lang="ts">
import { reactive, watch, DeepReadonly } from "vue";
import type { ThemeState, ThemePatch } from "@maho/shared";

const props = defineProps<{
  serverTheme: DeepReadonly<ThemeState> | null;
  connected: boolean;
  lastError?: string;
}>();

const emit = defineEmits<{
  (e: "apply", patch: ThemePatch): void;
  (e: "reset"): void;
}>();

type Draft = {
  activeThemeId: string;
  lifetimeMs: string;
  fadeMs: string;
  disappear: boolean;
  showNames: boolean;
  customCss: string;
};

const draft = reactive<Draft>({
  activeThemeId: "default",
  lifetimeMs: "30000",
  fadeMs: "400",
  disappear: true,
  showNames: true,
  customCss: "",
});

const ui = reactive({
  dirty: false,
  hasSnapshot: false,
});

function fromServer(t: DeepReadonly<ThemeState>) {
  draft.activeThemeId = t.activeThemeId;
  const v = t.values;

  draft.lifetimeMs = String(v.lifetimeMs ?? 30000);
  draft.fadeMs = String(v.fadeMs ?? 400);
  draft.disappear = !!v.disappear;
  draft.showNames = !!v.showNames;
  draft.customCss = (v.customCss as string) ?? "";

  ui.dirty = false;
  ui.hasSnapshot = true;
}

watch(
  () => props.serverTheme,
  (t) => {
    if (!t) return;
    if (!ui.hasSnapshot || !ui.dirty) {
      fromServer(t);
    }
  },
  { immediate: true }
);

watch(draft, () => {
  if (ui.hasSnapshot) ui.dirty = true;
});

function parseIntStrict(val: string, fallback: number) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function onApply() {
  if (!props.serverTheme) return;

  const nextValues: Record<string, any> = {
    lifetimeMs: parseIntStrict(draft.lifetimeMs, 30000),
    fadeMs: parseIntStrict(draft.fadeMs, 400),
    disappear: draft.disappear,
    showNames: draft.showNames,
    customCss: draft.customCss,
  };

  emit("apply", {
    activeThemeId: draft.activeThemeId,
    values: nextValues,
  });

  ui.dirty = false;
}
</script>

<template>
  <section class="space-y-4">
    <header class="mb-3 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-slate-700">Theme settings</h2>
      <span
        class="rounded-full px-2 py-1 text-xs font-semibold"
        :class="
          ui.dirty
            ? 'bg-amber-200 text-amber-900'
            : 'bg-emerald-200 text-emerald-900'
        "
      >
        {{ ui.dirty ? "Modified" : "Synced" }}
      </span>
    </header>

    <fieldset :disabled="!serverTheme" class="space-y-6">
      <div
        class="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3"
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1">
            <div class="text-xs text-slate-600">Lifetime (ms)</div>
            <input
              v-model="draft.lifetimeMs"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              inputmode="numeric"
            />
          </label>
          <label class="space-y-1">
            <div class="text-xs text-slate-600">Fade (ms)</div>
            <input
              v-model="draft.fadeMs"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              inputmode="numeric"
            />
          </label>
        </div>

        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" v-model="draft.disappear" /> Disappear
          </label>
          <label class="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" v-model="draft.showNames" /> Show names
          </label>
        </div>
      </div>

      <label class="space-y-1 block">
        <div class="text-xs font-bold text-slate-700">Custom CSS</div>
        <textarea
          v-model="draft.customCss"
          class="min-h-72 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs leading-snug outline-none focus:border-blue-500"
        ></textarea>
      </label>

      <div class="flex justify-end pt-4">
        <button
          type="button"
          class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
          @click="onApply"
        >
          Apply theme
        </button>
      </div>
    </fieldset>
  </section>
</template>
