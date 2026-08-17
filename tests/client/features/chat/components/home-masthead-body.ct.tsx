// CT: home's MASTHEAD sentence, driven through the REAL `HomeSurface` over the REAL data layer
// (`chat.listChats` stubbed at the network by routeTrpc) so the derived count + the "you left off …"
// subtitle are the shipped ones.
//
// ── RED-FIRST (stickler 2026-08-16 F1): the SUB-MINUTE recency arm never reads "now ago" ────────────
// The subtitle composed `formatRelativeCompact(when)` — which returns the WORD "now" for any span under a
// minute — with a literal " ago", so opening home seconds after sending a message rendered "You left off
// now ago in …". The fix is the kit's sentence form `formatRelativeAgo` ("just now" sub-minute). Asserted
// through the rendered sentence (not the new API), so it compiles and fails against the old composition.

import { expect, test } from "@playwright/experimental-ct-react";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatMastheadTileStory } from "../_ct-stories.tsx";
import { chatListResponder, makeChatSummary } from "../fixtures.ts";

/** The masthead's subtitle sentence — the one line whose whole job is "how long has it been". */
const LEFT_OFF = /^You left off/u;

test("F1 the masthead reads 'You left off just now', never 'now ago', for a seconds-old room", async ({ mount, page }) => {
  // Freeze the page clock so the component's "now" and the message time agree deterministically — no
  // ambient Date.now() (test-determinism gate; Spine-Testing §3). A zero-span read exercises the sub-minute arm.
  await page.clock.setFixedTime(FROZEN_AT_MS);
  const recent = makeChatSummary({ id: "chat_recent", title: "The Ashen Spire", participantNames: ["Wren"], lastMessageAt: FROZEN_AT_MS });
  await routeTrpc(page, { "chat.listChats": chatListResponder([recent]) });

  const home = await mount(<ChatMastheadTileStory />);
  const subtitle = home.getByText(LEFT_OFF);

  await expect(subtitle).toBeVisible();
  await expect(subtitle).toHaveText("You left off just now in The Ashen Spire.");
  await expect(subtitle).not.toContainText("now ago");
});
