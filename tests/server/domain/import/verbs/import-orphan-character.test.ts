// domain/import/verbs/import-orphan-character — the ORPHAN-dir placeholder mint (the silent-gap sweep,
// 2026-08-15). Pins the EVIDENCE RULE (majority non-sentinel header name, else the humanized dir name;
// description stays EMPTY — never invented prose), the synthetic dir-keyed importHash idempotency, and the
// free-handle probe. The 7 real corpus dirs (Aestel/Ana/Bonnie_Cow/Diana/Mako/Misery/Sala) are the shapes
// these fixtures mirror: 6 of their 8 headers carry ST's literal `"unused"` sentinel, one carries "Diana".

import type { CreateCharacterInput } from "@orb/contracts/character";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportContext } from "@orb/server/domain/import";
import { createImportService } from "@orb/server/domain/import";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_owner");

interface MintRecord {
  readonly input: CreateCharacterInput;
  readonly importedFrom: string | null;
  readonly importHash: string;
}

/** A stateful character fake: dedup by importHash + handle occupancy, recording every mint. */
function ctxWith(takenHandles: readonly string[] = []): { ctx: ImportContext; mints: MintRecord[] } {
  const unused = (): never => {
    throw new Error("unexpected op call");
  };
  const byHash = new Map<string, CharacterId>();
  const handles = new Set<string>(takenHandles);
  const mints: MintRecord[] = [];
  let seq = 0;
  const ctx: ImportContext = {
    ownerId: OWNER,
    createCharacter: ({ input, importedFrom, importHash }) => {
      seq += 1;
      const id = castId<CharacterId>(`chr_${seq}`);
      byHash.set(importHash, id);
      handles.add(input.handle);
      mints.push({ input, importedFrom, importHash });
      return Promise.resolve({ characterId: id });
    },
    findByImportHash: ({ importHash }) => Promise.resolve(byHash.get(importHash) ?? null),
    findByHandle: ({ handle }) => Promise.resolve(handles.has(handle) ? castId<CharacterId>("chr_taken") : null),
    storeAsset: unused,
    attachCardTag: unused,
  };
  return { ctx, mints };
}

/** hex-64 — the sha256Hex output shape the synthetic oracle key must produce. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

const BONNIE: { dirName: string; handle: CharacterHandle; headerNames: string[] } = {
  dirName: "Bonnie_Cow",
  handle: castId<CharacterHandle>("bonnie-cow"),
  headerNames: ["unused"],
};

describe("importOrphanCharacter", () => {
  test("mints a husk from the dir's own evidence: humanized dir name, EMPTY description, provenance stamped", async () => {
    const { ctx, mints } = ctxWith();
    const result = await createImportService(ctx).importOrphanCharacter(BONNIE);

    expect(result.created).toBe(true);
    // The corpus's dominant case: every header is ST's `"unused"` sentinel — the DIR NAME is the evidence.
    expect(result.name).toBe("Bonnie Cow");
    expect(mints).toHaveLength(1);
    expect(mints[0]?.input).toEqual({ handle: "bonnie-cow", name: "Bonnie Cow", description: "" });
    expect(mints[0]?.importedFrom).toBe("chats/Bonnie_Cow");
  });

  test("a real (non-echo) header name WINS over the dir name", async () => {
    const { ctx } = ctxWith();
    const result = await createImportService(ctx).importOrphanCharacter({
      dirName: "Diana",
      handle: castId<CharacterHandle>("diana"),
      // One genuinely-authored header name beside a sentinel. NOTE: a header EQUAL to the dir name is not
      // evidence — the serde substitutes the dir name for a sentinel header, so that spelling is an echo.
      headerNames: ["Princess Diana", "unused", "Diana"],
    });
    expect(result.name).toBe("Princess Diana");
  });

  test("re-running resolves the SAME row via the synthetic dir-keyed hash — zero second mints", async () => {
    const { ctx, mints } = ctxWith();
    const service = createImportService(ctx);

    const first = await service.importOrphanCharacter(BONNIE);
    const second = await service.importOrphanCharacter(BONNIE);

    expect(second.created).toBe(false);
    expect(second.characterId).toBe(first.characterId);
    expect(mints).toHaveLength(1);
    // The oracle key is NAMESPACED — structurally disjoint from a real card-file byte hash.
    expect(mints[0]?.importHash).toMatch(SHA256_HEX);
  });

  test("an occupied handle suffixes the MINT's handle (never adopts the owner's same-named character)", async () => {
    const { ctx, mints } = ctxWith(["bonnie-cow"]);
    const result = await createImportService(ctx).importOrphanCharacter(BONNIE);

    expect(result.created).toBe(true);
    expect(mints.map((m) => m.input.handle)).toEqual(["bonnie-cow-2"]);
  });
});
