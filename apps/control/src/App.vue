<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { createControlWs, type ControlLogEntry } from "./lib/ws";
import ConfigEditor from "./components/ConfigEditor.vue";
import RulesEditor from "./components/RulesEditor.vue";
import logoUrl from "./assets/logo.png";

const client = createControlWs();
const state = client.state;

type Tab = "console" | "config" | "rules";
const tab = ref<Tab>("console");

onMounted(() => client.connect());

const overlayUrl = computed(
  () => `${location.protocol}//${location.host}/overlay`
);

const status = computed(() => {
  switch (state.status) {
    case "connected":
      return { label: "Connected", cls: "bg-emerald-600" };
    case "connecting":
      return { label: "Connecting", cls: "bg-amber-500" };
    case "error":
      return { label: "Error", cls: "bg-red-600" };
    case "disconnected":
      return { label: "Disconnected", cls: "bg-red-500" };
    default:
      return { label: "Idle", cls: "bg-slate-500" };
  }
});

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatLogLine(e: ControlLogEntry): string {
  if (e.kind === "info") return e.message;
  if (e.kind === "notice") {
    const base = `${e.level.toUpperCase()}: ${e.message}`;
    return e.details ? `${base} — ${safeJson(e.details)}` : base;
  }
  const base = `ERROR: ${e.message}`;
  return e.details ? `${base} — ${safeJson(e.details)}` : base;
}

function applyConfig(next: any) {
  client.setConfig(next);
}

function applyRules(next: any) {
  client.setRules(next);
}

function tabBtn(t: Tab) {
  const active = tab.value === t;
  return [
    "px-3 py-2 text-sm font-semibold",
    "border-b-2",
    active
      ? "border-accent text-slate-900"
      : "border-transparent text-slate-500 hover:text-slate-800",
  ].join(" ");
}
</script>

<template>
  <main class="min-h-screen">
    <div class="mx-auto max-w-220 px-6 py-10">
      <header class="mb-6 flex flex-col items-center gap-3">
        <img :src="logoUrl" alt="maho" class="h-auto w-48 select-none" />

        <div
          class="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500"
        >
          <span
            class="inline-flex items-center rounded-full px-2 py-1 font-semibold text-white"
            :class="status.cls"
          >
            {{ status.label }}
          </span>
          <span v-if="state.revision >= 0" class="font-mono"
            >rev {{ state.revision }}</span
          >
          <span v-if="state.serverConfig?.channel" class="font-mono"
            >#{{ state.serverConfig.channel }}</span
          >
          <span v-if="state.lastError" class="text-red-600">{{
            state.lastError
          }}</span>
        </div>
      </header>

      <!-- Tabs -->
      <nav
        class="mb-4 flex items-center justify-center gap-6 border-b border-slate-200"
      >
        <button
          type="button"
          :class="tabBtn('console')"
          @click="tab = 'console'"
        >
          Console
        </button>
        <button type="button" :class="tabBtn('config')" @click="tab = 'config'">
          Config
        </button>
        <button type="button" :class="tabBtn('rules')" @click="tab = 'rules'">
          Rules
        </button>
      </nav>

      <section class="rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div
          class="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="text-sm text-slate-600">
            <span class="font-semibold text-slate-900">Overlay:</span>
            <a
              class="ml-2 text-accent underline underline-offset-2"
              :href="overlayUrl"
              target="_blank"
              rel="noreferrer"
            >
              {{ overlayUrl }}
            </a>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              @click="client.connect"
              :disabled="
                state.status === 'connected' || state.status === 'connecting'
              "
            >
              Connect
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              @click="client.disconnect"
              :disabled="state.status !== 'connected'"
            >
              Disconnect
            </button>
            <a
              class="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
              :href="overlayUrl"
              target="_blank"
              rel="noreferrer"
            >
              Open overlay
            </a>
          </div>
        </div>

        <div class="p-5">
          <div v-if="tab === 'console'">
            <div class="mb-3 text-sm font-semibold text-slate-800">Log</div>

            <div
              class="h-105 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-snug"
            >
              <div v-if="state.log.length === 0" class="text-slate-500">
                No log entries yet.
              </div>

              <div
                v-for="(e, idx) in state.log"
                :key="idx"
                class="whitespace-pre-wrap"
              >
                <span class="text-slate-400">[{{ formatTime(e.ts) }}]</span>
                <span class="ml-2 text-slate-900">{{ formatLogLine(e) }}</span>
              </div>
            </div>
          </div>

          <div v-else-if="tab === 'config'">
            <ConfigEditor
              :server-config="state.serverConfig"
              :connected="state.status === 'connected'"
              :last-error="state.lastError"
              @apply="applyConfig"
            />
          </div>

          <div v-else>
            <RulesEditor
              :server-rules="state.serverRules"
              :connected="state.status === 'connected'"
              :last-error="state.lastError"
              @apply="applyRules"
            />
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
