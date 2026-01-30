<script setup lang="ts">
import { onMounted } from 'vue';
import { useServerStore } from "./stores/server";
import { useControlConnection } from "./lib/ws";

const store = useServerStore();
const client = useControlConnection();

onMounted(() => {
  client.connect();
});
</script>

<template>
  <main class="h-screen w-full bg-canvas"></main>
</template>