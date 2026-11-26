<script lang="ts">
  import Badge from './Badge.svelte';
  let failed = $state(false);
</script>

<!-- svelte-check does not type data-* on elements (temper check covers those); props of wrapper components are typed -->
<Badge data-tm-tone={failed ? 'danger' : 'success'}>ok</Badge>
<Badge data-tm-tone={failed ? 'danger' : 'sucess'}>bad</Badge> <!-- expect -->
<Badge data-tm-tone={failed && 'danger'}>bad</Badge> <!-- expect -->
