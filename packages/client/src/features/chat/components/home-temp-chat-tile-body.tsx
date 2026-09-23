// The "Temp chat" HOME tile body — EXPOSURE, not design: the
// `chats.temporary` flag has been the built shape since the chat domain landed (persisted so turns can
// run, excluded from `listMemberChats` ALWAYS, swept by `reapTemporaryChats` past the user's own TTL).
// What was missing was a wire field, a carry line, a procedure, and this tile.
//
// It also carries the reaper's CALL SITE (owner decision H5): a fire-and-forget sweep of the caller's own
// expired temp chats, once per home mount. The verb is already per-caller-scoped with a per-user TTL, so
// a workloads runner would be scheduling for one indexed delete. It lives HERE, in the tile that owns the
// feature, rather than in `features/home` — home imports zero features and owns no chat verbs.
//
// The gloss renders the user's OWN TTL, read cache-first from settings — never a hardcoded "24h", which
// would lie the moment they change it.

import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { openNewChatPicker } from "#state";

/** Sweep the caller's OWN expired temp chats. `busDriven: false` with an explicit filter: the verb emits
 *  no bus event (it deletes rows nothing was showing), so the chats list reconciles from here.
 *
 *  RECONCILE ONLY WHAT THE SWEEP ACTUALLY CHANGED (issue #188 P2-12). The filter used to be
 *  unconditional, so every home landing paid a second full `chat.listChats` round-trip — inside the boot
 *  window, holding `data-app-ready` open — to re-read a list the server had just reported unaffected. The
 *  common answer is `{reaped: 0}` (a user with no expired temp room), and zero rows deleted is zero rows
 *  the list can be showing. A throw still reconciles: `undefined` is not evidence of a no-op. */
const useReapTemporaryChats = createEntityMutation<void, { readonly reaped: number }>({
  options: (trpc: Trpc) => trpc.chat.reapTemporaryChats.mutationOptions(),
  invalidates: (trpc: Trpc, _vars: void, data: { readonly reaped: number } | undefined) =>
    data !== undefined && data.reaped === 0 ? [] : [trpc.chat.listChats.pathFilter()],
});

/** This body is FIXED, not paged: one primary button and one gloss paragraph. So its first-boot skeleton
 *  is two rows, not the frame's three (#92) — declared here, beside the body it describes, and consumed by
 *  the contribution's `skeletonRows`. Not a pixel guess: it is the row count this tile IS. */
export const TEMP_CHAT_SKELETON_ROWS = 2;

/** The janitor's idle deadline — past this the sweep runs whether or not the tab ever goes idle, so a
 *  permanently busy session still gets its expired temp rooms deleted. */
const REAP_IDLE_TIMEOUT_MS = 2000;
/** The no-`requestIdleCallback` fallback delay (Safari before 17.4): long enough to clear home's read burst. */
const REAP_FALLBACK_DELAY_MS = 1500;

/** ONE creation ceremony: the temp tile opens the SAME character picker every other "New chat" opens,
 *  with the creation-only flag preset — it never forks a second launcher that skips the character pick. The
 *  picker mints the seed (preset ⊕ picks) and moves the rail. */
function startTempChat(): void {
  openNewChatPicker({ temporary: true });
}

export function HomeTempChatTileBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { mutate: reapExpiredTempChats } = useReapTemporaryChats({ trpc, invalidation });
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const ttlHours = settings.config.chat.tempChatTtlHours;

  // Maintenance, once per mount — never a render-phase side effect, and never retried on failure (an
  // expired temp chat that survives one home visit is swept on the next).
  //
  // AND NEVER ON THE LANDING'S CRITICAL PATH (issue #188 P2-12). Firing it in the mount commit put a
  // MUTATION in the middle of home's first read burst: it competed with the reads the surface is actually
  // waiting on, and its settle fell inside the boot window. It is a janitor — nothing on screen depends on
  // it, and a sweep that runs a second late is indistinguishable from one that runs on time — so it waits
  // for an idle frame (the `useFuzzySearch` warmup precedent), with a timeout so a permanently busy tab
  // still gets swept.
  //
  // THE LATCH IS SET WHEN THE SWEEP FIRES, NEVER WHEN IT IS SCHEDULED. Latching at schedule time is the
  // obvious spelling and it silently DELETES the sweep under StrictMode: the double-invoked effect arms the
  // callback, the cleanup cancels it, and the second invocation sees the latch already set and arms nothing.
  // Caught on a live stage (`snap --isolated`), where five seconds on home produced no sweep at all — a CT
  // cannot see it, because the CT host does not double-invoke. Cancelling in cleanup and re-arming on the
  // next run keeps it exactly-once: at most one callback is ever pending, and only the one that RUNS latches.
  const swept = useRef(false);
  useEffect(() => {
    if (swept.current) {
      return;
    }
    const sweep = (): void => {
      swept.current = true;
      reapExpiredTempChats();
    };
    if (typeof requestIdleCallback === "function") {
      const idleId = requestIdleCallback(sweep, { timeout: REAP_IDLE_TIMEOUT_MS });
      return (): void => cancelIdleCallback(idleId);
    }
    const timerId = setTimeout(sweep, REAP_FALLBACK_DELAY_MS);
    return (): void => clearTimeout(timerId);
  }, [reapExpiredTempChats]);

  return (
    <Stack gap="row">
      <Row>
        {/* SECONDARY, not primary (CD3 re-ruled 2026-08-16, owner pick on #102). This button used to be
            home's ONE accent element. The focal moved to the resume-room hero — the complaint under
            review was that the live rooms were not the loudest thing on the page, and a page whose only
            accent made a room that deletes itself in a day was exactly that complaint.
            …AND `sm`, which is what the shelf's OTHER peer-rank CTA already was (side-eye rail sweep
            P3-16): this rendered 169×34 beside databank's 171×32 text-link, two registers for two controls
            of identical rank in one column. Both are `secondary`/`sm` now. */}
        <Button intent="secondary" onClick={startTempChat} size="sm">
          <Icon icon={Plus} size="sm" />
          Start a temp chat
        </Button>
      </Row>
      {/* ONE gloss, in the user's own terms. The teaching line about the creation-only flag used to ride a
          sample `Badge` beside it — a picture OF a badge, which is not a state and cannot be acted on; the
          real badge shows on the room itself the moment the picker starts it. */}
      {/* EM-DASH DIET (#104 item 3). Three sentences carried three em-dashes, which turns a warm
          explanation into a telegram: the punctuation was doing the work the conjunctions should. Same
          three facts, same voice, no dashes — a room that doesn't stick around, a flag set at birth, and
          everything else behaving normally. */}
      {/* MEASURED (#1130, side-eye HOME 2026-09-02 H5). This paragraph resolved `max-width: none`, so it
          took whatever the hearth column gave it: 76.7ch at 1280 and **153.2ch at 1920** — over twice the
          65-75ch reading band, on the widest single block on the surface. It is a LENGTH statement about
          prose, not a taste knob, which is why it rides the element rather than the column (the column also
          holds a Row of controls that must keep the full width).
          THE MEASURE IT TAKES CHANGED (#1145, owner ruling 2026-09-02). The house `--reading-measure` is
          75 CSS `ch`, and a CSS `ch` is the zero-glyph advance — 1.56 of this paragraph's average glyphs —
          so at 1920 the capped line still read 117 of the characters the law counts. The measure was SPLIT
          rather than narrowed: transcripts keep `--reading-measure`, teaching prose like this takes
          `--reading-measure-prose` (47ch = 73.3 law-characters here, the densest copy in the app). */}
      <Text className="max-w-(--reading-measure-prose)" size="label" tone="muted">
        A room that never joins your chats list, deleted after{" "}
        <Text as="span" size="code">
          {ttlHours}h
        </Text>
        . Marked Temporary from the moment it opens, and you can't switch a room over later. Turns, canon and the tracker all work normally while it lives.
      </Text>
    </Stack>
  );
}
