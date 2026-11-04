<script setup lang="ts">
import { formatTarget } from "~~/shared/routines";

interface Exercise {
  id: string;
  name: string;
  type: string;
}

interface RoutineExerciseRow {
  id: string;
  exerciseId: string;
  name: string;
  type: string;
  position: number;
  targetSets: number | null;
  targetReps: number | null;
  targetWeightKg: string | null;
}

interface Routine {
  id: string;
  name: string;
  notes: string | null;
  exercises: RoutineExerciseRow[];
}

interface DraftRow {
  exerciseId: string;
  targetSets: string;
  targetReps: string;
  targetWeightKg: string;
}

interface LastSession {
  workoutId: string | null;
  startedAt: string | null;
  exercises: {
    exerciseId: string;
    name: string;
    type: string;
    targetSets: number;
    targetReps: number;
    targetWeightKg: string;
  }[];
}

const requestFetch = useRequestFetch();
const { data: routines, refresh: refreshRoutines } = await useFetch<{ items: Routine[] }>(
  "/api/routines",
);
const { data: exercises } = await useFetch<Exercise[]>("/api/exercises");

const sortedExercises = computed(() =>
  [...(exercises.value ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
);

const editingId = ref<string | null>(null);
const form = reactive({ name: "", notes: "" });
const rows = ref<DraftRow[]>([]);
const error = ref("");
const info = ref("");
const busy = ref(false);

function resetForm() {
  editingId.value = null;
  form.name = "";
  form.notes = "";
  rows.value = [];
  error.value = "";
  info.value = "";
}

function startEdit(routine: Routine) {
  editingId.value = routine.id;
  form.name = routine.name;
  form.notes = routine.notes ?? "";
  rows.value = routine.exercises.map((row) => ({
    exerciseId: row.exerciseId,
    targetSets: row.targetSets === null ? "" : String(row.targetSets),
    targetReps: row.targetReps === null ? "" : String(row.targetReps),
    targetWeightKg: row.targetWeightKg === null ? "" : String(Number(row.targetWeightKg)),
  }));
  error.value = "";
  info.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addRow() {
  const used = new Set(rows.value.map((row) => row.exerciseId));
  const next = sortedExercises.value.find((ex) => !used.has(ex.id)) ?? sortedExercises.value[0];
  if (!next) return;
  rows.value.push({ exerciseId: next.id, targetSets: "", targetReps: "", targetWeightKg: "" });
}

function moveRow(index: number, delta: number) {
  const target = index + delta;
  const row = rows.value[index];
  if (!row || target < 0 || target >= rows.value.length) return;
  rows.value.splice(index, 1);
  rows.value.splice(target, 0, row);
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}

async function copyLastSession() {
  error.value = "";
  info.value = "";
  busy.value = true;
  try {
    const url = editingId.value
      ? `/api/routines/last-session?routineId=${editingId.value}`
      : "/api/routines/last-session";
    const last = await requestFetch<LastSession>(url);
    if (!last.exercises.length) {
      info.value = "No completed workout to copy from yet.";
      return;
    }
    rows.value = last.exercises.map((row) => ({
      exerciseId: row.exerciseId,
      targetSets: String(row.targetSets),
      targetReps: String(row.targetReps),
      targetWeightKg: String(Number(row.targetWeightKg)),
    }));
    info.value = last.startedAt
      ? `Copied ${last.exercises.length} exercises from ${new Date(last.startedAt).toLocaleDateString(
          undefined,
          { day: "numeric", month: "short" },
        )}.`
      : `Copied ${last.exercises.length} exercises.`;
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? "Could not copy last session";
  } finally {
    busy.value = false;
  }
}

async function saveRoutine() {
  error.value = "";
  info.value = "";
  busy.value = true;
  const body = {
    name: form.name,
    notes: form.notes.trim() || null,
    exercises: rows.value.map((row) => ({
      exerciseId: row.exerciseId,
      targetSets: row.targetSets === "" ? null : Number(row.targetSets),
      targetReps: row.targetReps === "" ? null : Number(row.targetReps),
      targetWeightKg: row.targetWeightKg === "" ? null : Number(row.targetWeightKg),
    })),
  };

  try {
    if (editingId.value) {
      await requestFetch(`/api/routines/${editingId.value}`, { method: "PATCH", body });
    } else {
      await requestFetch("/api/routines", { method: "POST", body });
    }
    await refreshRoutines();
    resetForm();
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? "Could not save routine";
  } finally {
    busy.value = false;
  }
}

async function removeRoutine(id: string) {
  await requestFetch(`/api/routines/${id}`, { method: "DELETE" });
  await refreshRoutines();
  if (editingId.value === id) resetForm();
}

async function startRoutine(id: string) {
  error.value = "";
  try {
    await requestFetch("/api/workouts", { method: "POST", body: { routineId: id } });
    await navigateTo("/");
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? "Could not start routine";
  }
}
</script>

<template>
  <main class="page">
    <h1>Routines</h1>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="info" class="muted">{{ info }}</p>

    <form class="card" @submit.prevent="saveRoutine">
      <h2>{{ editingId ? "Edit routine" : "New routine" }}</h2>

      <div class="field">
        <label for="routine-name">Name</label>
        <input id="routine-name" v-model="form.name" maxlength="100" required />
      </div>
      <div class="field">
        <label for="routine-notes">Notes (optional)</label>
        <input id="routine-notes" v-model="form.notes" maxlength="2000" />
      </div>

      <div v-for="(row, index) in rows" :key="index" class="edit-row">
        <select v-model="row.exerciseId" aria-label="Exercise">
          <option v-for="ex in sortedExercises" :key="ex.id" :value="ex.id">{{ ex.name }}</option>
        </select>
        <div class="tools">
          <button
            type="button"
            class="danger icon"
            title="Move up"
            :disabled="index === 0"
            @click="moveRow(index, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="danger icon"
            title="Move down"
            :disabled="index === rows.length - 1"
            @click="moveRow(index, 1)"
          >
            ↓
          </button>
          <button type="button" class="danger icon" title="Remove" @click="removeRow(index)">
            ✕
          </button>
        </div>
        <div class="targets">
          <input
            v-model="row.targetSets"
            type="number"
            min="1"
            max="100"
            placeholder="Sets"
            aria-label="Target sets"
          />
          <input
            v-model="row.targetReps"
            type="number"
            min="1"
            max="1000"
            placeholder="Reps"
            aria-label="Target reps"
          />
          <input
            v-model="row.targetWeightKg"
            type="number"
            min="0"
            max="9999"
            step="0.5"
            placeholder="kg"
            aria-label="Target weight"
          />
        </div>
      </div>
      <p v-if="!rows.length" class="muted">No exercises yet.</p>

      <div class="actions">
        <button type="button" class="ghost" @click="addRow">+ Add exercise</button>
        <button type="button" class="ghost" :disabled="busy" @click="copyLastSession">
          Copy from last session
        </button>
      </div>

      <button type="submit" class="primary block" :disabled="busy || !rows.length">
        {{ editingId ? "Save changes" : "Create routine" }}
      </button>
      <button v-if="editingId" type="button" class="ghost" @click="resetForm">Cancel</button>
    </form>

    <h2>Saved routines</h2>
    <p v-if="!routines?.items.length" class="muted">No routines yet.</p>
    <div v-for="routine in routines?.items" :key="routine.id" class="card">
      <div class="card-head">
        <strong>{{ routine.name }}</strong>
        <button type="button" class="primary" @click="startRoutine(routine.id)">Start</button>
      </div>
      <p v-if="routine.notes" class="muted">{{ routine.notes }}</p>
      <ol class="routine-list">
        <li v-for="item in routine.exercises" :key="item.id">
          {{ item.name }}
          <span v-if="formatTarget(item.targetSets, item.targetReps, item.targetWeightKg)" class="muted">
            {{ formatTarget(item.targetSets, item.targetReps, item.targetWeightKg) }}
          </span>
        </li>
      </ol>
      <div class="actions">
        <button type="button" class="ghost" @click="startEdit(routine)">Edit</button>
        <button type="button" class="danger" @click="removeRoutine(routine.id)">Delete</button>
      </div>
    </div>
  </main>
</template>
