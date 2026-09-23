// The SDK SessionStore (canon-derived resume cache) + the per-chat SessionCache. Backend-internal only —
// the domain turn is stateless-first and never sees a session id. Keyed by sessionId, not projectKey: this
// backend seeds frames before any spawn, so replicating the SDK's cwd-derived projectKey would couple us to a wrapper internal.

import type { SessionKey, SessionStore, SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import type { SessionEntryWriter } from "../../../contract/agent.ts";
import type { AgentSdkSessionId } from "../../../contract/identity.ts";
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
 *   • `rewound`   — that session had already run a turn on this seed (a regenerate), so it was cut back
 *                   to the seed in place before resuming.
 *   • `fresh`     — no cache hit usable (salt ceiling / replace-incapable divergence) → SDK-fresh.
 *   • `cleared`   — an empty seed dropped the mapping.
 */
export interface SeededSessionDecision {
  readonly sessionId: AgentSdkSessionId | null;
  readonly disposition: "resumed" | "forked" | "reseeded" | "seeded" | "readopted" | "rewound" | "fresh" | "cleared";
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
  private readonly byChatConnection = new Map<string, AgentSdkSessionId>();
  private readonly writer: SessionEntryWriter | undefined;
  private readonly log: InferenceLog;

  constructor(log: InferenceLog, store: SessionStore = new InMemorySessionStore(), writer?: SessionEntryWriter) {
    this.log = log;
    this.store = store;
    this.writer = writer;
  }

  resolveResumeId(chatId: ChatId, connectionId: UserConnectionId): AgentSdkSessionId | undefined {
    return this.byChatConnection.get(`${chatId}${KEY_SEP}${connectionId}`);
  }

  record(chatId: ChatId, connectionId: UserConnectionId, sessionId: AgentSdkSessionId): void {
    this.byChatConnection.set(`${chatId}${KEY_SEP}${connectionId}`, sessionId);
  }

  /**
   * Resolve the session to resume given the model-visible transcript before this turn. Why not the SDK's
   * `forkSession`: it mints a random id, but swipe-back discovery is content-addressed (recomputes a
   * branch's id with `seedSessionId` from canon alone) — a random fork id would be unfindable on return.
   */
  async ensureSeededSession(chatId: ChatId, connectionId: UserConnectionId, seed: readonly SeedTurn[]): Promise<SeededSessionDecision> {
    const cacheKey = `${chatId}${KEY_SEP}${connectionId}`;
    const turns = toSeedTurns(seed);
    if (turns.length === 0) {
      this.byChatConnection.delete(cacheKey);
      return { sessionId: null, disposition: "cleared" };
    }
    const recorded = this.byChatConnection.get(cacheKey);
    if (recorded !== undefined) {
      const rows = await this.loadSession(recorded);
      if (sessionMatchesSeed(rows, turns)) {
        return { sessionId: recorded, disposition: "resumed" };
      }
      // Diverged from the recorded lineage — probe the deterministic candidate for THIS seed first: a
      // regenerate re-derives the id of the lineage its previous attempt ran on, which the probe re-adopts
      // (exact) or rewinds to the seed (grown by the rejected turn).
      const readopted = await this.readoptDeterministicCandidate(chatId, connectionId, turns);
      if (readopted !== null) {
        return readopted;
      }
      // Branch divergence (shares a prefix): fork under a new deterministic lineage, leaving the recorded
      // one intact so a later swipe-back re-derives + re-adopts it as a plain resume.
      if (isBranchDivergence(rows, turns)) {
        return await this.seedFresh(chatId, connectionId, turns, "forked");
      }
      // Non-branch divergence (no shared prefix, e.g. window-slide): reseed in place — preserving the
      // lineage buys nothing here, so the cheapest rewrite (same id, changed suffix) wins.
      if (canReplace(this.store)) {
        await this.store.replace({ projectKey: INTERNAL_PROJECT_KEY, sessionId: recorded }, buildSeedFrames(turns, recorded));
        await persistUpdate(this.writer, this.log, { connectionId, sdkSessionId: recorded, seededThroughSeq: turns.length, canonHash: canonHashOf(turns) });
        return { sessionId: recorded, disposition: "reseeded" };
      }
    }
    return await this.seedFresh(chatId, connectionId, turns);
  }

  /**
   * Probe deterministic candidate id(s) for this seed and re-adopt the stored lineage. An exact match
   * re-adopts as-is. A lineage that has GROWN past the seed was seeded from exactly this seed and has since
   * run a turn on it, so its tail is a turn this send replaces (a regenerate, a swipe, an edit-and-resend):
   * resuming it would show the model the rejected prompt and reply. It is rewound in place to the seed, which
   * rebuilds byte-identical seed frames under the same id and keeps its prompt-cache prefix. A store that
   * cannot replace falls through to the caller's salt walk, which seeds a fresh lineage instead.
   */
  private async readoptDeterministicCandidate(
    chatId: ChatId,
    connectionId: UserConnectionId,
    turns: readonly SeedTurn[],
  ): Promise<SeededSessionDecision | null> {
    const cacheKey = `${chatId}${KEY_SEP}${connectionId}`;
    for (let salt = 0; salt < MAX_SEED_SALT; salt++) {
      const sessionId = seedSessionId(chatId, connectionId, turns, salt);
      const rows = await this.loadSession(sessionId);
      if (rows.length === 0 || !sessionContainsSeedPrefix(rows, turns)) {
        continue;
      }
      if (sessionMatchesSeed(rows, turns)) {
        this.byChatConnection.set(cacheKey, sessionId);
        return { sessionId, disposition: "readopted" };
      }
      if (canReplace(this.store)) {
        await this.store.replace({ projectKey: INTERNAL_PROJECT_KEY, sessionId }, buildSeedFrames(turns, sessionId));
        await persistUpdate(this.writer, this.log, { connectionId, sdkSessionId: sessionId, seededThroughSeq: turns.length, canonHash: canonHashOf(turns) });
        this.byChatConnection.set(cacheKey, sessionId);
        return { sessionId, disposition: "rewound" };
      }
    }
    return null;
  }

  /** Seek (or seed) the deterministic lineage for this seed state; returns `fresh` past the salt ceiling. */
  private async seedFresh(
    chatId: ChatId,
    connectionId: UserConnectionId,
    turns: readonly SeedTurn[],
    seededAs: "seeded" | "forked" = "seeded",
  ): Promise<SeededSessionDecision> {
    const cacheKey = `${chatId}${KEY_SEP}${connectionId}`;
    for (let salt = 0; salt < MAX_SEED_SALT; salt++) {
      const sessionId = seedSessionId(chatId, connectionId, turns, salt);
      const rows = await this.loadSession(sessionId);
      if (rows.length === 0) {
        await this.store.append({ projectKey: INTERNAL_PROJECT_KEY, sessionId }, buildSeedFrames(turns, sessionId));
        this.byChatConnection.set(cacheKey, sessionId);
        await persistInsert(this.writer, this.log, {
          chatId,
          connectionId,
          sdkSessionId: sessionId,
          seededThroughSeq: turns.length,
          canonHash: canonHashOf(turns),
        });
        return { sessionId, disposition: seededAs };
      }
      if (sessionMatchesSeed(rows, turns)) {
        this.byChatConnection.set(cacheKey, sessionId);
        return { sessionId, disposition: "readopted" };
      }
    }
    this.byChatConnection.delete(cacheKey);
    return { sessionId: null, disposition: "fresh" };
  }

  private async loadSession(sessionId: AgentSdkSessionId): Promise<SessionStoreEntry[]> {
    return (await this.store.load({ projectKey: INTERNAL_PROJECT_KEY, sessionId })) ?? [];
  }
}
