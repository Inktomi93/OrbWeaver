// The ST profile-DIRECTORY bulk-import driver — the composition the `import-st` workload runs through
// (`ctx.env.import.importAll`). Where `run-profile-import.ts` takes already-extracted card files, this walks
// a staged ST profile snapshot on disk: the configured root holds ONE subdirectory per ST user profile
// (`<userDir>/characters/*.png`, `<userDir>/chats/<charDir>/*.jsonl`, `<userDir>/settings.json`,
// `<userDir>/User Avatars/`). Each subdir is collected through the injected `ImportFsPort` (the loader stays
// node:fs-free) and imported into the ONE target owner.
//
// FLOW (real run): collect every user dir → store persona avatars + `importPersonas` FIRST (populates the
// cross-verb `personaByUserName` map the chat importers attribute against) → per bundle `importCharacter`
// (idempotent by importHash; the card PNG is CAS-stored inside the verb) then `importChats`, then attach the
// character's ST library tags (`settings.tag_map[card filename]` → resolve-or-create by name). Counts follow
// the maintenance-pass shape: `scanned` = every ST entity the loader examined (bundles + personas + chat
// files + the recorded non-happy-path skips), `changed` = net-new canon written (created characters +
// created personas + imported chats). The runner reconciles stats post-run when `changed > 0` (PD-78); a
// chat write enqueues the memory backfill via the injected op (PD-78).
//
// dryRun: parse + collect + the read-only dedup MATCH only — ZERO writes. The import verbs have no
// write-free mode, so the driver never calls them under `dryRun`; it predicts the character-create count via
// the (read-only) importHash + handle oracles. Persona/chat dedup can't be predicted without the write op,
// so `changed` under `dryRun` reflects character creates only (documented; the invariant the runner cares
// about is zero writes).
//
// PD-94: every avatar/card blob is stored through a `maxBytes`-capped store — the zip-bomb belt for this
// non-HTTP caller (the store seam rejects an over-cap blob before the CAS write).

import type { Dirent } from "node:fs";
import { readdir as readdirFs, readFile as readFileFs, stat as statFs } from "node:fs/promises";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { BulkImportChats } from "#domain/chat";
import type { CollectedCard, CollectedPersona, CollectedWorld, ImportFsPort, ImportPersonaInput, ImportReport, ImportSkippedCard } from "#domain/import";
import { collectBundlesFromDir, createImportService, importFileHash } from "#domain/import";
import type { BulkImportPersonas } from "#domain/persona";
import type { ImportStandaloneLorebook } from "#domain/world-info";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort, ImportWorldInfoPort } from "./build-import-context.ts";
import { buildImportContext } from "./build-import-context.ts";

const AVATAR_MIME = "image/png";

export interface ProfileDirImportDeps {
  readonly fs: ImportFsPort;
  /** The root holding one subdir per ST user profile (the loader collects each subdir independently). */
  readonly profileRoot: string;
  readonly principal: Principal;
  readonly character: ImportCharacterPort;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly attachCardTag: ImportTagPort["attachCardTagByName"];
  readonly importLorebook?: ImportWorldInfoPort["importLorebook"];
  readonly linkCarriedBooks?: ImportWorldInfoPort["linkCarriedBooks"];
  /** The UNATTACHED owner-library book write — the standalone `worlds/*.json` land through this (no character
   *  attach). Imported BEFORE characters so a future name-link (`extensions.world`) can resolve them. */
  readonly importStandaloneLorebook: ImportStandaloneLorebook;
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly enqueueBackfill: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly now: () => number;
  readonly dryRun: boolean;
  readonly signal: AbortSignal;
}

interface Collected {
  readonly bundles: CollectedCard[];
  readonly personas: CollectedPersona[];
  readonly worlds: CollectedWorld[];
  /** ST library-tag assignments merged across every profile dir: card/avatar filename → tag names. */
  readonly tagsByEntityKey: ReadonlyMap<string, readonly string[]>;
  /** examined-but-not-imported records (unreadable cards/worlds, oversized/orphan chats, skip-listed characters). */
  readonly skipped: number;
  /** The per-profile "not imported" records, merged across every user dir — the import report's raw material. */
  readonly unreadableCards: string[];
  readonly unreadableWorlds: string[];
  readonly skippedChats: string[];
  readonly orphanChatDirs: string[];
  readonly skippedCharacters: string[];
  readonly unhandled: string[];
  readonly unhandledSettings: string[];
}

/** Collect every user-profile subdirectory under the root, merging the per-dir results into one set. A
 *  non-profile entry (a stray file, a `_cache` dir with no `characters/`) yields an empty collect and adds
 *  nothing — the loader's port returns `[]` for a missing subdir rather than throwing. */
async function collectProfileRoot(deps: ProfileDirImportDeps): Promise<Collected> {
  const { fs, profileRoot, signal } = deps;
  const bundles: CollectedCard[] = [];
  const personas: CollectedPersona[] = [];
  const worlds: CollectedWorld[] = [];
  // card/avatar filename → tag names, unioned across dirs (a filename can recur across profiles).
  const tagsByEntityKey = new Map<string, string[]>();
  const r = {
    unreadableCards: [] as string[],
    unreadableWorlds: [] as string[],
    skippedChats: [] as string[],
    orphanChatDirs: [] as string[],
    skippedCharacters: [] as string[],
    unhandled: [] as string[],
    unhandledSettings: [] as string[],
  };
  for (const ent of await fs.readdir(profileRoot)) {
    if (signal.aborted) {
      break;
    }
    if (ent.kind !== "directory") {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: user dirs are collected sequentially — a one-time bulk-import scan, not a hot path.
    const result = await collectBundlesFromDir(fs, fs.join(profileRoot, ent.name));
    bundles.push(...result.bundles);
    personas.push(...result.personas);
    worlds.push(...result.worlds);
    for (const [key, names] of result.tagsByEntityKey) {
      const merged = tagsByEntityKey.get(key) ?? [];
      for (const name of names) {
        if (!merged.includes(name)) {
          merged.push(name);
        }
      }
      tagsByEntityKey.set(key, merged);
    }
    r.unreadableCards.push(...result.unreadableCards);
    r.unreadableWorlds.push(...result.unreadableWorlds);
    r.skippedChats.push(...result.skippedChats);
    r.orphanChatDirs.push(...result.orphanChatDirs);
    r.skippedCharacters.push(...result.skippedCharacters);
    r.unhandled.push(...result.unhandled);
    r.unhandledSettings.push(...result.unhandledSettings);
  }
  const skipped = r.unreadableCards.length + r.unreadableWorlds.length + r.skippedChats.length + r.skippedCharacters.length + r.orphanChatDirs.length;
  return { bundles, personas, worlds, tagsByEntityKey, skipped, ...r };
}

/** scanned = every examined ST entity: happy-path bundles + personas + chat files, plus the recorded skips. */
function tallyScanned(collected: Collected): number {
  let scanned = collected.bundles.length + collected.personas.length + collected.worlds.length + collected.skipped;
  for (const b of collected.bundles) {
    scanned += b.chats.length;
  }
  return scanned;
}

/** dryRun prediction: a card writes iff neither the byte-identical importHash oracle nor the handle oracle
 *  matches (a create). Both lookups are reads — zero writes. Personas/chats can't be predicted without their
 *  write op, so they are examined (counted in scanned) but never in the dryRun `changed`. */
async function countWouldCreate(deps: ProfileDirImportDeps, bundles: readonly CollectedCard[]): Promise<number> {
  const ownerId = deps.principal.userId;
  let changed = 0;
  for (const b of bundles) {
    if (deps.signal.aborted) {
      break;
    }
    const importHash = importFileHash(b.cardBytes);
    // biome-ignore lint/performance/noAwaitInLoops: dedup oracles are probed sequentially per bundle during the one-time dry scan.
    const byHash = await deps.character.findByImportHash({ ownerId, importHash });
    if (byHash !== null) {
      continue;
    }
    const byHandle = await deps.character.findByHandle({ ownerId, handle: b.handle });
    if (byHandle === null) {
      changed += 1;
    }
  }
  return changed;
}

/** Store one persona's avatar (PD-94-capped) and pair it into the canonical persona-import input. */
async function toPersonaInput(store: ImportAssetPort["store"], principal: Principal, p: CollectedPersona): Promise<ImportPersonaInput> {
  let avatarAssetId: AssetId | null = null;
  if (p.avatarBytes !== undefined) {
    const stored = await store({
      principal,
      bytes: p.avatarBytes,
      kind: "avatar",
      mime: AVATAR_MIME,
      // One single-asset ceiling repo-wide — the profile importer deliberately shares the upload cap.
      maxBytes: ASSET_UPLOAD_MAX_BYTES,
    });
    avatarAssetId = stored.assetId;
  }
  return { parsed: p.parsed, avatarAssetId };
}

/** Import the collected standalone ST worlds as UNATTACHED owner library books; returns the net-new count
 *  (a name-collision re-import replaces in place and is not counted). Aborts cleanly on signal. */
async function importCollectedWorlds(deps: ProfileDirImportDeps, worlds: readonly CollectedWorld[]): Promise<number> {
  let created = 0;
  for (const world of worlds) {
    if (deps.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: worlds are imported sequentially during the one-time bulk import, not a hot path.
    const bookResult = await deps.importStandaloneLorebook({ ownerId: deps.principal.userId, book: world.book });
    if (!bookResult.replaced) {
      created += 1;
    }
  }
  return created;
}

/** Assemble the import report from the merged collect results + the run's counts + the per-card skips. The
 *  two structure planes (`unhandled`/`unhandledSettings`) are deduped — a multi-profile upload lists the same
 *  section names per user dir. */
function reportFrom(collected: Collected, scanned: number, changed: number, skippedCards: readonly ImportSkippedCard[]): ImportReport {
  return {
    scanned,
    changed,
    skippedCards,
    unreadableCards: collected.unreadableCards,
    unreadableWorlds: collected.unreadableWorlds,
    skippedChats: collected.skippedChats,
    orphanChatDirs: collected.orphanChatDirs,
    skippedCharacters: collected.skippedCharacters,
    unhandled: [...new Set(collected.unhandled)],
    unhandledSettings: [...new Set(collected.unhandledSettings)],
  };
}

/** Import one collected card bundle: the character (idempotent by importHash) then its chats. Returns the
 *  net-new count (created character + imported chats) and the resolved character id (for the tag attach).
 *  Throws are the CALLER's to isolate. */
async function importOneBundle(
  service: ReturnType<typeof createImportService>,
  bundle: CollectedCard,
): Promise<{ readonly changed: number; readonly characterId: CharacterId }> {
  let changed = 0;
  const cardResult = await service.importCharacter({ card: { bytes: bundle.cardBytes, filename: bundle.filename } });
  if (cardResult.created) {
    changed += 1;
  }
  if (bundle.chats.length > 0) {
    const chatResult = await service.importChats({ characterId: cardResult.characterId, chats: bundle.chats });
    changed += chatResult.chatsImported;
  }
  return { changed, characterId: cardResult.characterId };
}

/** Attach the ST library tags for a just-imported character (`tag_map[card filename]` → resolve-or-create by
 *  NAME). Source `manual`/status `accepted` — these are the user's own library tags, not a card-shipped
 *  suggestion. The attaches are independent and the verb is race-safe/idempotent (try-insert, fall back on
 *  conflict; never downgrades an accepted row), so they run together; `allSettled` isolates a single tag's
 *  failure so one bad tag never loses the already-imported character. */
function attachBundleTags(deps: ProfileDirImportDeps, characterId: CharacterId, tagNames: readonly string[]): Promise<unknown> {
  const ownerId = deps.principal.userId;
  return Promise.allSettled(tagNames.map((tagName) => deps.attachCardTag({ ownerId, characterId, tagName, source: "manual", status: "accepted" })));
}

/** Import every collected card bundle with PER-CARD ISOLATION: a bundle that throws (an oversized field, a
 *  malformed embedded book, any single-card defect) is skipped and counted in `failed` — it NEVER aborts the
 *  batch. Across hundreds of arbitrary ST cards some will always violate some cap; the import must still land
 *  every card that CAN import. Returns net-new `changed` + the `failed` count. */
async function importCollectedBundles(
  deps: ProfileDirImportDeps,
  service: ReturnType<typeof createImportService>,
  bundles: readonly CollectedCard[],
  tagsByEntityKey: ReadonlyMap<string, readonly string[]>,
): Promise<{ readonly changed: number; readonly skippedCards: ImportSkippedCard[] }> {
  let changed = 0;
  const skippedCards: ImportSkippedCard[] = [];
  for (const bundle of bundles) {
    if (deps.signal.aborted) {
      break;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: bulk import is intentionally sequential — each card is one atomic idempotent write, isolated per bundle.
      const result = await importOneBundle(service, bundle);
      changed += result.changed;
      const tagNames = tagsByEntityKey.get(bundle.filename);
      if (tagNames !== undefined && tagNames.length > 0) {
        await attachBundleTags(deps, result.characterId, tagNames);
      }
    } catch (err) {
      // The concise refusal reason for the report — the last line of a ZodError prettify is the actionable
      // one ("Too big: expected string to have <=200 characters → at cardVersion").
      const message = err instanceof Error ? err.message : String(err);
      skippedCards.push({ file: bundle.filename, reason: message.split("\n").filter(Boolean).at(-1) ?? message });
    }
  }
  return { changed, skippedCards };
}

/**
 * Import a staged ST profile-directory snapshot into the target owner. Returns the maintenance-pass counts
 * (scanned + changed). `dryRun` collects + matches with ZERO writes.
 */
export async function runProfileDirImport(deps: ProfileDirImportDeps): Promise<ImportReport> {
  const collected = await collectProfileRoot(deps);
  const scanned = tallyScanned(collected);

  if (deps.dryRun) {
    return reportFrom(collected, scanned, await countWouldCreate(deps, collected.bundles), []);
  }

  // The card avatar is CAS-stored inside importCharacter via ctx.storeAsset → this capped store (PD-94).
  const store: ImportAssetPort["store"] = (params) => deps.storeAvatar({ ...params, maxBytes: ASSET_UPLOAD_MAX_BYTES });
  // Post-import embedding is enqueued ONCE at the very end of the whole import (below, gated on `changed > 0`)
  // — NOT per character. Reasons: (1) the per-(kind, owner) admission lock makes a per-entity enqueue collide,
  // and an unhandled conflict aborts the import mid-loop (the "only 2 of hundreds imported" bug); (2) the embed
  // passes (characters then chats) must run AFTER the whole import, never while it is still writing. So the
  // per-chat `enqueueBackfill` the importChats verb calls is a NO-OP here — the driver owns the one enqueue.
  const ctx = buildImportContext({
    principal: deps.principal,
    character: deps.character,
    storeAvatar: store,
    attachCardTag: deps.attachCardTag,
    ...(deps.importLorebook !== undefined ? { importLorebook: deps.importLorebook } : {}),
    ...(deps.linkCarriedBooks !== undefined ? { linkCarriedBooks: deps.linkCarriedBooks } : {}),
    profile: {
      now: deps.now,
      personaByUserName: new Map(),
      bulkImportChats: deps.bulkImportChats,
      bulkImportPersonas: deps.bulkImportPersonas,
      enqueueBackfill: (): Promise<void> => Promise.resolve(),
      reconcileStats: deps.reconcileImportStats,
    },
  });
  const service = createImportService(ctx);

  let changed = 0;

  // Personas FIRST — populates personaByUserName so the chat importers can attribute their user_names.
  const personaInputs: ImportPersonaInput[] = [];
  for (const p of collected.personas) {
    if (deps.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: avatars are stored sequentially during the one-time bulk import (a short persona list), not a hot path.
    personaInputs.push(await toPersonaInput(store, deps.principal, p));
  }
  if (personaInputs.length > 0) {
    const personaResult = await service.importPersonas({ personas: personaInputs });
    changed += personaResult.personasCreated;
  }

  // Standalone ST worlds BEFORE characters — imported as UNATTACHED owner library books (dedup by name). Ahead
  // of the character wave so a future card name-link (`extensions.world`) can resolve an already-imported book.
  changed += await importCollectedWorlds(deps, collected.worlds);

  const bundleResult = await importCollectedBundles(deps, service, collected.bundles, collected.tagsByEntityKey);
  changed += bundleResult.changed;

  // ONE post-import embed enqueue for the whole run, gated on new canon (characters/personas/chats/worlds) —
  // the op chains embed-characters → embed-chats via dependsOn (see portability-runner). Triggered on ANY new
  // canon, not just a chat, so a characters-only import still embeds its cards. Skipped on abort (retry re-runs).
  if (changed > 0 && !deps.signal.aborted) {
    await deps.enqueueBackfill({ ownerId: deps.principal.userId });
  }

  return reportFrom(collected, scanned, changed, bundleResult.skippedCards);
}

type FsEntry = Awaited<ReturnType<ImportFsPort["readdir"]>>[number];

function direntKind(e: Dirent): FsEntry["kind"] {
  if (e.isFile()) {
    return "file";
  }
  return e.isDirectory() ? "directory" : "other";
}

/** The real node:fs `ImportFsPort` for the staged profile snapshot. `readdir` resolves `[]` for a
 *  missing/unreadable dir (the port contract — a profile may carry only one subdir), never throwing. */
export function createNodeFsImportPort(): ImportFsPort {
  return {
    readdir: async (dir): Promise<readonly FsEntry[]> => {
      try {
        const ents = await readdirFs(dir, { withFileTypes: true });
        return ents.map((e): FsEntry => ({ name: e.name, kind: direntKind(e) }));
      } catch {
        return [];
      }
    },
    readFile: (path): Promise<Uint8Array> => readFileFs(path),
    stat: async (path): Promise<{ readonly size: number }> => {
      const s = await statFs(path);
      return { size: s.size };
    },
    join: (...parts): string => join(...parts),
  };
}
