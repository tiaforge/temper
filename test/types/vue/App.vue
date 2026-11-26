<script setup lang="ts">
const props = defineProps<{ failed: boolean; collapsed: boolean }>();
</script>

<template>
  <span data-tm-badge :data-tm-tone="props.failed ? 'danger' : 'success'">ok</span>
  <nav data-tm-rail :data-tm-collapsed="props.collapsed || null"></nav>
  <span :data-tm-tone="props.failed ? 'danger' : 'sucess'">bad</span> <!-- expect -->
  <nav data-tm-rail :data-tm-collapsed="props.collapsed"></nav> <!-- expect -->
</template>
