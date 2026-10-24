// RpgTurnRef — the ONE TurnRef chip: a mono, muted reference to the
// origin message/turn a datum came from (the veiled ledger's lie origin; later the inventory last-change,
// quest wrap, journal artifact, choice echo — wherever the data really carries a message ref, "only
// where the data really carries a ref"). It renders ONLY a short ref token (the origin time when the row carries one, else the id tail) — the design's "click scrolls
// the transcript to the origin message" is DEFERRED: rpg cannot import chat, and no cross-feature
// transcript-scroll seam exists yet (it would ride the §12 state commons when chat exposes one). So v1 is
// display-only, flagged; the chip is the anchor label, not yet a jump.

import type { MessageId } from "@orb/kit/ids";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { timeLib } from "#lib";

/** How many trailing id chars the compact ref shows (a stable, glanceable anchor — not the full id). */
const REF_TAIL_LEN = 4;

export interface RpgTurnRefProps {
  /** The origin message id — the tail-token fallback and the chip's title. */
  readonly messageId: MessageId;
  /** The origin message's wall time (epoch ms). When the row carries it the chip shows the time; a row with
   *  only a message id (the veiled ledger's lie) keeps the id-tail token. */
  readonly createdAt?: number;
}

/** The short display form: the trailing id chars as a `t<chars>` token (a stable, compact anchor). */
function shortRef(messageId: MessageId): string {
  return `t${messageId.slice(-REF_TAIL_LEN)}`;
}

/** The mono TurnRef chip (display-only in v1 — see the file header). */
export function RpgTurnRef({ messageId, createdAt }: RpgTurnRefProps): ReactElement {
  return (
    <Text as="span" voice="gloss" className="shrink-0 font-mono tabular-nums" title={`Told at message ${messageId}`} data-slot="rpg-turn-ref">
      {createdAt === undefined ? shortRef(messageId) : timeLib.formatDateTime(createdAt)}
    </Text>
  );
}
