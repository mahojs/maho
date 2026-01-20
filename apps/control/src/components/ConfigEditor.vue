<script setup lang="ts">
import { computed, reactive, watch, type DeepReadonly } from "vue";
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
};

const draft = reactive<Draft>({
  channel: "",
  twitchUsername: "",
  twitchToken: "",
  seventvUserId: "",
  maxMessages: "50",
});

const ui = reactive({
  dirty: false,
  hasSnapshot: false,
});

const localError = reactive<{ message: string | null }>({ message: null });

function fromServer(c: DeepReadonly<AppConfig>) {
  draft.channel = c.channel ?? "";
  draft.twitchUsername = c.twitchUsername ?? "";
  draft.twitchToken = ""; // never hydrate secrets back into the UI
  draft.seventvUserId = c.seventvUserId ?? "";
  draft.maxMessages = String(c.maxMessages ?? 50);

  ui.dirty = false;
  ui.hasSnapshot = true;
  localError.message = null;
}

function isEquivalent(d: Draft, remote: DeepReadonly<AppConfig>): boolean {
  // Note: twitchToken is intentionally excluded (write-only field)
  if (d.channel.trim() !== (remote.channel ?? "")) return false;
  if (d.twitchUsername.trim() !== (remote.twitchUsername ?? "")) return false;
  if (d.seventvUserId.trim() !== (remote.seventvUserId ?? "")) return false;
  if (Number(d.maxMessages) !== (remote.maxMessages ?? 50)) return false;
  return true;
}

watch(
  () => props.serverConfig,
  (c) => {
    if (!c) return;
    if (!ui.hasSnapshot || !ui.dirty) fromServer(c);
    else if (isEquivalent(draft, c)) ui.dirty = false;
  },
  { immediate: true }
);

watch(
  () => ({ ...draft }),
  () => {
    if (!ui.hasSnapshot) return;
    ui.dirty = !props.serverConfig
      ? true
      : !isEquivalent(draft, props.serverConfig);
  },
  { deep: true }
);

function parseIntStrict(label: string, raw: string): number {
  const s = raw.trim();
  if (s === "") throw new Error(`${label} is required`);
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${label} must be an integer`);
  }
  return n;
}

const canEdit = computed(() => !!props.serverConfig);
const canApply = computed(
  () => props.connected && !!props.serverConfig && ui.dirty
);

function onReset() {
  if (!props.serverConfig) return;
  fromServer(props.serverConfig);
  emit("reset");
}

function onApply() {
  localError.message = null;
  if (!props.serverConfig) return;

  try {
    const s = props.serverConfig;
    const patch: Partial<AppConfig> = {};

    const channel = draft.channel.trim();
    const twitchUsername = draft.twitchUsername.trim();
    const seventvUserId = draft.seventvUserId.trim();
    const twitchToken = draft.twitchToken.trim();

    if (channel !== (s.channel ?? "")) patch.channel = channel;
    if (twitchUsername !== (s.twitchUsername ?? ""))
      patch.twitchUsername = twitchUsername;
    if (seventvUserId !== (s.seventvUserId ?? ""))
      patch.seventvUserId = seventvUserId;
    if (twitchToken) patch.twitchToken = twitchToken;

    const maxMessages = parseIntStrict("Max messages", draft.maxMessages);
    if (maxMessages !== (s.maxMessages ?? 50)) patch.maxMessages = maxMessages;

    if (Object.keys(patch).length === 0) {
      ui.dirty = false;
      return;
    }

    emit("apply", patch);
    ui.dirty = false;
    draft.twitchToken = "";
  } catch (e) {
    localError.message = e instanceof Error ? e.message : String(e);
  }
}

const syncPillClass = computed(() =>
  ui.dirty ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
);
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-slate-900">Config</div>
        <div v-if="!serverConfig" class="text-xs text-slate-500">
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
      <!-- Connection -->
      <div class="space-y-3">
        <div class="text-sm font-semibold text-slate-800">Connection</div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1">
            <div class="text-xs font-semibold text-slate-600">
              Twitch channel
            </div>
            <input
              v-model="draft.channel"
              class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white"
              placeholder="Channel to join"
              autocomplete="off"
            />
          </label>

          <label class="space-y-1">
            <div class="text-xs font-semibold text-slate-600">7TV user ID</div>
            <input
              v-model="draft.seventvUserId"
              class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white"
              placeholder="e.g. 60ae..."
              autocomplete="off"
            />
          </label>
        </div>

        <label class="space-y-1">
          <div class="text-xs font-semibold text-slate-600">
            Max messages in buffer
          </div>
          <input
            v-model="draft.maxMessages"
            class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white"
            inputmode="numeric"
          />
        </label>
      </div>

      <div class="border-t border-slate-100"></div>

      <!-- Auth -->
      <div class="space-y-3">
        <div class="text-sm font-semibold text-slate-800">Authentication</div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1">
            <div class="text-xs font-semibold text-slate-600">Username</div>
            <input
              v-model="draft.twitchUsername"
              class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white"
              placeholder="justinfan123"
              autocomplete="off"
            />
          </label>

          <label class="space-y-1">
            <div class="text-xs font-semibold text-slate-600">
              Access token (oauth:...)
            </div>
            <input
              v-model="draft.twitchToken"
              type="password"
              class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white"
              :placeholder="
                serverConfig?.hasTwitchToken
                  ? '•••••••• (Stored)'
                  : 'oauth:xxxxxxxxxx'
              "
              autocomplete="off"
            />
          </label>
        </div>

        <p class="text-xs text-slate-500">
          Leave blank to connect anonymously. Tokens are saved locally in plain
          text.
        </p>
      </div>

      <!-- Actions / errors -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4"
      >
        <div class="text-xs">
          <p v-if="localError.message" class="text-red-600">
            {{ localError.message }}
          </p>
          <p v-else-if="lastError" class="text-red-600">
            {{ lastError }}
          </p>
          <p v-else class="text-slate-500">
            Changes are local until you save & apply
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
