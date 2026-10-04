// The transcript rows the virtual window keeps mounted off-screen: the newest rows whose body renders a live
// Tier-B card frame. Unmounting one reloads its frame and re-runs its scripts when it scrolls back (§12.2).

import type { MessageView } from "@orb/contracts/chat";
import type { RowRenderPolicy } from "#lib";
import { toContentBlocks } from "./content-blocks.ts";

/** The most card rows held mounted at once. Each kept row is a live frame document whose scripts keep running
 *  off-screen, so the cap bounds that cost; the newest rows win because they are the ones a reader returns to.
 *  @public Test-anchored module surface; the unit test fills past the cap. */
export const LIVE_CARD_ROWS_KEPT_MOUNTED = 8;

/**
 * The ids of the newest {@link LIVE_CARD_ROWS_KEPT_MOUNTED} message rows that render a Tier-B card frame,
 * judged with the same render policy and block projection the row itself renders through.
 */
export function liveCardRowIds(
  items: readonly ({ readonly kind: "message"; readonly view: MessageView } | { readonly kind: "ghost" })[],
  renderPolicyOf: (view: MessageView) => RowRenderPolicy,
): ReadonlySet<string> {
  const kept = new Set<string>();
  for (let index = items.length - 1; index >= 0 && kept.size < LIVE_CARD_ROWS_KEPT_MOUNTED; index -= 1) {
    const item = items[index];
    if (item?.kind !== "message") {
      continue;
    }
    const render = renderPolicyOf(item.view);
    if (render.cardTier !== "tierB") {
      continue;
    }
    const blocks = toContentBlocks(item.view.content, { cardTrust: render.cardTier, lenientHtml: render.lenientCards });
    if (blocks.some((block) => block.kind === "html-card")) {
      kept.add(item.view.id);
    }
  }
  return kept;
}
