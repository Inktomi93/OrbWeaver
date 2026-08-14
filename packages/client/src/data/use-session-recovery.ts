// `useSessionRecovery` — the ONE mount that makes the session machinery live. Called once from the authed
// composition route (`routes/app-root.tsx`), beside the socket and the bus hooks it sits with.
//
// It wires four things that all key off the SAME identity read (`sessions.me`, already cached — this adds an
// observer, not a fetch):
//   1. the durable-local REBIND (§4.2.1) — every `orb:*` blob is re-keyed to this user, adopting the
//      pre-namespacing blobs once. Keyed on the USER ID, so an era-changed identity (the dev latch re-mints
//      the db) can never inherit the previous one's tag filters, drafts or view state;
//   2. the recovery HOST — the injected shell the `data/`-tier ladder cannot reach for itself (the resume
//      target is client state, the prompt is a modal slot). Re-bound whenever what it closes over moves, so
//      the ladder never reads a stale chat id or a stale handle;
//   3. the RESUME payload — invalidate identity + every user root and force the socket's rooms to
//      re-announce. That is what makes rung 0 a recovery instead of a reload;
//   4. the visibility PROBE (§4.4.1) — the sensor for a session that dies while nothing is being read.
//
// Everything here is an EFFECT on purpose: these are subscriptions to browser/document lifecycle, not
// derived render state, and none of them writes a shared selection store (`no-effect-on-shared-selection`
// is about deriving render state from a pointer, which this does not do).
//
// The seam is rebuilt INSIDE the resume callback rather than closed over from `useInvalidation()`: that
// accessor returns a fresh object per render by design, and a churning dep would re-bind the host (and its
// cross-tab subscription) on every commit. `queryClient` + the tRPC proxy are context values and stable.

import type { ChatId, Handle } from "@orb/kit/ids";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { timeLib } from "#lib";
import { bindDurableLocalToUser, openModal, selectChat, useActiveChatId } from "#state";
import { fetchAuthMe } from "./auth-bootstrap.ts";
import { roomRegistry } from "./bus/room-registry.ts";
import { createInvalidation } from "./invalidation.ts";
import { startSessionFreshness } from "./session-freshness.ts";
import { takeSessionResume } from "./session-resume.ts";
import { beginSessionRecovery, bindSessionRecovery } from "./stale-session.ts";
import { useTRPC } from "./trpc.ts";

/** Subscribe to the visibility edge on the real document, or nothing off-browser. */
function subscribeVisibility(listener: () => void): () => void {
  const target = (globalThis as { document?: Document }).document;
  if (target === undefined) {
    return (): void => undefined;
  }
  target.addEventListener("visibilitychange", listener);
  return (): void => {
    target.removeEventListener("visibilitychange", listener);
  };
}

export function useSessionRecovery(): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The identity read every surface already dedupes on (`use-viewer.ts`) — non-suspense here so the shell
  // never blocks on it; `undefined` just means "not bound yet", which every consumer below tolerates.
  const { data: me } = useQuery(trpc.sessions.me.queryOptions());
  const userId = me?.userId ?? null;
  const handle = me?.handle ?? null;
  const activeChatId = useActiveChatId();

  useEffect(() => {
    if (userId !== null) {
      bindDurableLocalToUser(userId);
    }
  }, [userId]);

  // The OIDC bounce's return leg (F3): consume the one-shot snapshot and re-open the chat the dead session
  // was in. Returns null on every ordinary boot, so this costs one sessionStorage read per mount.
  useEffect(() => {
    const resume = takeSessionResume();
    if (resume !== null && resume.chatId !== null) {
      selectChat(resume.chatId);
    }
  }, []);

  useEffect(() => {
    bindSessionRecovery({
      resumeInPlace: (): void => {
        const invalidation = createInvalidation({ queryClient, trpc });
        invalidation.invalidateIdentity();
        invalidation.invalidateAllUserRoots();
        // The socket's server-side cells may not have survived the dead session; attach is idempotent.
        roomRegistry.reannounceAll();
      },
      openReauthPrompt: (): void => {
        openModal("reauth");
      },
      resumeChatId: (): ChatId | null => activeChatId,
      currentHandle: (): Handle | null => handle,
    });
    return (): void => {
      bindSessionRecovery(null);
    };
  }, [activeChatId, handle, queryClient, trpc]);

  useEffect(
    () =>
      startSessionFreshness({
        now: timeLib.now,
        isVisible: (): boolean => (globalThis as { document?: Document }).document?.visibilityState === "visible",
        probe: async (): Promise<boolean> => (await fetchAuthMe()).authenticated,
        // The probe's verdict enters the SAME ladder every other sensor does — one recovery path, always.
        onDead: beginSessionRecovery,
        subscribe: subscribeVisibility,
      }),
    [],
  );
}
