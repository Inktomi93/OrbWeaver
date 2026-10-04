// Unit: which transcript rows the virtual window keeps mounted (features/chat/lib/live-card-rows).

import type { MessageView } from "@orb/contracts/chat";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { LIVE_CARD_ROWS_KEPT_MOUNTED, liveCardRowIds } from "../../../../../packages/client/src/features/chat/lib/live-card-rows.ts";
import type { RowRenderPolicy } from "../../../../../packages/client/src/lib/render-trust.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeMessageView } from "../fixtures.ts";

const CARD = ':::card title="Ledger"\n<div>Tally</div>\n:::';
const policy = (cardTier: RowRenderPolicy["cardTier"]): RowRenderPolicy => ({
  trust: cardTier === "tierB" ? "trusted" : "untrusted",
  allowExternal: false,
  lenientCards: false,
  colorQuotes: true,
  cardTier,
});
const row = (id: string, content: string): { readonly kind: "message"; readonly view: MessageView } => ({
  kind: "message",
  view: makeMessageView({ id: castId<MessageId>(id), content }),
});

test("only the newest Tier-B card rows are kept, up to the cap; plain and Tier-A rows never are", () => {
  const cards = Array.from({ length: LIVE_CARD_ROWS_KEPT_MOUNTED + 2 }, (_, i) => row(`msg_card_${i}`, CARD));
  const items = [...cards, row("msg_plain", "no card here"), row("msg_tier_a", CARD), { kind: "ghost" as const }];

  const kept = liveCardRowIds(items, (view) => policy(view.id === "msg_tier_a" ? "tierA" : "tierB"));

  expect([...kept].toSorted()).toEqual(
    cards
      .slice(-LIVE_CARD_ROWS_KEPT_MOUNTED)
      .map((item) => item.view.id)
      .toSorted(),
  );
});
