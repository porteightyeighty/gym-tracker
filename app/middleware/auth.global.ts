import { authClient } from "~~/lib/auth-client";

// Session is checked once per app load; refetching it on every navigation blocked each page change.
export default defineNuxtRouteMiddleware(async (to) => {
  const session = useState<unknown>("session", () => null);
  const checked = useState("session-checked", () => false);

  if (to.path === "/login") {
    session.value = null;
    checked.value = false;
    return;
  }

  if (!checked.value) {
    const { data } = await authClient.useSession(useFetch);
    session.value = data.value ?? null;
    checked.value = true;
  }

  if (!session.value) return navigateTo("/login");
});
