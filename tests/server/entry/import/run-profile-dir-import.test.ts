// entry/import/run-profile-dir-import — the ST profile-DIRECTORY bulk importer the `import-st` workload runs
// (`ctx.env.import.importAll`). Pins the load-bearing composition over an in-memory ImportFsPort fixture +
// recording/stateful fake ports (fake-at-the-edges, inject-at-the-root): personas import BEFORE chats (the
// attribution map), per-bundle character-then-chats, the {scanned, changed} maintenance tally, the
// maxBytes cap on every stored blob, dryRun's ZERO-write prediction, and idempotency (a byte-identical
// second run scans the same set but changes nothing).
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportFsPort } from "@orb/server/domain/import";
import { createNodeFsImportPort, runProfileDirImport } from "@orb/server/entry/import";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { cardPng, chatJsonl, deps, ENC, fakes, fixtureFiles, memoryFs, OWNER } from "./_profile-dir-import-support.ts";

describe("runProfileDirImport", () => {
  test("sorts a directory before applying the collector entry ceiling", async () => {
    const cardPath = "root/userA/characters/a.png";
    const base = memoryFs({ [cardPath]: cardPng("A") });
    const filesystemOrder: { name: string; kind: "file" | "other" }[] = Array.from({ length: 100_000 }, (_unused, i) => ({
      name: `z-${String(i).padStart(6, "0")}`,
      kind: "other",
    }));
    filesystemOrder.push({ name: "a.png", kind: "file" });
    const fs: ImportFsPort = {
      ...base,
      readdir: (dir) => (dir === "root/userA/characters" ? Promise.resolve(filesystemOrder) : base.readdir(dir)),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.changed).toBe(1);
    expect(f.log).toContain("character.create");
  });

  test("rejects an oversized non-chat candidate from stat before reading it", async () => {
    const cardPath = "root/userA/characters/Aria.png";
    const base = memoryFs({ [cardPath]: cardPng("Aria") });
    const reads: string[] = [];
    const fs: ImportFsPort = {
      ...base,
      readFile: (path) => {
        reads.push(path);
        return base.readFile(path);
      },
      stat: (path) => (path === cardPath ? Promise.resolve({ size: ASSET_UPLOAD_MAX_BYTES + 1 }) : base.stat(path)),
    };

    await expect(runProfileDirImport(deps(fs, fakes()))).rejects.toMatchObject({
      name: "ProfileImportLimitError",
      code: "profile_file_too_large",
    });
    expect(reads).not.toContain(cardPath);
  });

  test("rejects before reading the candidate that would exceed the direct-profile aggregate budget", async () => {
    const files: Record<string, Uint8Array> = {};
    const cardPaths: string[] = [];
    for (let i = 0; i < 17; i += 1) {
      const path = `root/user-${String(i).padStart(2, "0")}/characters/Card-${i}.png`;
      files[path] = cardPng(`Card ${i}`);
      cardPaths.push(path);
    }
    const base = memoryFs(files);
    const reads: string[] = [];
    const fs: ImportFsPort = {
      ...base,
      readFile: (path) => {
        reads.push(path);
        return base.readFile(path);
      },
      stat: (path) => (cardPaths.includes(path) ? Promise.resolve({ size: ASSET_UPLOAD_MAX_BYTES }) : base.stat(path)),
    };

    await expect(runProfileDirImport(deps(fs, fakes()))).rejects.toMatchObject({
      name: "ProfileImportLimitError",
      code: "profile_total_too_large",
    });
    expect(reads.filter((path) => cardPaths.includes(path))).toHaveLength(16);
    expect(reads).not.toContain(cardPaths[16]);
  });

  test("imports personas → per-bundle character + chats, tallying scanned/changed", async () => {
    const fs = memoryFs(fixtureFiles("root"));
    const f = fakes();

    const result = await runProfileDirImport(deps(fs, f));

    // scanned = 1 bundle + 1 persona + 1 chat file; changed = 1 persona created + 1 char + 1 chat imported.
    expect(result.scanned).toBe(3);
    expect(result.changed).toBe(3);
    // Personas MUST be written before the chat importer (it attributes user_names against them).
    expect(f.log.indexOf("bulkImportPersonas")).toBeLessThan(f.log.indexOf("bulkImportChats"));
    expect(f.log.indexOf("bulkImportPersonas")).toBeLessThan(f.log.indexOf("character.create"));
    // Every stored blob (persona avatar + the card PNG) carries the maxBytes cap.
    expect(f.stores).toHaveLength(2);
    for (const s of f.stores) {
      expect(s.maxBytes).toBe(ASSET_UPLOAD_MAX_BYTES);
    }
    // A real_conversation chat is the memory offer's scope; the run's one enqueue is the free index pass.
    expect(f.memoryChatIds).toHaveLength(1);
    expect(result.memoryChatIds).toEqual(f.memoryChatIds);
    expect(f.indexEnqueues).toEqual([OWNER.userId]);
  });

  test("dryRun predicts the create count with ZERO writes", async () => {
    const fs = memoryFs(fixtureFiles("root"));
    const f = fakes();

    const result = await runProfileDirImport(deps(fs, f, { dryRun: true }));

    expect(result.scanned).toBe(3);
    // one would-be-created character (fresh owner: no importHash/handle match); personas/chats not predicted.
    expect(result.changed).toBe(1);
    // No write op fired — no store, no create, no bulk import, no index enqueue.
    expect(f.stores).toHaveLength(0);
    expect(f.log).toHaveLength(0);
    expect(f.indexEnqueues).toHaveLength(0);
    expect(result.memoryChatIds).toEqual([]);
  });

  test("standalone worlds import as UNATTACHED library books, BEFORE characters, counted in the tally", async () => {
    // A native ST world-info file (entries keyed by uid; `key`/`order`/`disable` field spellings) lives in
    // `worlds/`. It must import as an owner library book (never a character attach) and be written before the
    // character wave.
    const stWorld = JSON.stringify({
      entries: {
        "0": { uid: 0, key: ["eldoria"], comment: "Eldoria", content: "A magical forest.", position: 0, order: 100, constant: false, disable: false },
        "1": { uid: 1, key: ["dragon"], comment: "Dragon", content: "Hoards gold.", position: 4, depth: 3, role: 1, order: 50, constant: true, disable: true },
      },
    });
    const files = { ...fixtureFiles("root"), "root/userA/worlds/Eldoria.json": ENC.encode(stWorld) };
    const fs = memoryFs(files);
    const f = fakes();

    const result = await runProfileDirImport(deps(fs, f));

    // The world imported as a library book, by its filename stem.
    expect(f.standaloneBooks).toEqual(["Eldoria"]);
    // scanned now = 1 bundle + 1 persona + 1 chat + 1 world; changed = persona + world + char + chat = 4.
    expect(result.scanned).toBe(4);
    expect(result.changed).toBe(4);
    // Worlds are written before the first character (a name-link would resolve against them).
    expect(f.log.indexOf("character.create")).toBeGreaterThanOrEqual(0);
  });

  test("MANY characters with chats import fully + enqueue EXACTLY ONE index pass (no per-character abort)", async () => {
    // Regression: the post-import enqueue used to fire per character that wrote a real conversation. The
    // second such enqueue collided on the per-(kind, owner) admission lock and, unhandled, aborted the whole
    // import mid-loop — "hundreds of characters, only 2 imported". There is now ONE enqueue,
    // after the entire import, so every character lands and embeddings never run mid-import.
    const files: Record<string, Uint8Array> = {};
    for (const name of ["Aria", "Bryn", "Cleo", "Dex"]) {
      files[`root/userA/characters/${name}.png`] = cardPng(name);
      files[`root/userA/chats/${name}/chat1.jsonl`] = ENC.encode(chatJsonl("Alex", name));
    }
    const fs = memoryFs(files);
    const f = fakes();

    const result = await runProfileDirImport(deps(fs, f));

    // 4 characters + 4 chats all imported (no abort after the second).
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(4);
    expect(f.log.filter((l) => l === "bulkImportChats")).toHaveLength(4);
    expect(result.changed).toBe(8); // 4 chars + 4 chats (no personas in this fixture)
    // EXACTLY ONE index enqueue for the whole import — not one per character, and never a thrown conflict —
    // and every character's written conversation in the memory offer's scope.
    expect(f.indexEnqueues).toEqual([OWNER.userId]);
    expect(f.memoryChatIds).toHaveLength(4);
    expect(result.memoryChatIds).toEqual(f.memoryChatIds);
  });

  test("ST library tags (settings.tags + tag_map) attach to the matching character by card filename", async () => {
    // ST assigns library tags by the character's avatar filename (the card PNG name). The importer resolves
    // tag_map ids → names against `tags` and attaches them to the imported character as manual/accepted.
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardPng("Aria"),
      "root/userA/settings.json": ENC.encode(
        JSON.stringify({
          tags: [
            { id: "10", name: "Fantasy" },
            { id: "20", name: "Romance" },
          ],
          tag_map: { "Aria.png": ["10", "20"], "Ghost.png": ["10"] },
        }),
      ),
    };
    const fs = memoryFs(files);
    const f = fakes();

    await runProfileDirImport(deps(fs, f));

    // Only Aria imported (no Ghost.png card) → only Aria's tags attach, both by NAME, manual/accepted.
    expect(f.tagAttaches).toEqual([
      { characterId: castId<CharacterId>("chr_1"), tagName: "Fantasy", source: "manual", status: "accepted" },
      { characterId: castId<CharacterId>("chr_1"), tagName: "Romance", source: "manual", status: "accepted" },
    ]);
  });

  test("dryRun attaches NO tags (zero writes)", async () => {
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardPng("Aria"),
      "root/userA/settings.json": ENC.encode(JSON.stringify({ tags: [{ id: "10", name: "Fantasy" }], tag_map: { "Aria.png": ["10"] } })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    await runProfileDirImport(deps(fs, f, { dryRun: true }));

    expect(f.tagAttaches).toHaveLength(0);
  });

  // §5.7 — ST's chat-bound persona pick, at the WHOLE-RUN tier: the persona wave must have populated the
  // name map before the chat wave reads the pin, and an unresolvable pick has to reach the operator's report
  // rather than dying in the mapper. (The column-level resolution proof lives in st-chat-fidelity.suite.)
  test("a chat's ST pinnedPersona resolves against the personas this run imported", async () => {
    const files = {
      ...fixtureFiles("root"),
      // ST's real shape on a pinned chat: the header user_name is the `unused` sentinel, so the PIN is the
      // only signal of who the user was.
      "root/userA/chats/Aria/pinned.jsonl": ENC.encode(chatJsonl("unused", "Aria", { pinnedPersona: "Alex" })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    const written = f.chatWrites.flatMap((w) => w.chats);
    const pinned = written.find((c) => c.importedFrom === "pinned.jsonl");
    // The persona wave minted exactly one persona ("Alex"), and the pin resolved onto it.
    expect(pinned?.anchorPersonaId).toBe(castId<PersonaId>(`persona_${"1".padStart(26, "0")}`));
    expect(report.unresolvedPinnedPersonas).toEqual([]);
  });

  test("an UNRESOLVABLE pinnedPersona is reported, never guessed, and never blocks the chat", async () => {
    const files = {
      ...fixtureFiles("root"),
      "root/userA/chats/Aria/orphan-pin.jsonl": ENC.encode(chatJsonl("unused", "Aria", { pinnedPersona: "Ghost" })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.unresolvedPinnedPersonas).toEqual([{ chat: "orphan-pin.jsonl", persona: "Ghost" }]);
    // The chat still imported — an unresolved pick costs the pick, never the transcript. And no near-match:
    // "Ghost" did NOT quietly land on the run's only persona.
    const orphan = f.chatWrites.flatMap((w) => w.chats).find((c) => c.importedFrom === "orphan-pin.jsonl");
    expect(orphan).toBeDefined();
    expect(orphan?.anchorPersonaId).toBeNull();
  });

  test("idempotent: a byte-identical second run scans the same set, changes nothing", async () => {
    const fs = memoryFs(fixtureFiles("root"));
    const f = fakes();

    const first = await runProfileDirImport(deps(fs, f));
    expect(first.changed).toBe(3);

    const second = await runProfileDirImport(deps(fs, f));
    expect(second.scanned).toBe(3);
    expect(second.changed).toBe(0);
    // The second run creates no new character (the importHash oracle short-circuits before any store).
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(1);
  });
});

describe("createNodeFsImportPort", () => {
  test("readdir resolves [] for a missing dir instead of throwing", async () => {
    const fs = createNodeFsImportPort();
    await expect(fs.readdir("/no/such/orbweaver/profile/dir")).resolves.toEqual([]);
  });

  // #1469 — EVERY readdir error folded into `[]`, so an infrastructure fault (a symlink loop, an EACCES on a
  // staged profile whose permissions did not survive the copy, EIO on a failing mount) read as "that plane is
  // empty" and the import reported success over a truncated profile. ABSENT stays absent; BROKEN now rejects,
  // and the collector turns the rejection into `ImportInfraFailureError` naming the dir.
  test("readdir REJECTS on an INFRASTRUCTURE fault (a symlink loop) instead of reporting the plane empty", async () => {
    const fs = createNodeFsImportPort();
    const base = await mkdtemp(join(tmpdir(), "pib-loop-"));
    // A two-link cycle: reading either resolves forever → ELOOP, the documented infra class, reproducible
    // regardless of which uid the suite runs as (a chmod-000 dir is still readable as root).
    await symlink(join(base, "b"), join(base, "a"));
    await symlink(join(base, "a"), join(base, "b"));
    try {
      await expect(fs.readdir(join(base, "a"))).rejects.toMatchObject({ code: "ELOOP" });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("a path that is a FILE, not a dir, stays the documented ABSENT case (ENOTDIR ⇒ [])", async () => {
    const fs = createNodeFsImportPort();
    const base = await mkdtemp(join(tmpdir(), "pib-file-"));
    const notADir = join(base, "worlds");
    await writeFile(notADir, "x");
    try {
      // A profile that carries a FILE where a plane's directory would be has no such plane — the same
      // "absent, not broken" reading the reports-ring reader had to learn.
      await expect(fs.readdir(notADir)).resolves.toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
