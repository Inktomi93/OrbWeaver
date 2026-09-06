// CT: the rack's SELECT ≠ DRILL split and the drill-in's structural rules (preset-surface-redesign
// §5.1/§5.2, audit §16 rows 18/19/21). These are properties of the COMPOSITION — no unit test of either
// component can see them — and each one is a rule the old surface actually broke:
//
//   · a row CLICK used to mount the editor. It must now only SELECT (the readout is the inspect view).
//   · the chevron DRILLS, and the drill-in owns the whole section — body AND placement AND triggers AND
//     locks, in one place (the CONTEXT inspector that held half of them is deleted).
//   · a MARKER's ⋯ menu omits Delete and Duplicate ENTIRELY (never a disabled Delete); a LITERAL keeps
//     them, and Delete persists the shorter list through the boundary's store driver with no flush.
//   · the PIVOT carries NO enable switch anywhere — a disabled pivot is an assembly with nowhere to
//     splice the conversation.
//   · a plain-marker CARRIER gets NO depth/order: the schema's own branch declares no `inject` on it, so
//     offering the field would write a shape the contract rejects. It DOES get Triggers — `trigger` is
//     declared on every branch (#1462/#1736) — and every non-pivot section shows that cluster.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { MainPromptStory, RackStory, SectionForkStory } from "./_rack-stories.tsx";

/** The rendered box, as a rounded integer rect — sub-pixel noise is not a defect, an 8/16px shear is. */
async function boxOf(locator: Locator): Promise<{ readonly top: number; readonly height: number; readonly width: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("expected a rendered box");
  }
  return { top: Math.round(box.y), height: Math.round(box.height), width: Math.round(box.width) };
}

/** A NumberField's bordered GROUP — the box the eye reads as the control (its `<input>` is inset by the
 *  group's own 1px border). */
function controlBoxOf(input: Locator): Locator {
  return input.locator("..");
}

/** A `<Field>`'s own label element, matched on its exact text (the hint trigger is a SIBLING of it). */
function labelBox(probe: Locator, text: string): Promise<{ readonly top: number; readonly height: number; readonly width: number }> {
  return boxOf(probe.locator('[data-slot="field-label"]').filter({ hasText: new RegExp(`^${text}$`) }));
}

// The zone select's two arms + the triggers dial's readings, matched on the trigger's TEXT (a Select
// renders its arm's whole label, and these pins are about which arm, not its full copy).
const RELATIVE_ZONE_RE = /Relative/;
const IN_CHAT_ZONE_RE = /In Chat/;
const EVERY_GENERATION_RE = /Every generation/;
const CONTINUE_TRIGGER_RE = /Continue/;
/** Every option the Fires-on dial offers, in `GENERATION_TYPES` order — the all-selected arm's input. */
const ALL_GENERATION_TYPES = ["Normal", "Continue", "Impersonate", "Swipe", "Regenerate", "Quiet"] as const;
const SWIPE_TRIGGER_RE = /Swipe/;
/** The main-prompt drill-in's mode-aware note — the two halves it has to say (C4). */
const MODE_AWARE_DEFAULT_RE = /narrator round gets a narrator framing/;
const OVERRIDE_COVERS_BOTH_RE = /replaces it on every turn, narrator and per-character alike/;

test("a row CLICK selects without mounting the drill-in; the CHEVRON drills", async ({ mount }) => {
  const probe = await mount(<RackStory />);

  // Clicking the row body (its accessible name is the section title) must NOT open the editor.
  await probe.getByRole("button", { name: "DeleteMe", exact: true }).click();
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeHidden();
  // The rack is still what's rendered — the other rows are all still there.
  await expect(probe.getByRole("button", { name: "Alpha", exact: true })).toBeVisible();

  // The trailing chevron is the drill.
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();
  // ONE OBJECT, ONE PLACE: body + delivery + placement + triggers all live here now.
  await expect(probe.getByLabel("Name", { exact: true })).toHaveValue("DeleteMe");
  await expect(probe.getByRole("combobox", { name: "Role" })).toBeVisible();
  await expect(probe.getByRole("combobox", { name: "Zone" })).toBeVisible();
  await expect(probe.getByRole("combobox", { name: "Fires on" })).toBeVisible();
});

// ── O-9★: DEPTH AND ORDER ARE IN-CHAT VOCABULARY ─────────────────────────────────────────────────────
// The zone is the DELIVERY the assembler performs: RELATIVE renders into the system block (no depth
// exists), IN CHAT splices at one. The fields are ABSENT on the relative arm rather than rendered-and-
// disabled — the same rule the carrier's missing `inject` already follows — and the drill-in must not be
// able to leave a depth behind on a section it calls relative, because `injectionDepthFor` would still
// honour it. Nothing but a composition test can see either half.

test("O-9 — a RELATIVE section has no depth and no order; an IN CHAT one has both", async ({ mount }) => {
  const probe = await mount(<RackStory />);

  // `sec_del` sits BEFORE the pivot ⇒ Relative.
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await expect(probe.getByRole("combobox", { name: "Zone" })).toHaveText(RELATIVE_ZONE_RE);
  await expect(probe.getByRole("textbox", { name: "Inject at depth" })).toHaveCount(0);
  await expect(probe.getByRole("textbox", { name: "Order" })).toHaveCount(0);
  await probe.getByRole("button", { name: "Back to rack" }).click();

  // `sec_z` sits AFTER it ⇒ In Chat, where both fields mean something.
  await probe.getByRole("button", { name: "Edit Zeta" }).click();
  await expect(probe.getByRole("combobox", { name: "Zone" })).toHaveText(IN_CHAT_ZONE_RE);
  await expect(probe.getByRole("textbox", { name: "Inject at depth" })).toBeVisible();
  await expect(probe.getByRole("textbox", { name: "Order" })).toBeVisible();
});

test("O-8/O-9 — the depth input WRITES (typed value round-trips to the form), and Relative clears the splice", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await expect(state).toContainText("splice=none");

  await probe.getByRole("button", { name: "Edit Zeta" }).click();
  const depth = probe.getByRole("textbox", { name: "Inject at depth" });
  await depth.click();
  await depth.pressSequentially("3");
  // The FORM's value, not the input's: a field that renders its own keystrokes while writing nothing is
  // exactly the "stuck at in flow" defect, and only the form side can tell the two apart.
  await expect(state).toContainText("splice=sec_z@3·-");

  // Moving back to Relative un-splices it — a stored depth under a "Relative" label is a lie the
  // assembler would act on.
  await probe.getByRole("combobox", { name: "Zone" }).click();
  await page.getByRole("option", { name: RELATIVE_ZONE_RE }).click();
  await expect(state).toContainText("splice=none");
});

// ── ITEM 10: THE DELIVERY ROW IS ONE ROW ─────────────────────────────────────────────────────────────
// Owner, live: "actions delivery misalignment, same with role and inject at depth in prompt". The pair is
// drawn as a two-column row and rendered as a shear — the hinted half's label sits in a 34px `size="icon"`
// button row while the plain half's is text-height, so the two labels and the two controls each land at a
// different y. Only COMPUTED geometry can see it: the source reads as a tidy two-cell Grid.

test("item 10 — the DELIVERY pair's two labels and two controls each share one baseline", async ({ mount }) => {
  const probe = await mount(<RackStory />);
  // `sec_z` is post-pivot ⇒ In Chat, the arm where both halves render.
  await probe.getByRole("button", { name: "Edit Zeta" }).click();

  const role = await labelBox(probe, "Role");
  const depth = await labelBox(probe, "Inject at depth");
  expect(role.top).toBe(depth.top);
  expect(role.height).toBe(depth.height);

  // The CONTROL BOXES, not the inner inputs: a NumberField's border lives on its Group, so the `<input>`
  // itself sits 1px inside it — comparing an input to a Select TRIGGER (whose border is its own box) would
  // assert a 1px shear that nobody can see.
  const roleControl = await boxOf(probe.getByRole("combobox", { name: "Role" }));
  const depthControl = await boxOf(controlBoxOf(probe.getByRole("textbox", { name: "Inject at depth" })));
  expect(roleControl.top).toBe(depthControl.top);

  // …and the PLACEMENT row below it speaks the same grammar (the drill's one row vocabulary).
  const zoneControl = await boxOf(probe.getByRole("combobox", { name: "Zone" }));
  const orderControl = await boxOf(controlBoxOf(probe.getByRole("textbox", { name: "Order" })));
  expect(zoneControl.top).toBe(orderControl.top);
});

test("item 10 / O-14 — the depth cell is WIDE ENOUGH FOR ITS OWN GHOST (it clipped to '0 — the t…')", async ({ mount }) => {
  const probe = await mount(<RackStory />);
  await probe.getByRole("button", { name: "Edit Zeta" }).click();

  // The ghost is the ONE thing the empty field says, and the inline cell is a fixed `--width-number-inline`
  // box — so "fits" is a MEASURED relation between the placeholder's rendered text and the box, not a
  // judgement about the copy. The same constant rides the template drill's cell.
  await expect
    .poll(
      async () =>
        await probe.getByRole("textbox", { name: "Inject at depth" }).evaluate((input: HTMLInputElement) => {
          const style = getComputedStyle(input);
          const context = document.createElement("canvas").getContext("2d");
          if (context === null) {
            throw new Error("expected a 2d context");
          }
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const inner = input.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
          return context.measureText(input.placeholder).width - inner;
        }),
    )
    .toBeLessThanOrEqual(0);
});

test("the main-prompt GHOST fits its own box — the second-person address clause did not overflow it", async ({ mount }) => {
  // The O-14 lens, applied to the one templated marker whose factory default is a full sentence. The empty
  // field's ONLY content is that ghost, so a placeholder taller than the box is a default the user cannot
  // read — and the address clause ("use their name only when it is one they have chosen for themselves")
  // roughly doubled its length. Measured on the RENDERED box, never on a character count.
  const probe = await mount(<MainPromptStory />);
  await probe.getByRole("button", { name: "Edit Main prompt" }).click();

  const template = probe.getByRole("textbox", { name: "Template" });
  await expect
    .poll(
      async () =>
        (
          await template.evaluate((area: HTMLTextAreaElement) => ({
            overflow: area.scrollHeight - area.clientHeight,
            // The ghost is what is actually on screen — pin that it IS the factory default, not an empty box.
            ghost: area.placeholder,
            value: area.value,
          }))
        ).value,
    )
    .toBe("");
  await expect
    .poll(
      async () =>
        (
          await template.evaluate((area: HTMLTextAreaElement) => ({
            overflow: area.scrollHeight - area.clientHeight,
            // The ghost is what is actually on screen — pin that it IS the factory default, not an empty box.
            ghost: area.placeholder,
            value: area.value,
          }))
        ).ghost,
    )
    .toContain("Address");
  await expect
    .poll(
      async () =>
        (
          await template.evaluate((area: HTMLTextAreaElement) => ({
            overflow: area.scrollHeight - area.clientHeight,
            // The ghost is what is actually on screen — pin that it IS the factory default, not an empty box.
            ghost: area.placeholder,
            value: area.value,
          }))
        ).ghost,
    )
    .toContain("chosen for themselves");
  await expect
    .poll(
      async () =>
        (
          await template.evaluate((area: HTMLTextAreaElement) => ({
            overflow: area.scrollHeight - area.clientHeight,
            // The ghost is what is actually on screen — pin that it IS the factory default, not an empty box.
            ghost: area.placeholder,
            value: area.value,
          }))
        ).overflow,
    )
    .toBeLessThanOrEqual(0);
});

test("the main-prompt drill-in DISCLOSES the mode-aware default — and that one typed template covers both turn kinds", async ({ mount }) => {
  // The ghost shows the PER-SPEAKER default (the narrator arm resolves a different one, `assembly/assemble`
  // templateFor). Without this line the mode-awareness is invisible from the only surface that edits the
  // slot, and a host who types a template has no way to know it lands on narrator rounds too — the stored
  // field is ONE text (row 52: the per-section override IS the edit path).
  const probe = await mount(<MainPromptStory />);
  await probe.getByRole("button", { name: "Edit Main prompt" }).click();

  await expect(probe.getByText(MODE_AWARE_DEFAULT_RE)).toBeVisible();
  await expect(probe.getByText(OVERRIDE_COVERS_BOTH_RE)).toBeVisible();
});

test("item 10 — the row is STABLE across the two zone arms: the Role select keeps its column", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  await probe.getByRole("button", { name: "Edit Zeta" }).click();

  const withDepth = await boxOf(probe.getByRole("combobox", { name: "Role" }));
  const zoneWithOrder = await boxOf(probe.getByRole("combobox", { name: "Zone" }));

  // Relative DROPS the depth and order halves (O-9★). An auto-FIT track collapses when its only item
  // leaves, so the surviving control silently doubles in width — the pane re-flows under a field the user
  // did not touch. The column is the grammar; the absent field is absent, not a re-layout.
  await probe.getByRole("combobox", { name: "Zone" }).click();
  await page.getByRole("option", { name: RELATIVE_ZONE_RE }).click();
  await expect(probe.getByRole("textbox", { name: "Inject at depth" })).toHaveCount(0);

  expect((await boxOf(probe.getByRole("combobox", { name: "Role" }))).width).toBe(withDepth.width);
  expect((await boxOf(probe.getByRole("combobox", { name: "Zone" }))).width).toBe(zoneWithOrder.width);
});

// ── O-11★: TRIGGERS IS A MULTI-CHECK DROPDOWN ────────────────────────────────────────────────────────
// The UNSET field IS the "fires on every generation" state, so the last deselection has to write
// `undefined` rather than an empty array that reads the same and stores differently.

test("O-11 — Fires on is a multi-check dropdown, and clearing the last pick returns to every-generation", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();

  const fires = probe.getByRole("combobox", { name: "Fires on" });
  await expect(fires).toHaveText(EVERY_GENERATION_RE);
  await expect(probe.getByText("Nothing selected — this section fires on every generation.")).toBeVisible();

  await fires.click();
  await page.getByRole("option", { name: "Continue" }).click();
  await page.getByRole("option", { name: "Swipe" }).click();
  await page.keyboard.press("Escape");
  await expect(fires).toHaveText(CONTINUE_TRIGGER_RE);
  await expect(fires).toHaveText(SWIPE_TRIGGER_RE);
  await expect(probe.getByText("Only the selected generation types carry this section.")).toBeVisible();

  await fires.click();
  await page.getByRole("option", { name: "Continue" }).click();
  await page.getByRole("option", { name: "Swipe" }).click();
  await page.keyboard.press("Escape");
  await expect(probe.getByText("Nothing selected — this section fires on every generation.")).toBeVisible();
});

test("the rider — selecting EVERY type reads and STORES as the every-generation absence", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();

  const fires = probe.getByRole("combobox", { name: "Fires on" });
  await fires.click();
  for (const option of ALL_GENERATION_TYPES) {
    await page.getByRole("option", { name: option, exact: true }).click();
  }
  await page.keyboard.press("Escape");

  // ALL selected ≡ NO filter: one state, so ONE reading — and one stored shape. A list of all six spells
  // "fires always" a second way AND drops the section out of the assembler's cached prefix.
  await expect(fires).toHaveText(EVERY_GENERATION_RE);
  await expect(probe.getByText("Nothing selected — this section fires on every generation.")).toBeVisible();
  await expect(state).toContainText("trig=-");
});

// ── O-12: THE OVERRIDES BLOCK ────────────────────────────────────────────────────────────────────────
// Both flags are OPTIONAL, so a section that has never had one set carries NO such key — and the gate
// was `"forbidCharacterOverride" in section`, i.e. the block never rendered for any real preset. The
// gate is the schema ARM (a templated marker), which is what the fixture's untouched Post-history is.

test("O-12 — a templated marker's OVERRIDES block renders with neither flag ever set", async ({ mount }) => {
  const probe = await mount(<RackStory />);
  await probe.getByRole("button", { name: "Edit Post-history" }).click();

  await expect(probe.getByRole("switch", { name: "Block the character card's override" })).toBeVisible();
  await expect(probe.getByRole("switch", { name: "Block the room's override" })).toBeVisible();
  // A LITERAL has no such fields in the schema — absent, never a disabled pair.
  await probe.getByRole("button", { name: "Back to rack" }).click();
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await expect(probe.getByRole("switch", { name: "Block the character card's override" })).toHaveCount(0);
});

// ── F-04: the drill-in is a NAVIGATION, so focus has to travel with it ────────────────────────────────
// Drilling in unmounts the chevron that opened the editor, and backing out unmounts the editor: both
// dropped focus to <body>, which restarts a keyboard user at the top of the document, twice per edit.
// This is a COMPOSITION property — neither component can see it alone — and it is invisible to any
// assertion that is not about `document.activeElement`.

test("F-04 — focus lands in the drill-in on entry and RETURNS to the originating chevron on exit", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);

  const chevron = probe.getByRole("button", { name: "Edit DeleteMe" });
  await chevron.click();

  // ENTRY: the region's first control — Back-to-rack, which also names the way out.
  const back = probe.getByRole("button", { name: "Back to rack" });
  await expect(back).toBeFocused();
  // …inside a NAMED region, so the editor is reachable by landmark and announces what it edits (rec 2).
  await expect(probe.getByRole("region", { name: "DeleteMe — section editor" })).toBeVisible();

  await back.click();

  // EXIT: back to the chevron the user left from — a BRAND-NEW node (the rack remounted), which is why
  // the restore is keyed on the section id rather than a held ref.
  await expect(probe.getByRole("button", { name: "Edit DeleteMe" })).toBeFocused();
  await expect(page.locator("body")).not.toBeFocused();
});

test("the drilled header's enable switch and the rack row's switch write ONE field", async ({ mount }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await expect(state).toContainText("on=6");

  // Off from the RACK row's switch…
  await probe.getByRole("switch", { name: "DeleteMe enabled" }).click();
  await expect(state).toContainText("on=5");

  // …and back on from the DRILLED header's echo: same path, so the count returns.
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await probe.getByRole("switch", { name: "DeleteMe enabled" }).click();
  await expect(state).toContainText("on=6");
});

test("CONTROL COLOR — the rack switch is AMBER-ON, asserted COMPUTED in BOTH states (owner ruling)", async ({ mount }) => {
  // The rendered defect this pins: every rack switch painted a pale `foreground/55` track ON and the
  // `input` track OFF — a pair the eye reads as one control in two indistinguishable states, while the
  // Reasoning switch one tab away was amber. One switch grammar, amber-ON, everywhere on this surface.
  //
  // COMPUTED, not the class list: the `tone` axis resolves through tailwind-merge, and a custom-token class
  // that loses that race still reads correct in source (the tailwind-merge custom-token lesson) — which is
  // how this exact defect was once marked fixed while rendering grey.
  const probe = await mount(<RackStory />);
  const toggle = probe.getByRole("switch", { name: "DeleteMe enabled" });
  const trackColor = (): Promise<string> => toggle.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor);
  const ember = await probe.evaluate(() => {
    const swatch = document.createElement("div");
    swatch.style.backgroundColor = "var(--color-primary)";
    document.body.append(swatch);
    const resolved = getComputedStyle(swatch).backgroundColor;
    swatch.remove();
    return resolved;
  });

  // ON (the story seeds every row enabled).
  await expect(toggle).toBeChecked();
  expect(await trackColor()).toBe(ember);

  // OFF — a genuinely different track, so the state never rides the thumb offset alone.
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await trackColor()).not.toBe(ember);
});

// The two menus are separate mounts on purpose: Base UI's popup leaves an inert backdrop behind for a beat
// after it closes, which swallows the next click on the surface underneath — a fresh mount is the honest
// isolation, not a sleep.
test("a MARKER's ⋯ menu OMITS Delete and Duplicate — the structural rule (§5.2), never a disabled Delete", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);

  await probe.getByRole("button", { name: "Edit Post-history" }).click();
  await page.getByRole("button", { name: "Section actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Move below the conversation" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toHaveCount(0);
});

test("a LITERAL keeps the full ⋯ set, and Delete persists the shorter list through the store driver", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await expect(state).toContainText("ids=sec_a,sec_del,sec_mark,sec_wi,sec_pivot,sec_z");

  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await page.getByRole("button", { name: "Section actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(state).toContainText("ids=sec_a,sec_mark,sec_wi,sec_pivot,sec_z");
  await expect(state).toContainText("savedCount=5");
});

test("the PIVOT carries no enable switch — on the rack or in its drill-in", async ({ mount }) => {
  const probe = await mount(<RackStory />);

  await expect(probe.getByRole("switch", { name: "Chat history enabled" })).toHaveCount(0);
  await probe.getByRole("button", { name: "Edit Chat history" }).click();
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();
  await expect(probe.getByRole("switch", { name: "Chat history enabled" })).toHaveCount(0);
  // And no arrangement vocabulary either: it cannot be re-zoned or trigger-filtered.
  await expect(probe.getByLabel("Zone")).toHaveCount(0);
});

test("a CARRIER's drill-in offers no depth or order, but DOES offer Triggers — #1462/#1736", async ({ mount }) => {
  const probe = await mount(<RackStory />);
  await probe.getByRole("button", { name: "Edit World info (before)" }).click();
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();

  // It IS arrangeable in the rack sense — zone is array position, which every section has…
  await expect(probe.getByRole("combobox", { name: "Zone" })).toBeVisible();
  // …but `inject` exists only on the literal / templated-marker arms of the union, so the depth/order
  // fields are ABSENT rather than rendered-and-disabled (writing either would fail the contract).
  await expect(probe.getByRole("textbox", { name: "Inject at depth" })).toHaveCount(0);
  await expect(probe.getByRole("textbox", { name: "Order" })).toHaveCount(0);
  // `trigger` IS declared on the plain-marker arm too (#1462 gave ST's `injection_trigger` parity to
  // world_info_before/after/chat_history) — the Triggers cluster is gated on `!pivot` alone, so a carrier
  // that isn't the pivot gets it same as a literal or templated marker.
  await expect(probe.getByRole("combobox", { name: "Fires on" })).toBeVisible();
  // Its body is the source-attribution panel plus the shared entry wrapper — never a body textarea.
  // Located by ROLE: the field's explainer moved to the hover HINT (side-eye F-32 — a one-line format
  // string does not need a 90px textarea plus a paragraph), and the hint trigger's own accessible name
  // contains the label, so a bare `getByLabel` now matches two elements.
  await expect(probe.getByRole("textbox", { name: "Entry wrapper" })).toBeVisible();
});

// ── #1736: THE PLAIN-MARKER TRIGGERS GATE SPLIT ──────────────────────────────────────────────────────
// The gate used to be ONE `arrangeable` flag (literal || templated marker) covering BOTH the Placement
// cluster's Order/Depth sub-fields AND the whole Triggers cluster — so a plain-marker carrier (world info
// before/after, and chat_history itself once #1462 gave it `trigger` too) never got a Triggers editor even
// though the assembler (`sectionTriggers`/`hasActiveMarker`) had honoured its `trigger` field since that
// fold. Triggers is now gated on `!pivot` ALONE; Order/Depth stay arrangeable-only (unchanged — a plain
// marker is a placement ANCHOR, `injectionDepthFor` returns null for it by design).

test("#1736 — a plain marker's Triggers cluster WRITES, and the value survives edit → save → parsePromptConfig", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await expect(state).toContainText("savedTrig=(unsaved)");

  await probe.getByRole("button", { name: "Edit World info (before)" }).click();
  const fires = probe.getByRole("combobox", { name: "Fires on" });
  await expect(fires).toHaveText(EVERY_GENERATION_RE);
  await fires.click();
  await page.getByRole("option", { name: "Swipe" }).click();
  await page.keyboard.press("Escape");
  await expect(fires).toHaveText(SWIPE_TRIGGER_RE);

  // The FORM's own value (the write proof) —
  await expect(state).toContainText("trig=sec_wi:swipe");
  // — AND what the autosave SAVE seam received, re-derived through `parsePromptConfig` (the contract's
  // own read path), not the live form: this is the edit→save→parse round trip, not just "the field wrote".
  await expect(state).toContainText("savedTrig=sec_wi:swipe");
});

test("#1736 — a templated marker moved In Chat gets BOTH Placement's depth/order AND Triggers", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);

  // `Post-history` (a templated marker) sits BEFORE the pivot in the fixture ⇒ Relative, so depth/order
  // are absent there for the SAME reason a literal's are (O-9★, not the #1736 gate). Move it In Chat via
  // the ⋯ menu so both halves of this pin — arrangement AND triggers — are visible on the one section.
  await probe.getByRole("button", { name: "Edit Post-history" }).click();
  await page.getByRole("button", { name: "Section actions" }).click();
  await page.getByRole("menuitem", { name: "Move below the conversation" }).click();

  await expect(probe.getByRole("combobox", { name: "Zone" })).toHaveText(IN_CHAT_ZONE_RE);
  await expect(probe.getByRole("textbox", { name: "Inject at depth" })).toBeVisible();
  await expect(probe.getByRole("textbox", { name: "Order" })).toBeVisible();
  await expect(probe.getByRole("combobox", { name: "Fires on" })).toBeVisible();
});

// ── THE `{{ }}` POPOVER COMPLETES AGAINST THE DERIVED CATALOG ────────────────────────────────────────
// The body's suggestion set is DERIVED from the one macro registry+metadata home (kit), not a hand-rolled
// short list — so a variable macro no hand list ever carried is offered here, with its parameterized
// `::` insert form. The other half is the curation: the excluded block-form/whitespace-literal macros
// (`{{noop}}` and friends) must NOT be offered, because the popover inserts a bare call form that a
// block macro cannot use. Only a mounted authoring surface can see either half.

test("the body's macro popover offers the derived builtin vocabulary and withholds the excluded noise", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  await probe.getByRole("button", { name: "Edit Alpha" }).click();
  const body = probe.getByRole("textbox", { name: "Text" });

  await body.fill("");
  await body.pressSequentially("{{getvar");
  await expect(page.getByRole("option", { name: "{{getvar::key}}" })).toBeVisible();

  // An EXCLUDED macro: the popover finds nothing, so it never opens.
  await body.fill("");
  await body.pressSequentially("{{noop");
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("Add mints a section AND drills straight into it, where the Name field is", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Literal text" }).click();

  // Auto-drilled: the editor is open on the NEW section, not the rack.
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();
  await expect(probe.getByLabel("Name", { exact: true })).toHaveValue("New literal");
  await expect(state).toContainText("savedCount=7");
});

// ── §5.2 fork-eject: the section drill survives the built-in's fork-retarget remount ──────────────────────
// The SAME defect the Actions template drill already fixed (dcaf87bc1), one view over: the production seam is
// `PresetForm entityId={presetId}` + the autosave hook's `selectPreset(fork)` swapping that id mid-edit,
// which remounts the whole keyed session. With the drill held in LOCAL component state, that remount dumped
// the author from the section editor to the top of the rack mid-sentence. The fork carries the SAME config
// (same section ids), so a drill homed on the section-id STORE axis re-anchors onto the copy's same section.
// The story reproduces exactly that seam; the pin is that the OPEN editor is still open, on the same section.
test("§5.2 — the section drill-in survives the fork's keyed remount, re-anchored to the same section", async ({ mount }) => {
  const probe = await mount(<SectionForkStory />);

  await probe.getByRole("button", { name: "Edit Epilogue" }).click();
  await expect(probe.getByRole("region", { name: "Epilogue — section editor" })).toBeVisible();
  // The rack rows are gone — we are IN the editor, not standing on the list.
  await expect(probe.getByRole("button", { name: "Prologue", exact: true })).toHaveCount(0);

  // The fork retarget: the session boundary remounts under the fork's entity id.
  await probe.getByRole("button", { name: "simulate fork retarget" }).click();
  await expect(probe.getByText("entity=preset_promptforkedxx")).toBeVisible();

  // STILL in the editor, STILL on Epilogue — never ejected to the rack. (With a local drill id this is where
  // the author landed back on the section list, mid-edit.)
  await expect(probe.getByRole("region", { name: "Epilogue — section editor" })).toBeVisible();
  await expect(probe.getByLabel("Name", { exact: true })).toHaveValue("Epilogue");
  await expect(probe.getByRole("button", { name: "Prologue", exact: true })).toHaveCount(0);

  // …and Back still works after the swap (the closed drill returns to the fork's rack).
  await probe.getByRole("button", { name: "Back to rack" }).click();
  await expect(probe.getByRole("button", { name: "Prologue", exact: true })).toBeVisible();
});
