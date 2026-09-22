// CT: the world-info collection's CONTEXT arm — the book activation panel, over the stubbed network.
//
// It is a `{kind:"body"}` arm, so there is no "nothing selected" state to test here (the host's own
// `context.empty` owns that). What this pins is that an OPEN book's arm is the real activation surface —
// the global toggle writes `worldInfo.attachGlobal` — and that a book deleted under the pane says so.
//
// AND that the character picker's LENS IS THE SERVER'S (2026-08-14). The reveal used to read `character.list`
// with no params at all: one default page, so past the fiftieth card a character was unattachable from here
// and nothing on screen said the roster had ended. The two pins below are the user-visible halves of the fix
// — a search affordance exists, and what the reader types reaches the VERB (so the answer covers the whole
// library, not the page that happened to arrive first).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { WorldInfoContextStory } from "../_ct-stories.tsx";

const BOOK_ID = "world_book_reorder001";
const ASTRID_ID = "character_aaaaaaaaaaaaaaaaaaaaaaaaaa";
const RETRY_RE = /Retry/u;
const NO_PERSONAS_RE = /No personas yet/u;
const BOOK_ROW = {
  id: BOOK_ID,
  name: "Reorder Book",
  description: null,
  createdAt: 1,
  entryCount: 0,
  usage: { characters: 0, personas: 0, chats: 0, global: false, total: 0 },
};
const PERSONA = {
  id: "persona_nova",
  name: "Nova",
  title: null,
  description: "",
  starred: false,
  avatarAssetId: null,
  avatarHash: null,
  metadata: null,
  createdAt: 1,
  updatedAt: 1,
};

/** A library whose second card is only ever reachable THROUGH the search param — the stub answers the term
 *  the way the verb does (a server-side predicate), never a client-side filter of one page. */
const LIBRARY = [
  { id: ASTRID_ID, name: "Astrid", avatarHash: null },
  { id: "character_bbbbbbbbbbbbbbbbbbbbbbbbbb", name: "Bramble", avatarHash: null },
];
function searchedLibrary(input: unknown): { items: typeof LIBRARY; nextCursor: null } {
  const search = (input as { search?: string } | undefined)?.search ?? "";
  return { items: search === "" ? LIBRARY : LIBRARY.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())), nextCursor: null };
}

test("the open book's arm switches the everywhere scope on", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.listAttachmentsForBook": () => ({ characters: [], personaIds: [] }),
    "worldInfo.listGlobal": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
    "worldInfo.attachGlobal": () => null,
  });

  const context = await mount(<WorldInfoContextStory />);
  const globalSwitch = context.getByRole("switch", { name: "Fires in every chat" });
  await expect(globalSwitch).toBeVisible();

  await globalSwitch.click();
  await expect.poll(() => trpc.lastInput("worldInfo.attachGlobal"), { intervals: [20, 50, 100] }).toEqual({ bookId: BOOK_ID });
});

test("a book deleted under the pane says so instead of showing an empty panel", async ({ mount, page }) => {
  await routeTrpc(page, { "worldInfo.listBooksWithUsage": () => [], "worldInfo.listAttachmentsForBook": () => ({ characters: [], personaIds: [] }) });

  const context = await mount(<WorldInfoContextStory />);
  await expect(context.getByText("Book not found")).toBeVisible();
});

test("the character picker narrows through the SERVER — the typed term reaches the verb and the roster re-answers", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.listGlobal": () => [],
    "worldInfo.listAttachmentsForBook": () => ({ characters: [], personaIds: [] }),
    "persona.list": () => [],
    "character.list": searchedLibrary,
  });

  const context = await mount(<WorldInfoContextStory />);
  await context.getByRole("button", { name: "Attach to a character" }).click();

  // SETTLED arm one: the unsearched roster, both cards painted. The switch's accessible name is the row's
  // own affordance, so this asserts what a reader can actually reach — not a stub's shape.
  await expect(context.getByRole("switch", { name: "Attach to Astrid" })).toBeVisible();
  await expect(context.getByRole("switch", { name: "Attach to Bramble" })).toBeVisible();
  // The read is BOUNDED and says so on the wire — the paged-list law's half that no pixel shows. Polled,
  // not sampled: a recorder read is mutable async state even behind a settled render (ct-no-oneshot).
  await expect.poll(() => trpc.lastInput("character.list"), { intervals: [20, 50, 100] }).toEqual({ limit: 100 });
  await expect.poll(() => trpc.count("worldInfo.listAttachmentsForBook")).toBe(1);
  await expect.poll(() => trpc.count("worldInfo.listForCharacter")).toBe(0);

  await context.getByRole("textbox", { name: "Search characters" }).fill("bram");

  // SETTLED arm two: the term has landed at the verb and the roster is the SEARCHED answer. Both assertions
  // are on the settled render — Astrid leaving is the tell that a new page arrived, not a local filter.
  await expect(context.getByRole("switch", { name: "Attach to Bramble" })).toBeVisible();
  await expect(context.getByRole("switch", { name: "Attach to Astrid" })).toHaveCount(0);
  await expect.poll(() => trpc.lastInput("character.list"), { intervals: [20, 50, 100] }).toEqual({ limit: 100, search: "bram" });
});

test("a search that matches nothing says so about the TERM, and offers the way back out", async ({ mount, page }) => {
  await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.listGlobal": () => [],
    "worldInfo.listAttachmentsForBook": () => ({ characters: [], personaIds: [] }),
    "persona.list": () => [],
    "character.list": searchedLibrary,
  });

  const context = await mount(<WorldInfoContextStory />);
  await context.getByRole("button", { name: "Attach to a character" }).click();
  await expect(context.getByRole("switch", { name: "Attach to Astrid" })).toBeVisible();

  await context.getByRole("textbox", { name: "Search characters" }).fill("nobody");
  // Not "No characters yet." — the library is not empty, the TERM is what found nothing, and the server
  // searched all of it, so the sentence is honest.
  await expect(context.getByText('No character matches "nobody".')).toBeVisible();

  await context.getByRole("button", { name: "Clear search" }).click();
  await expect(context.getByRole("switch", { name: "Attach to Astrid" })).toBeVisible();
});

test("attachment controls lock on the one shared reverse read and expose an explicit retry after error", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.listGlobal": () => [],
    "worldInfo.listAttachmentsForBook": () => held,
    "persona.list": () => [PERSONA],
    "character.list": searchedLibrary,
  });
  const context = await mount(<WorldInfoContextStory />);
  await context.getByRole("button", { name: "Attach to a character" }).click();
  await held.requested;
  await expect(context.getByRole("status")).toContainText("Loading attachment status");
  const toggle = context.getByRole("switch", { name: "Attach to Astrid" });
  await expect(toggle).toHaveCount(0);
  held.release(trpcError());

  await expect(context.getByRole("alert")).toContainText("Couldn't load attachment status.");
  const retry = context.getByRole("button", { name: "Retry attachment status" });
  await expect(retry).toBeVisible();
  await expect(context.getByRole("button", { name: RETRY_RE })).toHaveCount(1);
  await expect(toggle).toHaveCount(0);
  // The held marker replays its settled failure on retry; this still proves the explicit retry door fires.
  await retry.click();
  await expect.poll(() => trpc.count("worldInfo.listAttachmentsForBook")).toBe(2);
});

test("attachment rows withhold checked semantics until the shared read settles, then render the resolved state", async ({ mount, page }) => {
  const held = trpcHold();
  await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.listGlobal": () => [],
    "worldInfo.listAttachmentsForBook": () => held,
    "persona.list": () => [PERSONA],
    "character.list": searchedLibrary,
  });
  const context = await mount(<WorldInfoContextStory />);
  await context.getByRole("button", { name: "Attach to a character" }).click();
  await held.requested;

  await expect(context.getByRole("switch", { name: "Attach to Astrid" })).toHaveCount(0);
  await expect(context.getByRole("switch", { name: "Attach to Bramble" })).toHaveCount(0);
  await expect(context.getByRole("combobox", { name: "Role for Astrid" })).toHaveCount(0);

  held.release({ characters: [{ characterId: ASTRID_ID, role: "primary" }], personaIds: [PERSONA.id] });
  await expect(context.getByRole("switch", { name: "Attach to Astrid" })).toBeChecked();
  await expect(context.getByRole("switch", { name: "Attach to Bramble" })).not.toBeChecked();
  await expect(context.getByRole("combobox", { name: "Role for Astrid" })).toContainText("primary");
  await expect(context.getByRole("switch", { name: "Attach to Nova" })).toBeChecked();
});

test("the personas section does not claim zero or empty while its target roster is pending", async ({ mount, page }) => {
  const personasHeld = trpcHold();
  await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.listGlobal": () => [],
    "worldInfo.listAttachmentsForBook": () => ({ characters: [], personaIds: [] }),
    "persona.list": () => personasHeld,
  });
  const context = await mount(<WorldInfoContextStory />);
  await personasHeld.requested;

  await expect(context.getByRole("heading", { name: "Attached by personas" })).toBeVisible();
  await expect(context.getByText("Attached by personas · 0")).toHaveCount(0);
  await expect(context.getByText(NO_PERSONAS_RE)).toHaveCount(0);

  personasHeld.release([]);
  await expect(context.getByText(NO_PERSONAS_RE)).toBeVisible();
});
