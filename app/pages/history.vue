<script setup lang="ts">
import { recordLabel } from "~~/shared/analysis";
import { formatSetLoad } from "~~/shared/cardio";

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
  durationSeconds: number | null;
  distanceKm: string | null;
  exerciseName: string;
  workoutStartedAt: string | null;
  workoutEndedAt: string | null;
  workoutNotes: string | null;
  records: { kind: string; reps: number }[];
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
  const groups: {
    key: string;
    label: string;
    notes: string | null;
    workoutId: string | null;
    startedAt: string | null;
    endedAt: string | null;
    items: SetRow[];
  }[] = [];
  for (const row of rows.value ?? []) {
    const date = new Date(row.performedAt);
    const key = row.workoutId ? `workout:${row.workoutId}` : `day:${date.toDateString()}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: groupLabel(row),
        notes: row.workoutId ? row.workoutNotes : null,
        workoutId: row.workoutId,
        startedAt: row.workoutStartedAt,
        endedAt: row.workoutEndedAt,
        items: [],
      };
      groups.push(group);
    }
    group.items.push(row);
  }
  return groups;
});

const pendingEdit = useState<SetRow | null>("edit-set", () => null);
const pendingLog = useState<{ workoutId: string; startedAt: string; endedAt: string | null } | null>(
  "log-into-workout",
  () => null,
);

const notesFor = ref<string | null>(null);
const notesDraft = ref("");
const dateFor = ref<string | null>(null);
const dateDraft = ref("");
const sessionError = ref("");
const sessionBusy = ref(false);

function localInput(date: Date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

async function patchSession(id: string, body: Record<string, unknown>) {
  sessionError.value = "";
  sessionBusy.value = true;
  try {
    await requestFetch(`/api/workouts/${id}`, { method: "PATCH", body });
    notesFor.value = null;
    dateFor.value = null;
    await refreshSets();
  } catch (err: any) {
    sessionError.value = err?.data?.statusMessage ?? "Could not update session";
  } finally {
    sessionBusy.value = false;
  }
}

function startNotes(group: { workoutId: string | null; notes: string | null }) {
  notesFor.value = group.workoutId;
  notesDraft.value = group.notes ?? "";
}

function startDate(group: { workoutId: string | null; startedAt: string | null }) {
  if (!group.startedAt) return;
  dateFor.value = group.workoutId;
  dateDraft.value = localInput(new Date(group.startedAt));
}

async function removeSession(group: { workoutId: string | null; items: SetRow[] }) {
  if (!group.workoutId) return;
  if (!window.confirm(`Delete this session and its ${group.items.length} sets?`)) return;
  sessionError.value = "";
  try {
    await requestFetch(`/api/workouts/${group.workoutId}`, { method: "DELETE" });
    await refreshSets();
  } catch (err: any) {
    sessionError.value = err?.data?.statusMessage ?? "Could not delete session";
  }
}

async function addSetTo(group: { workoutId: string | null; startedAt: string | null; endedAt: string | null }) {
  if (!group.workoutId || !group.startedAt) return;
  pendingLog.value = { workoutId: group.workoutId, startedAt: group.startedAt, endedAt: group.endedAt };
  await navigateTo("/");
}

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
    <p v-if="sessionError" class="error">{{ sessionError }}</p>
    <p v-if="!days.length" class="muted">No sets logged yet.</p>

    <section v-for="day in days" :key="day.key" class="group">
      <div class="group-head">
        <h3>{{ day.label }}</h3>
        <span class="muted">{{ day.items.length }} {{ day.items.length === 1 ? "set" : "sets" }}</span>
      </div>

      <div v-if="day.workoutId" class="actions">
        <button type="button" class="linkish" @click="addSetTo(day)">+ Set</button>
        <button type="button" class="linkish" @click="startNotes(day)">Notes</button>
        <button type="button" class="linkish" @click="startDate(day)">Date</button>
        <button type="button" class="danger" title="Delete session" @click="removeSession(day)">✕</button>
      </div>

      <div v-if="notesFor && notesFor === day.workoutId" class="details-body">
        <input v-model="notesDraft" maxlength="2000" placeholder="How did it go?" />
        <div class="actions">
          <button
            type="button"
            :disabled="sessionBusy"
            @click="patchSession(day.workoutId!, { notes: notesDraft.trim() || null })"
          >
            Save
          </button>
          <button type="button" class="ghost" @click="notesFor = null">Cancel</button>
        </div>
      </div>

      <div v-if="dateFor && dateFor === day.workoutId" class="details-body">
        <div class="field">
          <label :for="`date-${day.key}`">Session start</label>
          <input :id="`date-${day.key}`" v-model="dateDraft" type="datetime-local" />
        </div>
        <p class="muted">Every set in this session moves with it.</p>
        <div class="actions">
          <button
            type="button"
            :disabled="sessionBusy || !dateDraft"
            @click="patchSession(day.workoutId!, { startedAt: new Date(dateDraft).toISOString() })"
          >
            Save
          </button>
          <button type="button" class="ghost" @click="dateFor = null">Cancel</button>
        </div>
      </div>

      <p v-if="day.notes" class="muted">{{ day.notes }}</p>
      <div class="set-list">
        <div v-for="row in day.items" :key="row.id" class="set-row">
          <div class="set-line">
            <NuxtLink class="set-name" :to="`/exercises/${row.exerciseId}`">
              {{ row.exerciseName }}
            </NuxtLink>
            <span class="set-load">{{ formatSetLoad(row) }}</span>
          </div>
          <div class="set-sub">
            <span>{{ timeOf(row.performedAt) }}</span>
            <span v-if="row.rpe" class="tag">RPE {{ Number(row.rpe) }}</span>
            <span v-if="row.isWarmup" class="tag">warmup</span>
            <span v-for="pr in row.records" :key="pr.kind" class="tag pr">{{ recordLabel(pr.kind, pr.reps) }}</span>
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
