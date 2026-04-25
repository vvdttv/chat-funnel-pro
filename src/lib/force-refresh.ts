/**
 * Force refresh: limpa Service Workers e Cache Storage (PWA assets),
 * preservando localStorage e IndexedDB (dados offline do usuário).
 */
export async function forceRefresh(): Promise<void> {
  type CacheCleanupContext = Pick<Window, "navigator" | "caches">;
  const contexts: CacheCleanupContext[] = [window];

  for (const iframe of Array.from(document.querySelectorAll("iframe"))) {
    if (iframe.contentWindow) contexts.push(iframe.contentWindow);
  }

  await Promise.all(
    contexts.map(async (ctx) => {
      try {
        if ("serviceWorker" in ctx.navigator) {
          const registrations = await ctx.navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ("caches" in ctx) {
          const cacheNames = await ctx.caches.keys();
          await Promise.all(cacheNames.map((cacheName) => ctx.caches.delete(cacheName)));
        }
      } catch {
        // Ignora contextos inacessíveis; mantém dados offline intactos
      }
    })
  );

  const url = new URL(window.location.href);
  url.searchParams.set("sw-reset", Date.now().toString());
  window.location.replace(url.toString());
}
