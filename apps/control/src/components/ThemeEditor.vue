<script setup lang="ts">
import { computed, reactive, watch, type DeepReadonly } from "vue";
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

const draft = reactive({
  activeThemeId: "default",
  lifetimeMs: "30000",
  fadeMs: "400",
  disappear: true,
  showNames: true,
  customCss: "",
  locales: {} as Record<string, string>,
});

const ui = reactive({
  dirty: false,
  hasSnapshot: false,
});

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function fromServer(t: DeepReadonly<ThemeState>) {
  draft.activeThemeId = t.activeThemeId;

  const v = t.values;
  draft.lifetimeMs = String(v.lifetimeMs ?? 30000);
  draft.fadeMs = String(v.fadeMs ?? 400);
  draft.disappear = !!v.disappear;
  draft.showNames = !!v.showNames;
  draft.customCss = (v.customCss as string) ?? "";

  // accept locales from either field if older snapshots exist
  const src = (v.locales || (v as any).templates || {}) as Record<
    string,
    string
  >;
  draft.locales = clone(src);

  ui.dirty = false;
  ui.hasSnapshot = true;
}

function isEquivalent(): boolean {
  if (!props.serverTheme) return true;
  const s = props.serverTheme.values;

  if (draft.activeThemeId !== props.serverTheme.activeThemeId) return false;
  if (draft.lifetimeMs !== String(s.lifetimeMs ?? 30000)) return false;
  if (draft.fadeMs !== String(s.fadeMs ?? 400)) return false;
  if (draft.disappear !== !!s.disappear) return false;
  if (draft.showNames !== !!s.showNames) return false;
  if (draft.customCss.trim() !== (s.customCss || "").trim()) return false;

  const src = (s.locales || (s as any).templates || {}) as Record<
    string,
    string
  >;
  if (JSON.stringify(draft.locales) !== JSON.stringify(src)) return false;

  return true;
}

watch(
  () => props.serverTheme,
  (t) => {
    if (!t) return;
    if (!ui.hasSnapshot || !ui.dirty) fromServer(t);
  },
  { immediate: true }
);

watch(
  draft,
  () => {
    if (ui.hasSnapshot) ui.dirty = !isEquivalent();
  },
  { deep: true }
);

const canEdit = computed(() => !!props.serverTheme);
const canApply = computed(
  () => props.connected && !!props.serverTheme && ui.dirty
);

function onReset() {
  if (!props.serverTheme) return;
  fromServer(props.serverTheme);
  emit("reset");
}

function onApply() {
  if (!props.serverTheme) return;

  emit("apply", {
    activeThemeId: draft.activeThemeId,
    values: {
      lifetimeMs: Number(draft.lifetimeMs) || 30000,
      fadeMs: Number(draft.fadeMs) || 400,
      disappear: draft.disappear,
      showNames: draft.showNames,
      customCss: draft.customCss,
      locales: draft.locales,
    },
  });

  ui.dirty = false;
}

function formatKey(key: string) {
  return key
    .split(".")
    .pop()!
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

const syncPillClass = computed(() =>
  ui.dirty ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
);
</script>

<template>
  <section class="space-y-6">
    <header class="flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-slate-900">Theme</div>
        <div v-if="!serverTheme" class="text-xs text-slate-500">
          Waiting for server snapshot…
        </div>
      </div>

      <span
        class="rounded-full px-2 py-1 text-xs font-semibold"
        :class="syncPillClass"
      >
        {{ ui.dirty ? "Draft modified" : "In sync" }}
      </span>
    </header>

    <fieldset :disabled="!canEdit" class="space-y-6">
      <!-- Behavior -->
      <div class="space-y-3">
        <div class="text-sm font-semibold text-slate-800">Behavior</div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1">
            <div class="text-xs font-semibold text-slate-600">
              Message lifetime (ms)
            </div>
            <input
              v-model="draft.lifetimeMs"
              class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white"
            />
          </label>

          <label class="space-y-1">
            <div class="text-xs font-semibold text-slate-600">
              Fade duration (ms)
            </div>
            <input
              v-model="draft.fadeMs"
              class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white"
            />
          </label>
        </div>

        <div class="flex flex-wrap gap-6 pt-1">
          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              v-model="draft.disappear"
              class="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
            />
            Auto-hide messages
          </label>

          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              v-model="draft.showNames"
              class="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
            />
            Display names
          </label>
        </div>
      </div>

      <div class="border-t border-slate-100"></div>

      <!-- Localization -->
      <div class="space-y-3">
        <div class="flex items-end justify-between gap-3">
          <div class="text-sm font-semibold text-slate-800">Localization</div>
          <div class="text-[11px] text-slate-500">
            Tags:
            <code class="text-accent">{user}</code>
            <code class="text-accent">{bits}</code>
            <code class="text-accent">{viewers}</code>
            <code class="text-accent">{tier}</code>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div v-for="(_, key) in draft.locales" :key="key" class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-600">
                {{ formatKey(key) }}
              </span>
              <span class="font-mono text-[10px] text-slate-400">{{
                key
              }}</span>
            </div>
            <input
              v-model="draft.locales[key]"
              class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white"
            />
          </div>
        </div>
      </div>

      <div class="border-t border-slate-100"></div>

      <!-- Custom CSS -->
      <div class="space-y-2">
        <div class="flex items-end justify-between gap-3">
          <div class="text-sm font-semibold text-slate-800">Custom CSS</div>
          <div class="text-[11px] font-mono text-slate-400">
            styleTag#maho-custom-css
          </div>
        </div>

        <textarea
          v-model="draft.customCss"
          spellcheck="false"
          class="min-h-72 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:border-accent focus:bg-white"
          placeholder="/* Add your CSS overrides here */"
        ></textarea>
      </div>

      <!-- Actions / errors -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4"
      >
        <div class="text-xs">
          <p v-if="lastError" class="text-red-600">{{ lastError }}</p>
          <p v-else class="text-slate-500">
            Changes are local until you “Save & apply”.
          </p>
        </div>

        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            @click="onReset"
            :disabled="!ui.dirty"
          >
            Reset
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
