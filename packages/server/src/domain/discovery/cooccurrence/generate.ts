// domain/discovery/cooccurrence/generate — the keyword×keyword cooccurrence pass (the `compute-cooccurrence`
// workload). Co-occurrence is keyword×keyword within a tier-0 digest's `keywords[]` (content-hash collapsed,
// hub-token filtered). Writes `keyword_cooccurrence` (owner × keyword-pair) + `character_keyword_profiles`
// (per witnessing character). Atomic per-owner replace — a crash mid-rebuild never leaves an empty table.

import type { Db } from "@orb/db";
import { characterKeywordProfiles, characters, keywordCooccurrence } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, chunkRows, rowsPerInsert } from "@orb/db/kit";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { eq, inArray } from "drizzle-orm";
import type { ComputeCooccurrenceOptions } from "../contract/params.ts";
import type { CooccurrenceStats } from "../contract/results.ts";
import type { ComputeCooccurrenceDeps } from "../contract/service.ts";
import { readOwnedDigestKeywords } from "../persistence/embed-store-reads.ts";
import { collapseByHash } from "../substrate/collapse.ts";
import { normalizeKeyword } from "./utils.ts";

/** Keep the top-N pairs per owner by count (the count-1 long tail is noise). */
export const DEFAULT_MAX_PAIRS = 10_000;
/** Drop a keyword present in over this fraction of an owner's digests (a hub token — mirrors CSLS). */
export const DEFAULT_HUB_FRACTION = 0.5;

const COOC_COLS = 6;
const PROFILE_COLS = 5;

type CoocInsert = typeof keywordCooccurrence.$inferInsert;
type ProfileInsert = typeof characterKeywordProfiles.$inferInsert;
type DigestKeywords = Awaited<ReturnType<typeof readOwnedDigestKeywords>>[number];

interface NormalizedDigest {
  readonly characterId: CharacterId;
  readonly keywords: string[];
}

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

function tallyDigest(d: NormalizedDigest, pairCount: Map<string, Map<string, number>>, charKw: Map<string, Map<string, number>>): void {
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
function tallyCooccurrence(digests: readonly NormalizedDigest[]): OwnerTally {
  const pairCount = new Map<string, Map<string, number>>();
  const charKw = new Map<string, Map<string, number>>();
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

function normalizeOwner(digests: readonly DigestKeywords[], hubFraction: number): { normalized: NormalizedDigest[]; hubDropped: number } {
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

// character_keyword_profiles has no ownerId column — delete by characterId IN (owner's characters).
async function replaceOwner(db: Db, ownerId: UserId, coocRows: readonly CoocInsert[], profileRows: readonly ProfileInsert[]): Promise<void> {
  const stmts: BatchStmt[] = [
    db.delete(keywordCooccurrence).where(eq(keywordCooccurrence.ownerId, ownerId)),
    db
      .delete(characterKeywordProfiles)
      .where(inArray(characterKeywordProfiles.characterId, db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId)))),
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
export async function computeCooccurrence(db: Db, deps: ComputeCooccurrenceDeps, opts: ComputeCooccurrenceOptions = {}): Promise<CooccurrenceStats> {
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
    // biome-ignore lint/performance/noAwaitInLoops: independent per-owner atomic replace — folding into one batch would unbound memory on a large corpus.
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
