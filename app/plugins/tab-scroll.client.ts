export default defineNuxtPlugin(() => {
  useRouter().beforeEach((to, from) => {
    if (to.path !== from.path && TAB_PATHS.includes(from.path)) {
      tabScroll.set(from.path, window.scrollY);
    }
  });
});
