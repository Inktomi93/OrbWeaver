// CT: the ACTIONS view derives EVERYTHING from `TEMPLATE_DEFS` (preset-surface-redesign §6.1/§6.6) and
// carries the §16 row-31 ABSENCE. Each case pins a rule the old 8-card grid broke or could not express:
//
//   · the previously EDITOR-LESS `responseNudge` (G5) and the new `newChatMarker` (G9) appear with no
//     client-side code naming them — that is what "registry-derived" has to mean or it is just a refactor;
//   · the list is a FIXED PRODUCT ENUM: no toggles, no grips, no Add. The manageable list is the RACK;
//   · the drill-in is CAPABILITY-DRIVEN — a nudge declaring no `role`/`depth` renders text-only, a guided
//     template renders the shared DeliveryCluster, and nothing branches on a template's NAME;
//   · a template's editor NEVER carries arrangement vocabulary (zone / order / triggers / locks).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { ActionsStory } from "./_actions-stories.tsx";

/** The rendered box, rounded — sub-pixel noise is not a defect, an 8/16px shear is. */
async function boxOf(locator: Locator): Promise<{ readonly top: number; readonly height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("expected a rendered box");
  }
  return { top: Math.round(box.y), height: Math.round(box.height) };
}

/** The group HEADINGS, in `TEMPLATE_KINDS` tuple order. Human labels, not the raw enum members the
 *  registry keys on (side-eye F-30 / ARIA rec 10): a kicker over a group of rows is a heading a person
 *  reads. The per-row KIND CHIP still prints the raw member — that is a taxonomy tag, not a heading. */
const KIND_HEADERS = ["Steers", "Voice", "Studio", "Format", "Nudges", "Game teaches"] as const;
/** A rack GRIP's accessible-name shape — the affordance this list must never grow (audit row 31). */
const REORDER_GRIP_RE = /^Reorder/u;
/** The DELIVERY row's two `<Field>` labels, matched exactly — the hint trigger is a SIBLING of the label,
 *  so a loose match would catch its "More info about …" name too. */
const ROLE_LABEL_RE = /^Role$/;
const AT_DEPTH_LABEL_RE = /^At depth$/;

test("every registry def renders — including the two slots that had no editor before", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);

  // Kicker groups come from `TEMPLATE_KINDS`, in tuple order.
  await Promise.all(KIND_HEADERS.map((kind) => expect(probe.getByRole("heading", { name: kind, exact: true })).toBeVisible()));
  // G5 + G9: neither had a client-side editor before, and neither is named anywhere in the view's code.
  await expect(probe.getByRole("button", { name: "Response nudge", exact: true })).toBeVisible();
  await expect(probe.getByRole("button", { name: "New-chat marker", exact: true })).toBeVisible();
  // A slot shipping NO default bytes says so rather than ghosting a lie — in the DRILL-IN, which is the
  // template text's editing home. The row's mono preview cell that used to carry it is DELETED (side-eye
  // F-7): 152px of every row spent on the text's THIRD home, clipping on all six sampled rows and reading
  // identically on five of them, while the column that discriminates (the fires gloss) starved.
  await probe.getByRole("button", { name: "Edit New-chat marker" }).click();
  await expect(probe.getByPlaceholder("Blank — nothing is emitted until you write something here.")).toBeVisible();
});

test("F-7 — the row carries NO template preview cell; the template text has two homes, not three", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  await expect(probe.getByRole("button", { name: "Impersonate", exact: true })).toBeVisible();
  // The measured shape of the defect: five of six rows read the identical first 30 characters of a
  // bracketed template. Nothing on a row may render that string any more.
  await expect(probe.getByText("[Take the following into", { exact: false })).toHaveCount(0);
  await expect(probe.getByText("[Forget all other previous", { exact: false })).toHaveCount(0);
});

// ── THE P0 (side-eye F-01): three rows rendered with NO VISIBLE NAME ──────────────────────────────────
// "Greeting rewrite", "New greeting" and "New-chat marker" measured 0px of label width, and "Response"
// clipped to "Respo…", because the name and the fires GLOSS shared one flex line with no basis: the gloss
// was `shrink-0`, so the identifier absorbed every squeeze. The DOM and the accessible name were fine the
// whole time — this defect is invisible to any assertion that is not a MEASUREMENT.
//
// The pin is deliberately GEOMETRIC and total: every row's title box, > 0px wide, and its rendered text
// un-elided. Asserting "the text is in the DOM" is exactly the check that stayed green while the pane
// shipped three anonymous rows.

const TITLE = '[data-slot="list-row-title"]';
const ROW_ROOT = '[data-slot="list-row-root"]';

test("F-01 — EVERY row's name has real width, and it is the GLOSS that shortens", async ({ mount, page }) => {
  const probe = await mount(<ActionsStory />);
  await expect(probe.getByRole("button", { name: "Response nudge", exact: true })).toBeVisible();

  const titles = probe.locator(TITLE);
  const count = await titles.count();
  // The registry ships 11 rows today (8 guided actions + 3 nudges + the format slot, minus none). Pin the
  // count so a registry that stops rendering rows cannot make the width check vacuously pass.
  expect(count).toBeGreaterThanOrEqual(11);

  // Measured in ONE page evaluation: a per-row `await` loop is both slower and a lint violation, and the
  // whole point is a snapshot of the SAME layout pass across every row.
  const measured = await titles.evaluateAll((els) =>
    els.map((el) => ({ text: el.textContent ?? "", width: el.getBoundingClientRect().width, elided: el.scrollWidth > el.clientWidth + 1 })),
  );
  for (const row of measured) {
    // WIDTH, not presence: 0px is exactly what the defect looked like in the DOM-passing state.
    expect(row.width, `"${row.text}" must have a visible name`).toBeGreaterThan(0);
    // …and the name is not ELLIPSIZED either (the "Respo…" arm of the same defect).
    expect(row.elided, `"${row.text}" must not clip its name`).toBe(false);
  }

  // THE PRIORITY, stated as geometry: squeeze the pane to a phone width and the GLOSS is what gives —
  // all the way to nothing if it must — while every NAME still measures. This is the exact inversion of
  // the shipped defect, so it is the assertion that would have caught it.
  await page.setViewportSize({ width: 420, height: 900 });
  const narrow = await titles.evaluateAll((els) => els.map((el) => ({ text: el.textContent ?? "", width: el.getBoundingClientRect().width })));
  // The floor is the `inline` subtitle arm's `min-w-24` (96px) — a STRUCTURAL guarantee, not a comparison
  // against the gloss. It used to be spelled as "the name is at least as wide as the gloss", which held
  // only while a 152px preview cell was eating the row's width; F-7 gave that width back to the gloss, so
  // the gloss is now legitimately the wider column and the NAME's guarantee is its own floor.
  const floorPx = await probe
    .locator(TITLE)
    .first()
    .evaluate((el) => {
      const probeEl = el.ownerDocument.createElement("div");
      probeEl.className = "min-w-24";
      el.ownerDocument.body.append(probeEl);
      const px = Number.parseFloat(getComputedStyle(probeEl).minWidth);
      probeEl.remove();
      return px;
    });
  expect(floorPx, "the min-w-24 token must resolve, or this assertion is vacuous").toBeGreaterThan(0);
  for (const row of narrow) {
    expect(row.width, `"${row.text}" keeps a visible name at 420px`).toBeGreaterThanOrEqual(floorPx);
  }
});

test("the row's DESCRIPTION is what the action does, never its template body", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  const row = probe.getByRole("button", { name: "Impersonate", exact: true });

  // Formerly the F-20 pin on an aria-hidden preview span; the span itself is gone with F-7, so this now
  // states the invariant directly: a screen reader hears what the action DOES, not the template body.
  const describedBy = (await row.getAttribute("aria-describedby")) ?? "";
  expect(describedBy).not.toBe("");
  const described = await probe.locator(`#${describedBy.split(" ").join(", #")}`).allTextContents();
  expect(described.join(" ")).toContain("writes as you for one turn");
  expect(described.join(" ")).not.toContain("{{person}}");
});

test("the state chip reads Customized only for a real override — and ABSENCE is the default", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  // The fixture customizes exactly one template.
  await expect(probe.getByText("Customized", { exact: true })).toHaveCount(1);
  // THE `Default` CHIP IS GONE (side-eye R-7): a "you changed this" marker that fired on the majority of
  // rows was ~70px per row spent saying nothing, taken from the description — the cell that discriminates.
  await expect(probe.getByText("Default", { exact: true })).toHaveCount(0);
});

// ONE COLUMN, ONE LEFT EDGE (side-eye R-7 / F-7 half-fixed). Killing the 152px preview cell gave the row
// its width back, but the `inline` subtitle arm sizes the name to its own TEXT — so down the deck the
// descriptions started at five different x positions (measured 487…520) and got five different widths,
// with the longest clipped hardest. The mock always said "a fixed name column, then the gloss at 1fr".
test("R-7 — every row's description shares ONE left edge, and takes ALL the width the name isn't using", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  await expect(probe.getByRole("button", { name: "Response nudge", exact: true })).toBeVisible();

  const rows = await probe.locator(ROW_ROOT).evaluateAll((els) =>
    els.map((el) => {
      const gloss = el.querySelector('[data-slot="list-row-subtitle"]')?.getBoundingClientRect();
      const actions = el.querySelector('[data-slot="list-row-actions"]')?.getBoundingClientRect();
      return {
        left: Math.round(gloss?.left ?? 0),
        // The space between where the description ends and the trailing cluster begins.
        toActions: Math.round((actions?.left ?? 0) - (gloss?.right ?? 0)),
      };
    }),
  );
  expect(rows.length).toBeGreaterThanOrEqual(11);

  // THE DEFECT, stated exactly: five different left edges (measured 487…520) down one column, because the
  // `inline` arm sized each name cell to its own text. One column, one edge.
  expect([...new Set(rows.map((r) => r.left))], "one description column means one left edge").toHaveLength(1);
  // …and the RIGHT edge is the trailing cluster's, identically on every row — so the description takes all
  // the width that is left, and what is left is decided by the chips, never by how long a name happens to
  // be. (The widths themselves are NOT all equal, and should not be: the kind chip's own label length and
  // the one `Customized` marker legitimately move the cluster's edge. That is the cluster speaking, which
  // is the thing this column was supposed to be independent of.)
  expect([...new Set(rows.map((r) => r.toActions))], "the description always runs to the trailing cluster").toHaveLength(1);
});

test("the list is a FIXED ENUM — no toggle, no grip, no Add anywhere (§16 row 31's absence)", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  await expect(probe.getByRole("switch")).toHaveCount(0);
  await expect(probe.getByRole("button", { name: REORDER_GRIP_RE })).toHaveCount(0);
  await expect(probe.getByRole("button", { name: "Add" })).toHaveCount(0);
});

// ── §16 row 23 / §6.1: SELECT ≠ DRILL, the rack's grammar spoken here too ─────────────────────────────
// The row body used to DRILL, which was defensible only while the readout had no echo half to select toward.
// D8's resolved preview is that half, so the acts diverge: body = select (the readout resolves THAT template),
// chevron = drill. The pin is the same one the rack row carries — a row click must NOT mount the editor.

test("row click SELECTS and does not drill; the chevron is the only door into the editor", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);

  await probe.getByRole("button", { name: "Impersonate", exact: true }).click();
  // The editor did NOT open (the drill-in's back affordance is its unmistakable tell).
  await expect(probe.getByRole("button", { name: "Back to actions" })).toHaveCount(0);
  // …and the list is still standing, with the clicked row now carrying the selected state the readout echoes.
  await expect(probe.getByRole("heading", { name: "Steers", exact: true })).toBeVisible();
  await expect(probe.locator('[data-slot="list-row-root"][data-selected]')).toHaveCount(1);

  // The chevron remains the drill — one act, one control.
  await probe.getByRole("button", { name: "Edit Impersonate", exact: true }).click();
  await expect(probe.getByRole("button", { name: "Back to actions" })).toBeVisible();
});

test("the drill-in is CAPABILITY-DRIVEN: a guided template gets role+depth, a nudge gets text only", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);

  await probe.getByRole("button", { name: "Edit Impersonate", exact: true }).click();
  await expect(probe.getByRole("button", { name: "Back to actions" })).toBeVisible();
  await expect(probe.getByRole("combobox", { name: "Role" })).toBeVisible();
  await expect(probe.getByRole("textbox", { name: "At depth" })).toHaveValue("2");
  // Its declared token vocabulary rides the same capability list.
  await expect(probe.getByText("{{person}}", { exact: true })).toBeVisible();
  // ARRANGEMENT vocabulary is a SECTION's and never appears here (§5.0).
  await expect(probe.getByRole("combobox", { name: "Zone" })).toHaveCount(0);
  await expect(probe.getByRole("textbox", { name: "Order" })).toHaveCount(0);
  await expect(probe.getByRole("combobox", { name: "Fires on" })).toHaveCount(0);

  await probe.getByRole("button", { name: "Back to actions" }).click();

  // A nudge declares NO role/depth capability, so its editor is text-only BY DERIVATION.
  await probe.getByRole("button", { name: "Edit Continue nudge" }).click();
  await expect(probe.getByRole("button", { name: "Back to actions" })).toBeVisible();
  await expect(probe.getByRole("combobox", { name: "Role" })).toHaveCount(0);
  await expect(probe.getByRole("textbox", { name: "At depth" })).toHaveCount(0);
});

// ── ITEM 10 / O-14: the DELIVERY pair is ONE ROW here too ────────────────────────────────────────────
// The cluster is SHARED, so the shear is shared: the hinted "At depth" half's label rode a 34px icon-button
// row while "Role" was text-height, and the two controls landed 16px apart. Owner, live: "actions delivery
// misalignment". Asserted COMPUTED — the source reads as a tidy two-cell Grid either way.

test("item 10 — the template drill's DELIVERY labels and controls each share one baseline", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  await probe.getByRole("button", { name: "Edit Impersonate", exact: true }).click();

  const labels = probe.locator('[data-slot="field-label"]');
  const role = await boxOf(labels.filter({ hasText: ROLE_LABEL_RE }));
  const depth = await boxOf(labels.filter({ hasText: AT_DEPTH_LABEL_RE }));
  expect(role.top).toBe(depth.top);
  expect(role.height).toBe(depth.height);

  // The CONTROL BOXES: a NumberField's border lives on its Group, so its `<input>` sits 1px inside — an
  // input-vs-Select-trigger comparison would assert a 1px shear nobody can see.
  const roleControl = await boxOf(probe.getByRole("combobox", { name: "Role" }));
  const depthControl = await boxOf(probe.getByRole("textbox", { name: "At depth" }).locator(".."));
  expect(roleControl.top).toBe(depthControl.top);
});

// ── THE TURN-WIRE FRAMINGS (owner ruling 2026-08-07) ─────────────────────────────────────────────────
// The owner's complaint, verbatim: the note framings were "not exposed in our presets template tab". They
// were `UserSettings.prose` rows (a different tab entirely) and, for the continuation cue, a `const` in
// `assembly/shape.ts`. These pins are the SEEING half — a green resolver test cannot tell you the row is
// reachable, and "reachable" is the whole defect.

test("the three turn-wire framings are ROWS in this tab, ghosting their shipped bytes", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  // Registry-derived exactly like the G5/G9 pins above: nothing in `actions-view.tsx` names these.
  await expect(probe.getByRole("button", { name: "System-note frame", exact: true })).toBeVisible();
  await expect(probe.getByRole("button", { name: "User-note frame", exact: true })).toBeVisible();
  await expect(probe.getByRole("button", { name: "Continuation cue", exact: true })).toBeVisible();

  // The GHOST is the shipped default, byte-for-byte — which is also what the wire ships until the host
  // types. A framing that ghosted the wrong bytes would promise a behavior the assembler does not have.
  await probe.getByRole("button", { name: "Edit User-note frame" }).click();
  await expect(probe.getByPlaceholder("[Note from user: {{note}}]")).toBeVisible();
  await probe.getByRole("button", { name: "Back to actions" }).click();
  await probe.getByRole("button", { name: "Edit Continuation cue" }).click();
  await expect(probe.getByPlaceholder("[Continue the conversation.]")).toBeVisible();
});

test("a framing drill-in is TEXT-ONLY and offers its own {{note}} token, never arrangement vocabulary", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  await probe.getByRole("button", { name: "Edit System-note frame" }).click();
  await expect(probe.getByRole("button", { name: "Back to actions" })).toBeVisible();
  // A framing declares no role/depth: where it lands is the WIRE's shape, not an author's choice.
  await expect(probe.getByRole("combobox", { name: "Role" })).toHaveCount(0);
  await expect(probe.getByRole("textbox", { name: "At depth" })).toHaveCount(0);
  // Its one token IS its payload carrier — the reference chip rides the same capability list every other
  // template's does.
  await expect(probe.getByText("{{note}}", { exact: true })).toBeVisible();
});

// THE TYPING PIN (the defect `fill()` could not see, found by a verifier driving the live app). `fill()` sets
// a controlled input's value in ONE event, so it sails past a per-keystroke transform: the drill-in trimmed
// on every change and React handed the trimmed string straight back, which meant `Note x` typed out as
// `Notex` and `a⏎b` as `ab`. An owner could only author multi-word text by PASTING. Any assertion about a
// controlled field's editing behavior has to press real keys.
test("a framing is TYPEABLE — real keystrokes keep interior spaces and newlines while the field is live", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  await probe.getByRole("button", { name: "Edit User-note frame" }).click();
  const body = probe.getByRole("textbox", { name: "Template" });

  await body.click();
  await body.pressSequentially("The table says");
  // The exact shape of the bug: the SPACE between two words, asserted mid-typing rather than after.
  await expect(body).toHaveValue("The table says");
  await body.press("Enter");
  await body.pressSequentially("{{note}}");
  await expect(body).toHaveValue("The table says\n{{note}}");

  // …and a TRAILING space survives while the field is live: it is the character the author is about to type
  // the next word after, and eating it is the same defect one keystroke earlier.
  await body.pressSequentially(" ");
  await expect(body).toHaveValue("The table says\n{{note}} ");
});

test("editing a framing writes a VERSION-STAMPED override at SAVE, trimmed at the edges only", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  const framing = probe.getByLabel("saved framing");
  await expect(framing).toContainText("framing=—");

  await probe.getByRole("button", { name: "Edit User-note frame" }).click();
  const body = probe.getByRole("textbox", { name: "Template" });
  await body.click();
  await body.pressSequentially("  ((the table says: {{note}})) ");
  await body.blur();
  // The stored record, not just the text: an edit stamps the CURRENT slot version, which is what makes the
  // §4.4 staleness signal mean anything later. The `|` delimiters make the trimmed EDGES assertable — the
  // draft carried them, the persisted record must not.
  await expect(framing).toContainText("framing=|((the table says: {{note}}))|@v1");

  // CLEARING IS THE RESET (the storage semantic everywhere in this schema): the key must actually go, or the
  // slot resolves to empty bytes instead of falling back to the shipped frame. Also the whitespace-only case:
  // a field left holding spaces is a cleared field, not an override of blanks.
  await body.fill("   ");
  await body.blur();
  await expect(framing).toContainText("framing=unset");
});

test("a framing that drops {{note}} WARNS in the drill-in — and never blocks the edit", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  await probe.getByRole("button", { name: "Edit User-note frame" }).click();
  const body = probe.getByRole("textbox", { name: "Template" });
  // An untouched field is on the built-in wording, so it cannot lint (the shipped default carries the token).
  await expect(probe.getByText("Using the built-in wording")).toBeVisible();
  await expect(probe.getByText("Missing {{note}}")).toHaveCount(0);

  await body.click();
  await body.pressSequentially("((the table says something))");
  // `{{note}}` is the PAYLOAD carrier: without it the wrapper ships and the injection's content is gone.
  await expect(probe.getByText("Missing {{note}}")).toBeVisible();
  // WARN, NEVER BLOCK (§6.3): the text still reaches the save spy.
  await body.blur();
  await expect(probe.getByLabel("saved framing")).toContainText("framing=|((the table says something))|@v1");

  // Putting the token back clears the warning — the lint tracks the live text, not the last save.
  await body.fill("((the table says: {{note}}))");
  await expect(probe.getByText("Missing {{note}}")).toHaveCount(0);
});

test("the shared DeliveryCluster writes the guided action's own role+depth through the boundary", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  const state = probe.getByLabel("saved delivery");

  await probe.getByRole("button", { name: "Edit Impersonate", exact: true }).click();
  const depth = probe.getByRole("textbox", { name: "At depth" });
  // Select-all + retype: Base UI's NumberField is CONTROLLED, and a bare fill() on a live-formatted
  // numeric input lands beside the existing digits rather than replacing them ("2" + "0" → 20).
  await depth.click();
  await depth.press("ControlOrMeta+a");
  await depth.pressSequentially("5");
  await depth.blur();

  await expect(state).toContainText("saved=user@5");
});
