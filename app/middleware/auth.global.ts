import { authClient } from "~~/lib/auth-client";

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login") return;
  const { data } = await authClient.useSession(useFetch);
  if (!data.value) return navigateTo("/login");
});
