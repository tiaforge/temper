<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  let { children, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span data-tm-badge {...rest}>{@render children?.()}</span>
