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

import { rowActionsName } from "@orb/client/lib";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { DocumentId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcInput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { ChatDocumentsSectionStory } from "../_ct-stories.tsx";

const SET_VISIBILITY = "chat.setChatDocumentVisibility";
const SETTINGS = "settings.getUserSettings";
const PRESET_GET = "preset.get";
const SLOT_WARNING = "Not reaching the prompt";
const ACTIVE_PRESET_ID = "preset_00000000000000000000mine";

/** The host's settings with NO preset picked — `defaultPresetId: null` is the built-in arrangement, exactly
 *  as the server resolves it (`resolvePromptConfigFor`), so no `preset.get` is issued at all. */
const SETTINGS_BUILT_IN = { userId: "user_ct_docs", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 };
const DETACH = "databank.detachFromChat";
const ATTACH = "databank.attachToChat";

type BankDocument = TrpcWireOutput<"databank.list">["items"][number];
const BASE_DOC: Omit<BankDocument, "id" | "name"> = {
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
type ActiveDocument = TrpcWireOutput<"databank.listActiveForChat">[number];
const CHAT_DOC = { ...BASE_DOC, id: "document_00000000000000000001", name: "The Crimson Court", hidden: false, sources: ["chat"] } satisfies ActiveDocument;
const GLOBAL_DOC = { ...BASE_DOC, id: "document_00000000000000000002", name: "Duskwater Barony", hidden: false, sources: ["global"] } satisfies ActiveDocument;
const HIDDEN_CHAR_DOC = {
  ...BASE_DOC,
  id: "document_00000000000000000003",
  name: "Heraldry plates",
  hidden: true,
  sources: ["character"],
} satisfies ActiveDocument;

/** The rack as the host sees it (the whole union, hidden rows flagged), plus the picker's bank read. */
const RACK_OVERRIDE_PATHS = ["databank.listActiveForChat", "settings.getUserSettings", "preset.get", "chat.setChatDocumentVisibility"] as const;
type RackOverridePath = (typeof RACK_OVERRIDE_PATHS)[number];
function stubRack(page: Page, over: Partial<TrpcRoutes<RackOverridePath>> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "databank.listActiveForChat": () => [CHAT_DOC, GLOBAL_DOC, HIDDEN_CHAR_DOC],
    // The caller's own bank: two of the three active documents plus one that reaches no room yet. The
    // picker's search is a SERVER lens, so the stub narrows by the term it is handed (a fixed array would
    // pass a search assertion while the component filtered nothing).
    "databank.list": (input: TrpcInput<"databank.list">) => {
      const bank = [
        { ...BASE_DOC, id: CHAT_DOC.id, name: CHAT_DOC.name },
        { ...BASE_DOC, id: HIDDEN_CHAR_DOC.id, name: HIDDEN_CHAR_DOC.name },
        { ...BASE_DOC, id: "document_00000000000000000004", name: "Unattached notes" },
      ] satisfies TrpcWireOutput<"databank.list">["items"];
      const needle = input?.search?.trim().toLowerCase() ?? "";
      const items = needle === "" ? bank : bank.filter((doc) => doc.name.toLowerCase().includes(needle));
      return { items, nextCursor: null, totalCount: items.length };
    },
    // The slot-state reads: the built-in arrangement is active by default, which DOES place `{{databank}}`,
    // so the warning is absent on every arm that doesn't opt into a slotless preset.
    [SETTINGS]: () => SETTINGS_BUILT_IN,
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
  await expect(component.getByRole("button", { name: rowActionsName(GLOBAL_DOC.name) })).toHaveCount(0);
  await expect(component.getByRole("button", { name: rowActionsName(HIDDEN_CHAR_DOC.name) })).toHaveCount(0);

  await component.getByRole("button", { name: rowActionsName(CHAT_DOC.name) }).click();
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
  await expect(component.getByRole("button", { name: rowActionsName(CHAT_DOC.name) })).toHaveCount(0);
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

// THE SLOTLESS-PRESET WARNING (issue #80). The rack promises these documents feed the room; that promise is
// false whenever the running preset never writes `{{databank}}`, and nothing else in the stack can say so
// (an unreferenced slot is a legal no-op by design). Each arm barriers on the SETTLED `data-databank-slot`
// state, never on a bare absence — the two reads behind it land after mount, so an un-barriered "no chip"
// assertion would pass on the un-resolved frame and prove nothing.
test("host + documents + a preset that never places {{databank}}: the rack says the documents can't feed", async ({ mount, page }) => {
  await stubRack(page, {
    [SETTINGS]: () => ({
      ...SETTINGS_BUILT_IN,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: ACTIVE_PRESET_ID } },
    }),
    // An imported-ST-shaped arrangement: a main prompt and nothing else. This is the live 2026-08-15 case —
    // add → index → attach all worked, and the model still received zero retrieved bytes.
    [PRESET_GET]: () => ({
      id: ACTIVE_PRESET_ID,
      name: "Imported",
      config: { ...DEFAULT_PROMPT_CONFIG, sections: DEFAULT_PROMPT_CONFIG.sections.filter((section) => section.id !== "databank") },
    }),
  });
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  await expect(component.locator('[data-databank-slot="missing"]')).toBeVisible();
  await expect(component.getByText(SLOT_WARNING, { exact: true })).toBeVisible();
  // It names the fix, and it is a WARNING about reach — never an error claiming something failed.
  await expect(component.getByText("Add the Databank section", { exact: false })).toBeVisible();
});

test("host + documents + the shipped default preset: no warning — the slot is placed", async ({ mount, page }) => {
  const trpc = await stubRack(page, {
    // Deliberately fed but unreachable: the built-in arm has no PresetId and therefore no preset read.
    [PRESET_GET]: () => ({ id: ACTIVE_PRESET_ID, name: "SHOULD NOT BE CALLED", config: DEFAULT_PROMPT_CONFIG }),
  });
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  // BARRIER on the settled answer first: `placed` only renders once both reads resolved, so the absence
  // below is a verdict rather than a race with the un-resolved frame.
  await expect(component.locator('[data-databank-slot="placed"]')).toBeVisible();
  await expect(component.getByText(SLOT_WARNING, { exact: true })).toHaveCount(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): `placed` is the settled built-in state, so every event
  // that could release a fake-id preset query has passed.
  expect(trpc.count(PRESET_GET)).toBe(0);
});

test("no documents attached: the slotless preset is not worth mentioning yet", async ({ mount, page }) => {
  await stubRack(page, {
    "databank.listActiveForChat": () => [],
    [SETTINGS]: () => ({
      ...SETTINGS_BUILT_IN,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: ACTIVE_PRESET_ID } },
    }),
    [PRESET_GET]: () => ({ id: ACTIVE_PRESET_ID, name: "Imported", config: { ...DEFAULT_PROMPT_CONFIG, sections: [] } }),
  });
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  await expect(component.locator('[data-databank-slot="missing"]')).toBeVisible();
  await expect(component.getByText("No documents feed this chat yet.")).toBeVisible();
  // Nothing is being dropped, so there is nothing to warn about — the empty state is the whole message.
  await expect(component.getByText(SLOT_WARNING, { exact: true })).toHaveCount(0);
});

test("member: no warning even on a slotless preset — it is the HOST's preset that runs, and only they can fix it", async ({ mount, page }) => {
  await stubRack(page, {
    "databank.listActiveForChat": () => [{ ...CHAT_DOC }],
    [SETTINGS]: () => ({
      ...SETTINGS_BUILT_IN,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: ACTIVE_PRESET_ID } },
    }),
    [PRESET_GET]: () => ({ id: ACTIVE_PRESET_ID, name: "Imported", config: { ...DEFAULT_PROMPT_CONFIG, sections: [] } }),
  });
  const component = await mount(<ChatDocumentsSectionStory isHost={false} />);

  await expect(component.locator('[data-databank-slot="missing"]')).toBeVisible();
  await expect(component.getByText(SLOT_WARNING, { exact: true })).toHaveCount(0);
});

// ── #1520 item 3 · A FAILED PRESET READ IS NOT "NO CUSTOM PRESET" ──────────────────────────────────
// `useSlotState` collapsed `preset.isError` WHOLESALE to the built-in arrangement, which DOES place the
// slot — so a transient failure looked exactly like a host running the default and the "Not reaching the
// prompt" warning was withheld from a host whose real arrangement may well be slotless.
//
// THE OLD RULING SURVIVES; ITS INPUT CHANGED. The degrade was written for a STALE OR UNOWNED id, which is
// what the server itself degrades, and the second test below is that half: a NOT_FOUND still resolves to
// the built-in. What changed is that the degrade no longer swallows every OTHER failure with it.
test("a TRANSIENT preset read failure settles as UNKNOWN — it neither warns nor claims the slot is placed", async ({ mount, page }) => {
  await stubRack(page, {
    [SETTINGS]: () => ({
      ...SETTINGS_BUILT_IN,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: ACTIVE_PRESET_ID } },
    }),
    [PRESET_GET]: () => trpcError({ code: "INTERNAL_SERVER_ERROR", message: "preset read failed" }),
  });
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  // Barrier on the SETTLED failure state, then read both absences against it.
  await expect(component.locator('[data-databank-slot="unknown"]')).toBeVisible();
  await expect(component.locator('[data-databank-slot="placed"]')).toHaveCount(0);
  await expect(component.getByText(SLOT_WARNING, { exact: true })).toHaveCount(0);
  // …and it SAYS it could not find out, with a way to ask again — the silence was the defect.
  await expect(component.getByText("Couldn't check whether your preset places", { exact: false })).toBeVisible();
  await expect(component.getByRole("button", { name: "Check again" })).toBeVisible();
});

test("a NOT_FOUND preset still degrades to the built-in arrangement — the server's own degrade, preserved", async ({ mount, page }) => {
  await stubRack(page, {
    [SETTINGS]: () => ({
      ...SETTINGS_BUILT_IN,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: ACTIVE_PRESET_ID } },
    }),
    [PRESET_GET]: () => trpcError({ code: "NOT_FOUND", message: "no such preset" }),
  });
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  // The built-in places the slot, so this is `placed` — a stale pointer runs the default SERVER-side too.
  await expect(component.locator('[data-databank-slot="placed"]')).toBeVisible();
  await expect(component.getByText(SLOT_WARNING, { exact: true })).toHaveCount(0);
});

// ── #1520 item 2 · TWO TOGGLES IN ONE TASK ─────────────────────────────────────────────────────────
// The verb has SET semantics, so every toggle sends the WHOLE excluded set. The mutation's optimistic patch
// (`use-chat-document-mutations.ts:59-73`) covers the ordinary case — a second click a beat later composes
// from an already-patched cache — but `onMutate` runs inside the mutation's own async execution, NOT
// synchronously in the click handler, so two toggles in ONE browser task both read the unpatched rows and
// the second's payload silently drops the first's document. Driven through one `evaluate` for exactly that
// reason (the `regex-bulk-bar` same-task precedent); a two-`click()` version cannot reach the window.
test("two visibility toggles in ONE browser task compose — the second write carries BOTH documents (#1520)", async ({ mount, page }) => {
  const trpc = await stubRack(page);
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);
  await expect(component.getByRole("button", { name: `Stop ${CHAT_DOC.name} feeding this chat` })).toBeVisible();

  await component.evaluate(
    (root, names) => {
      const buttons = Array.from(root.querySelectorAll("button"));
      for (const name of names) {
        const button = buttons.find((candidate) => candidate.getAttribute("aria-label") === name);
        if (button === undefined) {
          throw new Error(`missing toggle: ${name}`);
        }
        button.click();
      }
    },
    [`Stop ${CHAT_DOC.name} feeding this chat`, `Stop ${GLOBAL_DOC.name} feeding this chat`],
  );

  await expect.poll(() => trpc.count(SET_VISIBILITY), { intervals: [20, 50, 100] }).toBe(2);
  // The character doc was already hidden; the two clicks add the other two. A payload of
  // [HIDDEN_CHAR_DOC, GLOBAL_DOC] is the defect: the second write reverting the first. The ORDER is
  // `nextHiddenSet`'s documented one — the RENDERED row order, newly-hidden id appended — not click order.
  await expect
    .poll(() => (trpc.lastInput(SET_VISIBILITY) as { visibility?: { hidden?: string[] } } | undefined)?.visibility?.hidden, {
      intervals: [20, 50, 100],
    })
    .toEqual([CHAT_DOC.id, HIDDEN_CHAR_DOC.id, GLOBAL_DOC.id]);
});

// A REJECTED write must not wedge the queue. The chain's `.catch` is on the CHAIN, never on the mutation, so
// the mutation's own `onError` (the optimistic rollback + its errorToast) still runs — and the NEXT toggle
// still reaches the wire.
test("a REJECTED visibility write still lets the next toggle reach the wire (#1520)", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await stubRack(page, {
    [SET_VISIBILITY]: () => (attempts++ === 0 ? trpcError({ message: "visibility write failed" }) : { hidden: [] }),
  });
  const component = await mount(<ChatDocumentsSectionStory isHost={true} />);

  await component.getByRole("button", { name: `Stop ${CHAT_DOC.name} feeding this chat` }).click();
  await expect.poll(() => trpc.count(SET_VISIBILITY), { intervals: [20, 50, 100] }).toBe(1);
  // The rollback puts the row back: the toggle names the un-set again, so it is offering to HIDE once more.
  await expect(component.getByRole("button", { name: `Stop ${CHAT_DOC.name} feeding this chat` })).toBeVisible();

  await component.getByRole("button", { name: `Stop ${GLOBAL_DOC.name} feeding this chat` }).click();
  await expect.poll(() => trpc.count(SET_VISIBILITY), { intervals: [20, 50, 100] }).toBe(2);
});
