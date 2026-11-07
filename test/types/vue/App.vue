<script setup lang="ts">
const props = defineProps<{ failed: boolean; collapsed: boolean }>();
</script>

<template>
  <span data-badge :data-tone="props.failed ? 'danger' : 'success'">ok</span>
  <nav data-rail :data-collapsed="props.collapsed || null"></nav>
  <span :data-tone="props.failed ? 'danger' : 'sucess'">bad</span> <!-- expect -->
  <nav data-rail :data-collapsed="props.collapsed"></nav> <!-- expect -->
</template>
