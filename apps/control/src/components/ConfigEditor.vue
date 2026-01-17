<script setup lang="ts">
import { computed, reactive, watch, DeepReadonly } from "vue";
import type { AppConfig } from "@maho/shared";

const props = defineProps<{
  serverConfig: DeepReadonly<AppConfig> | null;
  connected: boolean;
  lastError?: string;
}>();

const emit = defineEmits<{
  (e: "apply", patch: Partial<AppConfig>): void;
  (e: "reset"): void;
}>();

type Draft = {
  channel: string;
  twitchUsername: string;
  twitchToken: string;
  seventvUserId: string;
  maxMessages: string;
  lifetimeMs: string;
  fadeMs: string;
  disappear: boolean;
  showNames: boolean;
  hideLinks: boolean;
  blocklistText: string;
  customCss: string;
};

const draft = reactive<Draft>({
  channel: "",
  twitchUsername: "",
  twitchToken: "",
  seventvUserId: "",
  maxMessages: "10",
  lifetimeMs: "30000",
  fadeMs: "400",
  disappear: true,
  showNames: true,
  hideLinks: false,
  blocklistText: "",
  customCss: "",
});

const ui = reactive({
  dirty: false,
  hasSnapshot: false,
});

function fromServer(c: DeepReadonly<AppConfig>) {
  draft.channel = c.channel ?? "";
  draft.twitchUsername = c.twitchUsername ?? "";
  draft.twitchToken = "";
  draft.seventvUserId = c.seventvUserId ?? "";
  draft.maxMessages = String(c.maxMessages ?? 10);
  draft.lifetimeMs = String(c.lifetimeMs ?? 30000);
  draft.fadeMs = String(c.fadeMs ?? 400);
  draft.disappear = !!c.disappear;
  draft.showNames = !!c.showNames;
  draft.hideLinks = !!c.hideLinks;
  draft.blocklistText = Array.isArray(c.blocklist)
    ? c.blocklist.join(", ")
    : "";
  draft.customCss = c.customCss ?? "";
  ui.dirty = false;
  ui.hasSnapshot = true;
}

watch(
  () => props.serverConfig,
  (c) => {
    if (!c) return;
    if (!ui.hasSnapshot) {
      fromServer(c);
      return;
    }
    if (!ui.dirty) fromServer(c);
  },
  { immediate: true }
);

watch(
  () => ({ ...draft }),
  () => {
    if (!ui.hasSnapshot) return;
    ui.dirty = true;
  },
  { deep: true }
);

function parseIntStrict(label: string, raw: string): number {
  const s = raw.trim();
  if (s === "") throw new Error(`${label} is required`);
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number`);
  if (!Number.isInteger(n)) throw new Error(`${label} must be an integer`);
  return n;
}

const localError = reactive<{ message: string | null }>({ message: null });

const canApply = computed(() => props.connected && !!props.serverConfig);

function onReset() {
  if (!props.serverConfig) return;
  fromServer(props.serverConfig);
  emit("reset");
}

function onApply() {
  localError.message = null;
  if (!props.serverConfig) return;

  try {
    const patch: Partial<AppConfig> = {};
    const s = props.serverConfig;

    // diff
    if (draft.channel.trim() !== s.channel) patch.channel = draft.channel.trim();
    if (draft.twitchUsername.trim() !== s.twitchUsername) patch.twitchUsername = draft.twitchUsername.trim();
    if (draft.seventvUserId.trim() !== s.seventvUserId) patch.seventvUserId = draft.seventvUserId.trim();
    if (draft.customCss !== s.customCss) patch.customCss = draft.customCss;

    if (draft.twitchToken.trim()) {
      patch.twitchToken = draft.twitchToken.trim();
    }

    const maxMsg = parseIntStrict("Max messages", draft.maxMessages);
    if (maxMsg !== s.maxMessages) patch.maxMessages = maxMsg;

    const life = parseIntStrict("Lifetime", draft.lifetimeMs);
    if (life !== s.lifetimeMs) patch.lifetimeMs = life;

    const fade = parseIntStrict("Fade", draft.fadeMs);
    if (fade !== s.fadeMs) patch.fadeMs = fade;

    if (draft.disappear !== s.disappear) patch.disappear = !!draft.disappear;
    if (draft.showNames !== s.showNames) patch.showNames = !!draft.showNames;
    if (draft.hideLinks !== s.hideLinks) patch.hideLinks = !!draft.hideLinks;

    const nextBlock = draft.blocklistText.split(/[,\n]/g).map((s) => s.trim()).filter(Boolean);

    if (JSON.stringify(nextBlock) !== JSON.stringify(s.blocklist)) {
      patch.blocklist = nextBlock;
    }

    // only emit if keys exist
    if (Object.keys(patch).length > 0) {
      emit("apply", patch);
    } else {
      ui.dirty = false;
    }

  } catch (e) {
    localError.message = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <section class="space-y-4">
    <header class="mb-3 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-slate-700">Configuration</h2>

      <span
        class="rounded-full px-2 py-1 text-xs font-semibold"
        :class="
          ui.dirty
            ? 'bg-amber-200 text-amber-900'
            : 'bg-emerald-200 text-emerald-900'
        "
      >
        {{ ui.dirty ? "Draft modified" : "In sync" }}
      </span>
    </header>

    <p v-if="!serverConfig" class="text-sm text-slate-500">
      Waiting for server snapshot…
    </p>

    <fieldset :disabled="!serverConfig" class="space-y-6">
      <div
        class="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3"
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1">
            <div class="text-xs text-slate-600">Twitch Channel</div>
            <input
              v-model="draft.channel"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="Channel to join"
              autocomplete="off"
            />
          </label>

          <label class="space-y-1">
            <div class="text-xs text-slate-600">7TV User ID</div>
            <input
              v-model="draft.seventvUserId"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. 60ae..."
              autocomplete="off"
            />
          </label>
        </div>

        <div class="rounded-md border border-slate-100 bg-slate-50 p-3">
          <div class="mb-2 text-xs font-semibold text-slate-800">
            Authentication
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1">
              <div class="text-xs text-slate-600">Username</div>
              <input
                v-model="draft.twitchUsername"
                class="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="justinfan123"
                autocomplete="off"
              />
            </label>
            <label class="space-y-1">
              <div class="text-xs text-slate-600">Access Token (oauth:...)</div>
              <input
                v-model="draft.twitchToken"
                type="password"
                class="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="oauth:xxxxxxxxxx"
                autocomplete="off"
              />
            </label>
          </div>
          <div class="mt-2 text-[10px] text-slate-700/80">
            Leave blank to connect anonymously. Tokens are saved locally in
            plain text.
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <label class="space-y-1">
            <div class="text-xs text-slate-600">Max messages</div>
            <input
              v-model="draft.maxMessages"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              inputmode="numeric"
            />
          </label>

          <label class="space-y-1">
            <div class="text-xs text-slate-600">Lifetime (ms)</div>
            <input
              v-model="draft.lifetimeMs"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              inputmode="numeric"
            />
          </label>

          <label class="space-y-1">
            <div class="text-xs text-slate-600">Fade (ms)</div>
            <input
              v-model="draft.fadeMs"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              inputmode="numeric"
            />
          </label>
        </div>

        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" v-model="draft.disappear" />
            Disappear
          </label>
          <label class="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" v-model="draft.showNames" />
            Show usernames
          </label>
          <label class="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" v-model="draft.hideLinks" />
            Hide links
          </label>
        </div>
      </div>

      <label class="space-y-1 block">
        <div class="text-xs text-slate-600">
          Blocklist (comma or newline separated)
        </div>
        <textarea
          v-model="draft.blocklistText"
          class="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        ></textarea>
      </label>

      <label class="space-y-1 block">
        <div class="flex items-center justify-between">
          <div class="text-xs font-bold text-slate-700">Custom CSS</div>
          <div class="text-[10px] text-slate-400">Target .chat-line</div>
        </div>

        <textarea
          v-model="draft.customCss"
          class="min-h-32 w-full rounded-md border border-slate-300 bg-slate-800 px-3 py-2 font-mono text-xs text-slate-100 leading-snug outline-none focus:border-blue-500"
          placeholder=".chat-line { background: red; }"
        ></textarea>
      </label>

      <div class="flex justify-end gap-2 pt-1 border-t border-slate-100 mt-4">
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          @click="onReset"
          :disabled="!serverConfig"
        >
          Reset draft
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

      <p v-if="localError.message" class="text-sm text-red-700">
        {{ localError.message }}
      </p>
      <p v-else-if="lastError" class="text-sm text-red-700">
        {{ lastError }}
      </p>
    </fieldset>
  </section>
</template>
