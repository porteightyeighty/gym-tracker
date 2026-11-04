<script setup lang="ts">
interface Stats {
  from: string;
  to: string;
  weekly: { week: string; volume: number; sets: number }[];
  equipment: { type: string; sets: number }[];
  totals: { sets: number; days: number; volume: number; streak: number };
}

interface BodyWeightRow {
  id: string;
  weightKg: string;
  measuredAt: string;
}

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const weeks = ref(12);
const requestFetch = useRequestFetch();

function localInput(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

const from = computed(() => {
  const start = startOfWeek(new Date());
  start.setDate(start.getDate() - (weeks.value - 1) * 7);
  return start;
});

const { data, error } = await useAsyncData(
  () => `stats-${weeks.value}`,
  () =>
    requestFetch<Stats>("/api/stats", {
      query: { from: from.value.toISOString(), to: new Date().toISOString(), tz },
    }),
  { watch: [weeks] },
);

function formatWeek(week: string) {
  return new Date(`${week}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function share(sets: number) {
  const total = data.value?.totals.sets ?? 0;
  return total ? `${Math.round((sets / total) * 100)}%` : "—";
}

const chart = computed(() => {
  const weekly = data.value?.weekly ?? [];
  if (!weekly.length) return null;

  const width = 600;
  const baseline = 154;
  const top = 12;
  const max = Math.max(...weekly.map((row) => row.volume), 1);
  const slot = width / weekly.length;

  return {
    max,
    baseline,
    first: weekly[0]?.week ?? "",
    last: weekly[weekly.length - 1]?.week ?? "",
    bars: weekly.map((row, index) => {
      const height = (row.volume / max) * (baseline - top);
      return {
        week: row.week,
        volume: row.volume,
        sets: row.sets,
        x: index * slot + slot * 0.15,
        y: baseline - height,
        width: slot * 0.7,
        height,
      };
    }),
  };
});

const { data: weights, refresh: refreshWeights } = await useFetch<{ items: BodyWeightRow[] }>(
  "/api/body-weights?limit=30",
);

const weightForm = reactive({ weightKg: "", measuredAt: localInput(new Date()) });
const weightError = ref("");
const weightBusy = ref(false);

async function saveWeight() {
  weightError.value = "";
  weightBusy.value = true;
  try {
    await requestFetch("/api/body-weights", {
      method: "POST",
      body: {
        weightKg: Number(weightForm.weightKg),
        measuredAt: new Date(weightForm.measuredAt).toISOString(),
      },
    });
    weightForm.weightKg = "";
    weightForm.measuredAt = localInput(new Date());
    await refreshWeights();
  } catch (err: any) {
    weightError.value = err?.data?.statusMessage ?? "Could not save weight";
  } finally {
    weightBusy.value = false;
  }
}

async function removeWeight(id: string) {
  await requestFetch(`/api/body-weights/${id}`, { method: "DELETE" });
  await refreshWeights();
}

const latestWeight = computed(() => weights.value?.items[0] ?? null);
const weightChange = computed(() => {
  const latest = latestWeight.value;
  const previous = weights.value?.items[1];
  if (!latest || !previous) return "—";
  const diff = Number(latest.weightKg) - Number(previous.weightKg);
  return `${diff > 0 ? "+" : ""}${Math.round(diff * 10) / 10} kg`;
});

const weightChart = computed(() => {
  const points = [...(weights.value?.items ?? [])].reverse().map((row) => ({
    date: new Date(row.measuredAt),
    value: Number(row.weightKg),
  }));
  if (!points.length) return null;

  const width = 600;
  const height = 180;
  const left = 44;
  const right = 12;
  const top = 12;
  const bottom = 26;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const span = max - min;
  const x = (index: number) =>
    points.length === 1
      ? left + (width - left - right) / 2
      : left + (index * (width - left - right)) / (points.length - 1);
  const y = (value: number) =>
    span === 0
      ? (top + height - bottom) / 2
      : top + (1 - (value - min) / span) * (height - top - bottom);

  return {
    min,
    max,
    line: points.map((point, index) => `${x(index)},${y(point.value)}`).join(" "),
    points: points.map((point, index) => ({ ...point, x: x(index), y: y(point.value) })),
    first: points[0] ?? null,
    last: points[points.length - 1] ?? null,
  };
});

function shortDate(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
</script>

<template>
  <main class="page">
    <h1>Stats</h1>

    <div class="segmented" role="group" aria-label="Range">
      <button
        v-for="option in [4, 12, 26]"
        :key="option"
        type="button"
        :class="{ active: weeks === option }"
        @click="weeks = option"
      >
        {{ option }} weeks
      </button>
    </div>

    <p v-if="error" class="error">{{ error.statusMessage ?? "Could not load stats" }}</p>

    <template v-else-if="data">
      <div class="stat-grid">
        <div class="stat">
          <div class="label">Sets</div>
          <div class="value">{{ data.totals.sets }}</div>
        </div>
        <div class="stat">
          <div class="label">Days trained</div>
          <div class="value">{{ data.totals.days }}</div>
        </div>
        <div class="stat">
          <div class="label">Volume</div>
          <div class="value">{{ Math.round(data.totals.volume).toLocaleString() }} kg</div>
        </div>
        <div class="stat">
          <div class="label">Streak</div>
          <div class="value">{{ data.totals.streak }} days</div>
        </div>
      </div>

      <h2>Weekly volume</h2>
      <svg
        v-if="chart"
        class="chart"
        viewBox="0 0 600 180"
        role="img"
        aria-label="Weekly training volume"
      >
        <line x1="0" :y1="chart.baseline" x2="600" :y2="chart.baseline" stroke="var(--border)" />
        <rect
          v-for="bar in chart.bars"
          :key="bar.week"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          rx="2"
          fill="var(--accent)"
        >
          <title>
            {{ formatWeek(bar.week) }}: {{ Math.round(bar.volume).toLocaleString() }} kg ·
            {{ bar.sets }} sets
          </title>
        </rect>
        <text x="0" y="10">{{ Math.round(chart.max).toLocaleString() }} kg</text>
        <text x="0" y="174">{{ formatWeek(chart.first) }}</text>
        <text x="600" y="174" text-anchor="end">{{ formatWeek(chart.last) }}</text>
      </svg>
      <p v-else class="muted">No sets in this range.</p>

      <h2>By equipment</h2>
      <table v-if="data.equipment.length">
        <thead>
          <tr>
            <th>Equipment</th>
            <th class="num">Sets</th>
            <th class="num">Share</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.equipment" :key="row.type">
            <td>{{ row.type }}</td>
            <td class="num">{{ row.sets }}</td>
            <td class="num">{{ share(row.sets) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">No sets in this range.</p>
    </template>

    <h2>Body weight</h2>
    <form class="card" @submit.prevent="saveWeight">
      <div class="row">
        <div class="field">
          <label for="weight-kg">Weight (kg)</label>
          <input
            id="weight-kg"
            v-model="weightForm.weightKg"
            type="number"
            inputmode="decimal"
            step="0.1"
            min="1"
            max="999"
            required
          />
        </div>
        <div class="field">
          <label for="weight-at">When</label>
          <input id="weight-at" v-model="weightForm.measuredAt" type="datetime-local" required />
        </div>
      </div>
      <p v-if="weightError" class="error">{{ weightError }}</p>
      <button type="submit" class="primary block" :disabled="weightBusy">
        {{ weightBusy ? "Saving…" : "Log weight" }}
      </button>
    </form>

    <template v-if="latestWeight">
      <div class="stat-grid">
        <div class="stat">
          <div class="label">Latest</div>
          <div class="value">{{ Number(latestWeight.weightKg) }} kg</div>
        </div>
        <div class="stat">
          <div class="label">Change</div>
          <div class="value">{{ weightChange }}</div>
        </div>
      </div>

      <svg
        v-if="weightChart"
        class="chart"
        viewBox="0 0 600 180"
        role="img"
        aria-label="Body weight over time"
      >
        <text x="0" y="10">{{ Math.round(weightChart.max * 10) / 10 }} kg</text>
        <text x="0" y="174">{{ Math.round(weightChart.min * 10) / 10 }} kg</text>
        <polyline :points="weightChart.line" fill="none" stroke="var(--accent)" stroke-width="2" />
        <circle
          v-for="point in weightChart.points"
          :key="point.date.toISOString()"
          :cx="point.x"
          :cy="point.y"
          r="3"
          fill="var(--accent)"
        >
          <title>{{ shortDate(point.date) }}: {{ point.value }} kg</title>
        </circle>
        <text v-if="weightChart.first" x="44" y="174">
          {{ shortDate(weightChart.first.date) }}
        </text>
        <text v-if="weightChart.last" x="588" y="174" text-anchor="end">
          {{ shortDate(weightChart.last.date) }}
        </text>
      </svg>

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th class="num">Weight</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in weights?.items.slice(0, 10)" :key="row.id">
            <td>{{ shortDate(row.measuredAt) }}</td>
            <td class="num">{{ Number(row.weightKg) }} kg</td>
            <td class="num">
              <button type="button" class="danger" title="Delete weigh-in" @click="removeWeight(row.id)">
                ✕
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <p v-else class="muted">No weigh-ins yet.</p>
  </main>
</template>
