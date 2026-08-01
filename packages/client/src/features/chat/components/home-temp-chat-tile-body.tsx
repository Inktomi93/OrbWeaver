// The "Temp chat" HOME tile body (home-section-spec §5, owner decision H4) — EXPOSURE, not design: the
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
 *  no bus event (it deletes rows nothing was showing), so the chats list reconciles from here. */
const useReapTemporaryChats = createEntityMutation<void, { readonly reaped: number }>({
  options: (trpc: Trpc) => trpc.chat.reapTemporaryChats.mutationOptions(),
  invalidates: (trpc: Trpc) => [trpc.chat.listChats.pathFilter()],
});

/** ONE creation ceremony: the temp tile opens the SAME character picker every other "New chat" opens,
 *  with the creation-only flag preset — it never forks a second launcher that skips the cast pick. The
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
  const swept = useRef(false);
  useEffect(() => {
    if (swept.current) {
      return;
    }
    swept.current = true;
    reapExpiredTempChats();
  }, [reapExpiredTempChats]);

  return (
    <Stack gap="row">
      <Row>
        <Button intent="primary" onClick={startTempChat}>
          <Icon icon={Plus} size="sm" />
          Start a temp chat
        </Button>
      </Row>
      {/* ONE gloss, in the user's own terms. The teaching line about the creation-only flag used to ride a
          sample `Badge` beside it — a picture OF a badge, which is not a state and cannot be acted on; the
          real badge shows on the room itself the moment the picker starts it. */}
      <Text size="label" tone="muted">
        A room that never joins your chats list — deleted after{" "}
        <Text as="span" size="code">
          {ttlHours}h
        </Text>
        . Marked Temporary from the moment it opens — you can't switch a room later. Turns, canon and the tracker all work normally while it lives.
      </Text>
    </Stack>
  );
}
