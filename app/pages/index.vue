<script setup lang="ts">
import { EQUIPMENT } from "~~/shared/equipment";
import { authClient } from "~~/lib/auth-client";

interface SetRow {
  id: string;
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

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const { data: exercises, refresh: refreshExercises } = await useFetch<Exercise[]>("/api/exercises");
const { data: rows, refresh: refreshSets } = await useFetch<SetRow[]>("/api/sets");

const form = reactive({
  exerciseId: "",
  weightKg: "",
  reps: "",
  performedAt: nowLocal(),
});
const error = ref("");
const busy = ref(false);

const newExercise = reactive({ name: "", type: "barbell" });
const showNewExercise = ref(false);
const exerciseError = ref("");

async function addSet() {
  busy.value = true;
  error.value = "";
  try {
    await $fetch("/api/sets", {
      method: "POST",
      body: {
        exerciseId: form.exerciseId,
        weightKg: Number(form.weightKg),
        reps: Number(form.reps),
        performedAt: new Date(form.performedAt).toISOString(),
      },
    });
    form.performedAt = nowLocal();
    await refreshSets();
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? "Could not save set";
  } finally {
    busy.value = false;
  }
}

async function addExercise() {
  exerciseError.value = "";
  try {
    const created = await $fetch<Exercise>("/api/exercises", {
      method: "POST",
      body: { name: newExercise.name, type: newExercise.type },
    });
    await refreshExercises();
    form.exerciseId = created.id;
    newExercise.name = "";
    showNewExercise.value = false;
  } catch (err: any) {
    exerciseError.value = err?.data?.statusMessage ?? "Could not add exercise";
  }
}

async function removeSet(id: string) {
  await $fetch(`/api/sets/${id}`, { method: "DELETE" });
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

    <form @submit.prevent="addSet">
      <div>
        <label for="exercise">Exercise</label>
        <select id="exercise" v-model="form.exerciseId" required>
          <option value="" disabled>Pick an exercise</option>
          <option v-for="ex in exercises" :key="ex.id" :value="ex.id">
            {{ ex.name }} ({{ ex.type }})
          </option>
        </select>
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

      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="busy">{{ busy ? "Saving…" : "Add set" }}</button>
    </form>

    <h2>Recent sets</h2>
    <p v-if="!days.length" class="muted">No sets yet.</p>
    <div v-for="day in days" :key="day.key" class="day">
      <h3>{{ day.label }}</h3>
      <div v-for="row in day.items" :key="row.id" class="set">
        <span class="name">{{ row.exerciseName }}</span>
        <span class="load">{{ Number(row.weightKg) }} kg × {{ row.reps }}</span>
        <span class="time">
          {{ new Date(row.performedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }}
        </span>
        <button class="danger" title="Delete set" @click="removeSet(row.id)">✕</button>
      </div>
    </div>
  </main>
</template>
