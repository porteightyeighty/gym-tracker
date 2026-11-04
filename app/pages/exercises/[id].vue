<script setup lang="ts">
import { dayStats, e1rm } from "~~/shared/progress";

interface Exercise {
  id: string;
  name: string;
  type: string;
}

interface SetRow {
  id: string;
  reps: number;
  weightKg: string;
  performedAt: string;
}

const route = useRoute();
const { data, error } = await useFetch<{ exercise: Exercise; sets: SetRow[] }>(
  () => `/api/exercises/${route.params.id}`,
);

const rows = computed(() => data.value?.sets ?? []);
const recent = computed(() => [...rows.value].reverse());
const days = computed(() => dayStats(rows.value));

const bestSet = computed(() => {
  let best: SetRow | null = null;
  for (const row of rows.value) {
    if (!best || Number(row.weightKg) > Number(best.weightKg)) best = row;
  }
  return best;
});

const bestE1rm = computed(() =>
  rows.value.reduce((max, row) => Math.max(max, e1rm(Number(row.weightKg), row.reps)), 0),
);
const totalVolume = computed(() =>
  rows.value.reduce((sum, row) => sum + Number(row.weightKg) * row.reps, 0),
);
const lastSet = computed(() => rows.value.at(-1) ?? null);

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function kg(value: string | number) {
  return `${round(Number(value))} kg`;
}

function shortDate(date: Date | string) {
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const chart = computed(() => {
  const points = days.value.map((day) => ({ date: day.date, value: day.topWeight }));
  if (!points.length) return null;

  const width = 600;
  const height = 180;
  const left = 44;
  const right = 12;
  const top = 12;
  const bottom = 26;
  const max = Math.max(...points.map((point) => point.value));
  const scaleMax = Math.max(max, 1);
  const x = (index: number) =>
    points.length === 1
      ? left + (width - left - right) / 2
      : left + (index * (width - left - right)) / (points.length - 1);
  const y = (value: number) => top + (1 - value / scaleMax) * (height - top - bottom);

  return {
    max,
    line: points.map((point, index) => `${x(index)},${y(point.value)}`).join(" "),
    points: points.map((point, index) => ({ ...point, x: x(index), y: y(point.value) })),
    maxY: y(max),
    zeroY: y(0),
    firstX: x(0),
    lastX: x(points.length - 1),
    firstDate: points[0]!.date,
    lastDate: points[points.length - 1]!.date,
  };
});
</script>

<template>
  <main>
    <p><NuxtLink to="/">← Back to log</NuxtLink></p>

    <p v-if="error" class="error">{{ error.statusMessage ?? "Could not load exercise" }}</p>

    <template v-else-if="data">
      <h1>
        {{ data.exercise.name }}
        <span class="muted">{{ data.exercise.type }}</span>
      </h1>

      <div class="stats">
        <div class="stat">
          <div class="label">Best set</div>
          <div class="value">{{ bestSet ? `${kg(bestSet.weightKg)} × ${bestSet.reps}` : "—" }}</div>
        </div>
        <div class="stat">
          <div class="label">Best e1RM</div>
          <div class="value">{{ bestE1rm ? `${round(bestE1rm)} kg` : "—" }}</div>
        </div>
        <div class="stat">
          <div class="label">Volume</div>
          <div class="value">{{ Math.round(totalVolume).toLocaleString() }} kg</div>
        </div>
        <div class="stat">
          <div class="label">Sessions</div>
          <div class="value">{{ days.length }}</div>
        </div>
        <div class="stat">
          <div class="label">Last performed</div>
          <div class="value">{{ lastSet ? shortDate(lastSet.performedAt) : "—" }}</div>
        </div>
      </div>

      <h2>Top set over time</h2>
      <svg v-if="chart" class="chart" viewBox="0 0 600 180" role="img" aria-label="Top set weight over time">
        <text x="0" :y="chart.zeroY + 4">0</text>
        <text v-if="chart.max > 0" x="0" :y="chart.maxY + 4">{{ Math.round(chart.max) }}</text>
        <polyline :points="chart.line" fill="none" stroke="var(--accent)" stroke-width="2" />
        <circle
          v-for="point in chart.points"
          :key="point.date.toISOString()"
          :cx="point.x"
          :cy="point.y"
          r="3"
          fill="var(--accent)"
        >
          <title>{{ shortDate(point.date) }}: {{ round(point.value) }} kg</title>
        </circle>
        <text :x="chart.firstX" y="174" text-anchor="start">{{ shortDate(chart.firstDate) }}</text>
        <text v-if="chart.points.length > 1" :x="chart.lastX" y="174" text-anchor="end">
          {{ shortDate(chart.lastDate) }}
        </text>
      </svg>
      <p v-else class="muted">No sets yet.</p>

      <h2>All sets</h2>
      <p v-if="!recent.length" class="muted">No sets yet.</p>
      <table v-else>
        <thead>
          <tr>
            <th>When</th>
            <th class="num">Weight</th>
            <th class="num">Reps</th>
            <th class="num">e1RM</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in recent" :key="row.id">
            <td>
              {{
                new Date(row.performedAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }}
            </td>
            <td class="num">{{ kg(row.weightKg) }}</td>
            <td class="num">{{ row.reps }}</td>
            <td class="num">{{ round(e1rm(Number(row.weightKg), row.reps)) }} kg</td>
          </tr>
        </tbody>
      </table>
    </template>
  </main>
</template>
