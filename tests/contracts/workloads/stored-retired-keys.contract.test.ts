// @subject packages/contracts/src/workloads/result.ts
// @subject packages/contracts/src/chat/metadata.ts
import { groupConfigSchema, storedGroupConfigSchema } from "@orb/contracts/chat";
import { workloadResultSchemaOf } from "@orb/contracts/workloads";
import { expect, test } from "@orb/testkit/node";

// A strict schema on a stored column refuses a key it no longer declares. A row written before the key was
// retired must still read, or the list that holds it fails whole.

test("a token-usage backfill result stored with the retired owner census keys still reads, and the view no longer carries them", () => {
  const stored = {
    scanned: 9,
    exactRecovered: 1,
    legacyPromoted: 2,
    estimated: 3,
    alreadyMeasured: 1,
    alreadyEstimated: 1,
    compareAndSetSkipped: 1,
    dryRun: false,
  };
  const parse = workloadResultSchemaOf("import-token-usage-backfill");
  expect(parse.parse({ ...stored, ownersScanned: 4, ownersReconciled: 2 })).toEqual(stored);
  expect(parse.safeParse({ ...stored, neverDeclared: 1 }).success).toBe(false);
});

test("a bundle import result stored before imports carried a scope reads as having none", () => {
  const stored = { imported: 2, skipped: 0, failed: 0, notes: [] };
  expect(workloadResultSchemaOf("import-bundle").parse(stored)).toEqual({ ...stored, memoryScope: null });
});

test("a stored group config carrying the retired groupCharacterId keeps its mode, while the write door still refuses the key", () => {
  const withRetired = { output: "narrator", policy: "natural", groupCharacterId: "character_retired" };
  const read = storedGroupConfigSchema.parse(withRetired);
  expect(read.output).toBe("narrator");
  expect(read).not.toHaveProperty("groupCharacterId");
  expect(groupConfigSchema.safeParse(withRetired).success).toBe(false);
});
