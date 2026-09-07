// CT: the Databank LIST chrome band — the D-6 maintenance arm. The owner-wide sweeps are the band KEBAB's
// (never a primary: A2's one primary here is Add), and `re-extract` — the arm that re-runs extraction over
// every stored source file — waits for an explicit confirm before a single call leaves the client.

import { DATABANK_LIST_DEFAULT_LIMIT } from "@orb/contracts/databank";
import { expect, test } from "@playwright/experimental-ct-react";
import { trpcError } from "../../../../support/node/route-trpc.ts";
import { DatabankListHeaderStory } from "../_ct-stories.tsx";
import { READY_DOC, stubDatabank } from "../fixtures.ts";

/** What may sit between the arm's footer and the floor of the region that reserves its height: nothing but
 *  sub-pixel. A CEILING on a defect, not a token read — the finding measured 225px and 254px. */
const DIALOG_FLOOR_SLACK_PX = 24;
/** `min-h-96` — the tallest arm's height, still reserved. Asserted so the void fix cannot be "simplified"
 *  into dropping the floor the strip's stillness depends on. */
const RESERVED_REGION_PX = 384;

// BOTH SWEEPS CONFIRM (side-eye 2026-08-19 P3) — a superseded ruling, recorded. `Reindex everything` used
// to fire BARE while its slower sibling sat behind a dialog, on the reasoning that re-extract is "the
// expensive arm". The scope is what earns the dialog, not the runtime: the one owner-wide sweep a mis-aimed
// menu click could start was the one with no way back. Nothing is deleted by either, so both confirms stay
// `primary` — the destructive red is still reserved for the one control here that IS destructive.
test("the maintenance kebab fires the owner-wide sweep, and BOTH arms wait for a confirm (D-6)", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const band = await mount(<DatabankListHeaderStory />);

  await band.getByRole("button", { name: "Databank maintenance" }).click();
  await page.getByRole("menuitem", { name: "Reindex everything" }).click();
  // At the SETTLED open-confirm state, nothing has been sent.
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect.poll(() => trpc.count("databank.reindex"), { intervals: [20, 50, 100] }).toBe(0);

  await page.getByRole("alertdialog").getByRole("button", { name: "Reindex", exact: true }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex"), { intervals: [20, 50, 100] }).toEqual({ scope: { kind: "owner" }, mode: "chunk-embed" });

  await band.getByRole("button", { name: "Databank maintenance" }).click();
  await page.getByRole("menuitem", { name: "Re-extract everything" }).click();
  // The expensive arm is dialog-gated — at the settled open-confirm state, still ONE call: the one above.
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect.poll(() => trpc.count("databank.reindex"), { intervals: [20, 50, 100] }).toBe(1);

  await page.getByRole("alertdialog").getByRole("button", { name: "Re-extract", exact: true }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex"), { intervals: [20, 50, 100] }).toEqual({ scope: { kind: "owner" }, mode: "re-extract" });
});

// NEITHER SWEEP IS OFFERED OVER AN EMPTY BANK (side-eye 2026-08-19 P3). Both items were live at zero
// documents — "re-run this over everything you have" is a lie when you have nothing, and firing it costs a
// round trip to be told so. The census the band already prints is the predicate, so this needs no new read.
// NO SETTLE BARRIER IS OWED, and that is a property of the fix rather than a shortcut: pre-census
// (`total` undefined) and post-census (`total === 0`) render the SAME disabled menu, deliberately — the
// sweeps stay closed until the count is known, because an enabled control firing into an unknown bank is
// the defect and a disabled one that enables a beat later is not. So there is no in-flight arm to catch,
// and the assertions below auto-retry to the settled state either way. What proves the predicate is not
// simply stuck closed is the FIRST test in this file: same component, a four-document bank, and the sweep
// fires.
test("both owner-wide sweeps are closed over an empty bank", async ({ mount, page }) => {
  const trpc = await stubDatabank(page, { "databank.listGlobal": () => [] }, []);
  const band = await mount(<DatabankListHeaderStory />);

  await band.getByRole("button", { name: "Databank maintenance" }).click();
  const reindex = page.getByRole("menuitem", { name: "Reindex everything" });
  await expect(reindex).toHaveAttribute("data-disabled", "");
  await expect(page.getByRole("menuitem", { name: "Re-extract everything" })).toHaveAttribute("data-disabled", "");

  // …and it is disabled in the way that matters: activating it opens no confirm and sends nothing.
  await reindex.click({ force: true });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => trpc.count("databank.reindex"), { intervals: [20, 50, 100] }).toBe(0);

  // …AND IT SAYS WHY (side-eye 2026-08-19 N-6). Two greyed items with no reason read as a broken menu
  // rather than a closed door. The sentence is a GROUP LABEL, not a `title=` on the items: a disabled
  // MenuItem takes no pointer events and no focus, so a tooltip on it is unreachable by exactly the reader
  // who needs it. Over a bank with documents it must not appear — a reason for a state that is not on.
  await expect(page.getByText("Add a document first — these sweeps run over your whole bank.")).toBeVisible();
});

test("the sweeps' disabled reason is scoped to the empty bank — a stocked one shows no excuse (N-6)", async ({ mount, page }) => {
  await stubDatabank(page);
  const band = await mount(<DatabankListHeaderStory />);

  await band.getByRole("button", { name: "Databank maintenance" }).click();
  await expect(page.getByRole("menuitem", { name: "Reindex everything" })).not.toHaveAttribute("data-disabled", "");
  await expect(page.getByText("Add a document first — these sweeps run over your whole bank.")).toHaveCount(0);
});

// THE MODE STRIP HOLDS ONE Y (side-eye 2026-08-19 P2). The three arms are 405 / 543.75 / 375.75px tall and
// the shell's Dialog is vertically CENTRED, so switching mode moved the whole dialog 70-84px — under the
// pointer, with the control the user is aiming at as the thing that moved. Measured as the SPREAD of the
// strip's y across all three arms, so a fix that pins two of three cannot pass.
// …AND THE FLOOR THAT HOLDS IT MUST NOT MANUFACTURE A VOID (side-eye 2026-08-19 N-2 — the regression the
// pin above caused). `min-h-96` reserved the tallest arm's height on a region whose LAST child is the arm's
// own in-body footer, so on the two shorter arms 225-254px (36-41% of the dialog) sat empty UNDER Cancel and
// the first-run surface read as a failed render. Both halves are asserted in ONE test on purpose: the fix is
// only correct if the strip still holds its y, and a later "simplification" that drops the floor would
// otherwise turn one green test into another green test.
test("switching Add mode moves neither the mode strip nor the footer off the dialog's floor (P2 · N-2)", async ({ mount, page }) => {
  await stubDatabank(page);
  const band = await mount(<DatabankListHeaderStory />);
  await band.getByRole("button", { name: "Add" }).click();
  const dialog = page.getByRole("dialog");
  const upload = dialog.getByRole("button", { name: "Upload a file" });
  await expect(upload).toBeVisible();

  // Three explicit arms are the whole axis.
  const measure = async (mode: string): Promise<{ stripY: number; deadPx: number; regionPx: number }> => {
    await dialog.getByRole("button", { name: mode }).click();
    // SETTLED: the clicked arm is the pressed one before its geometry is read.
    await expect(dialog.getByRole("button", { name: mode })).toHaveAttribute("aria-pressed", "true");
    const stripY = (await upload.boundingBox())?.y ?? Number.NaN;
    // The void the finding measured, read against the RESERVED REGION rather than the dialog — the dialog's
    // own bottom padding (24px) plus the body's (12px) is surface, not void, and would put a floor of ~37px
    // under any dialog-relative number. Region-relative, the claim is exact: the footer sits ON the floor.
    const measured = await dialog.evaluate((el) => {
      const cancel = [...el.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cancel");
      const footer = cancel?.parentElement;
      const arm = footer?.parentElement;
      const region = arm?.parentElement;
      if (footer === undefined || footer === null || region === undefined || region === null) {
        return { deadPx: Number.NaN, regionPx: Number.NaN };
      }
      return { deadPx: region.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom, regionPx: region.getBoundingClientRect().height };
    });
    return { deadPx: measured.deadPx, regionPx: measured.regionPx, stripY };
  };
  const onUpload = await measure("Upload a file");
  const onPaste = await measure("Paste text");
  const onLink = await measure("From a link");
  const arms = [onUpload, onPaste, onLink];

  expect(arms.some((arm) => Number.isNaN(arm.stripY) || Number.isNaN(arm.deadPx))).toBe(false);
  const ys = arms.map((arm) => arm.stripY);
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
  // EVERY arm, not the tallest: the tallest one was never the defect.
  for (const arm of arms) {
    expect(arm.deadPx, `dead space under Cancel (strip y ${String(arm.stripY)})`).toBeLessThan(DIALOG_FLOOR_SLACK_PX);
    // …and the floor the strip's stillness rests on is still reserved — the two halves are one fix.
    expect(arm.regionPx).toBeGreaterThanOrEqual(RESERVED_REGION_PX);
  }
});

// THE TEACHING SENTENCE IS NOT A FOOTNOTE (side-eye 2026-08-19 P3). It is the sentence that explains the
// whole mechanism to someone who has never added a document, and it was set at `gloss` — 10.5px, the
// footnote voice — i.e. the SMALLEST of its three homes (13px in the LIST empty, 15px in CONTENT) at the
// moment it matters most. Asserted as a RELATION to the dialog's own smallest voice, so a token change
// cannot drift out from under it and a px literal cannot satisfy it.
test("the Add dialog's teaching sentence is set to be READ, not to be a footnote (P3)", async ({ mount, page }) => {
  await stubDatabank(page);
  const band = await mount(<DatabankListHeaderStory />);
  await band.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const sizes = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const gloss = [...(dialog?.querySelectorAll("*") ?? [])].find((el) => el.textContent?.trim().startsWith("Upload a file, paste text"));
    const label = [...(dialog?.querySelectorAll("label") ?? [])][0];
    return {
      teaching: gloss === undefined ? 0 : Number.parseFloat(getComputedStyle(gloss).fontSize),
      field: label === undefined ? 0 : Number.parseFloat(getComputedStyle(label).fontSize),
    };
  });

  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            const gloss = [...(dialog?.querySelectorAll("*") ?? [])].find((el) => el.textContent?.trim().startsWith("Upload a file, paste text"));
            const label = [...(dialog?.querySelectorAll("label") ?? [])][0];
            return {
              teaching: gloss === undefined ? 0 : Number.parseFloat(getComputedStyle(gloss).fontSize),
              field: label === undefined ? 0 : Number.parseFloat(getComputedStyle(label).fontSize),
            };
          })
        ).teaching,
    )
    .toBeGreaterThan(0);
  // At least the step a field label reads at — never below the chrome around it.
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            const gloss = [...(dialog?.querySelectorAll("*") ?? [])].find((el) => el.textContent?.trim().startsWith("Upload a file, paste text"));
            const label = [...(dialog?.querySelectorAll("label") ?? [])][0];
            return {
              teaching: gloss === undefined ? 0 : Number.parseFloat(getComputedStyle(gloss).fontSize),
              field: label === undefined ? 0 : Number.parseFloat(getComputedStyle(label).fontSize),
            };
          })
        ).teaching,
    )
    .toBeGreaterThanOrEqual(sizes.field);
});

// THE BAND PRINTS THE CENSUS (2026-08-14). It used to print the length of `databank.list`'s first page,
// which is why a bank past that page read "100+" — the honest thing to say about a number that was really a
// page length (side-eye P2-d). `databank.bankHealth` counts the bank, so the band states it: no cap, no `+`,
// and no hundred-document read taken to measure a list.
test("the band prints the SERVER's census — a bank deeper than one page states its real size", async ({ mount, page }) => {
  const deeperThanAPage = Array.from({ length: DATABANK_LIST_DEFAULT_LIMIT + 46 }, (_, i) => ({
    ...READY_DOC,
    id: `document_${String(i + 1).padStart(20, "0")}`,
    updatedAt: READY_DOC.updatedAt - i * 1000,
  }));
  const trpc = await stubDatabank(page, {}, deeperThanAPage);
  const band = await mount(<DatabankListHeaderStory />);

  await expect(band.getByText(`${DATABANK_LIST_DEFAULT_LIMIT + 46}`, { exact: true })).toBeVisible();
  await expect(band.getByText(`${DATABANK_LIST_DEFAULT_LIMIT}+`, { exact: true })).toHaveCount(0);
  // A COUNT read for a count: the band fetches no document rows at all.
  await expect.poll(() => trpc.count("databank.bankHealth"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("databank.list"), { intervals: [20, 50, 100] }).toBe(0);
});

// EVERY ARM OWES A WAY OUT (side-eye sweep 2026-08-03). Each ingest arm draws its own footer because each
// has its own submit verb, and the UPLOAD arm — where picking the file IS the submit — shipped with no
// footer at all: the dialog held ZERO buttons besides its three mode toggles, so its only exit was Esc or
// the backdrop, while both sibling arms offered a labelled one. A dismiss is not part of a submit.
test("every arm of the Add dialog offers a labelled way out — including the one with no submit", async ({ mount, page }) => {
  await stubDatabank(page);
  const band = await mount(<DatabankListHeaderStory />);

  await band.getByRole("button", { name: "Add" }).click();
  const dialog = page.getByRole("dialog");
  // The dialog opens ON the upload arm.
  await expect(dialog.getByRole("button", { name: "Upload a file" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  await dialog.getByRole("button", { name: "Paste text" }).click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  await dialog.getByRole("button", { name: "From a link" }).click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  // …and it works: the upload arm's Cancel closes the dialog, not just decorates it.
  await dialog.getByRole("button", { name: "Upload a file" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// A FAILED CENSUS IS NOT AN EMPTY BANK (#1500). `(census?.total ?? 0) === 0` folded settling, empty and
// FAILED into one predicate, so a bank-health failure told a reader with two hundred documents to "add a
// document first" — on the one control whose whole predicate is how many they have. The sweeps still stay
// CLOSED while the count is unknown (that ruling is unchanged and is the safe direction); what changed is
// that the closed door now says which of the three states it is in, and offers the re-read.
test("a FAILED bank census does not tell a stocked bank to add a document first (#1500)", async ({ mount, page }) => {
  const trpc = await stubDatabank(page, { "databank.bankHealth": () => trpcError({ message: "bank health failed" }) });
  const band = await mount(<DatabankListHeaderStory />);

  await band.getByRole("button", { name: "Databank maintenance" }).click();
  await expect(page.getByText("Couldn't check your bank, so these sweeps stay closed.")).toBeVisible();
  await expect(page.getByText("Add a document first — these sweeps run over your whole bank.")).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Reindex everything" })).toHaveAttribute("data-disabled", "");

  // …and the closed door has a way out: the re-read is its own item, because a group LABEL cannot be
  // actioned and a disabled MenuItem takes no pointer events.
  await page.getByRole("menuitem", { name: "Check the bank again" }).click();
  await expect.poll(() => trpc.count("databank.bankHealth"), { intervals: [20, 50, 100] }).toBe(2);
});
