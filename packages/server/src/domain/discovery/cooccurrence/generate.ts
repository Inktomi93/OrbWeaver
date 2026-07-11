// domain/discovery/cooccurrence/generate — the keyword×keyword cooccurrence pass (the `compute-cooccurrence`
// workload). A chat's turns anchor on scene keywords; co-occurrence is keyword×keyword WITHIN a tier-0
// digest's `keywords[]` (tier-0 LEAVES only — mixing consolidation tiers double-counts a scene;
// content-hash collapsed — a forked scene counts once; hub-token filtered — a keyword in > `hubFraction` of an
// owner's digests co-occurs with everything and drowns the signal, the CSLS rationale). Writes
// `keyword_cooccurrence` (owner × keyword-pair, KEEPS ownerId) + `character_keyword_profiles` (per witnessing
// character, ownerId DERIVES via `characterId → characters.ownerId`). Was neo-tavern
// `corpus/cooccurrence/generate.ts` (neo's sampled per-pair `characterIds` column is dropped in orb —
// schema/discovery.ts — so the pair is a bare weight).
//
// ATOMIC per-owner replace: each owner's rows are cleared + re-inserted in ONE db.batch, so a crash
// mid-rebuild leaves either the old rollup OR the new one — never an empty table. DETERMINISM: the clock + id
// minters are injected (no ambient Date.now / typeid).

import type { BatchStmt, Db } from "@orb/db";
import {
  batchMany,
  characterKeywordProfiles,
  characters,
  chunkRows,
  keywordCooccurrence,
  rowsPerInsert,
} from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { eq, inArray } from "drizzle-orm";
import type { ComputeCooccurrenceOptions } from "../contract/params";
import type { CooccurrenceStats } from "../contract/results";
import type { ComputeCooccurrenceDeps } from "../contract/service";
import { readOwnedDigestKeywords } from "../persistence/embed-store-reads";
import { collapseByHash } from "../substrate/collapse";
import { normalizeKeyword } from "./utils";

/** Keep the top-N pairs per owner by count (the count-1 long tail is noise). */
export const DEFAULT_MAX_PAIRS = 10_000;
/** Drop a keyword present in over this fraction of an owner's digests (a hub token — mirrors CSLS). */
export const DEFAULT_HUB_FRACTION = 0.5;

// keyword_cooccurrence insert column count (id, ownerId, keywordA, keywordB, count, computedAt).
const COOC_COLS = 6;
// character_keyword_profiles insert column count (id, characterId, keyword, count, computedAt).
const PROFILE_COLS = 5;

type CoocInsert = typeof keywordCooccurrence.$inferInsert;
type ProfileInsert = typeof characterKeywordProfiles.$inferInsert;
type DigestKeywords = Awaited<ReturnType<typeof readOwnedDigestKeywords>>[number];

// One digest reduced to its unique normalized keyword set (post hub-filter), with its witnessing character.
interface NormalizedDigest {
  readonly characterId: CharacterId;
  readonly keywords: string[];
}

// The pure tally output for one owner: keyword pairs + per-character keyword counts.
interface OwnerTally {
  readonly pairs: { keywordA: string; keywordB: string; count: number }[];
  readonly charKeywords: { characterId: CharacterId; keyword: string; count: number }[];
}

function bump(m: Map<string, number>, key: string): void {
  m.set(key, (m.get(key) ?? 0) + 1);
}

function bumpNested(m: Map<string, Map<string, number>>, k1: string, k2: string): void {
  let inner = m.get(k1);
  if (inner === undefined) {
    inner = new Map();
    m.set(k1, inner);
  }
  bump(inner, k2);
}

// Tally ONE digest's keywords into the running pair-count + per-character-keyword maps (every unordered pair
// co-occurs once, canonical A<B; every keyword credits the digest's character).
function tallyDigest(
  d: NormalizedDigest,
  pairCount: Map<string, Map<string, number>>,
  charKw: Map<string, Map<string, number>>,
): void {
  const kws = d.keywords;
  for (const kw of kws) {
    bumpNested(charKw, d.characterId, kw);
  }
  for (let i = 0; i < kws.length; i += 1) {
    for (let j = i + 1; j < kws.length; j += 1) {
      const a0 = kws[i] ?? "";
      const b0 = kws[j] ?? "";
      const [a, b] = a0 < b0 ? [a0, b0] : [b0, a0];
      bumpNested(pairCount, a, b);
    }
  }
}

/**
 * Pure counting core (no db): per digest, every unordered keyword pair co-occurs once (canonical A-before-B) and
 * every keyword credits its character. O(k²) per digest, k ≤ ~20 (the caller caps the digest keyword set).
 */
export function tallyCooccurrence(digests: readonly NormalizedDigest[]): OwnerTally {
  const pairCount = new Map<string, Map<string, number>>(); // a → b → count (a < b)
  const charKw = new Map<string, Map<string, number>>(); // characterId → keyword → count
  for (const d of digests) {
    tallyDigest(d, pairCount, charKw);
  }
  const pairs: OwnerTally["pairs"] = [];
  for (const [a, inner] of pairCount) {
    for (const [b, count] of inner) {
      pairs.push({ keywordA: a, keywordB: b, count });
    }
  }
  const charKeywords: OwnerTally["charKeywords"] = [];
  for (const [characterId, inner] of charKw) {
    for (const [keyword, count] of inner) {
      charKeywords.push({ characterId: characterId as CharacterId, keyword, count });
    }
  }
  return { pairs, charKeywords };
}

// Normalize one owner's collapsed digests to unique keyword sets, dropping hub tokens (> hubFraction of the
// owner's digests). Returns the normalized digests + the count of hub tokens dropped.
function normalizeOwner(
  digests: readonly DigestKeywords[],
  hubFraction: number,
): { normalized: NormalizedDigest[]; hubDropped: number } {
  const perDigest: NormalizedDigest[] = [];
  const df = new Map<string, number>();
  for (const d of digests) {
    const set = new Set<string>();
    for (const kw of d.keywords) {
      const n = normalizeKeyword(kw);
      if (n !== null) {
        set.add(n);
      }
    }
    perDigest.push({ characterId: d.scopedCharacterId, keywords: [...set] });
    for (const k of set) {
      bump(df, k);
    }
  }
  const cutoff = perDigest.length * hubFraction;
  const hub = new Set([...df.entries()].filter(([, c]) => c > cutoff).map(([k]) => k));
  const normalized = perDigest.map((d) => ({
    characterId: d.characterId,
    keywords: d.keywords.filter((k) => !hub.has(k)),
  }));
  return { normalized, hubDropped: hub.size };
}

// Atomically replace ONE owner's cooccurrence + profile rows. keyword_cooccurrence scopes by ownerId;
// character_keyword_profiles has no ownerId (D23) → delete by characterId IN (owner's characters).
async function replaceOwner(
  db: Db,
  ownerId: UserId,
  coocRows: readonly CoocInsert[],
  profileRows: readonly ProfileInsert[],
): Promise<void> {
  const stmts: BatchStmt[] = [
    db.delete(keywordCooccurrence).where(eq(keywordCooccurrence.ownerId, ownerId)),
    db
      .delete(characterKeywordProfiles)
      .where(
        inArray(
          characterKeywordProfiles.characterId,
          db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId)),
        ),
      ),
  ];
  for (const chunk of chunkRows(coocRows, rowsPerInsert(COOC_COLS))) {
    stmts.push(db.insert(keywordCooccurrence).values(chunk));
  }
  for (const chunk of chunkRows(profileRows, rowsPerInsert(PROFILE_COLS))) {
    stmts.push(db.insert(characterKeywordProfiles).values(chunk));
  }
  await db.batch(batchMany(stmts));
}

function groupByOwner(rows: readonly DigestKeywords[]): Map<UserId, DigestKeywords[]> {
  const groups = new Map<UserId, DigestKeywords[]>();
  for (const row of rows) {
    const bucket = groups.get(row.ownerId);
    if (bucket === undefined) {
      groups.set(row.ownerId, [row]);
    } else {
      bucket.push(row);
    }
  }
  return groups;
}

/**
 * Recompute keyword cooccurrence + per-character keyword profiles for every owner with tier-0 digests (or ONE
 * owner when `opts.ownerId` is set). Idempotent atomic per-owner replace. Standalone `(db, deps, opts?)` so the
 * `compute-cooccurrence` runner drives it without the whole service.
 */
export async function computeCooccurrence(
  db: Db,
  deps: ComputeCooccurrenceDeps,
  opts: ComputeCooccurrenceOptions = {},
): Promise<CooccurrenceStats> {
  const maxPairs = opts.maxPairs ?? DEFAULT_MAX_PAIRS;
  const hubFraction = opts.hubFraction ?? DEFAULT_HUB_FRACTION;
  const { signal } = opts;
  signal?.throwIfAborted();
  const now = deps.now();
  const all = await readOwnedDigestKeywords(db, opts.ownerId);
  const byOwner = groupByOwner(all);

  let pairsWritten = 0;
  let charKeywordsWritten = 0;
  let hubTokensDropped = 0;
  for (const [ownerId, digests] of byOwner) {
    signal?.throwIfAborted();
    // Collapse forked scenes (same content_hash counts once), then normalize + hub-filter + tally.
    const { reps } = collapseByHash(
      digests,
      (d) => d.contentHash,
      (d) => `${d.scopedCharacterId} ${d.contentHash}`,
    );
    const { normalized, hubDropped } = normalizeOwner(reps, hubFraction);
    const tally = tallyCooccurrence(normalized);
    const pairs = tally.pairs.sort((a, b) => b.count - a.count).slice(0, maxPairs);

    const coocRows: CoocInsert[] = pairs.map((p) => ({
      id: deps.newKeywordCooccurrenceId(),
      ownerId,
      keywordA: p.keywordA,
      keywordB: p.keywordB,
      count: p.count,
      computedAt: now,
    }));
    const profileRows: ProfileInsert[] = tally.charKeywords.map((c) => ({
      id: deps.newCharacterKeywordProfileId(),
      characterId: c.characterId,
      keyword: c.keyword,
      count: c.count,
      computedAt: now,
    }));
    // biome-ignore lint/performance/noAwaitInLoops: a per-owner atomic replace — each owner's write is its own batch; folding all owners into one batch would unbound memory on a large corpus.
    // biome-ignore lint/plugin/no-await-db-in-loop: the per-owner replace is inherently sequential (independent atomic batches, bounded backpressure) — mirrors the themes/duplicate BULK passes.
    await replaceOwner(db, ownerId, coocRows, profileRows);
    pairsWritten += coocRows.length;
    charKeywordsWritten += profileRows.length;
    hubTokensDropped += hubDropped;
  }
  return {
    ownersProcessed: byOwner.size,
    pairsWritten,
    charKeywordsWritten,
    hubTokensDropped,
  };
}
