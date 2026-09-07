// CT: §4 #16's NEEDLE METER (needle-meter.tsx) — the room-facing half of the needle preset, driven over the
// REAL tRPC path with a stubbed network (`routeTrpc`). What is asserted is what a MEMBER SEES: a dial that
// names itself and reads its own scale, and NOTHING AT ALL in a room that carries no score.
//
// The absent arms are the point of the file, not filler. This widget mounts in EVERY room (its `when` is
// sync and cannot see query data), so "renders nothing" is its behaviour nine rooms out of ten — and the
// failure it must never have is a broken gauge: a needle at zero, an empty card, or a dial reading NaN.

import { ANALYSIS_SCORE_MAX, NEEDLE_TENSION_VAR_KEY } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { NeedleMeterStory } from "../_ct-stories.tsx";

const CHAT = castId<ChatId>("chat_ct_needle_00000001");

/** The dial's accessible name — the ONE affordance every assertion here goes through. */
const NEEDLE_NAME = "Story tension";

/** Stub the room's runtime variable fold. */
async function routeVariables(page: Page, variables: Readonly<Record<string, string>>): Promise<void> {
  await routeTrpc(page, { "chat.getRuntimeVariables": variables });
}

test("a scored room renders the dial, named and on its OWN scale (never a percentage)", async ({ mount, page }) => {
  await routeVariables(page, { [NEEDLE_TENSION_VAR_KEY]: "7" });

  const component = await mount(<NeedleMeterStory chatId={CHAT} />);

  const meter = component.getByRole("meter", { name: NEEDLE_NAME });
  await expect(meter).toBeVisible();
  // The value a reader SEES and the value AT is announced are both on the 0-10 dial: a percentage readout
  // here ("70%") would be the meter primitive's own scale-honesty defect, and this room's score is not one.
  await expect(component.getByText(`7/${ANALYSIS_SCORE_MAX}`)).toBeVisible();
  await expect(meter).toHaveAttribute("aria-valuenow", "7");
  await expect(meter).toHaveAttribute("aria-valuemax", String(ANALYSIS_SCORE_MAX));
  await expect(meter).toHaveAttribute("aria-valuetext", `7 of ${ANALYSIS_SCORE_MAX}`);
});

// ── #685: THE CARD-TO-GAUGE RATIO ────────────────────────────────────────────────────────────────────
// The finding: "a 138x80 card holding a 40x40 arc is a lot of card". The 40 was the tell — the dial rode
// `size-control-lg`, a POINTER-CONDITIONAL control token (D62 P1), so the graphic rendered 56px on a touch
// device and shrank to 40px on the desktop the review was taken on. A display graphic that resizes with the
// input device is the nature error §13.9's display family exists to prevent, so the dial now takes a
// pointer-independent display step (80px, `charts/meter/variants.ts`).
//
// Measured RED against the pre-fix source: 40x40 at this project's (fine) pointer.
/** The dial's display step in rendered px — pointer-INDEPENDENT, unlike the control ramp it left. */
const DIAL_PX = 80;
/** What the card may cost for that dial — the ratio the finding actually complained about. */
const MAX_CARD_TO_DIAL = 2.5;

test("#685 the dial is a DISPLAY-sized graphic, and the card is sized for it rather than around it", async ({ mount, page }) => {
  await routeVariables(page, { [NEEDLE_TENSION_VAR_KEY]: "7" });

  const component = await mount(<NeedleMeterStory chatId={CHAT} />);

  const dial = component.locator('[data-slot="meter-track"]');
  await expect(dial).toBeVisible();
  // Settled snapshot: the visibility barrier settled this node; an SVG's intrinsic box does not move after paint.
  const dialBox = await dial.boundingBox();
  expect(dialBox?.width, "dial width").toBe(DIAL_PX);
  expect(dialBox?.height, "dial height").toBe(DIAL_PX);

  // …and the card around it is no longer mostly not-a-gauge. Asserted as a RATIO, not as px: the card's
  // width is the label row's, which is copy, and pinning copy metrics here would red on a wording change.
  // Queried off the PAGE, not the mount: the story renders providers that emit no DOM, so the meter's Card
  // IS the mounted root element — and a `component.locator(…)` search only ever sees DESCENDANTS of it.
  const card = page.locator('[data-slot="card-root"]');
  const cardBox = await card.boundingBox();
  expect(cardBox, "the meter card must have a box").not.toBeNull();
  expect((cardBox?.height ?? 0) / DIAL_PX, "card height per dial px").toBeLessThanOrEqual(MAX_CARD_TO_DIAL);
});

test("a room with NO score renders nothing at all — no dial, no empty card, no chrome", async ({ mount, page }) => {
  // The overwhelmingly common case: the preset was never added, or its first pass has not landed.
  await routeVariables(page, {});

  const component = await mount(<NeedleMeterStory chatId={CHAT} />);

  await expect(component.getByRole("meter")).toHaveCount(0);
  // The whole mount paints nothing — the property the flank column's `empty:hidden` collapse depends on.
  expect((await component.innerHTML()).trim()).toBe("");
});

test("a NON-NUMERIC value renders nothing rather than a broken gauge", async ({ mount, page }) => {
  // The vars plane is shared: a member's `{{setvar}}` or another rule can put words in any key. A dial whose
  // needle has no number is worse than no dial.
  await routeVariables(page, { [NEEDLE_TENSION_VAR_KEY]: "very tense" });

  const component = await mount(<NeedleMeterStory chatId={CHAT} />);

  await expect(component.getByRole("meter")).toHaveCount(0);
});

test("an OFF-SCALE value is clamped to the dial, not drawn past its own arc", async ({ mount, page }) => {
  // The applier clamps what IT writes, but the same variable is hand-writable — so the reader clamps too.
  await routeVariables(page, { [NEEDLE_TENSION_VAR_KEY]: "99" });

  const component = await mount(<NeedleMeterStory chatId={CHAT} />);

  const meter = component.getByRole("meter", { name: NEEDLE_NAME });
  await expect(meter).toHaveAttribute("aria-valuenow", String(ANALYSIS_SCORE_MAX));
  await expect(component.getByText(`${ANALYSIS_SCORE_MAX}/${ANALYSIS_SCORE_MAX}`)).toBeVisible();
});

test("a score of ZERO is a real reading and still renders — 'at rest' is not 'absent'", async ({ mount, page }) => {
  // The falsy-zero trap, pinned: 0 is the bottom of the dial, not a missing value.
  await routeVariables(page, { [NEEDLE_TENSION_VAR_KEY]: "0" });

  const component = await mount(<NeedleMeterStory chatId={CHAT} />);

  await expect(component.getByRole("meter", { name: NEEDLE_NAME })).toHaveAttribute("aria-valuenow", "0");
  await expect(component.getByText(`0/${ANALYSIS_SCORE_MAX}`)).toBeVisible();
});
