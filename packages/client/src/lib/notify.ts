// The ONE user-notification seam (UI-Arch §2.1 `lib/` — the `notify` seam). Query/mutation global
// error toasts (`data/query-client.ts` QueryCache/MutationCache onError) and any imperative "tell the
// user" call route through HERE, never a toast lib directly — the toast impl binds ONCE at the
// composition root when the `@orb/ui/toast` provider mounts, so swapping the surface never touches a
// call site. Until bound, the console fallback keeps notifications observable (client noConsole
// allowlist: info/warn/error).

export interface Notify {
  readonly info: (message: string) => void;
  readonly success: (message: string) => void;
  readonly error: (message: string) => void;
}

const consoleNotify: Notify = {
  info: (message) => console.info(message),
  success: (message) => console.info(message),
  error: (message) => console.error(message),
};

let current: Notify = consoleNotify;

/** Composition-root-only: bind the real toast impl (main.tsx, once the toast provider mounts). */
export function bindNotify(impl: Notify): void {
  current = impl;
}

/** The stable facade every call site imports — delegates to whatever is currently bound. */
export const notify: Notify = {
  info: (message) => current.info(message),
  success: (message) => current.success(message),
  error: (message) => current.error(message),
};
