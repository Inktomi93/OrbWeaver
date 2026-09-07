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
import { measureContentColumn } from "../../../../support/browser/measure-content-column.ts";
import { proseRow, readProseMeasure } from "../../../../support/browser/prose-measure.ts";
import { readPhantomScrollers } from "../../../../support/browser/scroll-containing-block.ts";
import {
  DatabankDetailContentColumnStory,
  DatabankDetailListModeStory,
  DatabankDetailStory,
  DatabankDetailWideStory,
  DatabankWorkspaceStory,
} from "../_ct-stories.tsx";
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

/** The side-agnostic pointer and the directional one it replaced. */
const FROM_THE_LIST = /from the list/u;
const DIRECTIONAL_COPY = /on the left/u;

/** The shell affordance the empty-bank arm names when the LIST is off screen — the topbar's own string,
 *  verbatim (WCAG 2.5.3: a voice-control user says exactly what is written). */
const LIST_PANEL_DOOR = /Show list panel in the top bar/u;

/** The Details readout as label→value PAIRS, read off the rendered grid. A pair, never a bare value: the
 *  workspace story also mounts the LIST, whose rows print the same numbers inside their scent lines. */
function readout(page: import("@playwright/test").Page): Promise<readonly (readonly [string, string])[]> {
  return page.evaluate(() => {
    const pane = document.querySelector('[data-slot="databank-content"]');
    const labels = ["Origin", "Type", "Size", "Characters", "Passages", "Added", "Updated", "Source"];
    const pairs: [string, string][] = [];
    for (const name of labels) {
      const label = [...(pane?.querySelectorAll("p,span") ?? [])].find((el) => el.textContent?.trim() === name && el.children.length === 0);
      const value = label?.nextElementSibling?.textContent?.trim();
      if (value !== undefined) {
        pairs.push([name, value]);
      }
    }
    return pairs;
  });
}

test("CONTENT with nothing open TEACHES what the bank is — never a blank pane", async ({ mount, page }) => {
  await stubDatabank(page);
  const content = await mount(<DatabankDetailStory />);

  await expect(content.getByText("Your databank")).toBeVisible();
  // SIDE-AGNOSTIC (side-eye 2026-08-19 N-10, the chat landing's own correction carried here): the LIST pane
  // is a docked column, a slide-over or collapsed, and on a phone the panes stack — a sentence that points
  // "left" is wrong more often than it is right.
  await expect(content.getByText(FROM_THE_LIST)).toBeVisible();
  await expect(content.getByText(DIRECTIONAL_COPY)).toHaveCount(0);
});

// THE SAME SENTENCE MUST NOT PRINT TWICE AT REST (side-eye 2026-08-19 taste). The one-home copy fix of
// 2026-08-08 is CORRECT and is not forked — `DATABANK_INGEST_GLOSS` still has exactly one spelling. What it
// created is a different defect: on an empty bank the LIST and CONTENT panes are both on screen and both
// printed it (13px there, 15px here), so the product said one thing twice in one glance. The fix is which
// SLOT renders it, never a second wording. Driven in ONE mount, because simultaneity is the whole finding.
// The second half is the two-Add-doors trim: this pane used to end "…or add another" with no button under
// it, 226px from the LIST's real one.
// #434 EXTENDS THAT RULING ONE NOTCH — the SLOT fix left the two panes still saying the same THING (an empty
// state each, one glance apart) with only one of them able to act. On an empty bank this pane now stands
// down entirely while the LIST is on screen: one empty state, one first step, one Add door.
test("the two empty panes do not print the same sentence, and only ONE offers Add (taste)", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.listGlobal": () => [] }, []);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await expect(workspace.getByText("No documents yet")).toBeVisible();
  // The CONTENT pane's welcome is GONE on an empty bank: "Pick a document from the list" names an act the
  // reader cannot perform, beside a list that is already teaching the real one.
  await expect(workspace.getByText("Your databank")).toHaveCount(0);
  await expect(workspace.getByText(FROM_THE_LIST)).toHaveCount(0);

  // The teaching gloss survives exactly once, in the pane that owns the first step.
  await expect(workspace.getByText(INGEST_GLOSS_TAIL)).toHaveCount(1);
  await expect(workspace.getByText(ADD_ANOTHER_INVITE)).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: "Add a document" })).toHaveCount(1);
});

// …AND THE STAND-DOWN IS CONDITIONED ON THE LIST BEING ON SCREEN, not on the bank alone. `panelDefaults.list`
// is `docked`, but the shell auto-collapses a docked default in the narrow-desktop band and focus mode hides
// both panes — deferring to a pane that is not there would leave a blank CONTENT region and no door at all.
// The REFUSED arm is pinned in the same breath: the way out is the NAMED shell affordance, never a second Add
// button minted in this pane (the two-Add-doors finding).
test("#434 on an empty bank the CONTENT pane stands down — unless the LIST is off screen, where it names the door", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.listGlobal": () => [] }, []);
  const content = await mount(<DatabankDetailListModeStory />);
  // Boot layout: the LIST is docked (on screen), so this pane says nothing at all.
  await expect(content.getByRole("button", { name: "take the list off screen" })).toBeVisible();
  await expect(content.getByText("Your databank")).toHaveCount(0);

  await content.getByRole("button", { name: "take the list off screen" }).click();
  await expect(content.getByText("Your databank")).toBeVisible();
  await expect(content.getByText(LIST_PANEL_DOOR)).toBeVisible();
  // No second Add door: the invitation names the shell control that reaches the one real door.
  await expect(content.getByRole("button", { name: "Add a document" })).toHaveCount(0);
  // And it does not re-print the LIST's teaching sentence — the one-home copy fix is not being forked.
  await expect(content.getByText(INGEST_GLOSS_TAIL)).toHaveCount(0);

  await content.getByRole("button", { name: "put the list back" }).click();
  await expect(content.getByText("Your databank")).toHaveCount(0);
});

// The POPULATED arm still teaches: with rows in the bank and nothing open, the pane says what it will show —
// an empty CONTENT pane reads as unbuilt, and that ruling is extended above, not reversed.
//
// #445 — AND IT NAMES THE DOOR WHEN THE LIST IS OFF SCREEN. "Pick a document from the list" presupposes a
// list on screen, which is false in the narrow-desktop auto-collapse, in focus mode and after a hand
// collapse — the F-28 class the Presets welcome was fixed for, left standing here by #434's empty-bank
// scope. The instruction is unchanged for the reader who can see the list; the footnote is an addition.
test("#434/#445 with documents in the bank and nothing selected, the welcome teaches — and names the list door only while the list is off screen", async ({
  mount,
  page,
}) => {
  await stubDatabank(page);
  const content = await mount(<DatabankDetailListModeStory />);
  await expect(content.getByText("Your databank")).toBeVisible();
  await expect(content.getByText(FROM_THE_LIST)).toBeVisible();
  await expect(content.getByText(LIST_PANEL_DOOR)).toHaveCount(0);

  await content.getByRole("button", { name: "take the list off screen" }).click();
  await expect(content.getByText(LIST_PANEL_DOOR)).toBeVisible();
  // The instruction survives beside it, and no Add door is minted here (the two-Add-doors refusal holds).
  await expect(content.getByText(FROM_THE_LIST)).toBeVisible();
  await expect(content.getByRole("button", { name: "Add a document" })).toHaveCount(0);

  await content.getByRole("button", { name: "put the list back" }).click();
  await expect(content.getByText(LIST_PANEL_DOOR)).toHaveCount(0);
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
  await expect(workspace.getByText("Chunks", { exact: true })).toHaveCount(0);
  // …AND THE LABEL CARRIES THE UNIT (side-eye 2026-08-19 N-3): the value is the number, not "12 passages"
  // under a column headed Passages. Read as the label→value PAIR, so it cannot pass on a stray "12"
  // elsewhere on the page, and with the feature's one number convention on the four-digit one.
  const pairs = await readout(page);
  expect(pairs).toContainEqual(["Characters", "4,200"]);
  expect(pairs).toContainEqual(["Passages", "12"]);

  await workspace.getByRole("button", { name: "Reindex" }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex"), { intervals: [20, 50, 100] }).toEqual({ scope: { kind: "document", documentId: READY_DOC.id } });
});

// THE DETAIL KEEPS A MEASURE (side-eye sweep 2026-08-03). `justify="between"` label/value rows spend
// whatever width they are given: at the 1448px desktop CONTENT pane "Origin" sat at x=496 and its own value
// "Text" at x=1387 — 890px of nothing between a label and the thing it labels, and Reindex flung to the far
// edge of its sentence. Both sibling member editors (tag, regex) cap at `--width-content-col` (#1175); this one did not.
// Asserted at the WIDEST real host (the 720px story cannot see it) as the RENDERED readout width against
// the pane's own, so a token change cannot drift out from under it and a px literal cannot satisfy it.
test("the detail keeps a MEASURE at a desktop-wide pane — it does not spread with the window", async ({ mount, page }) => {
  await stubDatabank(page);
  const wide = await mount(<DatabankDetailWideStory />);
  await wide.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(wide.getByText("application/pdf")).toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const label = [...document.querySelectorAll("p,span")].find((el) => el.textContent?.trim() === "Origin" && el.children.length === 0);
          const pane = document.querySelector('[data-slot="databank-content"]');
          if (label === undefined || pane === null) {
            return null;
          }
          // The readout ROW is the label's parent — its width is what the whole finding is about.
          const row = label.parentElement;
          return { row: row === null ? 0 : row.getBoundingClientRect().width, pane: pane.getBoundingClientRect().width };
        }),
    )
    .not.toBeNull();
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
  // The pane really is the wide one…
  expect(measured?.pane ?? 0).toBeGreaterThan(1200);
  // …and the readout is not. `--width-content-col` is the cap both sibling member editors (tag, regex) take (#1175);
  // asserted as a RELATION to the pane, so the token behind it can move without rotting this line.
  expect(measured?.row ?? Number.POSITIVE_INFINITY).toBeLessThan((measured?.pane ?? 0) * 0.7);
});

// A MEASURE CAPS THE WORST CASE; IT DOES NOT TIE THE PAIR (side-eye 2026-08-19 P2). The 08-03 measure above
// is REFINED, not overturned: inside it, `justify="between"` still spent the whole row, so "Origin" and its
// own value sat 382-475px apart at the real desktop pane and the eye crossed a hand-span to read one datum.
// The label now takes a COLUMN and the value starts beside it, so the gap is gone by CONSTRUCTION rather
// than by being small enough at one measured width. Asserted as the LARGEST gap across every row, at the
// widest real host — a per-row check would pass on the short labels alone.
//
// THE COLUMN IS `max-content` NOW (side-eye 2026-08-19 N-7): the first spelling borrowed the knob-row's
// 152px CONTROL token, which for ~62px readout labels left ~90px of nothing inside every row — the same gap
// one size smaller. The ruling is unchanged (one column, every value at one x); only the number moves, so
// this test keeps its shape and tightens its ceiling to the grid's own gap.
test("every readout row ties its label to its value — no gap to cross at any width", async ({ mount, page }) => {
  await stubDatabank(page);
  const wide = await mount(<DatabankDetailWideStory />);
  await wide.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(wide.getByText("application/pdf")).toBeVisible();

  const worstGap = await page.evaluate(() => {
    const pane = document.querySelector('[data-slot="databank-content"]');
    const labels = ["Origin", "Type", "Size", "Characters", "Passages", "Added", "Updated"];
    let worst = 0;
    let widest = 0;
    let narrowest = Number.POSITIVE_INFINITY;
    const xs = new Set<number>();
    for (const name of labels) {
      const label = [...(pane?.querySelectorAll("p,span") ?? [])].find((el) => el.textContent?.trim() === name && el.children.length === 0);
      const value = label?.nextElementSibling;
      if (label === undefined || value === null || value === undefined) {
        return { gap: Number.POSITIVE_INFINITY, missing: name, slack: 0, valueXs: 0 };
      }
      // The label's TEXT, not its BOX. A fixed-width column puts its slack INSIDE the box, so a box-edge
      // measurement reads ~6px while the eye crosses the whole column — which is exactly how the 152px
      // control token passed this test for a day (side-eye 2026-08-19 N-7).
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      worst = Math.max(worst, value.getBoundingClientRect().left - text.right);
      widest = Math.max(widest, text.width);
      narrowest = Math.min(narrowest, text.width);
      xs.add(Math.round(value.getBoundingClientRect().left));
    }
    const grid = pane?.querySelector('[class*="grid-cols"]');
    if (grid === null || grid === undefined) {
      // NOT a grid ⇒ there is no shared track, so there is no irreducible cost to compare against and the
      // pin has nothing to say — which is itself the failure (a stack of rows is the shape N-7 replaced).
      return { gap: worst, missing: "the readout grid", slack: 0, valueXs: xs.size };
    }
    const columnGap = Number.parseFloat(getComputedStyle(grid).columnGap);
    // What ONE shared column costs by construction: the shortest label's row carries the difference to the
    // longest, plus the grid's own gap. Anything ABOVE this is track slack — the defect.
    return { gap: worst, missing: null, slack: widest - narrowest + columnGap, valueXs: xs.size };
  });

  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const pane = document.querySelector('[data-slot="databank-content"]');
            const labels = ["Origin", "Type", "Size", "Characters", "Passages", "Added", "Updated"];
            let worst = 0;
            let widest = 0;
            let narrowest = Number.POSITIVE_INFINITY;
            const xs = new Set<number>();
            for (const name of labels) {
              const label = [...(pane?.querySelectorAll("p,span") ?? [])].find((el) => el.textContent?.trim() === name && el.children.length === 0);
              const value = label?.nextElementSibling;
              if (label === undefined || value === null || value === undefined) {
                return { gap: Number.POSITIVE_INFINITY, missing: name, slack: 0, valueXs: 0 };
              }
              // The label's TEXT, not its BOX. A fixed-width column puts its slack INSIDE the box, so a box-edge
              // measurement reads ~6px while the eye crosses the whole column — which is exactly how the 152px
              // control token passed this test for a day (side-eye 2026-08-19 N-7).
              const range = document.createRange();
              range.selectNodeContents(label);
              const text = range.getBoundingClientRect();
              worst = Math.max(worst, value.getBoundingClientRect().left - text.right);
              widest = Math.max(widest, text.width);
              narrowest = Math.min(narrowest, text.width);
              xs.add(Math.round(value.getBoundingClientRect().left));
            }
            const grid = pane?.querySelector('[class*="grid-cols"]');
            if (grid === null || grid === undefined) {
              // NOT a grid ⇒ there is no shared track, so there is no irreducible cost to compare against and the
              // pin has nothing to say — which is itself the failure (a stack of rows is the shape N-7 replaced).
              return { gap: worst, missing: "the readout grid", slack: 0, valueXs: xs.size };
            }
            const columnGap = Number.parseFloat(getComputedStyle(grid).columnGap);
            // What ONE shared column costs by construction: the shortest label's row carries the difference to the
            // longest, plus the grid's own gap. Anything ABOVE this is track slack — the defect.
            return { gap: worst, missing: null, slack: widest - narrowest + columnGap, valueXs: xs.size };
          })
        ).missing,
    )
    .toBeNull();
  // Every value still starts at ONE x — the property the column exists for, and the one a per-row
  // `max-content` would quietly lose.
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const pane = document.querySelector('[data-slot="databank-content"]');
            const labels = ["Origin", "Type", "Size", "Characters", "Passages", "Added", "Updated"];
            let worst = 0;
            let widest = 0;
            let narrowest = Number.POSITIVE_INFINITY;
            const xs = new Set<number>();
            for (const name of labels) {
              const label = [...(pane?.querySelectorAll("p,span") ?? [])].find((el) => el.textContent?.trim() === name && el.children.length === 0);
              const value = label?.nextElementSibling;
              if (label === undefined || value === null || value === undefined) {
                return { gap: Number.POSITIVE_INFINITY, missing: name, slack: 0, valueXs: 0 };
              }
              // The label's TEXT, not its BOX. A fixed-width column puts its slack INSIDE the box, so a box-edge
              // measurement reads ~6px while the eye crosses the whole column — which is exactly how the 152px
              // control token passed this test for a day (side-eye 2026-08-19 N-7).
              const range = document.createRange();
              range.selectNodeContents(label);
              const text = range.getBoundingClientRect();
              worst = Math.max(worst, value.getBoundingClientRect().left - text.right);
              widest = Math.max(widest, text.width);
              narrowest = Math.min(narrowest, text.width);
              xs.add(Math.round(value.getBoundingClientRect().left));
            }
            const grid = pane?.querySelector('[class*="grid-cols"]');
            if (grid === null || grid === undefined) {
              // NOT a grid ⇒ there is no shared track, so there is no irreducible cost to compare against and the
              // pin has nothing to say — which is itself the failure (a stack of rows is the shape N-7 replaced).
              return { gap: worst, missing: "the readout grid", slack: 0, valueXs: xs.size };
            }
            const columnGap = Number.parseFloat(getComputedStyle(grid).columnGap);
            // What ONE shared column costs by construction: the shortest label's row carries the difference to the
            // longest, plus the grid's own gap. Anything ABOVE this is track slack — the defect.
            return { gap: worst, missing: null, slack: widest - narrowest + columnGap, valueXs: xs.size };
          })
        ).valueXs,
    )
    .toBe(1);
  // …and the column is exactly its content: the worst row's gap is the irreducible cost of sharing a track
  // (longest label − shortest + the grid gap), with NO slack on top. Derived rather than a number, so a
  // relabelling or a gap retune cannot rot it — and a fixed 152px control column fails it by ~90px.
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const pane = document.querySelector('[data-slot="databank-content"]');
            const labels = ["Origin", "Type", "Size", "Characters", "Passages", "Added", "Updated"];
            let worst = 0;
            let widest = 0;
            let narrowest = Number.POSITIVE_INFINITY;
            const xs = new Set<number>();
            for (const name of labels) {
              const label = [...(pane?.querySelectorAll("p,span") ?? [])].find((el) => el.textContent?.trim() === name && el.children.length === 0);
              const value = label?.nextElementSibling;
              if (label === undefined || value === null || value === undefined) {
                return { gap: Number.POSITIVE_INFINITY, missing: name, slack: 0, valueXs: 0 };
              }
              // The label's TEXT, not its BOX. A fixed-width column puts its slack INSIDE the box, so a box-edge
              // measurement reads ~6px while the eye crosses the whole column — which is exactly how the 152px
              // control token passed this test for a day (side-eye 2026-08-19 N-7).
              const range = document.createRange();
              range.selectNodeContents(label);
              const text = range.getBoundingClientRect();
              worst = Math.max(worst, value.getBoundingClientRect().left - text.right);
              widest = Math.max(widest, text.width);
              narrowest = Math.min(narrowest, text.width);
              xs.add(Math.round(value.getBoundingClientRect().left));
            }
            const grid = pane?.querySelector('[class*="grid-cols"]');
            if (grid === null || grid === undefined) {
              // NOT a grid ⇒ there is no shared track, so there is no irreducible cost to compare against and the
              // pin has nothing to say — which is itself the failure (a stack of rows is the shape N-7 replaced).
              return { gap: worst, missing: "the readout grid", slack: 0, valueXs: xs.size };
            }
            const columnGap = Number.parseFloat(getComputedStyle(grid).columnGap);
            // What ONE shared column costs by construction: the shortest label's row carries the difference to the
            // longest, plus the grid's own gap. Anything ABOVE this is track slack — the defect.
            return { gap: worst, missing: null, slack: widest - narrowest + columnGap, valueXs: xs.size };
          })
        ).gap,
    )
    .toBeLessThanOrEqual(worstGap.slack + 1);
});

// CD1 (section.tsx's own doc): a read-only grouping gets the micro-caps kicker + a hairline rule, not the
// settings-pane `heading`. Three of the six `heading=` call sites the 2026-08-19 sweep found are here.
test("the CONTENT groups are CD1 kickers, hairline and all (P2)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
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
        ),
    )
    .toEqual([
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

// ── #1653 — the MAINTENANCE gloss is a PARAGRAPH, and it never took a reading measure ──────────────────
// #1175 gave this pane `--width-content-col` on the block that holds its CONTROLS, and said in the same
// breath that "a block holding controls keeps the wider measure while the paragraph inside it takes this
// one". The paragraph never got the second half. The Maintenance sentence ("Re-chunk and re-embed this
// document — after a settings change, or to heal a partial index.") is the longest running copy in the
// editor, it sits in a `justify="between"` row with the Reindex button, and the only cap above it is the
// 720px content column — which is a control measure, not a reading one. Measured pre-fix in this browser
// with real Geist: 446.2px = 90.0 average glyph advances per line, at 1280 / 1440 / 1920 alike (the mount
// is width-fixed, so the three viewports are the RANGE receipt, not three different layouts).
//
// THE ASSERTION IS IN THE LAW'S UNIT, NOT THE TOKEN'S — canvas `measureText` over the paragraph's own
// resolved font, judged against the design law's 75 (`.claude/skills/side-eye-design-review/SKILL.md` §2).
// A `ch` comparison would only restate the token. And the paragraph is found by its own COPY rather than by
// a `data-slot`, so this pin compiles and runs against the pre-fix source: a DEFECT PROOF, not a fence.
// The reader is `support/browser/prose-measure.ts` — this pin grew the fifth hand-rolled copy of that probe, and
// extracting it was the point at which it got a home (#1653's second leg).
const PROSE_WIDTHS = [1280, 1440, 1920] as const;
/** The design law's line-length ceiling, in typographic characters — never a px and never a token value. */
const LAW_CHARACTERS_PER_LINE = 75;
/** The Maintenance sentence's own opening — enough to find the paragraph, not the whole string, so the pin
 *  is about the MEASURE rather than about the wording. */
const REINDEX_GLOSS = "Re-chunk and re-embed this document";

test("#1653 the Maintenance gloss reads inside the prose measure at every desktop width", async ({ mount, page }) => {
  await stubDatabank(page);
  const wide = await mount(<DatabankDetailWideStory />);
  await wide.getByRole("button", { name: CRIMSON_ROW }).first().click();
  // SETTLED: the document's own readout has painted, so the Maintenance section exists to measure.
  await expect(wide.getByText("application/pdf")).toBeVisible();
  await expect(wide.getByText(REINDEX_GLOSS, { exact: false })).toBeVisible();

  const rows: string[] = [];
  for (const width of PROSE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // Barrier on a SETTLED box — a read on the same tick as the viewport change is the pre-reflow one.
    await expect.poll(async () => Math.round((await readProseMeasure(page, REINDEX_GLOSS)).widthPx)).toBeGreaterThan(0);
    const reading = await readProseMeasure(page, REINDEX_GLOSS);
    rows.push(proseRow(width, reading));
    // ON the token, not merely under some width: the paragraph must resolve THIS measure in its own font.
    expect(reading.widthPx, `#1653 at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(reading.proseTokenPx + 0.5);
    expect(reading.lawCharacters, `#1653 at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(LAW_CHARACTERS_PER_LINE);
  }
  // The rows ride every assertion message above, so a RED prints the measurement that earned it.
  expect(rows).toHaveLength(PROSE_WIDTHS.length);
});

// ── #1664 — THE CONTENT COLUMN TAKES ITS TOKEN'S WHOLE STATED CONSUMPTION ────────────────────────────
// `--width-content-col`'s `$description` says the column is CENTERED and BREATHES to
// `--width-content-col-wide` once its container clears `@5xl`; this editor spelled the bare cap, so it
// hard-clamped at 720px, left-pinned, inside panes measured live on the shell at 869px (list-only),
// 1176px (focus @1280) and 1816px (focus @1920) — the dead-void defect the breathe step was minted for.
// Asserted through the TOKENS, resolved by a probe inside the query container, so a token move carries
// the expectation with it and no px literal is written down. ONE mount, BOTH ends of the range plus the
// crossover: a point measurement cannot prove a range property.

test("the detail column is CENTERED, capped, and BREATHES past @5xl (#1664)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankDetailContentColumnStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  const column = page.locator('[data-slot="databank-detail-editor"]');
  const narrow = await measureContentColumn(column);
  // BELOW `@5xl`: the cap binds, and the leftover is split evenly instead of all landing on the right.
  expect(narrow.containerWidth).toBeGreaterThan(narrow.capPx);
  expect(narrow.maxWidthPx).toBeCloseTo(narrow.capPx, 0);
  expect(narrow.columnWidth).toBeCloseTo(narrow.capPx, 0);
  expect(Math.abs(narrow.leftGutter - narrow.rightGutter)).toBeLessThanOrEqual(1);
  expect(narrow.leftGutter).toBeGreaterThan(1);

  await page.getByRole("button", { name: "widen the pane" }).click();
  // SETTLED, never same-tick: the widen is a React commit and the layout it causes is the thing measured.
  await expect.poll(async () => (await measureContentColumn(column)).containerWidth, { intervals: [20, 50, 100] }).toBeGreaterThan(narrow.containerWidth);

  const wide = await measureContentColumn(column);
  // PAST `@5xl`: the breathe engages, and it is a real step (the two tokens differ) — a column that
  // simply stretched, or one still clamped at the cap, both fail here.
  expect(wide.widePx).toBeGreaterThan(wide.capPx);
  expect(wide.maxWidthPx).toBeCloseTo(wide.widePx, 0);
  expect(wide.columnWidth).toBeCloseTo(wide.widePx, 0);
  expect(Math.abs(wide.leftGutter - wide.rightGutter)).toBeLessThanOrEqual(1);
});
