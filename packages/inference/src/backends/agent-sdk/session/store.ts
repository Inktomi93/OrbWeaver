// The SDK SessionStore (canon-derived resume cache) + the per-chat SessionCache. Backend-internal only —
// the domain turn is stateless-first and never sees a session id. Keyed by sessionId, not projectKey: this
// backend seeds frames before any spawn, so replicating the SDK's cwd-derived projectKey would couple us to a wrapper internal.

import type { SessionKey, SessionStore, SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import type { ChatId } from "@orb/kit/ids";
import type { InferenceLog } from "../../../deps.ts";
import type { SeedTurn } from "./frames.ts";
import { buildSeedFrames, canonHashOf, isBranchDivergence, seedSessionId, sessionContainsSeedPrefix, sessionMatchesSeed, toSeedTurns } from "./frames.ts";

// "" is internal-only for the main transcript's subpath — never handed back to the SDK, where "" is invalid.
const MAIN_TRANSCRIPT_SUBPATH = "";
// NUL separator: can't appear in a sessionId/subpath, so composite keys never collide.
const KEY_SEP = "\0";
// LRU cap on retained session lineages. Eviction is safe by construction: a cold entry re-derives its
// deterministic session id from canon and rebuilds byte-identical frames on the next turn — never a lost conversation.
const MAX_SESSION_LINEAGES = 256;
// Salt ceiling for ensureSeededSession's diverged-id walk; past this the turn runs fresh rather than looping.
const MAX_SEED_SALT = 4;

/** sessionId + subpath — projectKey is deliberately ignored (see file header). */
function composite(key: SessionKey): string {
  return `${key.sessionId}${KEY_SEP}${key.subpath ?? MAIN_TRANSCRIPT_SUBPATH}`;
}

/**
 * Orb-internal store extension: atomically REPLACE a session's frames (the SDK {@link SessionStore} is
 * append-only). Replacing in place keeps the sessionId and its prompt-cache lineage — an in-place replace
 * re-bills only the changed suffix, where minting a new id re-writes the whole conversation's cache.
 */
export interface ReplaceableSessionStore extends SessionStore {
  readonly replace: (key: SessionKey, entries: SessionStoreEntry[]) => Promise<void>;
}

function canReplace(store: SessionStore): store is ReplaceableSessionStore {
  return typeof (store as Partial<ReplaceableSessionStore>).replace === "function";
}

/**
 * `ensureSeededSession` outcome: the session to resume (`null` = SDK-fresh) + which branch decided it.
 *   • `resumed`   — the recorded session's stored transcript still matched the seed.
 *   • `forked`    — a branch divergence (swipe/edit sharing a prefix); recorded lineage stays intact,
 *                   the branch seeds under its own deterministic lineage.
 *   • `reseeded`  — a non-branch divergence (window-slide) on a replace-capable store → in-place replace.
 *   • `seeded`    — cold cache → a fresh deterministic seed-derived session was appended.
 *   • `readopted` — a previously-seeded deterministic session for this exact state was re-adopted.
 *   • `fresh`     — no cache hit usable (salt ceiling / replace-incapable divergence) → SDK-fresh.
 *   • `cleared`   — an empty seed dropped the mapping.
 */
export interface SeededSessionDecision {
  readonly sessionId: string | null;
  readonly disposition: "resumed" | "forked" | "reseeded" | "seeded" | "readopted" | "fresh" | "cleared";
}

/**
 * The D8 write-path injection seam: `session_entries` persistence (`packages/db/src/schema/sdk-session.ts`)
 * as two ops, kept SDK-free/db-free here (the sealed-executor invariant — infra never imports `@orb/db`
 * directly; the compose root builds these over `db.insert`/`db.update` and injects them). `insert` covers a
 * BRAND NEW sdk-session lineage entry (dispositions `seeded`/`forked` — a new `sdkSessionId` was minted);
 * `update` covers an in-place content rewrite of an EXISTING entry (disposition `reseeded` — the SAME
 * `sdkSessionId`, changed content). Absent ⇒ no persistence (the in-memory cache alone still works — a
 * durable row is an optimization per Tier-3b-Providers.md Esoteric §3, not a correctness need).
 */
export interface SessionEntryWriter {
  readonly insert: (entry: {
    readonly chatId: ChatId;
    readonly sdkSessionId: string;
    readonly seededThroughSeq: number;
    readonly canonHash: string;
  }) => Promise<void>;
  readonly update: (entry: { readonly sdkSessionId: string; readonly seededThroughSeq: number; readonly canonHash: string }) => Promise<void>;
}

/** Best-effort INSERT: a `session_entries` write failure never takes down a chat turn (the in-memory
 *  cache is the correctness path; the row is an observability/reap-substrate optimization). */
async function persistInsert(writer: SessionEntryWriter | undefined, log: InferenceLog, entry: Parameters<SessionEntryWriter["insert"]>[0]): Promise<void> {
  if (writer === undefined) {
    return;
  }
  try {
    await writer.insert(entry);
    // @orb-waive caught-failure-ownership(err): this best-effort persistence failure is owned by the injected warning log; the in-memory session remains authoritative. Precedent: the gate mustPass fixture packages/server/src/domain/probe/logged.ts proves the same contextual warning owner. Ends if the warning or cache owner disappears.
  } catch (err) {
    log.warn({ err, op: "insert", sdkSessionId: entry.sdkSessionId }, "agent-sdk: session_entries persist failed (best-effort, cache unaffected)");
  }
}

/** Best-effort UPDATE counterpart of {@link persistInsert} (the `reseeded` disposition — same
 *  `sdkSessionId`, rewritten content). */
async function persistUpdate(writer: SessionEntryWriter | undefined, log: InferenceLog, entry: Parameters<SessionEntryWriter["update"]>[0]): Promise<void> {
  if (writer === undefined) {
    return;
  }
  try {
    await writer.update(entry);
    // @orb-waive caught-failure-ownership(err): this best-effort persistence failure is owned by the injected warning log; the in-memory session remains authoritative. Precedent: the gate mustPass fixture packages/server/src/domain/probe/logged.ts proves the same contextual warning owner. Ends if the warning or cache owner disappears.
  } catch (err) {
    log.warn({ err, op: "update", sdkSessionId: entry.sdkSessionId }, "agent-sdk: session_entries persist failed (best-effort, cache unaffected)");
  }
}

/**
 * Process-local in-memory {@link SessionStore}, keyed by (sessionId, subpath). uuid-bearing frames dedup
 * (the SDK replays uuids on retry/resume-import); uuid-less frames always append. Bounded to
 * {@link MAX_SESSION_LINEAGES} lineages, LRU by lineage (a lineage groups every composite key of one
 * sessionId, so eviction drops a whole session atomically, never a partial transcript).
 */
export class InMemorySessionStore implements ReplaceableSessionStore {
  private readonly entries = new Map<string, SessionStoreEntry[]>();
  // LRU recency order over lineages: Map iteration is insertion-ordered, so the first key is least-recently-touched.
  private readonly lineages = new Map<string, Set<string>>();

  private touch(key: SessionKey): void {
    const { sessionId } = key;
    const members = this.lineages.get(sessionId);
    if (members !== undefined) {
      this.lineages.delete(sessionId);
      members.add(composite(key));
      this.lineages.set(sessionId, members);
    } else {
      this.lineages.set(sessionId, new Set([composite(key)]));
    }
    while (this.lineages.size > MAX_SESSION_LINEAGES) {
      const oldest = this.lineages.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      for (const memberKey of this.lineages.get(oldest) ?? []) {
        this.entries.delete(memberKey);
      }
      this.lineages.delete(oldest);
    }
  }

  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    if (entries.length === 0) {
      return Promise.resolve();
    }
    const id = composite(key);
    const existing = this.entries.get(id) ?? [];
    const seen = new Set(existing.map((e) => e.uuid).filter((u): u is string => typeof u === "string"));
    for (const entry of entries) {
      if (typeof entry.uuid === "string") {
        if (seen.has(entry.uuid)) {
          continue;
        }
        seen.add(entry.uuid);
      }
      existing.push(entry);
    }
    this.entries.set(id, existing);
    this.touch(key);
    return Promise.resolve();
  }

  load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    const rows = this.entries.get(composite(key));
    if (rows === undefined) {
      return Promise.resolve(null);
    }
    this.touch(key);
    return Promise.resolve([...rows]);
  }

  // No uuid dedup: rebuilt frames share index-derived uuids with the rows being replaced; dedup would keep stale text.
  replace(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    this.entries.set(composite(key), [...entries]);
    this.touch(key);
    return Promise.resolve();
  }
}

// The store ignores projectKey (see file header); the SDK's own calls arrive with its sanitized-cwd key and land on the same rows.
const INTERNAL_PROJECT_KEY = "orbweaver";

/**
 * Per-chat resume cache: the SDK {@link SessionStore} plus the `chatId → sessionId` map. `record`/
 * `resolveResumeId` are the runner's raw seam; `ensureSeededSession` resumes the recorded session when its
 * stored transcript still matches the freshly-rendered seed, else seeds a fresh deterministic session.
 */
export class SessionCache {
  readonly store: SessionStore;
  private readonly byChat = new Map<string, string>();
  private readonly writer: SessionEntryWriter | undefined;
  private readonly log: InferenceLog;

  constructor(log: InferenceLog, store: SessionStore = new InMemorySessionStore(), writer?: SessionEntryWriter) {
    this.log = log;
    this.store = store;
    this.writer = writer;
  }

  resolveResumeId(chatId: ChatId): string | undefined {
    return this.byChat.get(chatId);
  }

  record(chatId: ChatId, sessionId: string): void {
    this.byChat.set(chatId, sessionId);
  }

  /**
   * Resolve the session to resume given the model-visible transcript before this turn. Why not the SDK's
   * `forkSession`: it mints a random id, but swipe-back discovery is content-addressed (recomputes a
   * branch's id with `seedSessionId` from canon alone) — a random fork id would be unfindable on return.
   */
  async ensureSeededSession(chatId: ChatId, seed: readonly SeedTurn[]): Promise<SeededSessionDecision> {
    const turns = toSeedTurns(seed);
    if (turns.length === 0) {
      this.byChat.delete(chatId);
      return { sessionId: null, disposition: "cleared" };
    }
    const recorded = this.byChat.get(chatId);
    if (recorded !== undefined) {
      const rows = await this.loadSession(recorded);
      if (sessionMatchesSeed(rows, turns)) {
        return { sessionId: recorded, disposition: "resumed" };
      }
      // Diverged from the recorded lineage — probe the deterministic candidate for THIS seed first: an
      // A→B→A swipe-back re-derives lineage A's own id, and if the live subprocess grew it since, a plain
      // exact-match walk would miss it, so this probe matches on a grown-superset prefix instead.
      const readopted = await this.readoptDeterministicCandidate(chatId, turns);
      if (readopted !== null) {
        return readopted;
      }
      // Branch divergence (shares a prefix): fork under a new deterministic lineage, leaving the recorded
      // one intact so a later swipe-back re-derives + re-adopts it as a plain resume.
      if (isBranchDivergence(rows, turns)) {
        return await this.seedFresh(chatId, turns, "forked");
      }
      // Non-branch divergence (no shared prefix, e.g. window-slide): reseed in place — preserving the
      // lineage buys nothing here, so the cheapest rewrite (same id, changed suffix) wins.
      if (canReplace(this.store)) {
        await this.store.replace({ projectKey: INTERNAL_PROJECT_KEY, sessionId: recorded }, buildSeedFrames(turns, recorded));
        await persistUpdate(this.writer, this.log, { sdkSessionId: recorded, seededThroughSeq: turns.length, canonHash: canonHashOf(turns) });
        return { sessionId: recorded, disposition: "reseeded" };
      }
    }
    return await this.seedFresh(chatId, turns);
  }

  /**
   * Probe deterministic candidate id(s) for this seed and re-adopt a matching stored lineage (the
   * swipe-back landing). A candidate matches when the stored transcript contains the seed as a leading
   * prefix (exact or grown-superset) — the live subprocess appends its own frames after a turn runs, so
   * the pre-turn seed becomes a strict prefix of the stored lineage.
   */
  private async readoptDeterministicCandidate(chatId: ChatId, turns: readonly SeedTurn[]): Promise<SeededSessionDecision | null> {
    for (let salt = 0; salt < MAX_SEED_SALT; salt++) {
      const sessionId = seedSessionId(chatId, turns, salt);
      const rows = await this.loadSession(sessionId);
      if (rows.length > 0 && sessionContainsSeedPrefix(rows, turns)) {
        this.byChat.set(chatId, sessionId);
        return { sessionId, disposition: "readopted" };
      }
    }
    return null;
  }

  /** Seek (or seed) the deterministic lineage for this seed state; returns `fresh` past the salt ceiling. */
  private async seedFresh(chatId: ChatId, turns: readonly SeedTurn[], seededAs: "seeded" | "forked" = "seeded"): Promise<SeededSessionDecision> {
    for (let salt = 0; salt < MAX_SEED_SALT; salt++) {
      const sessionId = seedSessionId(chatId, turns, salt);
      const rows = await this.loadSession(sessionId);
      if (rows.length === 0) {
        await this.store.append({ projectKey: INTERNAL_PROJECT_KEY, sessionId }, buildSeedFrames(turns, sessionId));
        this.byChat.set(chatId, sessionId);
        await persistInsert(this.writer, this.log, { chatId, sdkSessionId: sessionId, seededThroughSeq: turns.length, canonHash: canonHashOf(turns) });
        return { sessionId, disposition: seededAs };
      }
      if (sessionMatchesSeed(rows, turns)) {
        this.byChat.set(chatId, sessionId);
        return { sessionId, disposition: "readopted" };
      }
    }
    this.byChat.delete(chatId);
    return { sessionId: null, disposition: "fresh" };
  }

  private async loadSession(sessionId: string): Promise<SessionStoreEntry[]> {
    return (await this.store.load({ projectKey: INTERNAL_PROJECT_KEY, sessionId })) ?? [];
  }
}
