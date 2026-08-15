// RpgTurnRef — the ONE TurnRef chip: a mono, muted reference to the
// origin message/turn a datum came from (the veiled ledger's lie origin; later the inventory last-change,
// quest wrap, journal artifact, choice echo — wherever the data really carries a message ref, "only
// where the data really carries a ref"). It renders ONLY the short ref token — the design's "click scrolls
// the transcript to the origin message" is DEFERRED: rpg cannot import chat, and no cross-feature
// transcript-scroll seam exists yet (it would ride the §12 state commons when chat exposes one). So v1 is
// display-only, flagged; the chip is the anchor label, not yet a jump.

import type { MessageId } from "@orb/kit/ids";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** How many trailing id chars the compact ref shows (a stable, glanceable anchor — not the full id). */
const REF_TAIL_LEN = 4;

export interface RpgTurnRefProps {
  /** The origin message id — shown as a short mono ref (`t…` shorthand of the trailing id chars). */
  readonly messageId: MessageId;
}

/** The short display form: the trailing id chars as a `t<chars>` token (a stable, compact anchor). */
function shortRef(messageId: MessageId): string {
  return `t${messageId.slice(-REF_TAIL_LEN)}`;
}

/** The mono TurnRef chip (display-only in v1 — see the file header). */
export function RpgTurnRef({ messageId }: RpgTurnRefProps): ReactElement {
  return (
    <Text as="span" voice="gloss" className="shrink-0 font-mono tabular-nums" title={`Told at message ${messageId}`} data-slot="rpg-turn-ref">
      {shortRef(messageId)}
    </Text>
  );
}
