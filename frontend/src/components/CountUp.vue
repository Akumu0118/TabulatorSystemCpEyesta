<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useCountUp } from '../motion'

const props = withDefaults(
  defineProps<{ value: number; decimals?: number; duration?: number; delay?: number }>(),
  { decimals: 0, duration: 900, delay: 0 }
)
const ready = ref(props.delay <= 0)
let t: ReturnType<typeof setTimeout> | undefined
onMounted(() => { if (!ready.value) t = setTimeout(() => { ready.value = true }, props.delay) })
onBeforeUnmount(() => clearTimeout(t))
const shown = useCountUp(() => (ready.value ? props.value : 0), props.duration)
</script>

<template><span class="num">{{ shown.toFixed(decimals) }}</span></template>
