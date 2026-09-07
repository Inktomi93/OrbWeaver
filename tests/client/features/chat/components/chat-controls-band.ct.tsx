// CT: the S1 in-chat CONTROL band (interaction-direction-spec.md §3-S1) — THE MOUNT MATRIX.
//
// Every row drives the PRODUCTION path: a `chat-controls` source registry → the real
// `makeChatControlsContribution` → the chat-surface registry → the real `ChatRoomSurface`'s
// `above-composer` anchor → the real band. Nothing here mounts the band directly, because the property
// under test is the SEAM, not the component.
//
// The four laws proven here, each with its discriminator:
//   1. ZERO SOURCES RENDER NOTHING — no band, and the room's above-composer wrapper does not exist either
//      (a body returning `null` would leave that wrapper standing; the `when` predicate is what makes the
//      page identical to a build with no S1 at all). A registered source publishing an EMPTY list is the
//      neighbouring arm: the band mounts and paints no chrome.
//   2. BUSY IS PER MODE — a turn in flight disables the SEND chip (reason on `title`) while the COMPOSE
//      chip beside it stays live and the EXECUTE chip stays live. A band that reused the `:::choices`
//      block's blanket rule would pass the send arm and fail both others.
//   3. THE CAPS — one visible card + "+N pending"; four chips + "+N more".
//   4. THE STACK — cards above chips, asserted by GEOMETRY, from a fixture that publishes the chip FIRST
//      so DOM order cannot accidentally produce the right answer.
//
// Assertions go through accessible names, rendered text and geometry — @orb/ui primitives drop
// `data-testid` (the slot-only seal), so the band's own `data-slot` marks are used for structure only.

import type { ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { pixelContrast } from "../../../../support/browser/pixel-contrast.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatControlsStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, makeMessagesPage, makeMessageView } from "../fixtures.ts";

/** A non-empty `aria-describedby` — the disabled chip points at a real reason element, not title-only. */
const NON_EMPTY = /\S/;
/** WCAG AA for normal text — what an interactive chip's label owes its backdrop. */
const AA_NORMAL = 4.5;
/** The house body-adjacent icon step (`ICON_SM`), in rendered px — a bare lucide glyph is 24. */
const HOUSE_GLYPH_PX = 16;
/** A fully transparent computed background — the #674 tell, and the empty-band pin's discriminator. */
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const BAND = '[data-slot="chat-controls"]';
const ABOVE_COMPOSER = '[data-slot="chat-above-composer"]';
const CARDS = '[data-slot="chat-control-cards"]';
const CHIPS = '[data-slot="chat-control-chips"]';

/** The room's floor reads: the transcript, the roster, and the divider's present-tense preview (an
 *  unlisted proc's `data: null` default is out-of-contract for the last one and crashes the surface). */
function routeRoom(
  page: Page,
  extra: Record<string, unknown> = {},
): Promise<{ readonly count: (p: string) => number; readonly lastInput: (p: string) => unknown }> {
  return routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    "chat.previewContextFit": (): unknown => ({
      boundaryMessageId: null,
      usedTokens: 120,
      ceilingTokens: 32_768,
      ceilingEstimated: false,
      reserveOutputTokens: 2048,
      droppedCount: 0,
      compactSummary: null,
    }),
    "chat.getChat": (): {
      participants: never[];
      anchorPersonaId: null;
      identities: readonly ChatIdentity[];
      group: GroupConfig;
    } => ({ participants: [], anchorPersonaId: null, identities: [], group: DEFAULT_GROUP_CONFIG }),
    "chat.listMessages": (): unknown =>
      makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_controls_room"), role: "assistant", content: "The corridor forks.", seq: 1 })]),
    "chat.send": (): unknown => ({ ok: true }),
    ...extra,
  });
}

test("ZERO sources: no control band, and no above-composer wrapper either (the room is unchanged)", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory source="none" />);

  // The room is really rendered (the discriminator — an empty assertion set would pass on a blank mount).
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  await expect(component.locator(BAND)).toHaveCount(0);
  await expect(component.locator(ABOVE_COMPOSER)).toHaveCount(0);
});

test("a registered source publishing NOTHING paints no band, and its empty wrapper is out of layout", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="empty" />);

  // The room is live (the barrier — without it every count-0 below passes on a blank mount).
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  await expect(component.locator(BAND)).toHaveCount(0);
  await expect(component.locator(CARDS)).toHaveCount(0);
  await expect(component.locator(CHIPS)).toHaveCount(0);
  // The mount IS registered, so the room's above-composer wrapper exists — but with no rendered child it is
  // `empty:hidden`, i.e. display:none, so it costs neither a box nor one of the column's `gap` steps. A
  // "mounted but silent" source must read exactly like an unmounted one (the M8 spirit).
  const wrapper = component.locator(ABOVE_COMPOSER);
  await expect(wrapper).toHaveCount(1);
  await expect(wrapper).toHaveCSS("display", "none");
  // #674 BYTE-IDENTITY: the band now PAINTS a reading surface, and a surface on an always-rendered wrapper
  // would put an empty strip above every silent room's composer. The fill rides the `chat-controls` element
  // (absent above) and NOT this wrapper — asserted rather than assumed, because "the surface migrated one
  // level up" is invisible to every other row in this file.
  await expect(wrapper).toHaveCSS("background-color", TRANSPARENT);
});

// ── #674: THE BAND'S READING SURFACE, over worst-case art ────────────────────────────────────────────
// The defect these rows close was measured live at 1.01–1.63:1 (`snap --contrast --contrast-pixel`, a
// carried-art room): the band had NO surface, so an `intent="outline"` chip drew onto the photograph.
//
// THEY ARE PIXEL RECEIPTS, NOT COMPUTED-STYLE ONES, and that is the whole point of the family: over art
// the composited backdrop is what a reader sees, and `getComputedStyle` reported `rgba(0, 0, 0, 0)` on
// every ancestor while the number was 1.01. `pixelContrast` samples the chip box's perimeter ring out of
// the framebuffer through the SAME `ringBackdrop` kernel snap uses.
//
// THE ART IS WHITE ON PURPOSE. The story's palette is the dark seed, so its chip ink is the LIGHT muted
// tone and the worst legal wallpaper is the BRIGHT one (D144/#217 state this polarity inversion). A lane
// choosing its own worst case is why this is a CT rather than a drive against whatever picture the dev
// account carries.
//
// TWO WIDTHS, because a point measurement never proves a range property: the chip row wraps and the touch
// floor widens the chips at the narrow end, and neither may be allowed to move a chip off its backing.
// (The narrow arm is a VIEWPORT width, not full coarse-pointer emulation — contrast is pointer-invariant,
// the tap-floor geometry that is not lives in the touch-floor suite.)
const WORST_ART = "#ffffff";
const CONTRAST_WIDTHS = [
  { label: "desktop", width: 1280, height: 800 },
  { label: "mobile", width: 430, height: 932 },
] as const;

const PIVOT_THEMES = [
  { label: "dark", background: "oklch(0.62 0.01 60)", accent: "oklch(0.72 0.14 280)" },
  { label: "light", background: "oklch(0.6201 0.01 60)", accent: "oklch(0.48 0.16 40)" },
] as const;

for (const { label, width, height } of CONTRAST_WIDTHS) {
  test(`#674 ${label} (${String(width)}px): both chip modes clear AA over worst-case art — the band owns a surface`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height });
    await routeRoom(page);

    const component = await mount(
      <div data-has-bg-image="" style={{ background: WORST_ART }}>
        <ChatControlsStory fixture="chips" />
      </div>,
    );

    // The room is live (the barrier — a blank mount would make every locator below vacuous).
    await expect(component.getByText("The corridor forks.")).toBeVisible();
    const band = component.locator(BAND);
    await expect(band).toBeVisible();
    for (const mode of ["send", "compose"] as const) {
      const chip = component.locator(`${CHIPS} button[data-mode="${mode}"]`);
      await expect(chip).toBeVisible();
      // Settled snapshot: the visibility barrier above settled this chip's box; the framebuffer read is of a
      // painted, settled frame, not of mutable async state.
      const receipt = await pixelContrast(page, chip);
      expect(receipt.ratio, `${mode} chip @ ${label}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }

    // The STRUCTURAL companion, asserted LAST so a regression's first failure is the NUMBER (the finding),
    // not a class list. Pre-fix this resolved fully transparent, which is why the ratios above were ~1:1 —
    // but a computed-style assertion alone would also pass a 5%-alpha wash, so it never stands in for them.
    await expect(band).not.toHaveCSS("background-color", TRANSPARENT);
  });
}

for (const theme of PIVOT_THEMES) {
  test(`#969 ${theme.label} pivot: ordinary chip labels clear AA on the derived card surface`, async ({ mount, page }) => {
    await routeRoom(page);

    const component = await mount(<ChatControlsStory fixture="chips" />, {
      hooksConfig: { theme: { background: theme.background, accent: theme.accent } },
    });

    await expect(component.getByText("The corridor forks.")).toBeVisible();
    const chips = component.locator(`${CHIPS} button`);
    await expect(chips).toHaveCount(2);
    for (const mode of ["send", "compose"] as const) {
      const label = component.locator(`${CHIPS} button[data-mode="${mode}"] [data-slot="text"]`);
      await expect(label).toBeVisible();
      const receipt = await pixelContrast(page, label);
      expect(receipt.ratio, `${mode} label @ ${theme.label} pivot: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
}

// ── #684 P3: THE BAND DECLARES ITS OWN INK (the latent half of the #674 surface fix) ─────────────────
// A surface without an ink is half a reading surface. The band paints `bg-card`, but a text node that sets
// no colour INHERITS one — and the band is mounted inside the room's `ThemeScope`, so a carried palette can
// hand it an ink derived against a background this box does not paint (the review's probe span measured
// 1.1:1 across that boundary). Every band text sets its own ink today; the one node the band cannot style is
// `ChatControl.detail`, an arbitrary `ReactNode` a SOURCE outside chat supplies.
//
// THE HOSTILE WRAPPER IS THE INSTRUMENT, not decoration: it sets the inherited `color` to the band's own
// surface colour — the worst legal case of "the ink came from somewhere else". The BAND's own computed ink
// is the defect proof (measured RED against the pre-fix source: the band element computed the hostile
// inherited colour, i.e. it had no ink of its own and passed one down it never chose).
//
// THE PIXEL ROW BELOW IT IS A FENCE, DEMOTED HONESTLY, and the demotion is a finding: the only unstyled node
// the band can host TODAY is a card's `detail`, and that sits inside `@orb/ui` Card, whose own base pairs
// `bg-card` with `text-card-foreground` — so it passes pre-fix too. It is kept because the Card is the thing
// that could change (a source-supplied detail rendered outside a card, a future S1 control with no card),
// and because it is the reader's-eye version of the assertion above.
const BAND_SURFACE_INK = "oklch(0.205 0.006 60)"; // color.card — what the band paints under itself

test("#684 the band declares its OWN ink — a hostile inherited colour does not reach inside it", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(
    <div style={{ color: BAND_SURFACE_INK }}>
      <ChatControlsStory fixture="card-unstyled-detail" />
    </div>,
  );

  // The room is live (the barrier — every locator below is vacuous on a blank mount).
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  const band = component.locator(BAND);
  await expect(band).toBeVisible();
  // The hostile ink is what the band's PARENT hands down; the band must compute something else — its own
  // card-foreground, the ink the `bg-card` contrast guarantee is stated for.
  // Both sides resolved through a 1x1 canvas — the browser prints a computed `color` and a raw custom
  // property in DIFFERENT oklch spellings ("oklch(0.955 …)" vs "oklch(95.5% …)"), so a string compare of the
  // two is a false red. Painting makes the ENGINE do the conversion (the `pixel-contrast` helper's reason).
  const inks = await band.evaluate((el) => {
    const paint = (color: string): string => {
      const canvas = el.ownerDocument.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("no 2d context");
      }
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(",");
    };
    const style = getComputedStyle(el);
    const parent = el.parentElement;
    return {
      band: paint(style.color),
      inherited: parent === null ? "" : paint(getComputedStyle(parent).color),
      cardForeground: paint(style.getPropertyValue("--color-card-foreground").trim()),
    };
  });
  expect(inks.band, "the band's ink must not be the one it inherited").not.toBe(inks.inherited);
  expect(inks.band, "the band's ink is the one its bg-card guarantee is stated for").toBe(inks.cardForeground);
});

test("#684 an UNSTYLED detail node inside the band paints legibly (the reader's-eye fence)", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(
    <div style={{ color: BAND_SURFACE_INK }}>
      <ChatControlsStory fixture="card-unstyled-detail" />
    </div>,
  );

  await expect(component.getByText("The corridor forks.")).toBeVisible();
  const detail = component.getByTestId("ct-unstyled-detail");
  await expect(detail).toBeVisible();
  // Settled snapshot: the visibility barrier settled this node; the framebuffer read is of a painted frame.
  const receipt = await pixelContrast(page, detail);
  expect(receipt.ratio, `unstyled band detail: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL);
});

test("#674 an ENABLED control names its mode's CONSEQUENCE on title — both chip modes", async ({ mount, page }) => {
  // `title` used to be set only when a control was DISABLED, so an operable chip said nothing on hover
  // about what the click costs — and `send` posts a turn with no confirm step. The disabled REASON still
  // wins the slot; that half is pinned by the BUSY-IS-PER-MODE row above, which asserts the unlock text on
  // the same attribute.
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);

  const sendChip = component.locator(`${CHIPS} button[data-mode="send"]`);
  const composeChip = component.locator(`${CHIPS} button[data-mode="compose"]`);
  await expect(sendChip).toBeEnabled();
  await expect(composeChip).toBeEnabled();
  await expect(sendChip).toHaveAttribute("title", "Sends as your line");
  await expect(composeChip).toHaveAttribute("title", "Drafts into your composer");
});

test("#674 the chip's mode glyph renders at the house 16px step, not lucide's intrinsic 24px", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);

  for (const mode of ["send", "compose"] as const) {
    const glyph = component.locator(`${CHIPS} button[data-mode="${mode}"] svg`);
    await expect(glyph).toBeVisible();
    // The RENDERED box, not the attribute alone: a `size` prop that a stylesheet then overrode would pass
    // an attribute check and still paint 24px.
    // Settled snapshot: the visibility barrier settled this node; an SVG's intrinsic box does not move after paint.
    const box = await glyph.boundingBox();
    expect(box?.width, `${mode} glyph width`).toBe(HOUSE_GLYPH_PX);
    expect(box?.height, `${mode} glyph height`).toBe(HOUSE_GLYPH_PX);
  }
});

test("chips render their labels in one row", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);

  await expect(component.getByRole("button", { name: "Draw your blade" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Time skip" })).toBeVisible();
  await expect(component.locator(CHIPS)).toHaveCSS("flex-direction", "row");
});

test("chips are DISTINGUISHABLE by mode: a per-mode glyph, a mode-prefixed accessible name, and data-mode", async ({ mount, page }) => {
  // side-eye 2026-08-24 P1: the send chip (posts your turn instantly) and the compose chip (only drafts) were
  // rendering byte-identical AND named label-only, so neither a sighted nor an SR user could tell them apart
  // before clicking — the exact mode-confusion the S1 mode field exists to prevent.
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);

  const sendChip = component.locator(`${CHIPS} button[data-mode="send"]`);
  const composeChip = component.locator(`${CHIPS} button[data-mode="compose"]`);
  // The SR/keyboard signal: distinct accessible names, the visible label kept as a substring (WCAG 2.5.3).
  await expect(sendChip).toHaveAccessibleName("Send Draw your blade");
  await expect(composeChip).toHaveAccessibleName("Draft Time skip");
  // The sighted signal: each chip carries a leading glyph, and the two modes render different components.
  await expect(sendChip.locator("svg")).toHaveCount(1);
  await expect(composeChip.locator("svg")).toHaveCount(1);
});

// ── #684 P1: THE MODE IS A WORD, NOT ONLY A SILHOUETTE ────────────────────────────────────────────────
// The follow-up finding on the row above: once the glyphs shipped, the two chips still differed ONLY by a
// 16px silhouette in the sighted channel — a smaller distinction than the colour-alone rule already
// forbids, gating an irreversible consequence (a send chip posts a turn, no confirm). This row asserts the
// TEXT channel, and it is the defect proof rather than a fence: measured RED against the pre-fix source
// (`git show HEAD:…` — the chips rendered their bare label, so `toHaveText` saw "Draw your blade").
//
// WHY NOT THE GREYSCALE ELEMENT SHOT the finding proposed as the receipt bar: a pixel diff of the two chips
// under `Emulation.setEmulatedVisionDeficiency achromatopsia` passes PRE-FIX too — greyscale erases hue, and
// the glyphs never carried hue, they carried shape. An un-failable pin is not a receipt. The property the
// finding actually wants is "distinguishable through a channel that is not a 16px shape", and that is text.
test("#684 a chip carries its MODE AS A WORD, in the visible label, not only as a glyph", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);

  const sendChip = component.locator(`${CHIPS} button[data-mode="send"]`);
  const composeChip = component.locator(`${CHIPS} button[data-mode="compose"]`);
  // The RENDERED text of each chip — the sighted, greyscale-proof, icon-font-proof channel. Asserted as
  // CONTAINMENT, not equality: the word and the label are two nodes in a flex row (the gap is layout, not a
  // text space), and pinning the concatenation would be pinning JSX whitespace rather than the channel.
  await expect(sendChip).toContainText("Send");
  await expect(sendChip).toContainText("Draw your blade");
  await expect(composeChip).toContainText("Draft");
  await expect(composeChip).toContainText("Time skip");
  // …and the visible words stay a SUBSTRING of the accessible name (WCAG 2.5.3 label-in-name): the name is
  // the same word + the same label with no separator punctuation, which is why the colon was dropped.
  await expect(sendChip).toHaveAccessibleName("Send Draw your blade");
});

test("send mode: a chip click fires chat.send with the chip's text and leaves the composer draft alone", async ({ mount, page }) => {
  const trpc = await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);
  await component.getByRole("button", { name: "Draw your blade" }).click();

  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  // Settled snapshot: the poll above already settled the recorder for this proc — the call is recorded, so its
  // input is a fixed value, not mutable async state.
  await expect.poll(async () => (trpc.lastInput("chat.send") as { readonly content?: string }).content).toBe("I draw my blade.");
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("");
});

test("compose mode: a chip click seeds THIS room's composer draft and fires NO send", async ({ mount, page }) => {
  const trpc = await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);
  await component.getByRole("button", { name: "Time skip" }).click();

  const composer = component.getByRole("textbox", { name: "Message" });
  await expect(composer).toHaveValue("Some hours later,");
  await expect(composer).toBeFocused();
  // Settled snapshot: a NEGATIVE about a synchronous click path that has already produced its full effect (the
  // draft landed and focus moved, both asserted web-first above) — there is no later moment at which a send
  // this click did not make could appear.
  await expect.poll(async () => trpc.count("chat.send")).toBe(0);
});

test("BUSY IS PER MODE: a turn in flight disables the send chip with its reason; compose stays live", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);
  const sendChip = component.getByRole("button", { name: "Draw your blade" });
  const composeChip = component.getByRole("button", { name: "Time skip" });
  await expect(sendChip).toBeEnabled();

  // The exact call the chat-bus reducer makes on `turnStarted`.
  await component.getByTestId("drive-turn-begin").click();

  await expect(sendChip).toBeDisabled();
  await expect(sendChip).toHaveAttribute("title", "Wait for the current reply to finish, then pick");
  // side-eye 2026-08-24 P2: the reason must be reachable by keyboard/SR, not `title` (hover) alone — it is
  // bound through `aria-describedby` to a visually-hidden sibling. The MECHANISM is the defect proof: a
  // `title`-only chip ALSO yields an accessible description (title is a last-resort source), so the
  // discriminator is the explicit `aria-describedby` wiring the pre-fix band did not have.
  await expect(sendChip).toHaveAttribute("aria-describedby", NON_EMPTY);
  await expect(sendChip).toHaveAccessibleDescription("Wait for the current reply to finish, then pick");
  // THE DISCRIMINATOR: writing a draft is always legal, so the compose chip is untouched by the turn.
  await expect(composeChip).toBeEnabled();
});

test("execute mode: NOT turn-gated — it runs its own verb while a turn is in flight", async ({ mount, page }) => {
  await routeRoom(page);

  // This fixture publishes a SEND chip beside the execute one precisely so the turn's liveness is
  // OBSERVED, not assumed: without that barrier the test passes even with the turn driver neutered (it
  // would then only prove "an idle execute chip is clickable"), which is exactly how this row was vacuous
  // when first written.
  const component = await mount(<ChatControlsStory fixture="execute" />);
  const sendChip = component.getByRole("button", { name: "Draw your blade" });
  const roll = component.getByRole("button", { name: "Roll 1d20" });
  await expect(sendChip).toBeEnabled();

  await component.getByTestId("drive-turn-begin").click();

  // THE BARRIER: the turn really is in flight in this frame — the send-mode control is blocked by it.
  await expect(sendChip).toBeDisabled();
  // …and in the SAME state the execute control is live, because a verb call is not a turn.
  await expect(roll).toBeEnabled();
  await roll.click();
  // The SOURCE's own runner ran (the band never invents it).
  await expect(component.getByTestId("ct-control-source-ran")).toHaveText("1");
});

test("execute mode: disabled ONLY while its own call pends, with the running reason", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="execute-pending" />);
  const roll = component.getByRole("button", { name: "Roll 1d20" });

  await expect(roll).toBeDisabled();
  await expect(roll).toHaveAttribute("title", "Already running — wait for it to finish");
});

// ── THE PUBLISH GUARD (use-chat-controls.tsx `sameControls`) ───────────────────────────────────────
// The `republish` fixture's source rebuilds its control OBJECTS on every render (fresh closures, fresh
// array — the natural bus-driven shape) and publishes them from an effect with no equality of its own. The
// band's CONTENT comparison is the only thing between that shape and a render loop, and these two rows pin
// both halves of it: a same-content republish is IGNORED (the band keeps the previous objects, so the epoch-0
// closure is what a click runs), and a changed-content one is ADOPTED. With the guard reduced to identity
// comparison — or removed — the first row reads 10 instead of 1 and goes red.

test("a same-content republish is a NO-OP: the band keeps the controls it already had", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="republish" />);
  const roll = component.getByRole("button", { name: "Roll 1d20" });
  await expect(roll).toBeVisible();

  // Epoch 1: every rendered field identical (kind/id/label/mode/pending), the closure now adds 10.
  await component.getByTestId("drive-source-republish").click();
  await expect(roll).toBeVisible();
  await roll.click();

  // 1, not 10 — the ignored publish kept the epoch-0 object. (This is also the documented residual: a
  // source that changes BEHAVIOUR without changing a rendered field must mint a new control id.)
  await expect(component.getByTestId("ct-control-source-ran")).toHaveText("1");
});

test("a changed-content republish IS adopted — the guard never swallows a real update", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="republish" />);
  await expect(component.getByRole("button", { name: "Roll 1d20" })).toBeVisible();

  // Epoch 2 changes the label — a compared field, so the band takes the new control.
  await component.getByTestId("drive-source-relabel").click();

  await expect(component.getByRole("button", { name: "Roll 2d20" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Roll 1d20" })).toHaveCount(0);
});

test("the chips row caps its display and discloses the remainder", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips-over-cap" />);

  // FOUR chips + the disclosure BUTTON (#684 P2 — the disclosure is itself a control now, so the row's
  // button count is cap+1; the chips themselves are still capped, which is what law 5 asks).
  await expect(component.locator(`${CHIPS} button[data-mode]`)).toHaveCount(4);
  await expect(component.getByRole("button", { name: "+2 more" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Chip five" })).toHaveCount(0);
  // side-eye 2026-08-24 P3: the row WRAPS rather than clipping — at a phone width four long-label chips
  // overran the inline space and pushed "+2 more" off the (un-scrollable) right edge. A second line keeps
  // every capped chip and its disclosure reachable.
  await expect(component.locator(CHIPS)).toHaveCSS("flex-wrap", "wrap");
});

// ── #684 P2: EVERY CAPPED CHIP IS REACHABLE, BY KEYBOARD ─────────────────────────────────────────────
// The finding's specimen: one rule surfaces three openers and another three vote options, so the member saw
// ONE vote option and a dead `<p>` reading "+2 more" — the other two were not disclosed, they were gone.
// This row is the defect proof (RED against the pre-fix source: the overflow was a `<p>`, so
// `getByRole("button", { name: "+2 more" })` found nothing and `Chip five` never appeared), and it drives
// the disclosure with the KEYBOARD, because "reachable without a pointer trick" is the actual property.
test("#684 the chip disclosure is an EXPANDER: all N chips reachable by keyboard, and reversible", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips-over-cap" />);

  const disclosure = component.getByRole("button", { name: "+2 more" });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByRole("button", { name: "Chip six" })).toHaveCount(0);

  // Focus it the way a keyboard member arrives at it, and operate it with the keyboard.
  await disclosure.focus();
  await expect(disclosure).toBeFocused();
  await page.keyboard.press("Enter");

  // ALL SIX are now in the row — the two the cap hid are real, operable chips, not a count.
  await expect(component.locator(`${CHIPS} button[data-mode]`)).toHaveCount(6);
  await expect(component.getByRole("button", { name: "Chip five" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Chip six" })).toBeVisible();

  // …and it goes back (the cap governs the RESTING row — expansion is the member's choice, not a one-way door).
  const collapse = component.getByRole("button", { name: "Show fewer" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(component.locator(`${CHIPS} button[data-mode]`)).toHaveCount(4);
});

test("ONE visible card, its dismiss, and the pending count for the rest", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="cards-stacked" />);

  // The NEWEST (last published) card is the visible one.
  await expect(component.getByText("The newer ask")).toBeVisible();
  await expect(component.getByText("The older ask")).toHaveCount(0);
  await expect(component.getByText("+1 pending")).toBeVisible();

  // The dismiss is explicit, named, and really retires the card — the one behind it takes its place.
  await component.getByRole("button", { name: "Dismiss The newer ask" }).click();
  await expect(component.getByText("The older ask")).toBeVisible();
  await expect(component.getByText("+1 pending")).toHaveCount(0);

  // Dismissing the last one empties the band's chrome entirely.
  await component.getByRole("button", { name: "Dismiss The older ask" }).click();
  await expect(component.locator(CARDS)).toHaveCount(0);
});

test("a card's action carries its detail and runs the source's own handler", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="card" />);

  await expect(component.getByText("A short catch-up on the last scene.")).toBeVisible();
  await component.getByRole("button", { name: "Do it" }).click();
  await expect(component.getByTestId("ct-control-source-ran")).toHaveText("1");
});

test("THE STACK: cards render ABOVE chips even when the chip was published first", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="mixed" />);

  const cards = component.locator(CARDS);
  const chips = component.locator(CHIPS);
  await expect(cards).toBeVisible();
  await expect(chips).toBeVisible();
  const cardBox = await cards.boundingBox();
  const chipBox = await chips.boundingBox();
  expect(cardBox, "the card stack must have a box to compare").not.toBeNull();
  expect(chipBox, "the chip row must have a box to compare").not.toBeNull();
  expect((cardBox?.y ?? 0) + (cardBox?.height ?? 0)).toBeLessThanOrEqual(chipBox?.y ?? 0);
});

test("the band sits between the transcript and the composer (the room's own track)", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);

  const band = component.locator(BAND);
  const composer = component.getByRole("textbox", { name: "Message" });
  await expect(band).toBeVisible();
  const bandBox = await band.boundingBox();
  const composerBox = await composer.boundingBox();
  expect((bandBox?.y ?? 0) + (bandBox?.height ?? 0)).toBeLessThanOrEqual(composerBox?.y ?? 0);
});
