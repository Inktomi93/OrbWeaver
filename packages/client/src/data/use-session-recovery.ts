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
//   4. the visibility PROBE (§4.4.1) — the sensor for a session that dies, OR silently becomes another
//      human's, while nothing is being read (a swapped identity keeps answering 200, so it is the only
//      sensor that can see one).
//
// Everything here is an EFFECT on purpose: these are subscriptions to browser/document lifecycle, not
// derived render state, and none of them writes a shared selection store (`no-effect-on-shared-selection`
// is about deriving render state from a pointer, which this does not do).
//
// The seam is rebuilt INSIDE the resume callback rather than closed over from `useInvalidation()`: that
// accessor returns a fresh object per render by design, and a churning dep would re-bind the host (and its
// cross-tab subscription) on every commit. `queryClient` + the tRPC proxy are context values and stable.

import type { ChatId, Handle, UserId, VerifiedUserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { sessionDocument, timeLib } from "#lib";
import { bindDurableLocalToUser, durableLocalReadyFor, openModal, selectChat, useActiveChatId } from "#state";
import { roomRegistry } from "./bus/room-registry.ts";
import { createInvalidation } from "./invalidation.ts";
import { startSessionFreshness } from "./session-freshness.ts";
import { takeSessionResume } from "./session-resume.ts";
import { beginSessionRecovery, bindSessionRecovery, probeSessionContinuity } from "./stale-session.ts";
import { useTRPC } from "./trpc.ts";

export type SessionRecoveryState = { readonly status: "error"; readonly retry: () => void } | { readonly status: "loading" } | { readonly status: "ready" };

export function useSessionRecovery(): SessionRecoveryState {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The identity read every surface already dedupes on (the shared `sessions.me` query). It is non-suspense
  // so this hook can run the bind explicitly; `AppRoot` keeps durable consumers unmounted until it completes.
  const { data: me } = useQuery(trpc.sessions.me.queryOptions());
  // #854 — THE ONE MINT of `VerifiedUserId`, and the only place in the client that may perform it. `me`
  // is the `sessions.me` payload: the server projected it from the request `Principal` the auth seam
  // resolved, so this id is session-verified by construction and nothing the browser writes can reach it.
  // `bindDurableLocalToUser` requires the brand precisely so a future caller cannot hand the durable-local
  // namespace gate an id derived from client state (a route param, a cached blob, the browser-writable
  // `orb:active-user` hint) — see `state/durable-local.ts`'s header.
  const userId: VerifiedUserId | null = me === undefined ? null : castId<VerifiedUserId>(me.userId);
  const handle = me?.handle ?? null;
  const activeChatId = useActiveChatId();
  const [hydratedUserId, setHydratedUserId] = useState<UserId | null>(null);
  const [failedBind, setFailedBind] = useState<{ readonly attempt: number; readonly userId: UserId } | null>(null);
  const [bindAttempt, setBindAttempt] = useState(0);
  const durableReady = userId !== null && hydratedUserId === userId && durableLocalReadyFor(userId);
  const retryBind = (): void => setBindAttempt((attempt) => attempt + 1);
  // The host is page-lifecycle state, not render-derived state. Keep its identity mounted for the whole
  // authed route and refresh only the values its callbacks read: a terminal `sessions.me` error re-renders
  // this hook while QueryCache begins the ladder, and clearing the module host between effect generations
  // would turn local re-auth into the fail-closed signed-out fallback.
  const latest = useRef({ activeChatId: null as ChatId | null, handle, queryClient, trpc });

  useEffect(() => {
    latest.current = { activeChatId: durableReady ? activeChatId : null, handle, queryClient, trpc };
  }, [activeChatId, durableReady, handle, queryClient, trpc]);

  useEffect(() => {
    let ownsCompletion = true;
    if (userId === null) {
      return (): void => {
        ownsCompletion = false;
      };
    }
    // @orb-waive caught-failure-ownership(bindDurableLocalToUser): rejection records failedBind; AppRoot renders Retry while durable writes remain gated. Ends if AppRoot stops owning failedBind.
    void bindDurableLocalToUser(userId)
      .then(() => {
        if (ownsCompletion && durableLocalReadyFor(userId)) {
          setFailedBind(null);
          setHydratedUserId(userId);
        }
      })
      .catch(() => {
        if (ownsCompletion) {
          setFailedBind({ attempt: bindAttempt, userId });
        }
      });
    return (): void => {
      ownsCompletion = false;
    };
  }, [bindAttempt, userId]);

  // The OIDC bounce's return leg (F3): consume the one-shot snapshot and re-open the chat the dead session
  // was in. Returns null on every ordinary boot, so this costs one sessionStorage read per mount.
  useEffect(() => {
    if (!durableReady) {
      return;
    }
    const resume = takeSessionResume();
    if (resume !== null && resume.chatId !== null) {
      selectChat(resume.chatId);
    }
  }, [durableReady]);

  useEffect(() => {
    bindSessionRecovery({
      resumeInPlace: (): void => {
        const invalidation = createInvalidation({ queryClient: latest.current.queryClient, trpc: latest.current.trpc });
        invalidation.invalidateIdentity();
        invalidation.invalidateAllUserRoots();
        // The socket's server-side cells may not have survived the dead session; attach is idempotent.
        roomRegistry.reannounceAll();
      },
      openReauthPrompt: (): void => {
        openModal("reauth");
      },
      resumeChatId: (): ChatId | null => latest.current.activeChatId,
      currentHandle: (): Handle | null => latest.current.handle,
    });
    return (): void => {
      bindSessionRecovery(null);
    };
  }, []);

  useEffect(
    () =>
      startSessionFreshness({
        now: timeLib.now,
        isVisible: sessionDocument.isVisible,
        // ALIVE **AND STILL OURS** — the compare lives with the rest of the identity boundary, in the
        // ladder (§4.2.1). A session that comes back as a different human is not freshness.
        probe: probeSessionContinuity,
        // The probe's verdict enters the SAME ladder every other sensor does — one recovery path, always.
        onDead: beginSessionRecovery,
        subscribe: sessionDocument.subscribeVisibility,
      }),
    [],
  );

  if (durableReady) {
    return { status: "ready" };
  }
  return failedBind?.userId === userId && failedBind.attempt === bindAttempt ? { status: "error", retry: retryBind } : { status: "loading" };
}
