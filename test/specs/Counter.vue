<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ initialCount?: number }>();
const count = ref(props.initialCount ?? 0);
</script>

<template>
  <div>
    <p id="count">Count: {{ count }}</p>
    <button id="inc" @click="count++">Increment</button>
    <button id="dec" @click="count--">Decrement</button>
  </div>
</template>
