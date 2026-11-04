<script setup lang="ts">
interface SetRow {
  id: string;
  exerciseId: string;
  workoutId: string | null;
  reps: number;
  weightKg: string;
  performedAt: string;
  notes: string | null;
  rpe: string | null;
  isWarmup: boolean;
  exerciseName: string;
  workoutStartedAt: string | null;
  workoutEndedAt: string | null;
  workoutNotes: string | null;
}

const PAGE_SIZE = 20;
const requestFetch = useRequestFetch();

const { data: firstPage, refresh: refreshSets } = await useAsyncData("history-sets", () =>
  requestFetch<{ items: SetRow[]; hasMore: boolean }>(`/api/sets?limit=${PAGE_SIZE}`),
);

const rows = ref<SetRow[]>([]);
const hasMore = ref(false);
const loadingMore = ref(false);
const error = ref("");

watch(
  firstPage,
  (page) => {
    rows.value = page?.items ?? [];
    hasMore.value = page?.hasMore ?? false;
  },
  { immediate: true },
);

async function loadMore() {
  loadingMore.value = true;
  try {
    const page = await requestFetch<{ items: SetRow[]; hasMore: boolean }>(
      `/api/sets?limit=${PAGE_SIZE}&offset=${rows.value.length}`,
    );
    rows.value.push(...page.items);
    hasMore.value = page.hasMore;
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? "Could not load more sets";
  } finally {
    loadingMore.value = false;
  }
}

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = date.toDateString();
  if (key === today.toDateString()) return "Today";
  if (key === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function groupLabel(row: SetRow) {
  if (!row.workoutId || !row.workoutStartedAt) return dayLabel(new Date(row.performedAt));
  const start = new Date(row.workoutStartedAt);
  const startTime = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const prefix = `${dayLabel(start)} · ${startTime}`;
  if (!row.workoutEndedAt) return `${prefix} · in progress`;
  const endTime = new Date(row.workoutEndedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${prefix}–${endTime}`;
}

const days = computed(() => {
  const groups: { key: string; label: string; notes: string | null; items: SetRow[] }[] = [];
  for (const row of rows.value ?? []) {
    const date = new Date(row.performedAt);
    const key = row.workoutId ? `workout:${row.workoutId}` : `day:${date.toDateString()}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: groupLabel(row),
        notes: row.workoutId ? row.workoutNotes : null,
        items: [],
      };
      groups.push(group);
    }
    group.items.push(row);
  }
  return groups;
});

const pendingEdit = useState<SetRow | null>("edit-set", () => null);

function editRow(row: SetRow) {
  pendingEdit.value = row;
  return navigateTo("/");
}

async function removeSet(id: string) {
  await requestFetch(`/api/sets/${id}`, { method: "DELETE" });
  await refreshSets();
}

function timeOf(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <main class="page">
    <h1>History</h1>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="!days.length" class="muted">No sets logged yet.</p>

    <section v-for="day in days" :key="day.key" class="group">
      <div class="group-head">
        <h3>{{ day.label }}</h3>
        <span class="muted">{{ day.items.length }} {{ day.items.length === 1 ? "set" : "sets" }}</span>
      </div>
      <p v-if="day.notes" class="muted">{{ day.notes }}</p>
      <div class="set-list">
        <div v-for="row in day.items" :key="row.id" class="set-row">
          <div class="set-line">
            <NuxtLink class="set-name" :to="`/exercises/${row.exerciseId}`">
              {{ row.exerciseName }}
            </NuxtLink>
            <span class="set-load">
              {{ Number(row.weightKg) }} kg × {{ row.reps }}
            </span>
          </div>
          <div class="set-sub">
            <span>{{ timeOf(row.performedAt) }}</span>
            <span v-if="row.rpe" class="tag">RPE {{ Number(row.rpe) }}</span>
            <span v-if="row.isWarmup" class="tag">warmup</span>
            <span v-if="row.notes" class="set-note" :title="row.notes">{{ row.notes }}</span>
          </div>
          <div class="set-actions">
            <button class="danger" title="Edit set" @click="editRow(row)">✎</button>
            <button class="danger" title="Delete set" @click="removeSet(row.id)">✕</button>
          </div>
        </div>
      </div>
    </section>

    <button v-if="hasMore" type="button" :disabled="loadingMore" @click="loadMore">
      {{ loadingMore ? "Loading…" : "Load more" }}
    </button>
  </main>
</template>
