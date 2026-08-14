// CT: the per-chat DOCUMENTS rack (chat-documents-section.tsx, databank-surface-spec S2) — the D85
// visibility toggle's first live surface.
//
// WHAT IS PINNED, and why each one is a defect that shipped once or would have:
//  · the visibility write carries the FULL expected hidden set (set-semantics — a patch-shaped payload
//    silently un-hides every other hidden document). Asserted on the MUTATION INPUT, never a UI reaction.
//  · `aria-pressed` flips, and the row says "Hidden" IN WORDS (not only a dimmed skin + a glyph).
//  · the source chip states provenance, and the kebab's Detach renders ONLY for a `This chat` row — a
//    member's Everywhere document cannot be detached by the host, only hidden (legacy rendered a
//    read-only Switch there, which is the affordance lie this rack exists to correct).
//  · a MEMBER's arm renders the rows and NONE of the controls (permission-OMIT, one surface).
//  · the picker offers the bank MINUS the active union, and closes on the pick.
//  · GEOMETRY at the real 320px pane floor: the eye lands at ONE x on every row even where the kebab is
//    absent — the reserved-spacer rule (the staggered state column is a measured side-eye P1 defect).
//
// Every arm mounts ONCE (`ct-mount-is-once-per-test`).

import type { DocumentId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatDocumentsSectionStory } from "../_ct-stories.tsx";

const SET_VISIBILITY = "chat.setChatDocumentVisibility";
const DETACH = "databank.detachFromChat";
const ATTACH = "databank.attachToChat";

const BASE_DOC = {
  mime: "text/markdown",
  origin: "text",
  sourceUrl: null,
  byteSize: 25_088,
  charCount: 4200,
  chunkCount: 12,
  embeddedCount: 12,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

// The three provenance arms the rack must tell apart: this room's own attachment (detachable), a member's
// Everywhere document (hide-only), and one riding a roster character (hide-only, and already hidden).
const CHAT_DOC = { ...BASE_DOC, id: "document_00000000000000000001", name: "The Crimson Court", hidden: false, sources: ["chat"] };
const GLOBAL_DOC = { ...BASE_DOC, id: "document_00000000000000000002", name: "Duskwater Barony", hidden: false, sources: ["global"] };
const HIDDEN_CHAR_DOC = { ...BASE_DOC, id: "document_00000000000000000003", name: "Heraldry plates", hidden: true, sources: ["character"] };

/** The rack as the host sees it (the whole union, hidden rows flagged), plus the picker's bank read. */
function stubRack(page: Page, over: TrpcRoutes = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "databank.listActiveForChat": () => [CHAT_DOC, GLOBAL_DOC, HIDDEN_CHAR_DOC],
    // The caller's own bank: two of the three active documents plus one that reaches no room yet. The
    // picker's search is a SERVER lens, so the stub narrows by the term it is handed (a fixed array would
    // pass a search assertion while the component filtered nothing).
    "databank.list": (input: unknown) => {
      const bank = [
        { ...BASE_DOC, id: CHAT_DOC.id, name: CHAT_DOC.name },
        { ...BASE_DOC, id: HIDDEN_CHAR_DOC.id, name: HIDDEN_CHAR_DOC.name },
        { ...BASE_DOC, id: "document_00000000000000000004", name: "Unattached notes" },
      ];
      const needle = ((input ?? {}) as { search?: string }).search?.trim().toLowerCase() ?? "";
      const items = needle === "" ? bank : bank.filter((doc) => doc.name.toLowerCase().includes(needle));
      return { items, nextCursor: null, totalCount: items.length };
    },
    [SET_VISIBILITY]: () => ({ hidden: [] }),
    [DETACH]: () => null,
    [ATTACH]: () => null,
    ...over,
  });
}

test("host: hiding a VISIBLE row writes the whole excluded set — the already-hidden row survives", async ({ mount, page }) => {
  const trpc = await stubRack(page);
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  const toggle = component.getByRole("button", { name: `Stop ${CHAT_DOC.name} feeding this chat` });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();

  // THE PAYLOAD, not the reaction: the write REPLACES the stored set, so the already-hidden character doc
  // must ride along or hiding one document silently un-hides another.
  await expect
    .poll(() => (trpc.lastInput(SET_VISIBILITY) as { visibility?: { hidden?: string[] } } | undefined)?.visibility?.hidden, {
      intervals: [20, 50, 100],
    })
    .toEqual([HIDDEN_CHAR_DOC.id, CHAT_DOC.id]);
});

test("host: showing a HIDDEN row removes only it — and the row's pressed state + 'Hidden' word flip", async ({ mount, page }) => {
  const trpc = await stubRack(page);
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  // The hidden row says so in WORDS, not only through the dimmed skin (greyscale-legible state).
  await expect(component.getByText("Hidden", { exact: true })).toBeVisible();

  const toggle = component.getByRole("button", { name: `Let ${HIDDEN_CHAR_DOC.name} feed this chat again` });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();

  await expect
    .poll(() => (trpc.lastInput(SET_VISIBILITY) as { visibility?: { hidden?: string[] } } | undefined)?.visibility?.hidden, {
      intervals: [20, 50, 100],
    })
    .toEqual([]);
  // The optimistic patch repaints the row before the round trip: the toggle now names the un-set.
  await expect(component.getByRole("button", { name: `Stop ${HIDDEN_CHAR_DOC.name} feeding this chat` })).toBeVisible();
});

test("host: the source chip states WHY each row is active", async ({ mount, page }) => {
  await stubRack(page);
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  await expect(component.getByText("This chat", { exact: true })).toBeVisible();
  await expect(component.getByText("Everywhere", { exact: true })).toBeVisible();
  await expect(component.getByText("From a character", { exact: true })).toBeVisible();
});

test("host: Detach renders ONLY for a 'This chat' row — a member's Everywhere document can only be hidden", async ({ mount, page }) => {
  const trpc = await stubRack(page);
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  // The un-detachable rows have no kebab at all (never a disabled one — a control the host cannot operate
  // is exactly the lie legacy's read-only Switch told).
  await expect(component.getByRole("button", { name: `Actions for ${GLOBAL_DOC.name}` })).toHaveCount(0);
  await expect(component.getByRole("button", { name: `Actions for ${HIDDEN_CHAR_DOC.name}` })).toHaveCount(0);

  await component.getByRole("button", { name: `Actions for ${CHAT_DOC.name}` }).click();
  await page.getByRole("menuitem", { name: "Detach from this chat" }).click();
  await expect.poll(() => (trpc.lastInput(DETACH) as { documentId?: DocumentId } | undefined)?.documentId, { intervals: [20, 50, 100] }).toBe(CHAT_DOC.id);
});

test("member: the rows render and NONE of the controls do (permission-OMIT, one surface)", async ({ mount, page }) => {
  // A member's payload is already filtered by the verb — no hidden row exists in it.
  await stubRack(page, { "databank.listActiveForChat": () => [{ ...CHAT_DOC }, { ...GLOBAL_DOC }] });
  const component = await mount(<ChatDocumentsSectionStory isHost={false} />);

  await expect(component.getByText(CHAT_DOC.name)).toBeVisible();
  await expect(component.getByText("Everywhere", { exact: true })).toBeVisible();

  await expect(component.getByRole("button", { name: `Stop ${CHAT_DOC.name} feeding this chat` })).toHaveCount(0);
  await expect(component.getByRole("button", { name: `Actions for ${CHAT_DOC.name}` })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Add from your bank" })).toHaveCount(0);
});

test("host: the picker offers the bank MINUS the active union, and attaching closes it", async ({ mount, page }) => {
  const trpc = await stubRack(page);
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  await component.getByRole("button", { name: "Add from your bank" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Add Unattached notes to this chat" })).toBeVisible();
  // Already feeding the room — through this chat, and through a roster character. Neither is offered.
  await expect(dialog.getByRole("button", { name: `Add ${CHAT_DOC.name} to this chat` })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: `Add ${HIDDEN_CHAR_DOC.name} to this chat` })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Add Unattached notes to this chat" }).click();
  await expect
    .poll(() => (trpc.lastInput(ATTACH) as { documentId?: DocumentId } | undefined)?.documentId, { intervals: [20, 50, 100] })
    .toBe("document_00000000000000000004");
  await expect(dialog).toHaveCount(0);
});

test("empty (host): the rack says so — a blank block reads as a failed load", async ({ mount, page }) => {
  await stubRack(page, { "databank.listActiveForChat": () => [] });
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);
  await expect(component.getByText("No documents feed this chat yet.")).toBeVisible();
  // The way OUT of the empty state is still offered.
  await expect(component.getByRole("button", { name: "Add from your bank" })).toBeVisible();
});

test("empty (member): the copy names what a member CAN do about it, since they cannot attach", async ({ mount, page }) => {
  await stubRack(page, { "databank.listActiveForChat": () => [] });
  const component = await mount(<ChatDocumentsSectionStory isHost={false} />);
  await expect(component.getByText("switch one of your own on for every chat", { exact: false })).toBeVisible();
});

test("320px: the eye column lands at ONE x on every row, kebab or no kebab", async ({ mount, page }) => {
  // The reserved-spacer rule. Only SOME rows are detachable, so without a spacer where the kebab would be
  // the state column staggers by a full control width — measured at the REAL context-panel pane floor,
  // which is where S1's own chip defect only became visible.
  await stubRack(page);
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  const detachable = component.getByRole("button", { name: `Stop ${CHAT_DOC.name} feeding this chat` });
  const notDetachable = component.getByRole("button", { name: `Stop ${GLOBAL_DOC.name} feeding this chat` });
  await expect(detachable).toBeVisible();
  await expect(notDetachable).toBeVisible();

  // Polled to a SETTLED layout — a same-tick box read samples whatever the first frame had.
  const xOf = async (name: string): Promise<number> => {
    const box = await component.getByRole("button", { name }).boundingBox();
    return box?.x ?? -1;
  };
  const target = await xOf(`Stop ${CHAT_DOC.name} feeding this chat`);
  await expect.poll(() => xOf(`Stop ${GLOBAL_DOC.name} feeding this chat`), { intervals: [20, 50, 100, 200] }).toBe(target);
});
