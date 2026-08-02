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
import { ActionsStory } from "./_actions-stories";

/** The group HEADINGS, in `TEMPLATE_KINDS` tuple order. Human labels, not the raw enum members the
 *  registry keys on (side-eye F-30 / ARIA rec 10): a kicker over a group of rows is a heading a person
 *  reads. The per-row KIND CHIP still prints the raw member — that is a taxonomy tag, not a heading. */
const KIND_HEADERS = ["Steers", "Voice", "Studio", "Format", "Nudges"] as const;
/** A rack GRIP's accessible-name shape — the affordance this list must never grow (audit row 31). */
const REORDER_GRIP_RE = /^Reorder/u;

test("every registry def renders — including the two slots that had no editor before", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);

  // Kicker groups come from `TEMPLATE_KINDS`, in tuple order.
  await Promise.all(KIND_HEADERS.map((kind) => expect(probe.getByRole("heading", { name: kind, exact: true })).toBeVisible()));
  // G5 + G9: neither had a client-side editor before, and neither is named anywhere in the view's code.
  await expect(probe.getByRole("button", { name: "Response nudge", exact: true })).toBeVisible();
  await expect(probe.getByRole("button", { name: "New-chat marker", exact: true })).toBeVisible();
  // A slot shipping NO default bytes says so rather than ghosting a lie.
  await expect(probe.getByText("(blank — off)")).toBeVisible();
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
const ROW_SUBTITLE = '[data-slot="list-row-subtitle"]';

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
  const glossWidth = (await probe.locator(ROW_SUBTITLE).first().boundingBox())?.width ?? 0;
  const narrow = await titles.evaluateAll((els) => els.map((el) => ({ text: el.textContent ?? "", width: el.getBoundingClientRect().width })));
  for (const row of narrow) {
    expect(row.width, `"${row.text}" keeps a visible name at 420px`).toBeGreaterThan(0);
    expect(row.width).toBeGreaterThanOrEqual(glossWidth);
  }
});

test("F-20 — the row's mono template PREVIEW is not announced (a 600-char body is not a description)", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  const row = probe.getByRole("button", { name: "Impersonate", exact: true });

  // The row's accessible DESCRIPTION is its fires gloss — the preview span is aria-hidden and carries no
  // describedby id, so a screen reader hears what the action DOES, not the whole template body.
  const describedBy = (await row.getAttribute("aria-describedby")) ?? "";
  expect(describedBy).not.toBe("");
  const described = await probe.locator(`#${describedBy.split(" ").join(", #")}`).allTextContents();
  expect(described.join(" ")).toContain("writes as you for one turn");
  expect(described.join(" ")).not.toContain("{{person}}");
});

test("the state chip reads Customized only for a real override — empty IS the default", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  // The fixture customizes exactly one template.
  await expect(probe.getByText("Customized", { exact: true })).toHaveCount(1);
  await expect(probe.getByText("Default", { exact: true }).first()).toBeVisible();
});

test("the list is a FIXED ENUM — no toggle, no grip, no Add anywhere (§16 row 31's absence)", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  await expect(probe.getByRole("switch")).toHaveCount(0);
  await expect(probe.getByRole("button", { name: REORDER_GRIP_RE })).toHaveCount(0);
  await expect(probe.getByRole("button", { name: "Add" })).toHaveCount(0);
});

test("the drill-in is CAPABILITY-DRIVEN: a guided template gets role+depth, a nudge gets text only", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);

  await probe.getByRole("button", { name: "Edit Impersonate", exact: true }).click();
  await expect(probe.getByRole("button", { name: "Back to actions" })).toBeVisible();
  await expect(probe.getByRole("combobox", { name: "Delivered as" })).toBeVisible();
  await expect(probe.getByRole("textbox", { name: "At depth" })).toHaveValue("2");
  // Its declared token vocabulary rides the same capability list.
  await expect(probe.getByText("{{person}}", { exact: true })).toBeVisible();
  // ARRANGEMENT vocabulary is a SECTION's and never appears here (§5.0).
  await expect(probe.getByRole("combobox", { name: "Zone" })).toHaveCount(0);
  await expect(probe.getByRole("textbox", { name: "Order" })).toHaveCount(0);
  await expect(probe.getByRole("group", { name: "Fires on" })).toHaveCount(0);

  await probe.getByRole("button", { name: "Back to actions" }).click();

  // A nudge declares NO role/depth capability, so its editor is text-only BY DERIVATION.
  await probe.getByRole("button", { name: "Edit Continue nudge" }).click();
  await expect(probe.getByRole("button", { name: "Back to actions" })).toBeVisible();
  await expect(probe.getByRole("combobox", { name: "Delivered as" })).toHaveCount(0);
  await expect(probe.getByRole("textbox", { name: "At depth" })).toHaveCount(0);
});

test("the shared DeliveryCluster writes the guided action's own role+depth through the boundary", async ({ mount }) => {
  const probe = await mount(<ActionsStory />);
  const state = probe.locator("output");

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
