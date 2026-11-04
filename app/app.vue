<script setup lang="ts">
const route = useRoute();

const tabs = [
  { to: "/", label: "Log" },
  { to: "/history", label: "History" },
  { to: "/routines", label: "Routines" },
  { to: "/stats", label: "Stats" },
];

const showTabs = computed(() => route.path !== "/login");

function isActive(to: string) {
  if (to === "/") return route.path === "/" || route.path.startsWith("/exercises");
  return route.path === to;
}
</script>

<template>
  <div>
    <NuxtPage />
    <nav v-if="showTabs" class="tabbar" aria-label="Main">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="tab"
        :class="{ active: isActive(tab.to) }"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
