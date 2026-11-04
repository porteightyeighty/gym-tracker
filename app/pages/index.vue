<script setup lang="ts">
import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxRoot,
  ComboboxViewport,
} from "reka-ui";
import { EQUIPMENT } from "~~/shared/equipment";
import { formatTarget } from "~~/shared/routines";
import { authClient } from "~~/lib/auth-client";

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
  exerciseType: string;
  workoutStartedAt: string | null;
  workoutEndedAt: string | null;
  workoutNotes: string | null;
}

interface Workout {
  id: string;
  routineId: string | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
}

interface LogTarget {
  workoutId: string;
  startedAt: string;
  endedAt: string | null;
}

interface RoutineExercise {
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
  exercises: RoutineExercise[];
}

interface Exercise {
  id: string;
  name: string;
  type: string;
}

interface LastSet {
  reps: number;
  weightKg: string;
  performedAt: string;
}

function localInput(date: Date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function nowLocal() {
  return localInput(new Date());
}

const requestFetch = useRequestFetch();

const { data: exercises, refresh: refreshExercises } = await useFetch<Exercise[]>("/api/exercises");
const { data: activeWorkout, refresh: refreshActive } = await useFetch<Workout | null>(
  "/api/workouts/active",
);
const { data: routines } = await useFetch<{ items: Routine[] }>("/api/routines");
const { data: setPage, refresh: refreshSets } = await useAsyncData("session-sets", () =>
  requestFetch<{ items: SetRow[]; hasMore: boolean }>("/api/sets?limit=50"),
);

const rows = ref<SetRow[]>([]);
watch(
  setPage,
  (page) => {
    rows.value = page?.items ?? [];
  },
  { immediate: true },
);

const form = reactive({
  weightKg: "",
  reps: "",
  notes: "",
  rpe: "",
  isWarmup: false,
  performedAt: nowLocal(),
});
const selectedExercise = ref<Exercise | null>(null);
const editingId = ref<string | null>(null);
const lastSet = ref<LastSet | null>(null);
const error = ref("");
const busy = ref(false);
const detailsOpen = ref(false);
const pickerOpen = ref(false);

const workoutNotes = ref("");
const now = ref<number | null>(null);
let clock: ReturnType<typeof setInterval> | undefined;

watch(
  activeWorkout,
  (workout) => {
    workoutNotes.value = workout?.notes ?? "";
  },
  { immediate: true },
);

watch(editingId, (id) => {
  if (id) detailsOpen.value = true;
});

const pendingEdit = useState<SetRow | null>("edit-set", () => null);
const pendingLog = useState<LogTarget | null>("log-into-workout", () => null);
const logTarget = ref<LogTarget | null>(null);
const targetRows = ref<SetRow[]>([]);

function nextSlot(target: LogTarget, items: SetRow[]) {
  const last = items.reduce((max, row) => Math.max(max, new Date(row.performedAt).getTime()), 0);
  const base = last || new Date(target.endedAt ?? target.startedAt).getTime();
  return localInput(new Date(base + 180_000));
}

function nextPerformedAt() {
  return logTarget.value ? nextSlot(logTarget.value, targetRows.value) : nowLocal();
}

async function loadTargetRows() {
  const target = logTarget.value;
  if (!target) return;
  const page = await requestFetch<{ items: SetRow[] }>(
    `/api/sets?workoutId=${target.workoutId}&limit=100`,
  );
  if (logTarget.value?.workoutId === target.workoutId) targetRows.value = page.items;
}

function finishTarget() {
  logTarget.value = null;
  targetRows.value = [];
  return navigateTo("/history");
}

onMounted(() => {
  now.value = Date.now();
  clock = setInterval(() => {
    now.value = Date.now();
  }, 1_000);
  if (pendingEdit.value) {
    startEdit(pendingEdit.value);
    pendingEdit.value = null;
  }
  if (pendingLog.value) {
    logTarget.value = pendingLog.value;
    pendingLog.value = null;
    form.performedAt = nextPerformedAt();
    void loadTargetRows();
  }
});

onUnmounted(() => clearInterval(clock));

const elapsed = computed(() => {
  const workout = activeWorkout.value;
  if (!workout || now.value === null) return "";
  const minutes = Math.max(
    0,
    Math.floor((now.value - new Date(workout.startedAt).getTime()) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`;
});

const restEndsAt = ref<number | null>(null);
const restDuration = ref(90);

const restRemaining = computed(() => {
  if (restEndsAt.value === null || now.value === null) return 0;
  return Math.max(0, Math.ceil((restEndsAt.value - now.value) / 1000));
});

watch(restRemaining, (value, previous) => {
  if (value === 0 && previous > 0) navigator.vibrate?.(200);
});

function formatRest(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function startRest() {
  restEndsAt.value = Date.now() + restDuration.value * 1000;
}

function adjustRest(delta: number) {
  restDuration.value = Math.max(15, restDuration.value + delta);
  if (restEndsAt.value !== null) {
    restEndsAt.value = Math.max(Date.now(), restEndsAt.value + delta * 1000);
  }
}

function dismissRest() {
  restEndsAt.value = null;
}

async function startWorkout(routineId?: string) {
  error.value = "";
  try {
    await requestFetch("/api/workouts", {
      method: "POST",
      body: { routineId: routineId ?? null },
    });
    await refreshActive();
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? "Could not start workout";
  }
}

async function finishWorkout() {
  if (!activeWorkout.value) return;
  const empty = sessionRows.value.length === 0;
  if (!window.confirm(empty ? "Finish an empty workout?" : "Finish this workout?")) return;
  await requestFetch(`/api/workouts/${activeWorkout.value.id}`, {
    method: "PATCH",
    body: { endedAt: new Date().toISOString(), notes: workoutNotes.value },
  });
  dismissRest();
  await Promise.all([refreshActive(), refreshSets()]);
}

const newExercise = reactive({ name: "", type: "barbell" });
const showNewExercise = ref(false);
const exerciseError = ref("");

const exerciseFilter = ref("");
const filteredExercises = computed(() => {
  const list = exercises.value ?? [];
  const query = exerciseFilter.value.trim().toLowerCase();
  return query
    ? list.filter((ex) => ex.name.toLowerCase().includes(query) || ex.type.includes(query))
    : list;
});
const exerciseGroups = computed(() => {
  const groups: { type: string; items: Exercise[] }[] = [];
  for (const ex of filteredExercises.value) {
    let group = groups.find((g) => g.type === ex.type);
    if (!group) {
      group = { type: ex.type, items: [] };
      groups.push(group);
    }
    group.items.push(ex);
  }
  return groups;
});

async function prefillLast() {
  const id = selectedExercise.value?.id;
  lastSet.value = null;
  if (!id || editingId.value) return;
  const last = await requestFetch<LastSet | null>(`/api/exercises/${id}/last-set`);
  if (selectedExercise.value?.id !== id || editingId.value) return;
  lastSet.value = last;
  if (last) {
    form.weightKg = String(Number(last.weightKg));
    form.reps = String(last.reps);
  }
}

watch(selectedExercise, prefillLast);

function resetForm() {
  form.weightKg = "";
  form.reps = "";
  form.notes = "";
  form.rpe = "";
  form.isWarmup = false;
  form.performedAt = nextPerformedAt();
}

function stepWeight(delta: number) {
  const current = Number(form.weightKg) || 0;
  form.weightKg = String(Math.max(0, Math.round((current + delta) * 2) / 2));
}

function stepReps(delta: number) {
  const current = Number(form.reps) || 0;
  form.reps = String(Math.max(1, Math.round(current + delta)));
}

async function saveSet() {
  error.value = "";
  if (!selectedExercise.value) {
    error.value = "Pick an exercise";
    return;
  }
  busy.value = true;
  const intoTarget = editingId.value ? null : logTarget.value;
  const body = {
    exerciseId: selectedExercise.value.id,
    weightKg: Number(form.weightKg),
    reps: Number(form.reps),
    notes: form.notes.trim() || null,
    rpe: form.rpe === "" ? null : Number(form.rpe),
    isWarmup: form.isWarmup,
    performedAt: new Date(form.performedAt).toISOString(),
    ...(intoTarget ? { workoutId: intoTarget.workoutId } : {}),
  };

  try {
    const wasEditing = Boolean(editingId.value);
    if (editingId.value) {
      await requestFetch(`/api/sets/${editingId.value}`, { method: "PATCH", body });
      editingId.value = null;
    } else {
      await requestFetch("/api/sets", { method: "POST", body });
    }
    if (intoTarget) {
      await loadTargetRows();
      form.performedAt = nextPerformedAt();
    } else {
      if (!wasEditing && !form.isWarmup) startRest();
      form.performedAt = nowLocal();
      await refreshSets();
    }
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? "Could not save set";
  } finally {
    busy.value = false;
  }
}

function startEdit(row: SetRow) {
  editingId.value = row.id;
  selectedExercise.value = { id: row.exerciseId, name: row.exerciseName, type: row.exerciseType };
  form.weightKg = String(Number(row.weightKg));
  form.reps = String(row.reps);
  form.notes = row.notes ?? "";
  form.rpe = row.rpe ? String(Number(row.rpe)) : "";
  form.isWarmup = row.isWarmup;
  form.performedAt = localInput(new Date(row.performedAt));
  error.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function cancelEdit() {
  editingId.value = null;
  resetForm();
  await prefillLast();
}

async function addExercise() {
  exerciseError.value = "";
  try {
    const created = await $fetch<Exercise>("/api/exercises", {
      method: "POST",
      body: { name: newExercise.name, type: newExercise.type },
    });
    await refreshExercises();
    selectedExercise.value = created;
    newExercise.name = "";
    showNewExercise.value = false;
  } catch (err: any) {
    exerciseError.value = err?.data?.statusMessage ?? "Could not add exercise";
  }
}

async function removeSet(id: string) {
  await requestFetch(`/api/sets/${id}`, { method: "DELETE" });
  if (editingId.value === id) await cancelEdit();
  await refreshSets();
}

async function deleteEditing() {
  if (editingId.value) await removeSet(editingId.value);
}

async function signOut() {
  await authClient.signOut();
  await navigateTo("/login");
}

const sessionRows = computed(() =>
  logTarget.value
    ? targetRows.value
    : rows.value.filter((row) => row.workoutId === activeWorkout.value?.id),
);

const routine = computed(() => {
  const id = activeWorkout.value?.routineId;
  if (!id) return null;
  return routines.value?.items.find((item) => item.id === id) ?? null;
});

const routineItems = computed(() => {
  if (!routine.value) return [];
  const workoutId = activeWorkout.value?.id;
  const logged = new Set(
    rows.value
      .filter((row) => row.workoutId === workoutId && !row.isWarmup)
      .map((row) => row.exerciseId),
  );
  let nextFound = false;
  return routine.value.exercises.map((item) => {
    const done = logged.has(item.exerciseId);
    const next = !done && !nextFound;
    if (next) nextFound = true;
    return {
      ...item,
      done,
      next,
      target: formatTarget(item.targetSets, item.targetReps, item.targetWeightKg),
    };
  });
});

const currentTarget = computed(
  () => routineItems.value.find((item) => item.exerciseId === selectedExercise.value?.id)?.target ?? "",
);

function pickRoutineExercise(item: RoutineExercise) {
  selectedExercise.value = { id: item.exerciseId, name: item.name, type: item.type };
}

watch(
  routineItems,
  (items) => {
    if (editingId.value) return;
    const next = items.find((item) => item.next);
    if (next && selectedExercise.value?.id !== next.exerciseId) {
      pickRoutineExercise(next);
    }
  },
  { immediate: true },
);

function timeOf(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <main class="page" :class="{ 'has-rest': restEndsAt !== null }">
    <template v-if="!activeWorkout && !editingId && !logTarget">
      <header class="hero">
        <h1>Ready to train?</h1>
        <p class="muted">Start an empty workout, or jump into a routine.</p>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="button" class="primary block" @click="startWorkout()">Start workout</button>
      </header>

      <template v-if="routines?.items.length">
        <div v-for="item in routines.items" :key="item.id" class="card">
          <div class="card-head">
            <div>
              <strong>{{ item.name }}</strong>
              <p class="muted">{{ item.exercises.length }} exercises</p>
            </div>
            <button type="button" class="primary" @click="startWorkout(item.id)">Start</button>
          </div>
          <p v-if="item.notes" class="muted">{{ item.notes }}</p>
        </div>
      </template>
      <p v-else class="muted">
        No routines yet — <NuxtLink to="/routines">create one</NuxtLink>.
      </p>

      <div class="actions">
        <a href="/api/export.csv" class="ghost" download>Export CSV</a>
        <button type="button" class="ghost muted" @click="signOut">Sign out</button>
      </div>
    </template>

    <template v-else>
      <header v-if="!activeWorkout && !logTarget">
        <h1>Edit set</h1>
      </header>

      <header v-if="logTarget" class="session-head">
        <div class="grow">
          <h1>Add to session</h1>
          <p class="micro">
            {{
              new Date(logTarget.startedAt).toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
            }}
          </p>
        </div>
        <button type="button" class="ghost" @click="finishTarget">Done</button>
      </header>

      <header v-if="activeWorkout" class="session-head">
        <div class="grow">
          <h1>{{ routine?.name ?? "Freestyle" }}</h1>
          <p class="micro">Session</p>
        </div>
        <span v-if="elapsed" class="timer">{{ elapsed }}</span>
        <button type="button" class="ghost" @click="finishWorkout">Finish</button>
      </header>

      <div v-if="routineItems.length" class="chips">
        <button
          v-for="item in routineItems"
          :key="item.id"
          type="button"
          class="chip"
          :class="{
            done: item.done,
            next: item.next,
            active: selectedExercise?.id === item.exerciseId,
          }"
          @click="pickRoutineExercise(item)"
        >
          {{ item.done ? "✓" : item.next ? "→" : "·" }} {{ item.name }}
        </button>
      </div>

      <form class="card exercise-card" @submit.prevent="saveSet">
        <ComboboxRoot v-model="selectedExercise" v-model:open="pickerOpen" :ignore-filter="true">
          <div class="card-head">
            <div class="grow">
              <div class="exercise-name">
                {{ selectedExercise?.name ?? "Choose exercise" }}
              </div>
              <p v-if="currentTarget" class="muted">Target {{ currentTarget }}</p>
              <p v-else-if="selectedExercise" class="muted">{{ selectedExercise.type }}</p>
            </div>
            <button type="button" class="ghost" @click="pickerOpen = !pickerOpen">
              {{ pickerOpen ? "Close" : "Change" }}
            </button>
          </div>

          <ComboboxInput
            v-if="pickerOpen"
            v-model="exerciseFilter"
            placeholder="Search exercises"
            autocomplete="off"
            autofocus
          />
          <ComboboxContent v-if="pickerOpen" class="combobox-list">
            <ComboboxViewport>
              <ComboboxGroup v-for="group in exerciseGroups" :key="group.type">
                <ComboboxLabel class="combobox-group">{{ group.type }}</ComboboxLabel>
                <ComboboxItem v-for="ex in group.items" :key="ex.id" :value="ex" class="combobox-item">
                  {{ ex.name }}
                </ComboboxItem>
              </ComboboxGroup>
              <ComboboxEmpty class="combobox-empty">No matches</ComboboxEmpty>
            </ComboboxViewport>
          </ComboboxContent>

          <template v-if="pickerOpen">
            <button
              type="button"
              class="ghost"
              @click="showNewExercise = !showNewExercise"
            >
              {{ showNewExercise ? "Cancel" : "+ New exercise" }}
            </button>
            <div v-if="showNewExercise" class="details-body">
              <div class="row">
                <div class="field">
                  <label for="new-name">Name</label>
                  <input id="new-name" v-model="newExercise.name" required />
                </div>
                <div class="field">
                  <label for="new-type">Equipment</label>
                  <select id="new-type" v-model="newExercise.type">
                    <option v-for="type in EQUIPMENT" :key="type" :value="type">{{ type }}</option>
                  </select>
                </div>
              </div>
              <p v-if="exerciseError" class="error">{{ exerciseError }}</p>
              <button type="button" @click="addExercise">Add exercise</button>
            </div>
          </template>
        </ComboboxRoot>

        <p v-if="lastSet && !editingId" class="muted">
          Last: {{ Number(lastSet.weightKg) }} kg × {{ lastSet.reps }}
        </p>

        <div class="big-inputs">
          <div class="big-field">
            <label for="weight">Weight kg</label>
            <input
              id="weight"
              v-model="form.weightKg"
              type="number"
              inputmode="decimal"
              step="0.5"
              min="0"
              required
            />
            <div class="steppers">
              <button type="button" aria-label="Decrease weight" @click="stepWeight(-2.5)">−</button>
              <button type="button" aria-label="Increase weight" @click="stepWeight(2.5)">+</button>
            </div>
          </div>
          <div class="big-field">
            <label for="reps">Reps</label>
            <input
              id="reps"
              v-model="form.reps"
              type="number"
              inputmode="numeric"
              step="1"
              min="1"
              required
            />
            <div class="steppers">
              <button type="button" aria-label="Decrease reps" @click="stepReps(-1)">−</button>
              <button type="button" aria-label="Increase reps" @click="stepReps(1)">+</button>
            </div>
          </div>
        </div>

        <div class="card-head">
          <label class="toggle">
            <input v-model="form.isWarmup" type="checkbox" />
            Warmup
          </label>
          <button type="button" class="ghost" @click="startRest()">
            Rest {{ restDuration }}s
          </button>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="primary block log-btn" :disabled="busy">
          {{ busy ? "Saving…" : editingId ? "Save changes" : "Log set" }}
        </button>

        <details
          :open="detailsOpen"
          @toggle="detailsOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary>Details</summary>
          <div class="details-body">
            <div class="row">
              <div class="field">
                <label for="rpe">RPE</label>
                <input
                  id="rpe"
                  v-model="form.rpe"
                  type="number"
                  inputmode="decimal"
                  step="0.5"
                  min="1"
                  max="10"
                />
              </div>
              <div class="field">
                <label for="notes">Notes</label>
                <input id="notes" v-model="form.notes" maxlength="500" />
              </div>
            </div>
            <div class="field">
              <label for="performed">When</label>
              <input id="performed" v-model="form.performedAt" type="datetime-local" required />
            </div>
            <div v-if="editingId" class="actions">
              <span class="muted">Editing set</span>
              <button type="button" class="ghost" @click="cancelEdit">Cancel</button>
              <button type="button" class="danger" @click="deleteEditing">Delete</button>
            </div>
          </div>
        </details>
      </form>

      <section v-if="sessionRows.length" class="card">
        <h2>{{ logTarget ? "Session" : "This session" }} · {{ sessionRows.length }}</h2>
        <div class="set-list">
          <div v-for="row in sessionRows" :key="row.id" class="set-row">
            <div class="set-line">
              <span class="set-name">{{ row.exerciseName }}</span>
              <span class="set-load">{{ Number(row.weightKg) }} kg × {{ row.reps }}</span>
            </div>
            <div class="set-sub">
              <span>{{ timeOf(row.performedAt) }}</span>
              <span v-if="row.rpe" class="tag">RPE {{ Number(row.rpe) }}</span>
              <span v-if="row.isWarmup" class="tag">warmup</span>
              <span v-if="row.notes" class="set-note" :title="row.notes">{{ row.notes }}</span>
            </div>
            <div class="set-actions">
              <button class="danger" title="Edit set" @click="startEdit(row)">✎</button>
              <button class="danger" title="Delete set" @click="removeSet(row.id)">✕</button>
            </div>
          </div>
        </div>
      </section>

      <details v-if="activeWorkout">
        <summary>Workout notes</summary>
        <div class="details-body">
          <input v-model="workoutNotes" maxlength="2000" placeholder="How did it go?" />
        </div>
      </details>
    </template>

    <div v-if="restEndsAt !== null" class="restbar" aria-label="Rest timer">
      <strong class="time" :class="{ done: restRemaining === 0 }">
        {{ restRemaining ? formatRest(restRemaining) : "Rest done" }}
      </strong>
      <div class="actions">
        <button type="button" class="ghost" @click="adjustRest(-30)">−30</button>
        <button type="button" class="ghost" @click="adjustRest(30)">+30</button>
        <button type="button" class="danger" aria-label="Dismiss rest timer" @click="dismissRest">
          ✕
        </button>
      </div>
    </div>
  </main>
</template>
