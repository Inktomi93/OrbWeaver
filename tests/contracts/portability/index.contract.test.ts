import type { PortabilityRegistry, PortableEntity, PortableFile, PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_IMPORT_ORDER, PORTABLE_KINDS } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

// ── Kind membership: the closed set is EXACTLY the design's §2 eight, no more, no less ──────────────────
test("PORTABLE_KINDS pins the twelve portable entity kinds", () => {
  expect([...PORTABLE_KINDS]).toEqual([
    "character",
    "chat",
    "persona",
    "world-info",
    "regex",
    "databank",
    "preset",
    "theme",
    "user-settings",
    "tag",
    "gallery",
    "assets",
  ]);
});

// Exhaustiveness over the derived union: a Record<PortableKind, …> fails tsc if a member is added or removed,
// so the union can never silently drift from the tuple it derives from.
const KIND_SEEN: Record<PortableKind, true> = {
  character: true,
  chat: true,
  persona: true,
  "world-info": true,
  regex: true,
  databank: true,
  preset: true,
  theme: true,
  "user-settings": true,
  tag: true,
  gallery: true,
  assets: true,
};
test("PortableKind has no member beyond the tuple", () => {
  expect(Object.keys(KIND_SEEN).sort()).toEqual([...PORTABLE_KINDS].sort());
});

// ── The fixed dependency import order (the ONE cross-entity rule, as data) ──────────────────────────────
test("PORTABLE_IMPORT_ORDER pins the exact dependency order", () => {
  // personas / world-info / tags / regex before characters; characters + personas before chats. `regex`
  // lands before `character` so a bundled card's carried script references re-link to rows that already exist.
  expect([...PORTABLE_IMPORT_ORDER]).toEqual([
    "assets",
    "user-settings",
    "tag",
    "persona",
    "world-info",
    "regex",
    "character",
    "databank",
    "gallery",
    "preset",
    "theme",
    "chat",
  ]);
});

test("PORTABLE_IMPORT_ORDER is a permutation of PORTABLE_KINDS (every kind exactly once)", () => {
  expect([...PORTABLE_IMPORT_ORDER].sort()).toEqual([...PORTABLE_KINDS].sort());
});

// ── Shape pins: the descriptor + its aggregate the delivery core consumes ───────────────────────────────
const SAMPLE_OWNER = castId<UserId>("user-alice");

test("PortableEntity descriptor shape is buildable and iterable", async () => {
  const rows: readonly PortableFile[] = [{ filename: "my-preset.json", bytes: new Uint8Array([1, 2]) }];
  const descriptor: PortableEntity = {
    kind: "preset",
    dir: "presets/",
    ext: ".json",
    async *exportAll(_ownerId: UserId): AsyncIterable<PortableFile> {
      yield* rows;
    },
    importFile: async (_ownerId: UserId, file: PortableFile): Promise<PortableImportOutcome> => ({
      ok: true,
      created: file.bytes.length > 0,
    }),
  };

  expect(descriptor.kind).toBe("preset");
  expect(descriptor.dir).toBe("presets/");

  const files: PortableFile[] = [];
  for await (const f of descriptor.exportAll(SAMPLE_OWNER)) {
    files.push(f);
  }
  expect(files).toHaveLength(1);

  const outcome = await descriptor.importFile(SAMPLE_OWNER, {
    filename: "x.json",
    bytes: new Uint8Array([1]),
  });
  expect(outcome).toEqual({ ok: true, created: true });

  // The registry is just a readonly list of descriptors — the core iterates it.
  const registry: PortabilityRegistry = [descriptor];
  expect(registry).toHaveLength(1);
});

test("PortableImportOutcome carries an isolated failure without throwing", () => {
  const failed: PortableImportOutcome = { ok: false, error: "bad envelope" };
  expect(failed.ok).toBe(false);
  expect(failed.created).toBeUndefined();
  expect(failed.error).toBe("bad envelope");
});
