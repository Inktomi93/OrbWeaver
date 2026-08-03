// Story module for the lib-tier CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// NotifyToastStory reproduces the EXACT main.tsx wiring of the `notify` seam's render half (F1): the
// D54 QueryCache/MutationCache `errorToast` channel (data/query-client.ts) → the `notify` facade →
// the toast manager bound at the composition root → `<ToastProvider>`/`<Toaster>` pixels. Before F1
// this middle was missing, so every errorToast-meta failure was console-only. The story mints the app
// QueryClient (the one whose MutationCache.onError reads `meta.errorToast`), binds `notify` to a real
// toast manager, and fires a mutation whose `meta.errorToast` message must reach a rendered toast.

import { createAppQueryClient } from "@orb/client/data";
import { bindNotify } from "@orb/client/lib";
import { createToastManager, Toaster, ToastProvider } from "@orb/ui/toast";
// @orb-gate-ignore query-machine-seals(useMutation): test-tier code the gate's `\.test\.tsx?$` scope
// cannot see — Spine-Testing §7 requires a CT to mount from a NON-test story module, so every
// `_ct-stories` file is test-tier while carrying a production filename. The raw `useMutation` is the
// SUBJECT: this story reproduces main.tsx's D54 MutationCache.onError→errorToast→notify channel, and
// createEntityMutation would put the client's own belt between the CT and the global channel under test.
// ENDS WHEN: query-machine-seals widens its test scope to `_ct-stories` modules, or this story is
// deleted. §4.3a position-named — an import line can carry BOTH sealed hooks, and a bare marker here
// would silently absolve a future `useInfiniteQuery` on the same line.
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

// Minted OUTSIDE React and bound ONCE — exactly the main.tsx posture. Fresh browser context per CT
// test (ct-data-providers.tsx header) → module state starts clean, so the bind is per-test-clean.
const toastManager = createToastManager();
bindNotify({
  info: (message): void => {
    toastManager.add({ title: message });
  },
  success: (message): void => {
    toastManager.add({ title: message, type: "success" });
  },
  error: (message): void => {
    toastManager.add({ title: message, type: "error", priority: "high" });
  },
});

// The REAL app QueryClient — its MutationCache.onError is the D54 errorToast→notify channel under test.
const queryClient = createAppQueryClient();

/** The failure message the mutation's `meta.errorToast` carries — must appear verbatim in the toast. */
const FAIL_MESSAGE = "Couldn't save your changes.";

/** Fires a mutation that always rejects, carrying an `errorToast` meta — the D54 global channel. */
function FailingMutationButton(): ReactElement {
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: (): Promise<never> => Promise.reject(new Error("boom")),
    meta: { errorToast: FAIL_MESSAGE },
  });
  return (
    <button type="button" onClick={(): void => mutation.mutate()}>
      save
    </button>
  );
}

export function NotifyToastStory(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <CtToastSurface>
        <FailingMutationButton />
      </CtToastSurface>
    </QueryClientProvider>
  );
}

/** The bare toast surface — the same manager/bind as above, for any OTHER feature story whose behavior under
 *  test ends in a `notify.*` call (the toast pixels are its only observable consequence). Homed here, not in a
 *  new support module, because `bindNotify` sets a MODULE-GLOBAL: a second module binding a second manager
 *  would race on import order and the loser's toasts would vanish. One manager, one bind, every toast story. */
export function CtToastSurface({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <ToastProvider toastManager={toastManager}>
      {children}
      <Toaster />
    </ToastProvider>
  );
}
