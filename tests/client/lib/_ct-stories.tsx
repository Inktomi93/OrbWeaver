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
// @orb-gate-ignore query-machine-seals
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import type { ReactElement } from "react";

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
      <ToastProvider toastManager={toastManager}>
        <FailingMutationButton />
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>
  );
}
