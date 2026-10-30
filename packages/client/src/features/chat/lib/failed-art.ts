// Art URLs that failed to load, held outside the components. The transcript is windowed, so a row that scrolls out and
// back remounts; a failure kept in its own state would be lost with it, and the row would show the speaker's chip again
// until the image errored a second time. A URL is retried when the art asks for a different one, when the network
// returns (`online`) or the app comes back to the foreground (`visibilitychange` to visible), and on reload. There is
// no timer: a dropped connection, a restarting server and a lapsed session all end with one of those.

const failed = new Set<string>();
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Forget every failure so each mounted slot asks again. */
function retryFailedArt(): void {
  if (failed.size === 0) {
    return;
  }
  failed.clear();
  announce();
}

function retryWhenVisible(): void {
  if (document.visibilityState === "visible") {
    retryFailedArt();
  }
}

/** Remember `url` as failed and tell every mounted slot. */
export function rememberFailedArt(url: string): void {
  if (failed.has(url)) {
    return;
  }
  failed.add(url);
  announce();
}

/** Whether `url` failed to load since the last retry. */
export function isFailedArt(url: string): boolean {
  return failed.has(url);
}

/** Subscribe to changes. The first subscriber attaches the retry events to the window and the last detaches them. */
export function subscribeFailedArt(listener: () => void): () => void {
  if (listeners.size === 0) {
    globalThis.addEventListener("online", retryFailedArt);
    document.addEventListener("visibilitychange", retryWhenVisible);
  }
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      globalThis.removeEventListener("online", retryFailedArt);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    }
  };
}
