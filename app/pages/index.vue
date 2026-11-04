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
import { authClient } from "~~/lib/auth-client";

interface SetRow {
  id: string;
  exerciseId: string;
  reps: number;
  weightKg: string;
  performedAt: string;
  exerciseName: string;
  exerciseType: string;
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

const PAGE_SIZE = 20;

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
const { data: firstPage, refresh: refreshSets } = await useAsyncData("sets", () =>
  requestFetch<{ items: SetRow[]; hasMore: boolean }>(`/api/sets?limit=${PAGE_SIZE}`),
);

const rows = ref<SetRow[]>([]);
const hasMore = ref(false);
const loadingMore = ref(false);

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
  } finally {
    loadingMore.value = false;
  }
}

const form = reactive({
  weightKg: "",
  reps: "",
  performedAt: nowLocal(),
});
const selectedExercise = ref<Exercise | null>(null);
const editingId = ref<string | null>(null);
const lastSet = ref<LastSet | null>(null);
const error = ref("");
const busy = ref(false);

const newExercise = reactive({ name: "", type: "barbell" });
const showNewExercise = ref(false);
const exerciseError = ref("");

const exerciseFilter = ref("");
const filteredExercises = computed(() => {
  const list = exercises.value ?? [];
  const query = exerciseFilter.value.trim().toLowerCase();
  return query ? list.filter((ex) => ex.name.toLowerCase().includes(query) || ex.type.includes(query)) : list;
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
  form.performedAt = nowLocal();
}

async function saveSet() {
  error.value = "";
  if (!selectedExercise.value) {
    error.value = "Pick an exercise";
    return;
  }
  busy.value = true;
  const body = {
    exerciseId: selectedExercise.value.id,
    weightKg: Number(form.weightKg),
    reps: Number(form.reps),
    performedAt: new Date(form.performedAt).toISOString(),
  };

  try {
    if (editingId.value) {
      await requestFetch(`/api/sets/${editingId.value}`, { method: "PATCH", body });
      editingId.value = null;
    } else {
      await requestFetch("/api/sets", { method: "POST", body });
    }
    form.performedAt = nowLocal();
    await refreshSets();
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

async function signOut() {
  await authClient.signOut();
  await navigateTo("/login");
}

const days = computed(() => {
  const groups: { key: string; label: string; items: SetRow[] }[] = [];
  for (const row of rows.value ?? []) {
    const date = new Date(row.performedAt);
    const key = date.toDateString();
    let group = groups.find((g) => g.key === key);
    if (!group) {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const label =
        key === today.toDateString()
          ? "Today"
          : key === yesterday.toDateString()
            ? "Yesterday"
            : date.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              });
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(row);
  }
  return groups;
});
</script>

<template>
  <main>
    <header>
      <h1>Gym tracker</h1>
      <button class="linkish" @click="signOut">Sign out</button>
    </header>

    <form @submit.prevent="saveSet">
      <div>
        <label for="exercise">Exercise</label>
        <ComboboxRoot v-model="selectedExercise" :ignore-filter="true" class="combobox">
          <ComboboxInput
            id="exercise"
            v-model="exerciseFilter"
            placeholder="Search exercises"
            autocomplete="off"
          />
          <ComboboxContent class="combobox-list">
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
        </ComboboxRoot>
        <p v-if="selectedExercise" class="muted">
          {{ editingId ? "Editing" : "Selected" }}: {{ selectedExercise.name }}
          <template v-if="lastSet && !editingId">
            · Last: {{ Number(lastSet.weightKg) }} kg × {{ lastSet.reps }} ·
            {{ new Date(lastSet.performedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) }}
          </template>
        </p>
        <button
          type="button"
          class="linkish"
          style="margin-top: 0.4rem"
          @click="showNewExercise = !showNewExercise"
        >
          {{ showNewExercise ? "Cancel" : "+ New exercise" }}
        </button>
      </div>

      <div v-if="showNewExercise">
        <div class="row">
          <div>
            <label for="new-name">Name</label>
            <input id="new-name" v-model="newExercise.name" required />
          </div>
          <div>
            <label for="new-type">Equipment</label>
            <select id="new-type" v-model="newExercise.type">
              <option v-for="type in EQUIPMENT" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>
        </div>
        <p v-if="exerciseError" class="error">{{ exerciseError }}</p>
        <button type="button" style="margin-top: 0.6rem" @click="addExercise">Add exercise</button>
      </div>

      <div class="row">
        <div>
          <label for="weight">Weight (kg)</label>
          <input
            id="weight"
            v-model="form.weightKg"
            type="number"
            inputmode="decimal"
            step="0.5"
            min="0"
            required
          />
        </div>
        <div>
          <label for="reps">Reps</label>
          <input id="reps" v-model="form.reps" type="number" inputmode="numeric" step="1" min="1" required />
        </div>
      </div>

      <div>
        <label for="performed">When</label>
        <input id="performed" v-model="form.performedAt" type="datetime-local" required />
      </div>

      <p v-if="editingId" class="edit-banner">
        Editing set —
        <button type="button" class="linkish" @click="cancelEdit">cancel</button>
      </p>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="busy">
        {{ busy ? "Saving…" : editingId ? "Save changes" : "Add set" }}
      </button>
    </form>

    <h2>Recent sets</h2>
    <p v-if="!days.length" class="muted">No sets yet.</p>
    <div v-for="day in days" :key="day.key" class="day">
      <h3>{{ day.label }}</h3>
      <div v-for="row in day.items" :key="row.id" class="set">
        <NuxtLink class="name" :to="`/exercises/${row.exerciseId}`">{{ row.exerciseName }}</NuxtLink>
        <span class="load">{{ Number(row.weightKg) }} kg × {{ row.reps }}</span>
        <span class="time">
          {{ new Date(row.performedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }}
        </span>
        <button class="danger" title="Edit set" @click="startEdit(row)">✎</button>
        <button class="danger" title="Delete set" @click="removeSet(row.id)">✕</button>
      </div>
    </div>

    <button v-if="hasMore" type="button" :disabled="loadingMore" @click="loadMore">
      {{ loadingMore ? "Loading…" : "Load more" }}
    </button>
  </main>
</template>
