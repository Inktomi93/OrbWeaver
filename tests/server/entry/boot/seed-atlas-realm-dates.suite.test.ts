// The card-atlas seed plugin under the REALM'S OWN ambient denial (#805). The five "parked" hubs of the v1.3
// live drive were the five whose row builders fed an ISO date string to `epochMs`, which called `Date.parse`
// — and the plugin sandbox replaces `Date` with a throwing stub (D46, `realm.ts` AMBIENT_STUBS). The throw
// was caught by the float's `.catch`, logged, and the log line destroyed by #806, so the stage read as a
// host park. The offline harness that had "proved the adapters correct" ran with a LIVE `Date`.
//
// This suite closes that gap structurally: the REAL shipped `main.js` runs in a bare `node:vm` context
// (ES intrinsics only — no timers, no fetch, no process, the floor a bare QuickJS context offers) after the
// realm's EXPORTED `AMBIENT_STUBS` text is evaluated in it, so the harness's denial IS the realm's, never a
// copy that can drift. The harness itself moved to `tests/support/atlas-guest.ts` when the #1698 import-
// outcome suite needed the same boot with a character plane; what it does is unchanged.
//
// `.suite`: one property (the atlas survives the realm's denial) across the guest bundle + the realm — it
// mirrors no single module. What the real QuickJS sandbox adds (marshalling, caps, the belts) is pinned in
// tests/server/infra/plugin-host/; the atlas's registration + activation publish in the real sandbox is
// `seed-example-plugins.int.test.ts` (which cannot reach the wire halves — `safeFetch` has no seam).

import { describe } from "vitest";
import type { CannedResponse } from "../../../support/atlas-guest.ts";
import { bootAtlas, lastAtlasState } from "../../../support/atlas-guest.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** A foreign wire row — the hubs' snake_case keys are wire tokens, tuple-built so they never become
 *  lint-checked identifiers (the atlas's own header-pair pattern). */
function wire(entries: readonly (readonly [string, unknown])[]): Record<string, unknown> {
  return Object.fromEntries(entries);
}

function tileTitles(state: Record<string, unknown>): string[] {
  const tiles = state["tiles"];
  return Array.isArray(tiles) ? tiles.map((tile: unknown) => (typeof tile === "object" && tile !== null && "title" in tile ? String(tile.title) : "")) : [];
}

// ── the live wire shapes (receipts 2026-08-30, one row builder each) ────────────────────────────────────────

const CHUB: CannedResponse = {
  match: "api.chub.ai/search",
  body: {
    data: {
      count: 3,
      nodes: [
        {
          fullPath: "alice/older",
          name: "Older",
          starCount: 5,
          createdAt: "2023-12-08T03:23:45Z",
          lastActivityAt: "2024-01-01T00:00:00Z",
          topics: ["fantasy"],
        },
        { fullPath: "bob/newer", name: "Newer", starCount: 9, createdAt: "2025-06-01T12:00:00Z", lastActivityAt: "2025-06-02T00:00:00Z", topics: [] },
        // THE PLANTED CONTROL: an unparseable date must still publish — the datum goes absent, never the row.
        { fullPath: "cy/undated", name: "Undated", starCount: 1, createdAt: "not-a-date", topics: [] },
      ],
    },
  },
};
const CHUB_DETAIL: CannedResponse = { match: "api.chub.ai/api/characters/bob/newer", body: { node: { description: "A newer card." } } };
const WYVERN: CannedResponse = {
  match: "api.wyvern.chat/exploreSearch",
  body: {
    totalPages: 1,
    results: [
      wire([
        ["id", "w1"],
        ["name", "Wyv"],
        ["likes", 3],
        ["created_at", "2026-08-28T22:26:15.959Z"],
        ["updated_at", "2026-08-28T22:26:15.959Z"],
        ["tags", []],
      ]),
    ],
  },
};
const BOTBOORU: CannedResponse = {
  match: "botbooru.com/posts/",
  body: {
    total: 1,
    posts: [
      wire([
        ["id", 7],
        ["character_name", "Boo"],
        ["downloads", 2],
        ["created_at", "2026-08-29T17:42:36.854153"],
        ["tags", []],
      ]),
    ],
  },
};
const DATACAT_MINT: CannedResponse = { match: "datacat.run/api/liberator/identify", body: { sessionToken: "tok" } };
const DATACAT: CannedResponse = {
  match: "datacat.run/api/characters/recent-public",
  body: { totalCount: 1, characters: [{ characterId: "d1", name: "Cat", firstPublishedAt: "2026-08-20T00:46:34.048Z", stats: { chat: 4 } }] },
};

describe("card atlas under the realm's ambient denial (#805)", () => {
  test("chub: ISO-dated rows publish, `newest` orders by the parsed dates, the unparseable control row still lands", async () => {
    const drive = await bootAtlas({ responses: [CHUB] });
    await drive.act("search", { q: "", source: "chub", sort: "newest", sfw: "false" });
    const state = lastAtlasState(drive);
    // The undated row sorts LAST (an unknown is not a zero) — and it is THERE (the datum is absent, not the row).
    expect(tileTitles(state)).toEqual(["Newer", "Older", "Undated"]);
    expect(String(state["status"])).toContain("3 from Chub");
    // The v1.3.1 failure line — the float's `.catch` reporting the realm's `Date.parse` refusal — must be gone.
    expect(drive.logs.filter((line) => line.includes("search failed"))).toEqual([]);
  });

  test("the detail sheet renders Created/Updated as YYYY-MM-DD through the real STAT_ROWS path (fmtDate)", async () => {
    const drive = await bootAtlas({ responses: [CHUB, CHUB_DETAIL] });
    await drive.act("search", { q: "", source: "chub", sort: "newest", sfw: "false" });
    await drive.act("open_result", { tile: "r0" });
    const state = lastAtlasState(drive);
    expect(state["stage"]).toBe("card");
    const detail = state["detail"] as { stats: readonly { key: string; value: string }[] };
    expect(detail.stats).toEqual(
      expect.arrayContaining([
        { key: "Created", value: "2025-06-01" },
        { key: "Updated", value: "2025-06-02" },
      ]),
    );
    expect(drive.logs.filter((line) => line.includes("open failed"))).toEqual([]);
  });

  test.each([
    ["wyvern", "Wyv", [WYVERN]],
    ["botbooru", "Boo", [BOTBOORU]],
    ["datacat", "Cat", [DATACAT_MINT, DATACAT]],
  ] as const)("%s: the ISO-dated row publishes a tile", async (hub, title, responses) => {
    const drive = await bootAtlas({ responses });
    await drive.act("search", { q: "", source: hub, sort: "relevance", sfw: "false" });
    expect(tileTitles(lastAtlasState(drive))).toEqual([title]);
    expect(drive.logs.filter((line) => line.includes("search failed"))).toEqual([]);
  });
});

describe("the guest date engine — every receipted wire shape, pure arithmetic", () => {
  test.each([
    ["Z-suffixed", "2023-12-08T03:23:45Z", 1_702_005_825_000],
    ["millisecond fraction", "2026-08-28T22:26:15.959Z", 1_787_955_975_959],
    ["microsecond fraction, no timezone (read as UTC, truncated to ms)", "2026-08-29T17:42:36.854153", 1_788_025_356_854],
    ["bare date", "2026-08-20", 1_787_184_000_000],
    ["positive offset", "2024-03-01T10:00:00+02:00", 1_709_280_000_000],
    ["negative compact offset", "2024-03-01T10:00:00-0530", 1_709_307_000_000],
    ["space separator, no seconds", "2024-03-01 10:00Z", 1_709_287_200_000],
    ["leap day", "2000-02-29T00:00:00Z", 951_782_400_000],
    ["epoch-second string (pygmalion's dialect)", "1700000000", 1_700_000_000_000],
  ])("epochMs: %s", async (_label, stamp, expected) => {
    const drive = await bootAtlas({ responses: [] });
    expect(drive.call("epochMs", stamp)).toBe(expected);
  });

  test.each([
    ["not a date", "not-a-date"],
    ["empty", ""],
    ["month 13", "2024-13-01"],
    ["day 30 of February", "2024-02-30"],
    ["hour 24", "2024-03-01T24:00:00Z"],
    ["trailing junk", "2024-03-01T10:00:00Zjunk"],
  ])("epochMs: %s is the absent datum (undefined), never a throw", async (_label, stamp) => {
    const drive = await bootAtlas({ responses: [] });
    expect(drive.call("epochMs", stamp)).toBeUndefined();
  });

  test("epochMs: numeric inputs keep the seconds-vs-ms dialect split", async () => {
    const drive = await bootAtlas({ responses: [] });
    expect(drive.call("epochMs", 1_700_000_000)).toBe(1_700_000_000_000);
    expect(drive.call("epochMs", 1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  test.each([
    [1_702_005_825_000, "2023-12-08"],
    [951_782_400_000, "2000-02-29"],
    [1_787_184_000_000, "2026-08-20"],
    [0, "1970-01-01"],
  ])("fmtDate(%d) renders %s", async (ms, expected) => {
    const drive = await bootAtlas({ responses: [] });
    expect(drive.call("fmtDate", ms)).toBe(expected);
  });
});
