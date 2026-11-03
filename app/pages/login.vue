<script setup lang="ts">
import { authClient } from "~~/lib/auth-client";

const email = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = "";
  const { error: err } = await authClient.signIn.email({
    email: email.value,
    password: password.value,
  });
  busy.value = false;
  if (err) {
    error.value = err.message ?? "Sign in failed";
    return;
  }
  await navigateTo("/");
}
</script>

<template>
  <main>
    <h1>Gym tracker</h1>
    <form @submit.prevent="submit">
      <div>
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="username" required />
      </div>
      <div>
        <label for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="busy">{{ busy ? "Signing in…" : "Sign in" }}</button>
    </form>
  </main>
</template>
