// CT: `__orb.nav.panel`'s REFUSAL WORDING (`agent-nav/panel-request.ts`) — the half the agent-nav unit
// suite structurally cannot reach.
//
// WHY IT IS A CT AND NOT A ROW IN `index.test.ts`. That suite runs in the node "unit" project, which has no
// DOM environment configured, and its own header says so: it proves routing and validation, and stops at the
// point the arm reads the rendered shell. The refusal under test here is decided entirely by DOM — the
// panel's `data-panel-mode` and the section's published `data-panel-available` declaration — so a node test
// could only pin a string builder, not the wiring that chooses between its arms.
//
// WHAT #1149 CHANGED, AND WHY IT IS NOT A REVERSAL. The old refusal said the active section "LIKELY declares
// no pane" for EVERY un-landed docked request, because the declaration lived in a React context this module
// cannot reach — the ruling was right when it was written and `panel-request.ts`'s own header said so. #1122
// then made the shell PUBLISH the declaration. The ruling survives; its INPUT changed: the hedge is kept for
// exactly the state that still warrants it (nothing published), and the two states the page now answers get
// answered. All three arms are pinned here, because a fix that only stops hedging is a fix that starts
// LYING on the arm where the section really does declare the pane.

import { expect, test } from "@playwright/experimental-ct-react";
import { PanelRequestStory } from "./_ct-stories.tsx";

const DOCK_LIST = "dock the list panel";
const REASON = "panel-request-reason";

test("#1149 the docked-panel refusal names the section's PUBLISHED declaration — and hedges only where there is none", async ({ mount }) => {
  const story = await mount(<PanelRequestStory />);
  const reason = story.getByTestId(REASON);

  // (1) DECLARED UNAVAILABLE — the page has already answered, so the refusal states it flatly.
  await story.getByRole("button", { name: "publish unavailable" }).click();
  await story.getByRole("button", { name: DOCK_LIST }).click();
  await expect(reason).toHaveText('panel "list" did not open — the active section declares no "list" pane');

  // (2) NOTHING PUBLISHED — the inference is all there is, so the hedge stays AND says why it is a hedge.
  await story.getByRole("button", { name: "publish unpublished" }).click();
  await story.getByRole("button", { name: DOCK_LIST }).click();
  await expect(reason).toHaveText('panel "list" did not open — the active section likely declares no "list" pane (it published no declaration to read)');

  // (3) DECLARED AVAILABLE and still did not open — a DIFFERENT defect (a write that reached no live
  // channel). Naming it "likely no pane" would send the reader to the one place the page has ruled out.
  await story.getByRole("button", { name: "publish declared" }).click();
  await story.getByRole("button", { name: DOCK_LIST }).click();
  await expect(reason).toHaveText('panel "list" did not open — the active section declares a "list" pane, but its rendered mode stayed "collapsed"');
});
