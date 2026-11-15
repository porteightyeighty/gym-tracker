<script setup lang="ts">
const route = useRoute();

const tabs = [
  { to: "/", label: "Log" },
  { to: "/history", label: "History" },
  { to: "/routines", label: "Routines" },
  { to: "/stats", label: "Stats" },
];

const showTabs = computed(() => route.path !== "/login");

// Drill-down pages (an exercise) belong to whichever tab they were opened from.
const lastTab = useState("last-tab", () => "/");
watch(
  () => route.path,
  (path) => {
    if (tabs.some((tab) => tab.to === path)) lastTab.value = path;
  },
  { immediate: true },
);

function isActive(to: string) {
  if (route.path.startsWith("/exercises")) return lastTab.value === to;
  return route.path === to;
}
</script>

<template>
  <div>
    <NuxtLoadingIndicator />
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
