// entry/import/run-profile-dir-import — a partial run says so (the entry half of the silent-loss sweep).

import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { runProfileDirImport } from "#server/entry/import/index.ts";
import { chatJsonl, deps, ENC, fakes, fixtureFiles, MINIMAL_PNG, memoryFs, openAiPresetJson } from "./_profile-dir-import-support.ts";

// ── #1469, the ENTRY half of the silent-loss sweep ───────────────────────────────────────────────────────
describe("runProfileDirImport — a partial run says so", () => {
  test("dryRun NAMES every wave it would run, instead of reporting zeroes indistinguishable from `nothing there`", async () => {
    // A profile carrying one card, one persona, one chat, one world, one preset and one group: a dry run
    // that answers `presetsImported: 0, groupsImported: 0` reads exactly like an empty profile.
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/worlds/Eldoria.json": ENC.encode(JSON.stringify({ entries: { "0": { uid: 0, key: ["e"], content: "A forest." } } })),
      "root/userA/OpenAI Settings/Marinara.json": ENC.encode(openAiPresetJson()),
      "root/userA/groups/g1.json": ENC.encode(JSON.stringify({ id: "g1", name: "The Party", members: ["Aria.png"], chats: ["party"] })),
      "root/userA/group chats/party.jsonl": ENC.encode(chatJsonl("Alex", "unused")),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(files), f, { dryRun: true }));

    expect(report.dryRun).toBe(true);
    expect(report.dryRunWouldImport).toEqual({
      characters: 1,
      personas: 1,
      chats: 1,
      worlds: 1,
      presets: 1,
      themes: 0,
      backgrounds: 0,
      groups: 1,
      groupChats: 1,
      orphanChatDirs: 0,
    });
    // Still ZERO writes — the census is collect-time arithmetic, not a rehearsal.
    expect(f.log).toHaveLength(0);
    expect(f.stores).toHaveLength(0);
  });

  test("a REAL run carries no dry-run census (the flag says which report you are reading)", async () => {
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(fixtureFiles("root")), f));

    expect(report.dryRun).toBe(false);
    expect(report.dryRunWouldImport).toBeNull();
  });

  test("a card TAG that fails to attach is reported — the allSettled result used to be thrown away", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/settings.json": ENC.encode(
        JSON.stringify({
          power_user: { personas: { "alex.png": "Alex" }, default_persona: "alex.png" },
          tags: [{ id: "t1", name: "bard" }],
          tag_map: { "Aria.png": ["t1"] },
        }),
      ),
    };
    const f = fakes();

    const report = await runProfileDirImport({
      ...deps(memoryFs(files), f),
      attachCardTag: () => Promise.reject(new Error("tag write failed\nUNIQUE constraint failed: tags.name")),
    });

    // The character still imported (per-tag isolation); the tag that did not attach is NAMED.
    expect(report.changed).toBeGreaterThan(0);
    expect(report.skippedCardTags).toEqual([{ character: "Aria.png", tag: "bard", reason: "UNIQUE constraint failed: tags.name" }]);
  });

  test("backgrounds stored with NO appearance applier wired are reported as unattached, not counted as imported", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/backgrounds/dungeon.png": MINIMAL_PNG,
    };
    const f = fakes();

    // The store IS wired (the blob lands in the CAS) but the settings-side applier is NOT — so nothing ever
    // references the asset, and before this it was neither imported nor reported.
    const report = await runProfileDirImport({
      ...deps(memoryFs(files), f),
      storeBackground: () => Promise.resolve({ assetId: castId<AssetId>("asset_bg"), hash: "deadbeef" }),
      newBackgroundEntryId: () => "entry_1",
    });

    expect(report.backgroundsImported).toBe(0);
    expect(report.skippedBackgrounds).toEqual([
      {
        file: "backgrounds/dungeon.png",
        reason: "stored in your media library but NOT attached to the background picker — the appearance applier is not wired into this composition",
      },
    ]);
  });
});
