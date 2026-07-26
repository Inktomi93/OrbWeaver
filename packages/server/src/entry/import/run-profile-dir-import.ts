// The ST profile-DIRECTORY bulk-import driver — the composition the `import-st` workload runs through
// (`ctx.env.import.importAll`). Where `run-profile-import.ts` takes already-extracted card files, this walks
// a staged ST profile snapshot on disk: the configured root holds ONE subdirectory per ST user profile
// (`<userDir>/characters/*.png`, `<userDir>/chats/<charDir>/*.jsonl`, `<userDir>/settings.json`,
// `<userDir>/User Avatars/`). Each subdir is collected through the injected `ImportFsPort` (the loader stays
// node:fs-free) and imported into the ONE target owner.
//
// FLOW (real run): collect every user dir → store persona avatars + `importPersonas` FIRST (populates the
// cross-verb `personaByUserName` map the chat importers attribute against) → per bundle `importCharacter`
// (idempotent by importHash; the card PNG is CAS-stored inside the verb) then `importChats`. Counts follow
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
import type { AssetId, UserId } from "@orb/kit/ids";
import type { BulkImportChats } from "#domain/chat";
import type { CollectedCard, CollectedPersona, ImportFsPort, ImportPersonaInput } from "#domain/import";
import { collectBundlesFromDir, createImportService, importFileHash } from "#domain/import";
import type { BulkImportPersonas } from "#domain/persona";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort, ImportWorldInfoPort } from "./build-import-context";
import { buildImportContext } from "./build-import-context";

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
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly enqueueBackfill: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  readonly now: () => number;
  readonly dryRun: boolean;
  readonly signal: AbortSignal;
}

export interface ProfileDirImportResult {
  /** Every ST entity the loader examined (imported, deduped, or recorded as a non-happy-path skip). */
  readonly scanned: number;
  /** Net-new canon written: created characters + created personas + imported chats (0 under dryRun writes). */
  readonly changed: number;
}

interface Collected {
  readonly bundles: CollectedCard[];
  readonly personas: CollectedPersona[];
  /** examined-but-not-imported records (unreadable cards, oversized/orphan chats, skip-listed characters). */
  readonly skipped: number;
}

/** Collect every user-profile subdirectory under the root, merging the per-dir results into one set. A
 *  non-profile entry (a stray file, a `_cache` dir with no `characters/`) yields an empty collect and adds
 *  nothing — the loader's port returns `[]` for a missing subdir rather than throwing. */
async function collectProfileRoot(deps: ProfileDirImportDeps): Promise<Collected> {
  const { fs, profileRoot, signal } = deps;
  const bundles: CollectedCard[] = [];
  const personas: CollectedPersona[] = [];
  let skipped = 0;
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
    skipped += result.unreadableCards.length + result.skippedChats.length + result.skippedCharacters.length + result.orphanChatDirs.length;
  }
  return { bundles, personas, skipped };
}

/** scanned = every examined ST entity: happy-path bundles + personas + chat files, plus the recorded skips. */
function tallyScanned(collected: Collected): number {
  let scanned = collected.bundles.length + collected.personas.length + collected.skipped;
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

/**
 * Import a staged ST profile-directory snapshot into the target owner. Returns the maintenance-pass counts
 * (scanned + changed). `dryRun` collects + matches with ZERO writes.
 */
export async function runProfileDirImport(deps: ProfileDirImportDeps): Promise<ProfileDirImportResult> {
  const collected = await collectProfileRoot(deps);
  const scanned = tallyScanned(collected);

  if (deps.dryRun) {
    return { scanned, changed: await countWouldCreate(deps, collected.bundles) };
  }

  // The card avatar is CAS-stored inside importCharacter via ctx.storeAsset → this capped store (PD-94).
  const store: ImportAssetPort["store"] = (params) => deps.storeAvatar({ ...params, maxBytes: ASSET_UPLOAD_MAX_BYTES });
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
      enqueueBackfill: deps.enqueueBackfill,
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

  for (const bundle of collected.bundles) {
    if (deps.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: bulk import is intentionally sequential — each card is one atomic idempotent write with resumable per-bundle isolation.
    const cardResult = await service.importCharacter({
      card: { bytes: bundle.cardBytes, filename: bundle.filename },
    });
    if (cardResult.created) {
      changed += 1;
    }
    if (bundle.chats.length > 0) {
      const chatResult = await service.importChats({
        characterId: cardResult.characterId,
        chats: bundle.chats,
      });
      changed += chatResult.chatsImported;
    }
  }

  return { scanned, changed };
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
