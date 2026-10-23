// These scripts observe guest requests and page outcomes, not application persistence or toast admission.
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { AtlasBootOptions, CannedResponse } from "@orb/testkit/node/composed";
import { bootAtlas, lastAtlasState } from "@orb/testkit/node/composed";
import { describe } from "vitest";

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
const CHARACTER_ID = mintTypeId(ID_PREFIX.character, createSeededIds().next);
const ADD_GRANTS: readonly string[] = ["storage.kv", "ui.surface", "net.fetch", "character.ingest", "character.card_state"];

async function driveAdd(options: Omit<AtlasBootOptions, "responses" | "grants">): Promise<Awaited<ReturnType<typeof bootAtlas>>> {
  const drive = await bootAtlas({ responses: RESPONSES, grants: ADD_GRANTS, ...options });
  await drive.act(
    "search",
    { q: "", source: "wyvern", sort: "relevance", sfw: "false" },
    (publication) => publication["stage"] === "browse" && publication["loading"] === false,
  );
  await drive.act("open_result", { tile: "r0" }, (publication) => publication["stage"] === "card");
  await drive.act("add_to_library", {}, (publication) => publication["stage"] === "card");
  return drive;
}

function ownedLine(state: Record<string, unknown>): string {
  const detail = state["detail"];
  return typeof detail === "object" && detail !== null && "owned" in detail ? String(detail.owned) : "";
}

describe("the add path states what just happened", () => {
  test("a FIRST-EVER import says it was ADDED — never 'already in your library'", async () => {
    const drive = await driveAdd({ ingest: () => ({ characterId: CHARACTER_ID, created: true }) });

    expect(drive.ingests).toEqual([CHARACTER_ID]);
    const line = ownedLine(lastAtlasState(drive));
    expect(line).toBe("Added to your library.");

    expect(line).not.toContain("Already in your library");
  });

  test("a DUPLICATE import says nothing was duplicated — a different fact, and still not the rest wording", async () => {
    const drive = await driveAdd({ ingest: () => ({ characterId: CHARACTER_ID, created: false }) });

    expect(drive.ingests).toEqual([CHARACTER_ID]);
    expect(ownedLine(lastAtlasState(drive))).toBe("Already in your library — nothing was duplicated.");
  });

  test("the page still states the outcome when the toast is REFUSED — the notice is not the only telling", async () => {
    const drive = await driveAdd({
      ingest: () => ({ characterId: CHARACTER_ID, created: true }),
      onToast: (): never => {
        throw new Error("plugin host: ui.toast is limited to one notice every 10s for this plugin");
      },
    });

    expect(drive.toasts.map((toast) => toast.level)).toContain("success");

    expect(ownedLine(lastAtlasState(drive))).toBe("Added to your library.");

    expect(drive.logs.some((line) => line.includes("toast refused"))).toBe(true);
  });
});

describe("the guest's provenance and index requests do not hang off the notice", () => {
  test("a refused toast still requests provenance and owned-index writes", async () => {
    const drive = await driveAdd({
      ingest: () => ({ characterId: CHARACTER_ID, created: true }),
      onToast: (): never => {
        throw new Error("plugin host: ui.toast is limited to one notice every 10s for this plugin");
      },
    });

    expect(drive.cardData.get(CHARACTER_ID)).toMatchObject({ source: "Wyvern", ref: "w1" });

    expect(drive.toasts.map(({ level }) => level)).toContain("success");
    expect(drive.kv.get("owned:wyvern:w1")).toBe(CHARACTER_ID);
    expect(drive.ingests).toEqual([CHARACTER_ID]);
    expect(ownedLine(lastAtlasState(drive))).toBe("Added to your library.");
    expect(drive.logs.some((line) => line.includes("toast refused"))).toBe(true);
  });

  test("a successful toast leaves the same provenance and owned-index requests", async () => {
    const drive = await driveAdd({ ingest: () => ({ characterId: CHARACTER_ID, created: true }) });

    expect(drive.toasts.map(({ level }) => level)).toContain("success");
    expect(drive.logs.some((line) => line.includes("toast refused"))).toBe(false);
    expect(drive.cardData.get(CHARACTER_ID)).toMatchObject({ source: "Wyvern", ref: "w1" });
    expect(drive.kv.get("owned:wyvern:w1")).toBe(CHARACTER_ID);
    expect(drive.ingests).toEqual([CHARACTER_ID]);
    expect(ownedLine(lastAtlasState(drive))).toBe("Added to your library.");
  });
});
