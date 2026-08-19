// CT: the Databank CONTENT pane over the stubbed network. What it pins (databank-surface-spec §6.2):
//
//   · the no-selection arm TEACHES what the bank is — an empty CONTENT pane reads as unbuilt;
//   · the selection handoff: the row you clicked is the document the pane paints;
//   · the identity header keeps its phase chip (the chip §6.1 deletes from the LIST ROW, because here it is
//     the answer to the question the user asked by opening the document) and the Details readout;
//   · the source text is a SEPARATE `includeText` read fired only on REVEAL — the whole reason the contract
//     splits the two reads, and what keeps opening a 4 MB document cheap — rendered as a read-only REGION,
//     never a `Textarea` (legacy's form control announced the canon as an editable textbox).

import { expect, test } from "@playwright/experimental-ct-react";
import { readPhantomScrollers } from "../../../../support/ct/scroll-containing-block.ts";
import { DatabankDetailStory, DatabankDetailWideStory, DatabankWorkspaceStory } from "../_ct-stories.tsx";
import { INDEXING_DOC, READY_DOC, SOURCE_TEXT, stubDatabank } from "../fixtures.ts";

/** The row bodies open a document — matched loosely because the row's accessible name carries its scent
 *  line as well as its title (top-level so the pattern is compiled once). */
const CRIMSON_ROW = /The Crimson Court/;
const DUSKWATER_ROW = /Duskwater Barony/;

/** The tail of `DATABANK_INGEST_GLOSS` — distinctive enough to count its copies on screen, and NOT the
 *  whole string, so the pin is about the number of homes rather than about the wording. */
const INGEST_GLOSS_TAIL = "passages feed into your chats as they happen";
/** The buttonless invitation the CONTENT welcome used to end on (the two-Add-doors trim). */
const ADD_ANOTHER_INVITE = "or add another";

test("CONTENT with nothing open TEACHES what the bank is — never a blank pane", async ({ mount, page }) => {
  await stubDatabank(page);
  const content = await mount(<DatabankDetailStory />);

  await expect(content.getByText("Your databank")).toBeVisible();
});

// THE SAME SENTENCE MUST NOT PRINT TWICE AT REST (side-eye 2026-08-19 taste). The one-home copy fix of
// 2026-08-08 is CORRECT and is not forked — `DATABANK_INGEST_GLOSS` still has exactly one spelling. What it
// created is a different defect: on an empty bank the LIST and CONTENT panes are both on screen and both
// printed it (13px there, 15px here), so the product said one thing twice in one glance. The fix is which
// SLOT renders it, never a second wording. Driven in ONE mount, because simultaneity is the whole finding.
// The second half is the two-Add-doors trim: this pane used to end "…or add another" with no button under
// it, 226px from the LIST's real one.
test("the two empty panes do not print the same sentence, and only ONE offers Add (taste)", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.listGlobal": () => [] }, []);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await expect(workspace.getByText("Your databank")).toBeVisible();
  await expect(workspace.getByText("No documents yet")).toBeVisible();

  // The teaching gloss survives exactly once, in the pane that owns the first step.
  await expect(workspace.getByText(INGEST_GLOSS_TAIL)).toHaveCount(1);
  await expect(workspace.getByText(ADD_ANOTHER_INVITE)).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: "Add a document" })).toHaveCount(1);
});

// ARRIVAL FOCUS BELONGS TO THE PANE THE READER CAME FOR (side-eye 2026-08-19 ARIA) — the config workspace's
// precedent verbatim, one section over. Both surfaces call `useFocusOnMount`; CONTENT mounts SECOND, so
// with nothing open a keyboard user landed on the welcome, last in the DOM, a full wrap past the library.
test("with nothing open, CONTENT stands down and the LIST keeps arrival focus (ARIA)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await expect(workspace.getByText("The Crimson Court")).toBeVisible();

  // `useFocusOnMount` declines on a cold load (activeElement is <body>) — the honest arrival is a real
  // navigation, so give it one by focusing something first, then re-mounting is impossible in a CT. Instead
  // assert the DECISION at its observable: the content pane never becomes the active element while the
  // selection is null, and DOES take it once a document is opened.
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-slot") ?? "none")).not.toBe("databank-content");

  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-slot") ?? "none")).toBe("databank-content");
});

test("opening a row from the LIST paints THAT document's detail (the selection handoff)", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);

  await workspace.getByRole("button", { name: DUSKWATER_ROW }).first().click();

  // The row you clicked is the document you got — in the pane, not just on the wire.
  await expect(workspace.getByRole("heading", { name: "Duskwater Barony" })).toBeVisible();
  await expect.poll(() => trpc.lastInput("databank.get"), { intervals: [20, 50, 100] }).toEqual({ id: INDEXING_DOC.id });
});

test("the detail states its metadata, keeps its Ready chip, and offers Reindex", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  await expect(workspace.getByText("Ready", { exact: true })).toBeVisible();
  await expect(workspace.getByText("application/pdf")).toBeVisible();
  // ONE VOCABULARY, BOTH PANES (side-eye 2026-08-19 P2). The row two panes left says "12 passages"; this
  // readout said "Chunks · 12 / 12 embedded" — one number under two names, which reads as two facts.
  await expect(workspace.getByText("Passages", { exact: true })).toBeVisible();
  await expect(workspace.getByText("12 passages", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Chunks", { exact: true })).toHaveCount(0);

  await workspace.getByRole("button", { name: "Reindex" }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex"), { intervals: [20, 50, 100] }).toEqual({ scope: { kind: "document", documentId: READY_DOC.id } });
});

// THE DETAIL KEEPS A MEASURE (side-eye sweep 2026-08-03). `justify="between"` label/value rows spend
// whatever width they are given: at the 1448px desktop CONTENT pane "Origin" sat at x=496 and its own value
// "Text" at x=1387 — 890px of nothing between a label and the thing it labels, and Reindex flung to the far
// edge of its sentence. Both sibling member editors (tag, regex) keep `max-w-prose`; this one did not.
// Asserted at the WIDEST real host (the 720px story cannot see it) as the RENDERED readout width against
// the pane's own, so a token change cannot drift out from under it and a px literal cannot satisfy it.
test("the detail keeps a MEASURE at a desktop-wide pane — it does not spread with the window", async ({ mount, page }) => {
  await stubDatabank(page);
  const wide = await mount(<DatabankDetailWideStory />);
  await wide.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(wide.getByText("application/pdf")).toBeVisible();

  const measured = await page.evaluate(() => {
    const label = [...document.querySelectorAll("p,span")].find((el) => el.textContent?.trim() === "Origin" && el.children.length === 0);
    const pane = document.querySelector('[data-slot="databank-content"]');
    if (label === undefined || pane === null) {
      return null;
    }
    // The readout ROW is the label's parent — its width is what the whole finding is about.
    const row = label.parentElement;
    return { row: row === null ? 0 : row.getBoundingClientRect().width, pane: pane.getBoundingClientRect().width };
  });

  expect(measured).not.toBeNull();
  // The pane really is the wide one…
  expect(measured?.pane ?? 0).toBeGreaterThan(1200);
  // …and the readout is not. `max-w-prose` is the measure both sibling member editors (tag, regex) keep;
  // asserted as a RELATION to the pane, so the token behind it can move without rotting this line.
  expect(measured?.row ?? Number.POSITIVE_INFINITY).toBeLessThan((measured?.pane ?? 0) * 0.7);
});

// A MEASURE CAPS THE WORST CASE; IT DOES NOT TIE THE PAIR (side-eye 2026-08-19 P2). The 08-03 measure above
// is REFINED, not overturned: inside it, `justify="between"` still spent the whole row, so "Origin" and its
// own value sat 382-475px apart at the real desktop pane and the eye crossed a hand-span to read one datum.
// The label now takes a fixed column (`--width-label-col`) and the value starts beside it, so the gap is
// gone by CONSTRUCTION rather than by being small enough at one measured width. Asserted as the LARGEST gap
// across every row, at the widest real host — a per-row check would pass on the short labels alone.
test("every readout row ties its label to its value — no gap to cross at any width", async ({ mount, page }) => {
  await stubDatabank(page);
  const wide = await mount(<DatabankDetailWideStory />);
  await wide.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(wide.getByText("application/pdf")).toBeVisible();

  const worstGap = await page.evaluate(() => {
    const pane = document.querySelector('[data-slot="databank-content"]');
    const labels = ["Origin", "Type", "Size", "Characters", "Passages", "Added", "Updated"];
    let worst = 0;
    for (const name of labels) {
      const label = [...(pane?.querySelectorAll("p,span") ?? [])].find((el) => el.textContent?.trim() === name && el.children.length === 0);
      const value = label?.nextElementSibling;
      if (label === undefined || value === null || value === undefined) {
        return { gap: Number.POSITIVE_INFINITY, missing: name };
      }
      worst = Math.max(worst, value.getBoundingClientRect().left - label.getBoundingClientRect().right);
    }
    return { gap: worst, missing: null };
  });

  expect(worstGap.missing).toBeNull();
  // The label column is 152px (`--width-label-col`), so the widest label ("Characters") leaves the smallest
  // slack and the shortest ("Size") the largest — all of it INSIDE one column, i.e. well under the 382px
  // the finding measured and under the column itself.
  expect(worstGap.gap).toBeLessThan(152);
});

// CD1 (section.tsx's own doc): a read-only grouping gets the micro-caps kicker + a hairline rule, not the
// settings-pane `heading`. Three of the six `heading=` call sites the 2026-08-19 sweep found are here.
test("the CONTENT groups are CD1 kickers, hairline and all (P2)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "Details" })).toBeVisible();

  const measured = await page.evaluate(() =>
    ["Details", "Maintenance", "Source text"].map((name) => {
      const heading = [...document.querySelectorAll("h3")].find((el) => el.textContent?.trim() === name);
      if (heading === undefined) {
        return { name, transform: "MISSING", separators: -1 };
      }
      const row = heading.parentElement;
      return {
        name,
        transform: getComputedStyle(heading).textTransform,
        separators: row === null ? -1 : row.querySelectorAll('[data-slot="separator"]').length,
      };
    }),
  );

  expect(measured).toEqual([
    { name: "Details", transform: "uppercase", separators: 1 },
    { name: "Maintenance", transform: "uppercase", separators: 1 },
    { name: "Source text", transform: "uppercase", separators: 1 },
  ]);
});

test("source text is a read-only REGION, fetched only on reveal — not a Textarea, not part of the open read", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  // Opening a document must NOT haul its canon: the text is absent until asked for.
  await expect(workspace.getByText(SOURCE_TEXT)).toHaveCount(0);

  await workspace.getByRole("button", { name: "View source text" }).click();
  await expect(workspace.getByText(SOURCE_TEXT)).toBeVisible();
  // The readout is not a form control — legacy's `Textarea readOnly` announced as an editable textbox.
  await expect(workspace.locator("textarea")).toHaveCount(0);
  await expect.poll(() => trpc.inputs("databank.get"), { intervals: [20, 50, 100] }).toContainEqual({ id: READY_DOC.id, includeText: true });
});

// THE CONTAINING-BLOCK PIN (phantom-scroll CLASS sweep, 2026-08-14). The detail pane owns its scroll axis (`h-full min-h-0 overflow-y-auto`).
// An `overflow` scroller only clips — and only absorbs the scrollable overflow of — an absolutely-positioned
// descendant whose CONTAINING BLOCK is inside it. A `position: static` scroller establishes none, so the
// `sr-only` boxes Base UI form primitives emit (`position: absolute` — NumberField's bounds announcer,
// Switch/Checkbox's hidden input, the combobox status line) resolve theirs further up and add their static
// positions to a POSITIONED ancestor's scrollable area instead. That is the owner's 2026-08-13 "scrolls past
// the end of its results" defect (fixed once for the settings pane region, swept as a class here), and
// `relative` on the scroller is the whole fix. `readPhantomScrollers` measures the MECHANISM document-wide —
// the SYMPTOM needs a positioned scrolling host, which is the settings shell CT's own story.
// HONEST LABEL: a FENCE, not a defect proof — measured GREEN against the pre-fix source, because this
// surface's CT story paints read-only content (no Base UI form primitive, so no `sr-only` absolute box
// exists to escape). The DEFECT PROOFS for this class are the preset-editor and character-editor pins,
// which red against HEAD. This fence is what stops the class coming back the day a form control lands
// in this pane — which is exactly how the settings pane acquired it.
test("no absolutely-positioned box escapes the databank detail scroller (the containing-block pin)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  // SETTLED: the opened document's own heading — the pane has painted its detail, not a spinner.
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  expect(await readPhantomScrollers(page)).toEqual([]);
});
