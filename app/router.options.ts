import type { RouterConfig } from "@nuxt/schema";
import { TAB_PATHS, tabScroll } from "./utils/tabScroll";

// Tab pages are kept alive, so returning to one restores where you were, like app tabs.
// Other pages keep Nuxt's default: scroll once the new page has loaded.
export default {
  scrollBehavior(to, from, savedPosition) {
    if (to.path === from.path) return false;
    const saved = TAB_PATHS.includes(to.path) ? tabScroll.get(to.path) : undefined;
    // A cached page renders straight away and may never fire page:loading:end.
    if (saved !== undefined) {
      const position = savedPosition ?? { left: 0, top: saved };
      return new Promise((resolve) => requestAnimationFrame(() => resolve(position)));
    }
    const position = savedPosition ?? { left: 0, top: 0 };
    return new Promise((resolve) => {
      useNuxtApp().hooks.hookOnce("page:loading:end", () => {
        requestAnimationFrame(() => resolve(position));
      });
    });
  },
} satisfies RouterConfig;
