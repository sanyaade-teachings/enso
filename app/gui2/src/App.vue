<script setup lang="ts">
import { provideGuiConfig, type GuiConfig } from '@/providers/guiConfig'
import { useSuggestionDbStore } from '@/stores/suggestionDatabase'
import ProjectView from '@/views/ProjectView.vue'
import { onMounted, toRef } from 'vue'

const props = defineProps<{
  config: GuiConfig
}>()

provideGuiConfig(toRef(props, 'config'))

// Initialize suggestion db immediately, so it will be ready when user needs it.
onMounted(() => useSuggestionDbStore())
</script>

<template>
  <ProjectView class="App flex" />
</template>

<style scoped>
@font-face {
  font-family: 'Monaspace Neon';
  font-style: normal;
  font-weight: 200;
  font-display: swap;
  src: url(/src/assets/fonts/MonaspaceNeon-ExtraLight.woff) format('woff');
}

@font-face {
  font-family: 'Monaspace Neon';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url(/src/assets/fonts/MonaspaceNeon-Light.woff) format('woff');
}

@font-face {
  font-family: 'Monaspace Neon';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(/src/assets/fonts/MonaspaceNeon-Regular.woff) format('woff');
}

@font-face {
  font-family: 'Monaspace Neon';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(/src/assets/fonts/MonaspaceNeon-Medium.woff) format('woff');
}

@font-face {
  font-family: 'Monaspace Neon';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(/src/assets/fonts/MonaspaceNeon-SemiBold.woff) format('woff');
}

@font-face {
  font-family: 'Monaspace Neon';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(/src/assets/fonts/MonaspaceNeon-Bold.woff) format('woff');
}

@font-face {
  font-family: 'Monaspace Neon';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url(/src/assets/fonts/MonaspaceNeon-ExtraBold.woff) format('woff');
}

.flex {
  flex: 1;
}

.App {
  color: var(--color-text);
  font-family: 'Monaspace Neon', 'M PLUS 1', sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 20px;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-variant-ligatures: common-ligatures;
  font-feature-settings: "calt", "liga", "dlig", "ss01", "ss02", "ss03", "ss05";
}
</style>
