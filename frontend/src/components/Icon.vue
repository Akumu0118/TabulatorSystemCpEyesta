<script setup lang="ts">
defineProps<{ name: IconName; size?: number }>()
</script>

<script lang="ts">
export type IconName = keyof typeof p
const p = {
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
  print: 'M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 017.5-2',
  wifi: 'M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01',
  wifiOff: 'M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01M3 3l18 18',
  out: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  check: 'M5 13l4 4L19 7',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  alert: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v5M12 16h.01',
  refresh: 'M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1'
}
</script>

<template>
  <svg
    :width="size ?? 18" :height="size ?? 18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
  ><path :d="p[name]" /></svg>
</template>
