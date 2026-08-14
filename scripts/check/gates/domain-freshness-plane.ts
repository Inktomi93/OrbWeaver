// Gate: domain-freshness-plane (event-bus coverage survey §3.1) — EVERY domain that WRITES must declare, in
// one place, HOW a client learns about the write. The three coverage ratchets quantify over BELTS, not over
// buses, so a domain that never got a bus at all is invisible to all of them: `refinery` shipped 11
// persisting verbs and zero events, and the only trace was a `query-freshness-coverage` STATIC citation on
// the READ side — paperwork instead of a RED (survey §1.2, §2.2). This gate closes the quantifier: the
// DOMAIN, not the read, is the unit.
//
// THE TABLE IS THE ONE HOME FOR THE NO-BUS VERDICT. A `none` row is a cited claim that a write genuinely
// needs no announcement; the `query-freshness-coverage` STATIC rows of the "no bus event exists" class point
// here so the two registries cannot drift.
//
// SELF-CLEANING IN ALL FOUR DIRECTIONS (D107 / the knob-wire discipline):
//   • a mutating domain with no row → MISSING-red (the refinery arm — the founding hole);
//   • a `none` row for a domain that DOES emit → STALE-red (it grew a plane; say which);
//   • a row naming a domain that writes nothing → ORPHAN-red (the domain was deleted or went read-only);
//   • zero domains derived on a tree that HAS `domain/chat` → BLINDNESS-red (§4.6), never a silent ✓.
//
// GRANULARITY HONESTY (survey §3.1, a declared limit with a real reason): per-DOMAIN, not per-verb. A domain
// with one emitting verb and one silent one passes here. The per-verb quantifier is held from the CLIENT
// side by `query-freshness-coverage` — any read a silent verb feeds is RED at its consumption site without a
// seam row or a citation — and the PAIRING is the design: this gate forces the domain to HAVE a plane, that
// ratchet forces every READ onto a driver. A per-verb `@freshness-exempt(<verb>)` marker is the escalation
// if the pairing ever leaks; carrying it now would cost a marker on every read-only verb for no found defect.
//
// DERIVATION, not a hand-list: a domain MUTATES iff some file under it imports `@orb/db` AND calls
// `.insert(` / `.update(` / `.delete(` / `.batch(`. The `@orb/db` half is load-bearing — without it
// `domain/search/substrate/field-index.ts`'s MiniSearch and a `Map.delete` both read as persistence, which
// is how a derivation quietly starts lying. THE DERIVATION IS ALSO WHAT SIZES THE TABLE: `export`, `import`,
// `search` and `tool-use` carry NO row because none of them writes a durable row (search's index is
// in-memory and rebuilt from canon; tool-use registers into the process registry at plugin activation), and
// adding a courtesy `none` row for any of them would be ORPHAN-red — which is the ORPHAN arm doing its job.
import type { SourceFile } from "ts-morph";
import type { ExemptionRow, GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** Where a domain's writes become visible to a client. `none` is the cited no-announcement verdict; every
 *  other value names the plane and, for a plane whose PRODUCER lives in another domain, says whose. */
type FreshnessPlane = "chat-bus" | `user-bus:${string}` | `own-bus:${string}` | "domain-events" | "workload-events" | "notifications-inbox" | "none";

/** A row is `{ plane, why }` — `why` is the CITE (the emit site, or the reason a write needs no plane, with
 *  the condition that would end it). `ExemptionRow` is widened by intersection, never re-spelled. */
type FreshnessRow = ExemptionRow & { readonly plane: FreshnessPlane };

/** THE REGISTRY. Every mutating domain, its plane, and the receipt. Derived rows were read off the tree
 *  2026-08-14 (`emitUserEvent`/`emitChatEvent`/`emitWiEvent`/`emitBus`/`emit` call sites per domain). */
const DOMAIN_FRESHNESS: Readonly<Record<string, FreshnessRow>> = {
  admin: {
    plane: "user-bus:identityChanged",
    why: "admin/verbs emit identityChanged when a role/ban flips; the client re-reads identity off it. Ends if admin stops mutating users.",
  },
  assets: {
    plane: "domain-events",
    why: "assets/verbs/store.ts emits `asset.created` on the in-process bus; the embeddings indexer is the subscriber. The CAS row itself is content-addressed and never edited.",
  },
  automation: {
    plane: "own-bus:automation",
    why: "the rule engine + the five rule-CRUD verbs emit through the injected `notify` sink onto the per-chat automation room (rulesChanged wired 2026-08-14, bus wave 2).",
  },
  character: {
    plane: "user-bus:charactersChanged",
    why: "character/verbs emit charactersChanged AND `character.updated` on the domain bus (the indexer + the multi-human chat fan). Two consumers, two planes, both live.",
  },
  chat: {
    plane: "chat-bus",
    why: "the turn lifecycle IS the chat bus — 18 member types emitted from the engine and the canon verbs, durable-first into chat_events.",
  },
  connection: {
    plane: "none",
    why: "the only writes are the model-CATALOG SNAPSHOT caches (persistence/catalog-snapshot.ts, agent-sdk-catalog-snapshot.ts) — a re-derivable cache of what a connection can list, not user canon. The user-facing member `connectionsChanged` is the one live DEFERRED row in scripts/check/gates/user-bus-coverage.ts; this row flips to `user-bus:connectionsChanged` the day that DEFERRED is cleared.",
  },
  credentials: { plane: "user-bus:credentialsChanged", why: "credentials/verbs emit credentialsChanged after every CRUD + the health-strike writes." },
  databank: {
    plane: "user-bus:databankChanged",
    why: "the CRUD/scrape/reindex verbs and the upload terminal emit databankChanged (bus wave 2, 2026-08-14; the four databank STATIC rows were deleted with it).",
  },
  discovery: {
    plane: "user-bus:corpusRecomputed",
    why: "each bulk recompute pass emits corpusRecomputed at its terminal (bus wave 2, 2026-08-14) — the survey §3.4-4 sweep-terminal shape.",
  },
  embeddings: {
    plane: "user-bus:corpusRecomputed",
    why: "the indexer's bulk terminals share discovery's corpusRecomputed member — one event per pass, two producers, one client filter.",
  },
  imagery: {
    plane: "chat-bus",
    why: "imagery persists generations + provenance, but the USER-visible artefact is the chat message that carries the image; chat/verbs/generate-image emits on the chat bus. Ends if a standalone imagery gallery surface lands with its own reads.",
  },
  notifications: {
    plane: "notifications-inbox",
    why: "the durable inbox rows ARE the plane — `record` is the ONE recipient chokepoint (Core-0 §8) and the `notifications` room streams them; there is no second announcement to make.",
  },
  persona: { plane: "user-bus:personasChanged", why: "persona/verbs emit personasChanged on every CRUD; the pin/active writes ride it too." },
  plugin: {
    plane: "notifications-inbox",
    why: "plugin state changes reach the user as `plugin-disabled` notification arms (activation/crash-policy.ts); the registry itself is process-local and re-read at activation.",
  },
  preset: {
    plane: "user-bus:presetsChanged",
    why: "preset/verbs emit presetsChanged; generation config is single-owned per user, the exact 'an entity you own changed' posture.",
  },
  refinery: {
    plane: "user-bus:refineryChanged",
    why: "THE FOUNDING HOLE, closed 2026-08-14: the 11 persisting verbs now emit refineryChanged after their durable writes, and the six refinery STATIC rows self-cleaned away.",
  },
  regex: { plane: "user-bus:regexChanged", why: "regex/verbs emit regexChanged; the script library is per-user canon." },
  rpg: { plane: "own-bus:rpg", why: "domain/rpg/bus.ts is the sanctioned domain-minted singleton (G10/O4); 16 verb/flush sites emit its six members." },
  sessions: {
    plane: "none",
    why: "BFF session/token/OIDC rows are AUTH substrate with no client projection — the browser learns about them through the auth response and the 401 path, never a cache read. Ends if a 'your sessions' management surface lands.",
  },
  settings: {
    plane: "user-bus:settingsChanged",
    why: "settings/verbs emit settingsChanged and themesChanged; both are per-user tiers with live client reads.",
  },
  stats: {
    plane: "chat-bus",
    why: "turn economics are written inside the chat turn's own batch and are read on the chat surface — turnCompleted is the announcement. The stats fence (Knowledge-Cluster) forbids stats raising its own user-visible event.",
  },
  tag: { plane: "user-bus:tagsChanged", why: "tag/verbs emit tagsChanged for the namespace and every entity junction." },
  workloads: {
    plane: "workload-events",
    why: "the engine runner/reaper emit six WorkloadEvent members on the progress bus, with `workloads.progress` as the durable reconnect truth (D118).",
  },
  "world-info": {
    plane: "user-bus:worldInfoChanged",
    why: "world-info/verbs emit worldInfoChanged, and the chat-scoped attachment verbs additionally emit the five WiBusEvent members through the injected emitWiEvent onto the chat bus.",
  },
};

const MESSAGE =
  "a MUTATING domain must declare its FRESHNESS PLANE — how a client learns the write happened. The three " +
  "bus coverage ratchets quantify over BELTS, not over buses, so a domain with no bus at all is invisible " +
  "to every one of them: refinery shipped 11 persisting verbs and zero events, and the only trace was a " +
  "STATIC citation on the READ side (event-bus coverage survey §2.2). The table in " +
  "scripts/check/gates/domain-freshness-plane.ts is the ONE home for that verdict, `none` included.";

const FIX =
  "add the domain's row to DOMAIN_FRESHNESS in scripts/check/gates/domain-freshness-plane.ts: the plane it " +
  "announces on (`chat-bus` · `user-bus:<member>` · `own-bus:<name>` · `domain-events` · " +
  "`workload-events` · `notifications-inbox`) and the CITE. If the honest answer is that the write needs no " +
  "announcement, the row is `none` plus the reason AND the condition that would end it — never an omission.";

const GATE_SELF = "scripts/check/gates/domain-freshness-plane.ts";
const DOMAIN_PREFIX = "packages/server/src/domain/";
/** TWO anchors, because the two whole-tree arms need different guards (§4.5). The BLINDNESS arm asks "does
 *  a real domain tree exist at all", so it anchors on `domain/chat/bus.ts` — which every example plants,
 *  deliberately, so the blindness arm is exercised as satisfied rather than skipped. The ORPHAN arm is a
 *  claim about the WHOLE domain roster and would fire on every mini-project, so it anchors on a file no
 *  example needs and only the real workspace has. */
const ANCHOR = "packages/server/src/domain/chat/bus.ts";
const ROSTER_ANCHOR = "packages/db/src/schema/index.ts";
const DB_IMPORT = "@orb/db";
const WRITE_RE = /\.(?:insert|update|delete|batch)\s*\(/u;
/** Every injected-emit spelling a domain announces through (survey §1.1). `emit(` alone covers the chat
 *  bus's `bus.emit` and the domain-event `ctx.emit`. */
const EMIT_RE = /\b(?:emitUserEvent|emitChatEvent|emitWiEvent|emitBus|emit)\s*\(/u;
const COMMENTS_RE = /\/\/[^\n]*|\/\*[\s\S]*?\*\//gu;

// Each arm's text is a SUFFIX so the finding reads `"<domain>" <verdict> … <pointer>` — `diagnostic-legibility`
// requires the message to END with a code-home, which a `prefix + name` composition cannot do.
const MISSING_SUFFIX = "is a MUTATING domain with NO row in DOMAIN_FRESHNESS — it writes and nothing says how a client finds out. Add its row in";
const STALE_SUFFIX = "carries a `none` row but DOES emit — it grew a plane and the registry still claims silence. Name the plane in";
const ORPHAN_SUFFIX =
  "has a DOMAIN_FRESHNESS row but writes nothing (deleted, or gone read-only) — a standing verdict about a site that is gone. Delete the row in";
const BLIND_MESSAGE =
  "DERIVED NO MUTATING DOMAINS on a tree that HAS packages/server/src/domain/chat — the write derivation " +
  "has stopped matching (a drizzle spelling changed, or the domain root moved), so this gate's ✓ is a " +
  "placebo (GATE-AUTHORING.md §4.6). Re-point it: scripts/check/gates/domain-freshness-plane.ts";

/** `<domain>` for a repo-relative path under the domain root, else undefined. */
function domainOf(rel: string): string | undefined {
  if (!rel.includes(DOMAIN_PREFIX)) {
    return;
  }
  return rel.slice(rel.indexOf(DOMAIN_PREFIX) + DOMAIN_PREFIX.length).split("/")[0];
}

interface DomainFacts {
  mutates: boolean;
  emits: boolean;
}

function deriveDomains(files: readonly SourceFile[]): Map<string, DomainFacts> {
  const out = new Map<string, DomainFacts>();
  for (const sf of files) {
    const name = domainOf(sf.getFilePath());
    if (name === undefined || name === "") {
      continue;
    }
    const text = sf.getFullText().replace(COMMENTS_RE, "");
    const facts = out.get(name) ?? { mutates: false, emits: false };
    // The `@orb/db` half is what keeps a MiniSearch `.delete(` or a `Map.delete(` out of the derivation.
    if (sf.getFullText().includes(DB_IMPORT) && WRITE_RE.test(text)) {
      facts.mutates = true;
    }
    if (EMIT_RE.test(text)) {
      facts.emits = true;
    }
    out.set(name, facts);
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "domain-freshness-plane",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // a registry reconcile over every domain — a scoped run sees a fraction and would false-ORPHAN
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes(DOMAIN_PREFIX),

  run: (ctx) => {
    const derived = deriveDomains(ctx.project.getSourceFiles().filter((f) => f.getFilePath().includes(DOMAIN_PREFIX)));
    const mutating = [...derived.entries()].filter(([, f]) => f.mutates);
    if (mutating.length === 0) {
      if (fileLoaded(ctx, ANCHOR)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_MESSAGE });
      }
      return; // a synthetic mini-project with no real domain tree is a legitimate zero (§4.5)
    }
    for (const [name, facts] of mutating) {
      const row = DOMAIN_FRESHNESS[name];
      if (row === undefined) {
        ctx.report({
          file: `${DOMAIN_PREFIX}${name}/`,
          line: 1,
          column: 0,
          message: `"${name}" ${MISSING_SUFFIX} scripts/check/gates/domain-freshness-plane.ts`,
        });
        continue;
      }
      if (row.plane === "none" && facts.emits) {
        ctx.report({
          file: `${DOMAIN_PREFIX}${name}/`,
          line: 1,
          column: 0,
          message: `"${name}" ${STALE_SUFFIX} scripts/check/gates/domain-freshness-plane.ts`,
        });
      }
    }
    if (!fileLoaded(ctx, ROSTER_ANCHOR)) {
      return; // the ORPHAN arm is a whole-roster claim — never fire it on a partial tree
    }
    const mutatingNames = new Set(mutating.map(([n]) => n));
    for (const name of Object.keys(DOMAIN_FRESHNESS)) {
      if (!mutatingNames.has(name)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `"${name}" ${ORPHAN_SUFFIX} scripts/check/gates/domain-freshness-plane.ts` });
      }
    }
  },

  mustFlag: [
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/server/src/domain/__probe/verbs/write-thing.ts":
          'import { refinerySessions } from "@orb/db";\nexport async function run(ctx) {\n  await ctx.db.update(refinerySessions).set({ n: 1 });\n}\n',
      },
      expect: { messageIncludes: "MUTATING domain with NO row" },
      why: "THE FOUNDING HOLE reproduced as the survey's own reach probe (§3.1): a domain that persists and has no registry row. This is exactly the state `refinery` was in before 2026-08-14 — and the state no ratchet could see, because refinery had no belt to quantify over. The probe domain is used rather than `refinery` itself precisely BECAUSE refinery now carries a row: a fixture keyed on a real domain would silently stop proving anything the day that domain was registered",
    },
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/server/src/domain/sessions/persistence/sessions.ts":
          'import { sessions } from "@orb/db";\nexport async function touch(ctx) {\n  await ctx.db.update(sessions).set({ n: 1 });\n  ctx.emitUserEvent(1, { type: "sessionsChanged" });\n}\n',
      },
      expect: { messageIncludes: "DOES emit" },
      why: "the STALE direction — `sessions` carries a cited `none` row, and the day it grows an emit the row is a lie. Self-cleaning both ways is what keeps a registry from rotting into paperwork",
    },
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        // The ROSTER anchor — present only here, so only this example arms the whole-roster ORPHAN sweep.
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
      },
      expect: { messageIncludes: "writes nothing" },
      why: "the ORPHAN direction — every other registry row names a domain this mini-tree does not have. A row that survives its domain's deletion is a standing verdict about nothing",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/server/src/domain/search/substrate/field-index.ts":
          'import MiniSearch from "minisearch";\nconst cache = new Map();\nexport function drop(k) {\n  cache.delete(k);\n  index.remove(k);\n}\n',
      },
      why: "DECLARED LIMIT MADE A PIN — `search`'s only `.delete(` is a Map/MiniSearch call in a file that never imports @orb/db, so it is NOT a mutating domain. Without the @orb/db half the derivation would classify every in-memory cache as persistence and the whole registry would be noise",
    },
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/server/src/domain/export/verbs/dump.ts":
          'import { characters } from "@orb/db";\nexport async function dump(ctx) {\n  return await ctx.db.select().from(characters);\n}\n',
      },
      why: "a READ-ONLY domain (`export`) needs no row at all — the registry quantifies over WRITERS, so a domain that only projects canon is neither MISSING nor ORPHAN. This is why `export` and `import` carry no row today",
    },
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/server/src/domain/sessions/persistence/sessions.ts":
          'import { sessions } from "@orb/db";\nexport async function touch(ctx) {\n  await ctx.db.update(sessions).set({ n: 1 });\n}\n',
      },
      why: "a cited `none` row that stays honest: `sessions` mutates auth substrate and emits nothing, which is the verdict the row records. `none` is a CLAIM the gate keeps checking, not an exemption from being checked",
    },
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/server/src/domain/imagery/persistence/queries.ts":
          'import { imageryGenerations } from "@orb/db";\nexport async function store(ctx) {\n  await ctx.db.insert(imageryGenerations).values({ n: 1 });\n}\n',
      },
      why: "DECLARED LIMIT — a domain whose plane's PRODUCER lives elsewhere (`imagery` writes, the chat verb emits) passes on its cited row alone. The gate cross-checks emits only against `none`; it cannot verify that a named foreign plane really fires for this domain's writes",
    },
  ],
};
