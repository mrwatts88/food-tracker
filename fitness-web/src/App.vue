<template>
  <div class="app-container">
    <RouterView />
  </div>
</template>

<style>
:root {
  --color-calorie-primary: #10b981;
  --color-protein-primary: #3b82f6;
  --color-sugar-primary: #f97316;
  --color-caffeine-primary: #14b8a6;
  --color-carbs-primary: #a855f7;
  --color-sodium-primary: #ec4899;
  --color-steps-primary: #a3e635;
  --color-weight-primary: #f59e0b;
  --color-lifts-primary: #ef4444;
  --color-background: #1f2937;
  --color-surface: #374151;
  --color-text: #f9fafb;
  --color-text-secondary: #9ca3af;
  --border-radius: 12px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  overflow: hidden;
}

/* iOS 26 sizes an installed web app's viewport one status bar short whenever the page is
   shorter than the screen, which leaves a gap at the bottom. Keeping the document a full
   screen tall avoids that; #app is pinned to the real viewport so nothing scrolls. */
html {
  min-height: 100vh;
  min-height: 100lvh;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
    sans-serif;
  background: var(--color-background);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  touch-action: manipulation;
}

#app {
  position: fixed;
  inset: 0;
  /* Sits below the #top-edge bar defined in index.html. */
  top: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-background);
}

.app-container {
  width: 100%;
  max-width: 428px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  position: relative;
  overflow: hidden;
}

@media (min-width: 431px) {
  #app {
    /* No #top-edge bar at this width (see index.html). */
    top: 0;
    padding: var(--spacing-md) 0;
  }

  .app-container {
    border-radius: var(--border-radius);
    height: 100%;
    max-height: 844px;
  }
}

@media (min-width: 900px) {
  .app-container {
    border-radius: var(--border-radius);
  }
}
</style>
