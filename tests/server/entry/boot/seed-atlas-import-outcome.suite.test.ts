// THE CARD-ATLAS ADD PATH: what the person is told, and what survives being told nothing (#1698).
//
// THE FINDING (side-eye 2026-09-05, the hub-ingested arm). A first-time `Add to library` "announces nothing":
// the button still reads `Add to library`, the accessible tree holds no live region, and the only new text on
// the page says **"Already in your library"** — on a card that had just this second been imported.
//
// TWO MECHANISMS, both in the shipped guest, both driven here against the REAL `main.js`:
//
//  1. THE OWNED LINE WAS A STANDING PROPERTY, NOT AN OUTCOME. `publishDetail` read `detail.owned` back out of
//     the owned INDEX — which `addToLibrary` had just written — so a successful FIRST import re-rendered the
//     page saying the card was already there. "Do I have this?" and "what did that button just do?" are two
//     different questions and one string was answering both.
//
//  2. THE NOTICE WAS LOAD-BEARING AND IT IS ALLOWED TO REFUSE. `host.ui.toast` is rate-limited to one notice
//     every `PLUGIN_TOAST_COOLDOWN_SECONDS` per plugin and refuses BY THROWING (the host's outbox is
//     deliberate about that — `domain/plugin/substrate/ui-outbox.ts`). The guest awaited it in the MIDDLE of
//     `addToLibrary`, above the provenance stamp and the owned-index write, so a second add inside the
//     cooldown threw straight out of the function: no `character.setCardData`, no owned index, and no
//     republish at all. The card landed with its provenance lost and the page never moved.
//
// `.suite`: one property (the add path's outcome is stated, and its writes do not hang off the statement)
// across the guest bundle + the host's toast budget — it mirrors no single module. The harness is the shared
// `tests/support/atlas-guest.ts`, so the realm denial these tests run under is the realm's own.

import { describe } from "vitest";
import type { AtlasBootOptions, CannedResponse } from "../../../support/atlas-guest.ts";
import { bootAtlas, lastAtlasState } from "../../../support/atlas-guest.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** A one-row Wyvern page — the hub whose rows carry native card JSON, so the add path's JSON arm resolves
 *  without an art plane (the PNG-first arm folds on `ingestAsset`, exactly as it does for a PNG-less hub). */
const WYVERN_SEARCH: CannedResponse = {
  match: "api.wyvern.chat/exploreSearch",
  body: {
    totalPages: 1,
    results: [
      Object.fromEntries([
        ["id", "w1"],
        ["name", "Illyria"],
        ["likes", 3],
        ["created_at", "2026-08-28T22:26:15.959Z"],
        ["tags", []],
      ]),
    ],
  },
};
/** The card body the detail open + the add both read. The hub's keys are WIRE TOKENS (`first_mes`), so they
 *  are tuple-built rather than spelled as identifiers — the atlas suite's own header-pair pattern. */
const WYVERN_CARD: CannedResponse = {
  match: "api.wyvern.chat/characters/w1",
  body: Object.fromEntries([
    ["name", "Illyria"],
    ["description", "A card."],
    ["personality", ""],
    ["scenario", ""],
    ["first_mes", "hi"],
    ["mes_example", ""],
  ]),
};

const RESPONSES: readonly CannedResponse[] = [WYVERN_SEARCH, WYVERN_CARD];
const CHARACTER_ID = "char_illyria";
const ADD_GRANTS: readonly string[] = ["storage.kv", "ui.surface", "net.fetch", "character.ingest", "character.card_state"];

/** Drive search → open → add, and hand back the drive. `ingest` decides whether this add CREATES. */
async function driveAdd(options: Omit<AtlasBootOptions, "responses" | "grants">): Promise<Awaited<ReturnType<typeof bootAtlas>>> {
  const drive = await bootAtlas({ responses: RESPONSES, grants: ADD_GRANTS, ...options });
  await drive.act("search", { q: "", source: "wyvern", sort: "relevance", sfw: "false" });
  await drive.act("open_result", { tile: "r0" });
  await drive.act("add_to_library", {});
  return drive;
}

function ownedLine(state: Record<string, unknown>): string {
  const detail = state["detail"] as { owned?: unknown } | undefined;
  return String(detail?.owned ?? "");
}

describe("the add path states what just happened", () => {
  test("a FIRST-EVER import says it was ADDED — never 'already in your library'", async () => {
    const drive = await driveAdd({ ingest: () => ({ characterId: CHARACTER_ID, created: true }) });

    // The ingest actually happened, so the sentence below is about a real import.
    expect(drive.ingests).toEqual([CHARACTER_ID]);
    const line = ownedLine(lastAtlasState(drive));
    expect(line).toBe("Added to your library.");
    // THE DEFECT, pinned as an absence: the standing-ownership wording is a lie about this render.
    expect(line).not.toContain("Already in your library");
  });

  test("a DUPLICATE import says nothing was duplicated — a different fact, and still not the rest wording", async () => {
    const drive = await driveAdd({ ingest: () => ({ characterId: CHARACTER_ID, created: false }) });

    expect(ownedLine(lastAtlasState(drive))).toBe("Already in your library — nothing was duplicated.");
  });

  test("the page still states the outcome when the toast is REFUSED — the notice is not the only telling", async () => {
    // The host's real refusal: over the per-plugin cooldown, `ui.toast` throws. Every toast in this run is
    // refused, which is the worst case the budget can produce.
    const drive = await driveAdd({
      ingest: () => ({ characterId: CHARACTER_ID, created: true }),
      onToast: (): never => {
        throw new Error("plugin host: ui.toast is limited to one notice every 10s for this plugin");
      },
    });

    // The guest ASKED for its success notice (so the arm ran) …
    expect(drive.toasts.map((toast) => toast.level)).toContain("success");
    // … and the page — the telling that cannot be rate-limited — carries the outcome anyway.
    expect(ownedLine(lastAtlasState(drive))).toBe("Added to your library.");
    // The refusal is a real fact about this plugin's budget, so it is logged rather than swallowed.
    expect(drive.logs.some((line) => line.includes("toast refused"))).toBe(true);
  });
});

describe("the add path's WRITES do not hang off the notice", () => {
  test("a refused toast still leaves the provenance stamp and the owned index", async () => {
    const drive = await driveAdd({
      ingest: () => ({ characterId: CHARACTER_ID, created: true }),
      onToast: (): never => {
        throw new Error("plugin host: ui.toast is limited to one notice every 10s for this plugin");
      },
    });

    // THE PROVENANCE STAMP — the portable record of WHERE the card came from, which the old order lost
    // entirely whenever a person added two cards inside ten seconds.
    expect(drive.cardData.get(CHARACTER_ID)).toMatchObject({ source: "Wyvern", ref: "w1" });
    // THE OWNED INDEX — what the hub grid's "in your library" badge is read from, so losing it also loses
    // the badge on every later search for the same card.
    expect([...drive.kv.values()]).toContain(CHARACTER_ID);
  });

  test("POSITIVE CONTROL: with the toast succeeding, the same two writes land — the pins above are not vacuous", async () => {
    const drive = await driveAdd({ ingest: () => ({ characterId: CHARACTER_ID, created: true }) });

    expect(drive.cardData.get(CHARACTER_ID)).toMatchObject({ source: "Wyvern", ref: "w1" });
    expect([...drive.kv.values()]).toContain(CHARACTER_ID);
  });
});
