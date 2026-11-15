// Tab pages are kept alive, so their fetched data goes stale while hidden.
// Runs `refresh` each time the page is shown again (not on first mount, where useFetch already ran).
export function onTabReturn(refresh: () => unknown) {
  let first = true;
  onActivated(() => {
    if (first) {
      first = false;
      return;
    }
    void refresh();
  });
}
