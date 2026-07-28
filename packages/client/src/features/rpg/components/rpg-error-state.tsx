// The rpg takeover's CONSOLIDATED read-error region (Context-Panel-Program §4.4; UI-Arch §4.3 rule 1). The
// takeover suspends on TWO seams — the header BAND (`RpgHeaderBand`) and the active game-tab BODY
// (`RpgGameTabBody`) — each behind its own boundary. A failed read used to surface as TWO fragmented,
// unannounced blocks ("Couldn't load this." + "Couldn't load status.") with bare retry links, while the panel's
// only live region still said "Loaded chat." — an SR user told the opposite of the truth. This is the ONE
// honest error surface: the BAND collapses to nothing on error (it is decoration) and the BODY renders THIS —
// plain scene-named copy, `role="alert"` so AT announces the real state, and a ≥44px Retry that actually
// refetches (the `QueryBoundary` reset handshake, threaded straight through `onRetry`).
//
// TWO ARMS (dangling-pointer heal §3.3). The read error is DISCRIMINATED by tRPC code, NOT swallowed — a
// transient/server error keeps the Retry arm (a refetch is the right recovery); a NOT_FOUND is the DANGLING
// POINTER state — the chat's `metadata.rpg` points at a game row that no longer exists (a pre-fix fork / any
// desync), where retrying is a permanent loop (the pre-heal defect). That arm renders the honest gone-copy,
// and for the HOST ONLY a "Detach game" action that nulls the stale pointer (`rpg.detachDanglingPointer`) so
// the chat self-heals to a plain chat. A member sees the copy + nothing (PERMISSION-omit — the host owns the
// heal). The distinction is the whole point: a real server error must NEVER read as "the game is gone".

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useDetachDanglingPointer } from "../hooks/use-rpg-mutations";

export interface RpgErrorStateProps {
  /** The chat whose game read failed — the detach target for a dangling pointer. */
  readonly chatId: ChatId;
  /** Does the viewer HOST this chat? The "Detach game" action is host-only (PERMISSION-omit for a member). */
  readonly isHost: boolean;
  /** The thrown read error — discriminated by tRPC code (NOT_FOUND = the dangling-pointer gone-state). */
  readonly error: unknown;
  /** Refetches the failed reads — pass `QueryBoundary`'s `renderError(error, retry)` retry straight through. */
  readonly onRetry: () => void;
}

/** A `NOT_FOUND` read on a game the pointer swears exists = the DANGLING POINTER state (§3.3). tRPC surfaces
 *  the domain code on `error.data.code` (the `invite-dialog` discrimination precedent); any other error (a 500,
 *  a transport failure) is transient and keeps the Retry arm. */
function isDanglingPointer(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  const data = (error as { data?: { code?: string } }).data;
  return data?.code === "NOT_FOUND";
}

/** The single announced error region the game-tab body renders when a takeover read fails. `role="alert"`
 *  makes AT speak the failure (the panel's other live region reports success); Retry meets the touch floor by
 *  construction (the `sm` control-height token = 2.75rem). A dangling pointer (NOT_FOUND) renders the typed
 *  gone-state + the host's detach heal instead of a doomed Retry. */
export function RpgErrorState({ chatId, isHost, error, onRetry }: RpgErrorStateProps): ReactElement {
  if (isDanglingPointer(error)) {
    return <DanglingPointerState chatId={chatId} isHost={isHost} />;
  }
  return (
    <Row role="alert" align="center" justify="center" gap="block" padding="section">
      <Text tone="muted">Couldn't load the scene.</Text>
      <Button intent="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </Row>
  );
}

/** The dangling-pointer gone-state: honest copy for everyone, the host's self-heal action for a host. */
function DanglingPointerState({ chatId, isHost }: { readonly chatId: ChatId; readonly isHost: boolean }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const detach = useDetachDanglingPointer({ trpc, invalidation });
  return (
    <Stack role="alert" align="center" justify="center" gap="block" padding="section">
      <Text tone="muted" className="text-center">
        This chat points at a game that no longer exists.
      </Text>
      {isHost ? (
        <Button intent="secondary" size="sm" onClick={(): void => detach.mutate({ chatId })} disabled={detach.isPending}>
          Detach game
        </Button>
      ) : null}
    </Stack>
  );
}
