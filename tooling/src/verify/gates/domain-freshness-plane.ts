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
// SECOND AXIS — ROOM REACH (entity→room member-freshness bridge §7, 2026-08-14). The plane above answers
// "how does THE OWNER's client learn"; it says nothing about the OTHER audience plane, the rooms where other
// humans sit on a member-visible projection of the owner's entity. That gap is what the bridge closed for
// character/persona/world-info, and this axis is what stops the NEXT seated entity kind shipping silent.
// Every row declares `roomReach`, and the SEATED arm derives its own truth from the schema: a domain is
// SEATABLE when a CHAT-ANCHORED table (one with an FK to `chats.id`) carries an FK to one of that domain's
// tables — i.e. the room literally holds a pointer to its rows. Seating a new entity kind therefore requires
// the junction, the junction makes the domain seatable, and a seatable domain may not answer `none`.
// Two-sided, like everything else here: `bridge`/`seated-exempt` on a domain the schema does NOT show seated
// is RED as well (the seating was removed and the claim outlived it).
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
import type { RoomEntityKind } from "@orb/contracts/chat";
import type { SourceFile } from "ts-morph";
import type { ExemptionRow, GateDescriptor } from "../contract/gate.ts";
import { blankTsComments } from "../lib/comment-spans.ts";
import { fileLoaded } from "../lib/pass.ts";

/** Where a domain's writes become visible to a client. `none` is the cited no-announcement verdict; every
 *  other value names the plane and, for a plane whose PRODUCER lives in another domain, says whose. */
type FreshnessPlane = "chat-bus" | `user-bus:${string}` | `own-bus:${string}` | "domain-events" | "workload-events" | "notifications-inbox" | "none";

/** The OTHER audience plane: whether an owner-plane edit of this domain's entities reaches the ROOMS those
 *  entities are seated in (the entity→room bridge, `docs/design/entity-room-member-freshness-bridge.md`).
 *  Three arms, and the SEATED derivation decides which are legal for a given domain:
 *    • `bridge` — on the bridge. `entity` is typed to the CONTRACT's own union, so renaming a kind fails tsc
 *      here (the same closed axis `ROOM_REACH` and `BUS_FILTERS.roomEntityChanged` key on).
 *    • `seated-exempt` — the schema DOES seat this domain's rows in rooms, and there is a cited reason no
 *      room fan is owed. Legal ONLY for a domain the SEATED derivation finds; a stale one is RED.
 *    • `none` — not room-seated at all. Illegal for a seatable domain: that is SEATED-red, the whole point.
 *  `why` carries the cite AND the end condition on both non-bridge arms (`ExemptionRow`, widened never
 *  re-spelled); the `bridge` arm needs none — its receipt is the resolver the tsc belt forces to exist. */
type RoomReach = { readonly lane: "bridge"; readonly entity: RoomEntityKind } | (ExemptionRow & { readonly lane: "seated-exempt" | "none" });

/** A row is `{ plane, roomReach, why }` — `why` is the CITE (the emit site, or the reason a write needs no
 *  plane, with the condition that would end it). `ExemptionRow` is widened by intersection, never
 *  re-spelled. `roomReach` is REQUIRED: every one of the rows below had to declare on the day it landed. */
type FreshnessRow = ExemptionRow & { readonly plane: FreshnessPlane; readonly roomReach: RoomReach };

/** THE REGISTRY. Every mutating domain, its plane, and the receipt. Derived rows were read off the tree
 *  2026-08-14 (`emitUserEvent`/`emitChatEvent`/`emitWiEvent`/`emitBus`/`emit` call sites per domain). */
const DOMAIN_FRESHNESS: Readonly<Record<string, FreshnessRow>> = {
  admin: {
    plane: "user-bus:identityChanged",
    roomReach: {
      lane: "none",
      why: "the identity root carries no member-visible ROOM projection: a human seat renders its ACTIVE PERSONA's name+avatar (entry/compose/chat.ts::resolveUserPublics), never the users row, and no chat-anchored table FKs a table admin owns. Ends if a seat ever renders a users-row field.",
    },
    why: "admin/verbs emit identityChanged when a role/ban flips; the client re-reads identity off it. Ends if admin stops mutating users.",
  },
  assets: {
    plane: "domain-events",
    roomReach: {
      lane: "seated-exempt",
      why: "SEATED — `imagery_generations` (chat-anchored) FKs `assets.id`. No fan is owed: the CAS row is content-addressed, so its BYTES can never change under a room; a new asset arrives as the chat message that carries it, and an avatar SWAP moves the character/persona row's `avatarAssetId`, which fans as that entity's own bridge kind. Ends the day an assets row gains a mutable member-visible field.",
    },
    why: "assets/verbs/store.ts emits `asset.created` on the in-process bus; the embeddings indexer is the subscriber. The CAS row itself is content-addressed and never edited.",
  },
  automation: {
    plane: "own-bus:automation",
    roomReach: {
      lane: "seated-exempt",
      why: "SEATED — `automation_fires` (chat-anchored) FKs `automation_rules.id`. No bridge fan is owed because the rules are THEMSELVES chat-anchored rows: they already announce on the per-chat automation room (the `own-bus:automation` plane above), which is the same room the bridge would fan into. Ends if rule content ever reaches a member through a chat-scoped read the automation room does not drive.",
    },
    why: "the rule engine + the five rule-CRUD verbs emit through the injected `notify` sink onto the per-chat automation room (rulesChanged wired 2026-08-14, bus wave 2).",
  },
  character: {
    plane: "user-bus:charactersChanged",
    roomReach: { lane: "bridge", entity: "character" },
    why: "character/verbs emit charactersChanged AND `character.updated` on the domain bus (the indexer + the multi-human chat fan). Two consumers, two planes, both live.",
  },
  chat: {
    plane: "chat-bus",
    roomReach: {
      lane: "none",
      why: "chat IS the room — its writes are the room's own events, so there is no OTHER audience plane to reach. The seating derivation skips chat's own tables for exactly this reason. Unendable while the chat bus is the room.",
    },
    why: "the turn lifecycle IS the chat bus — 18 member types emitted from the engine and the canon verbs, durable-first into chat_events.",
  },
  connection: {
    plane: "none",
    roomReach: {
      lane: "none",
      why: "no chat-anchored table FKs a connection table, and a member never reads a connection: the server resolves the room's connection per turn. Ends if a room ever renders which backend it is speaking to.",
    },
    why: "the only writes are the model-CATALOG SNAPSHOT caches (persistence/catalog-snapshot.ts, agent-sdk-catalog-snapshot.ts) — a re-derivable cache of what a connection can list, not user canon. The user-facing member `connectionsChanged` is the one live owner deferral, declared in tooling/src/verify/gates/user-bus-deferred-member.ts (#1822); this row flips to `user-bus:connectionsChanged` the day that deferral is deleted.",
  },
  credentials: {
    plane: "user-bus:credentialsChanged",
    roomReach: {
      lane: "none",
      why: "credentials are never member-visible anywhere, by the credential firewall — a room projection of one would be the defect, not the freshness gap.",
    },
    why: "credentials/verbs emit credentialsChanged after every CRUD + the health-strike writes.",
  },
  databank: {
    plane: "user-bus:databankChanged",
    roomReach: {
      lane: "seated-exempt",
      why: "SEATED — `chat_documents` FKs `documents.id`, and the per-chat rack IS member-visible. THIS IS A KNOWN GAP, DEFERRED BY OWNER RULING (bridge design §8 + fork F-E, 2026-08-14): an owner RENAME emits only `databankChanged` (editor-only), so co-members see the stale title until reload. The wave shipped the owner-named three kinds; databank is the named candidate `bridge` row (entity `databank`, reach = the D85 scope junctions). Ends when that row lands — at which point this arm becomes RED-if-not-updated by the bridge's own tsc belts.",
    },
    why: "the CRUD/scrape/reindex verbs and the upload terminal emit databankChanged (bus wave 2, 2026-08-14; the four databank STATIC rows were deleted with it).",
  },
  discovery: {
    plane: "user-bus:corpusRecomputed",
    roomReach: {
      lane: "none",
      why: "discovery writes derived analytics tables no chat-anchored table references, and nothing it computes is projected into a room.",
    },
    why: "each bulk recompute pass emits corpusRecomputed at its terminal (bus wave 2, 2026-08-14) — the survey §3.4-4 sweep-terminal shape.",
  },
  embeddings: {
    plane: "user-bus:corpusRecomputed",
    roomReach: {
      lane: "none",
      why: "vectors are derived data with no member-visible projection at all (Knowledge-Cluster); no chat-anchored table FKs a vector table.",
    },
    why: "the indexer's bulk terminals share discovery's corpusRecomputed member — one event per pass, two producers, one client filter.",
  },
  imagery: {
    plane: "chat-bus",
    roomReach: {
      lane: "none",
      why: "`imagery_generations` is itself the chat-anchored row (it FKs `chats.id`), not a seated entity of another domain — its member-visible artefact is the chat message, which rides the chat bus. Ends if a standalone imagery entity is ever seated in a room.",
    },
    why: "imagery persists generations + provenance, but the USER-visible artefact is the chat message that carries the image; chat/verbs/generate-image emits on the chat bus. Ends if a standalone imagery gallery surface lands with its own reads.",
  },
  notifications: {
    plane: "notifications-inbox",
    roomReach: {
      lane: "none",
      why: "the inbox is per-RECIPIENT by construction — the opposite of a room projection; a notification is delivered to a user, never rendered as room state.",
    },
    why: "the durable inbox rows ARE the plane — `record` is the ONE recipient chokepoint (Core-0 §8) and the `notifications` room streams them; there is no second announcement to make.",
  },
  persona: {
    plane: "user-bus:personasChanged",
    roomReach: { lane: "bridge", entity: "persona" },
    why: "persona/verbs emit personasChanged on every CRUD; the pin/active writes ride it too.",
  },
  plugin: {
    plane: "notifications-inbox",
    roomReach: {
      lane: "none",
      why: "the plugin registry is process-local and no chat-anchored table FKs it; a plugin's room-visible effect is whatever canon it writes, which rides the chat bus.",
    },
    why: "plugin state changes reach the user as `plugin-disabled` notification arms (activation/crash-policy.ts); the registry itself is process-local and re-read at activation.",
  },
  preset: {
    plane: "user-bus:presetsChanged",
    roomReach: {
      lane: "seated-exempt",
      why: "SEATED — `rpg_games` (chat-anchored) FKs `presets.id`. No fan is owed BY OWNER WORD (bridge design §8 + fork F-F): members never fetch a preset — the server assembles the turn — so there is no member-visible projection to refresh. A visible 'the host changed the model' notice is a PRODUCT choice, not freshness infrastructure; the day it is wanted it is one `roomEntityChanged`-class emit at the preset write, and this row becomes a `bridge` row. That is this exemption's end condition.",
    },
    why: "preset/verbs emit presetsChanged; generation config is single-owned per user, the exact 'an entity you own changed' posture.",
  },
  refinery: {
    plane: "user-bus:refineryChanged",
    roomReach: {
      lane: "none",
      why: "refinery sessions are an owner-private authoring workspace over a card; no chat-anchored table FKs them, and the ROOM only ever sees the character row the refinery eventually writes — which fans as `character`.",
    },
    why: "THE FOUNDING HOLE, closed 2026-08-14: the 11 persisting verbs now emit refineryChanged after their durable writes, and the six refinery STATIC rows self-cleaned away.",
  },
  regex: {
    plane: "user-bus:regexChanged",
    why: "regex/verbs emit regexChanged; the script library is per-user canon.",
    roomReach: {
      lane: "seated-exempt",
      why: "SEATED — `chat_regex_scripts` FKs `regex_scripts.id`, and a DISPLAY-tier script can change the bytes a member reads in the transcript (`chat/substrate/regex-tier.ts`). DEFERRED BY OWNER RULING (bridge design §8 + fork F-E, 2026-08-14): whether script CONTENT edits owe a room fan needs its own read of the display path — which tier actually re-renders, and whether the member's transcript re-reads at all. Named candidate `bridge` row. Ends with that read.",
    },
  },
  "roster-preset": {
    plane: "user-bus:rosterPresetsChanged",
    why: "roster-preset/verbs emit rosterPresetsChanged on every library CRUD (#26 — D61 B6); applyToChat mutates the CHAT, whose freshness is chat's own chatUpdated fan through the injected verbs.",
    roomReach: {
      lane: "none",
      why: "a saved party is LIBRARY data — no chat-anchored table FKs roster_presets (a preset is a stamp, not a live link: deliberately no back-reference column on chats), so no room seats it.",
    },
  },
  rpg: {
    plane: "own-bus:rpg",
    why: "domain/rpg/bus.ts is the sanctioned domain-minted singleton (G10/O4); 16 verb/flush sites emit its six members.",
    roomReach: {
      lane: "none",
      why: "`rpg_games` is itself the chat-anchored row, and every member-visible rpg projection already fans on the per-chat rpg bus (the `own-bus:rpg` plane above). The domain owns no entity another room seats.",
    },
  },
  sessions: {
    plane: "none",
    roomReach: {
      lane: "none",
      why: "auth substrate; a session has no projection on any surface, let alone a member-visible one. Same end condition as the plane row.",
    },
    why: "BFF session/token/OIDC rows are AUTH substrate with no client projection — the browser learns about them through the auth response and the 401 path, never a cache read. Ends if a 'your sessions' management surface lands.",
  },
  settings: {
    plane: "user-bus:settingsChanged",
    roomReach: {
      lane: "none",
      why: "settings are per-user tiers no chat-anchored table references; the room-affecting ones (group defaults, TTLs) are read server-side at the write they seed, never projected live to members.",
    },
    why: "settings/verbs emit settingsChanged and themesChanged; both are per-user tiers with live client reads.",
  },
  stats: {
    plane: "chat-bus",
    roomReach: {
      lane: "none",
      why: "turn economics are host-facing and the stats fence (Knowledge-Cluster) forbids stats raising its own event; no chat-anchored table FKs a stats table.",
    },
    why: "turn economics are written inside the chat turn's own batch and are read on the chat surface — turnCompleted is the announcement. The stats fence (Knowledge-Cluster) forbids stats raising its own user-visible event.",
  },
  tag: {
    plane: "user-bus:tagsChanged",
    why: "tag/verbs emit tagsChanged for the namespace and every entity junction.",
    roomReach: {
      lane: "seated-exempt",
      why: "SEATED — `chat_tags` FKs `tags.id`. No fan is owed: a chat tag is a per-TAGGER overlay (D30 — the junction carries its own `ownerId` because chats are ownerless), so a member never reads another human's chat tags; a rename moves only its owner's list, which rides `tagsChanged`. Ends if chat tags ever render to co-members.",
    },
  },
  workloads: {
    plane: "workload-events",
    roomReach: { lane: "none", why: "workload rows are per-user execution state with a durable progress bus of their own; no chat-anchored table FKs them." },
    why: "the engine runner/reaper emit six WorkloadEvent members on the progress bus, with `workloads.progress` as the durable reconnect truth (D118).",
  },
  "world-info": {
    plane: "user-bus:worldInfoChanged",
    roomReach: { lane: "bridge", entity: "world-info" },
    why: "world-info/verbs emit worldInfoChanged, and the chat-scoped attachment verbs additionally emit the five WiBusEvent members through the injected emitWiEvent onto the chat bus.",
  },
};

const MESSAGE =
  "a MUTATING domain must declare its FRESHNESS PLANE — how a client learns the write happened. The three " +
  "bus coverage ratchets quantify over BELTS, not over buses, so a domain with no bus at all is invisible " +
  "to every one of them: refinery shipped 11 persisting verbs and zero events, and the only trace was a " +
  "STATIC citation on the READ side (event-bus coverage survey §2.2). The table in " +
  "tooling/src/verify/gates/domain-freshness-plane.ts is the ONE home for that verdict, `none` included.";

const FIX =
  "add the domain's row to DOMAIN_FRESHNESS in tooling/src/verify/gates/domain-freshness-plane.ts: the plane it " +
  "announces on (`chat-bus` · `user-bus:<member>` · `own-bus:<name>` · `domain-events` · " +
  "`workload-events` · `notifications-inbox`) and the CITE. If the honest answer is that the write needs no " +
  "announcement, the row is `none` plus the reason AND the condition that would end it — never an omission.";

const GATE_SELF = "tooling/src/verify/gates/domain-freshness-plane.ts";
const DOMAIN_PREFIX = "packages/server/src/domain/";
/** TWO anchors, because the two whole-tree arms need different guards (§4.5). The BLINDNESS arm asks "does
 *  a real domain tree exist at all", so it anchors on `domain/chat/bus.ts` — which every example plants,
 *  deliberately, so the blindness arm is exercised as satisfied rather than skipped. The ORPHAN arm is a
 *  claim about the WHOLE domain roster and would fire on every mini-project, so it anchors on a file no
 *  example needs and only the real workspace has. */
const ANCHOR = "packages/server/src/domain/chat/bus.ts";
const ROSTER_ANCHOR = "packages/db/src/schema/index.ts";
/** THE THIRD anchor (§4a), for the UNSEATABLE_SCHEMA stale sweep alone: a real-tree file that is NOT any
 *  row's own path (keying a row's staleness on its OWN file is the documented anti-pattern) and that no
 *  conformance example needs — the room-reach examples all plant schema files, so `index.ts` is too weak
 *  a guard for this arm and would report every table-bearing mini-project as having lost the seating. */
const SEATING_STALE_ANCHOR = "packages/db/src/schema/relations.ts";
const DB_IMPORT = "@orb/db";
const WRITE_RE = /\.(?:insert|update|delete|batch)\s*\(/u;
/** Every injected-emit spelling a domain announces through (survey §1.1). `emit(` alone covers the chat
 *  bus's `bus.emit` and the domain-event `ctx.emit`. */
const EMIT_RE = /\b(?:emitUserEvent|emitChatEvent|emitWiEvent|emitBus|emit)\s*\(/u;

// Each arm's text is a SUFFIX so the finding reads `"<domain>" <verdict> … <pointer>` — `diagnostic-legibility`
// requires the message to END with a code-home, which a `prefix + name` composition cannot do.
const MISSING_SUFFIX = "is a MUTATING domain with NO row in DOMAIN_FRESHNESS — it writes and nothing says how a client finds out. Add its row in";
const STALE_SUFFIX = "carries a `none` row but DOES emit — it grew a plane and the registry still claims silence. Name the plane in";
const ORPHAN_SUFFIX =
  "has a DOMAIN_FRESHNESS row but writes nothing (deleted, or gone read-only) — a standing verdict about a site that is gone. Delete the row in";
const BLIND_MESSAGE =
  "DERIVED NO MUTATING DOMAINS on a tree that HAS packages/server/src/domain/chat — the write derivation " +
  "has stopped matching (a drizzle spelling changed, or the domain root moved), so this gate's ✓ is a " +
  "placebo (GATE-AUTHORING.md §4.6). Re-point it: tooling/src/verify/gates/domain-freshness-plane.ts";
const SEATED_SUFFIX =
  "is ROOM-SEATED (a chat-anchored table carries an FK to one of its tables — the room literally holds a " +
  "pointer to its rows) but its row answers `roomReach: none`. An owner-plane edit of a seated entity goes " +
  "STALE on every OTHER human's open room, which is the exact defect the entity→room bridge closed for " +
  "character/persona/world-info. Put it on the bridge (a `RoomEntityKind` + its resolver + its client " +
  "filters), or say `seated-exempt` with the cite AND the end condition, in";
const UNSEATED_CLAIM_SUFFIX =
  "claims room seating (`roomReach: bridge`/`seated-exempt`) that the SCHEMA no longer shows — no " +
  "chat-anchored table FKs any of its tables, so the claim is a standing verdict about a junction that is " +
  "gone. Move the row to a cited `none` in";
const UNOWNED_SEATED_PREFIX =
  "a CHAT-ANCHORED table FKs a table declared in a schema file with no same-named domain and no " +
  "UNSEATABLE_SCHEMA row, so the seating cannot be attributed to any domain and SEATED-red is silently " +
  "blind to it. Classify it (rename the schema file to its producing domain, or add the row WITH its " +
  "reason) in tooling/src/verify/gates/domain-freshness-plane.ts: ";
const STALE_UNSEATABLE_PREFIX =
  "UNSEATABLE_SCHEMA row for a schema file no chat-anchored table references any more (ratchet down) — delete it in tooling/src/verify/gates/domain-freshness-plane.ts: ";
const SEATING_BLIND_MESSAGE =
  "DERIVED NO CHAT-ANCHORED TABLES on a tree that HAS packages/db/src/schema/index.ts — the seating " +
  "derivation has stopped matching (the `references(() => chats.id)` spelling changed, or the schema root " +
  "moved), so SEATED-red is a placebo (GATE-AUTHORING.md §4.6). Re-point it: " +
  "tooling/src/verify/gates/domain-freshness-plane.ts";

const SCHEMA_PREFIX = "packages/db/src/schema/";
const SCHEMA_FILE_RE = /packages\/db\/src\/schema\/(?<name>[^/]+)\.ts$/u;
/** `export const X = sqliteTable(` — the declaration the seating derivation walks. */
const SQLITE_TABLE_RE = /^sqliteTable\s*\(/u;
/** Every FK target inside one table declaration: `.references(() => <table>.<column>`. */
const REFERENCES_RE = /\.references\(\s*\(\)\s*=>\s*(\w+)\./gu;
/** The table whose FK makes a table CHAT-ANCHORED. */
const CHATS_TABLE = "chats";
/** The room's own producer — a chat-anchored table pointing at chat's OWN rows is not "seating" anything. */
const ROOM_DOMAIN = "chat";

/** Schema files whose tables a chat-anchored table FKs but which have NO same-named domain, so the seating
 *  cannot be attributed. TOTAL: an unrowed one is RED (never silently un-seatable), and a row whose file is
 *  no longer referenced from a chat-anchored table is RED too. */
const UNSEATABLE_SCHEMA: Readonly<Record<string, ExemptionRow>> = {
  users: {
    why:
      "`chat_participants`/`chats`/`messages`/… all FK `users.id`, but the identity root has NO member-visible " +
      "room projection to go stale: a human seat renders its ACTIVE PERSONA's name+avatar " +
      "(`entry/compose/chat.ts::resolveUserPublics`), which is on the bridge as `persona`, and every other " +
      "users column is auth substrate. Its producers are `sessions`/`admin` (own-tables-only's SCHEMA_OWNERS), " +
      "neither of which owns a room-rendered entity. Ends the day a seat renders a users-row field directly.",
  },
};

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

/** The `sqliteTable` declarations a schema source exports, each with the tables its columns FK. Text-level
 *  on the declaration's own initializer (never the whole file), so a `references(() => chats.id)` in a
 *  neighbouring table cannot bleed into this one's answer. */
function tablesIn(sf: SourceFile): Map<string, ReadonlySet<string>> {
  const out = new Map<string, ReadonlySet<string>>();
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer()?.getText() ?? "";
      if (!SQLITE_TABLE_RE.test(init)) {
        continue;
      }
      out.set(decl.getName(), new Set([...init.matchAll(REFERENCES_RE)].map((m) => m[1] ?? "")));
    }
  }
  return out;
}

/** `packages/db/src/schema/*.ts` indexed once: table const → its schema file, and table const → the tables
 *  its columns FK. Two maps rather than one record so the seating walk reads like the question it asks. */
function indexSchema(files: readonly SourceFile[]): { fileOf: Map<string, string>; refsOf: Map<string, ReadonlySet<string>> } {
  const fileOf = new Map<string, string>();
  const refsOf = new Map<string, ReadonlySet<string>>();
  for (const sf of files) {
    const schema = SCHEMA_FILE_RE.exec(sf.getFilePath())?.groups?.["name"];
    if (schema === undefined) {
      continue;
    }
    for (const [table, refs] of tablesIn(sf)) {
      fileOf.set(table, schema);
      refsOf.set(table, refs);
    }
  }
  return { fileOf, refsOf };
}

/** What the SEATED arm derives, in one pass over `packages/db/src/schema/*.ts`. */
interface SeatingFacts {
  /** Domains whose tables a CHAT-ANCHORED table points at — the room holds a pointer to their rows. */
  readonly seated: ReadonlySet<string>;
  /** Schema-file basenames the seating reached that have no same-named domain (the totality arm's input). */
  readonly unattributed: ReadonlySet<string>;
  /** Did the derivation find ANY chat-anchored table at all? (`false` on a real tree ⇒ blindness.) */
  readonly derived: boolean;
}

/** SEATING, derived from the schema and never hand-listed: a table is CHAT-ANCHORED when it FKs `chats.id`;
 *  every OTHER table such a table FKs is SEATED, and its owner is the domain named by its schema file
 *  (producer-names-the-schema, the same mapping `own-tables-only` derives). `chat`'s own tables are skipped:
 *  the room holding pointers to its own rows is the chat bus's job, not a second audience plane. */
function deriveSeating(files: readonly SourceFile[], domains: ReadonlySet<string>): SeatingFacts {
  const { fileOf, refsOf } = indexSchema(files);
  const seated = new Set<string>();
  const unattributed = new Set<string>();
  let derived = false;
  for (const [table, refs] of refsOf) {
    if (!refs.has(CHATS_TABLE) && table !== CHATS_TABLE) {
      continue;
    }
    derived = true;
    for (const target of refs) {
      const schema = fileOf.get(target);
      if (target === CHATS_TABLE || schema === undefined || schema === ROOM_DOMAIN) {
        continue;
      }
      if (domains.has(schema)) {
        seated.add(schema);
      } else {
        unattributed.add(schema);
      }
    }
  }
  return { seated, unattributed, derived };
}

function deriveDomains(files: readonly SourceFile[]): Map<string, DomainFacts> {
  const out = new Map<string, DomainFacts>();
  for (const sf of files) {
    const name = domainOf(sf.getFilePath());
    if (name === undefined || name === "") {
      continue;
    }
    // The ONE comment blanker (tooling/src/verify/lib/comment-spans.ts), not a hand-rolled regex: the old
    // `//[^\n]*` strip also ate everything after a `//` inside a STRING — a `https://` URL blanked the
    // rest of its line, so a `.insert(` behind one was invisible and the domain read as non-mutating.
    const text = blankTsComments(sf);
    const facts = out.get(name) ?? { mutates: false, emits: false };
    // The `@orb/db` half is what keeps a MiniSearch `.delete(` or a `Map.delete(` out of the derivation.
    if (text.includes(DB_IMPORT) && WRITE_RE.test(text)) {
      facts.mutates = true;
    }
    if (EMIT_RE.test(text)) {
      facts.emits = true;
    }
    out.set(name, facts);
  }
  return out;
}

/** The room-reach verdict for one domain: what the SCHEMA says vs what the ROW claims. Both directions are
 *  findings — a seated domain answering `none` is the honesty ratchet, and an unseated domain claiming
 *  seating is the stale half that keeps the first from rotting into paperwork. */
function seatingVerdict(isSeated: boolean, lane: RoomReach["lane"]): string | undefined {
  if (isSeated) {
    return lane === "none" ? SEATED_SUFFIX : undefined;
  }
  return lane === "none" ? undefined : UNSEATED_CLAIM_SUFFIX;
}

/** THE ROOM-REACH AXIS, all four arms. Split out of `run` because it is a second, independent reconcile —
 *  the plane axis asks "does the OWNER learn", this one asks "do the room's OTHER humans".
 *
 *  Whole-tree, so it is guarded on the ROSTER anchor exactly like the ORPHAN arm: a conformance mini-project
 *  plants a handful of files, and judging seating there would "prove" every junction had vanished. The
 *  examples that DO want this axis plant the anchor themselves. */
function reportRoomReach(ctx: Parameters<NonNullable<GateDescriptor["run"]>>[0], mutating: ReadonlySet<string>): void {
  if (!fileLoaded(ctx, ROSTER_ANCHOR)) {
    return;
  }
  const files = ctx.project.getSourceFiles().filter((f) => f.getFilePath().includes(SCHEMA_PREFIX));
  const seating = deriveSeating(files, mutating);
  const report = (message: string): void => {
    ctx.report({ file: GATE_SELF, line: 1, column: 0, message });
  };
  if (!seating.derived) {
    report(SEATING_BLIND_MESSAGE);
    return; // a placebo derivation must not then pronounce on any row
  }
  for (const name of mutating) {
    const lane = DOMAIN_FRESHNESS[name]?.roomReach.lane;
    if (lane === undefined) {
      continue; // already MISSING-red; one finding per hole
    }
    const suffix = seatingVerdict(seating.seated.has(name), lane);
    if (suffix !== undefined) {
      ctx.report({ file: `${DOMAIN_PREFIX}${name}/`, line: 1, column: 0, message: `"${name}" ${suffix} tooling/src/verify/gates/domain-freshness-plane.ts` });
    }
  }
  // The attribution totality arm + its own two-sided ratchet: seating that lands on a schema file with no
  // same-named domain is either classified here or RED, and a classification whose seating is gone is RED.
  for (const schema of seating.unattributed) {
    if (!(schema in UNSEATABLE_SCHEMA)) {
      report(`${UNOWNED_SEATED_PREFIX}"${schema}"`);
    }
  }
  if (!fileLoaded(ctx, SEATING_STALE_ANCHOR)) {
    return; // §4a: the stale sweep needs an anchor NO example plants and that is not any row's own path
  }
  for (const schema of Object.keys(UNSEATABLE_SCHEMA)) {
    if (!seating.unattributed.has(schema)) {
      report(`${STALE_UNSEATABLE_PREFIX}"${schema}"`);
    }
  }
}

export const gate: GateDescriptor = {
  name: "domain-freshness-plane",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // a registry reconcile over every domain — a scoped run sees a fraction and would false-ORPHAN
  message: MESSAGE,
  fix: FIX,
  // The domain tree (the plane axis) PLUS the schema tree — the ROOM-REACH axis derives seating from the FK
  // graph in `packages/db/src/schema/*.ts`, so those files are genuinely READ, not merely anchored on.
  scanRoot: (p) => p.includes(DOMAIN_PREFIX) || p.includes(SCHEMA_PREFIX),

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
          message: `"${name}" ${MISSING_SUFFIX} tooling/src/verify/gates/domain-freshness-plane.ts`,
        });
        continue;
      }
      if (row.plane === "none" && facts.emits) {
        ctx.report({
          file: `${DOMAIN_PREFIX}${name}/`,
          line: 1,
          column: 0,
          message: `"${name}" ${STALE_SUFFIX} tooling/src/verify/gates/domain-freshness-plane.ts`,
        });
      }
    }
    const mutatingNames = new Set(mutating.map(([n]) => n));
    reportRoomReach(ctx, mutatingNames);
    if (!fileLoaded(ctx, ROSTER_ANCHOR)) {
      return; // the ORPHAN arm is a whole-roster claim — never fire it on a partial tree
    }
    for (const name of Object.keys(DOMAIN_FRESHNESS)) {
      if (!mutatingNames.has(name)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `"${name}" ${ORPHAN_SUFFIX} tooling/src/verify/gates/domain-freshness-plane.ts` });
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
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        // The room, plus a chat-anchored junction pointing at a credentials table: exactly the shape that
        // makes a domain SEATED, expressed in the same drizzle spelling the real schema uses.
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n',
        "packages/db/src/schema/credentials.ts":
          'export const credentials = sqliteTable("credentials", { id: text("id").primaryKey() });\n' +
          'export const chatCredentials = sqliteTable("chat_credentials", {\n  chatId: text("chat_id").references(() => chats.id),\n  credentialId: text("credential_id").references(() => credentials.id),\n});\n',
        "packages/server/src/domain/credentials/verbs/rotate.ts":
          'import { credentials } from "@orb/db";\nexport async function rotate(ctx) {\n  await ctx.db.update(credentials).set({ n: 1 });\n  ctx.emitUserEvent(1, { type: "credentialsChanged" });\n}\n',
      },
      expect: { messageIncludes: "is ROOM-SEATED" },
      why: "THE SEATED ARM — the honesty ratchet the bridge was built to leave behind. `credentials` answers `roomReach: none`, and this mini-tree seats its rows in a room via a chat-anchored junction; the row is now a lie and the gate says so. It is keyed on a REAL `none` domain deliberately (a probe domain has no registry row at all, so it is MISSING-red and never reaches this arm), and on the one `none` whose reason can never flip to `bridge` — a credential rendered to a room member would be the credential-firewall defect, not a freshness gap",
    },
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        // A chat-anchored table exists (so the derivation is NOT blind) — it just does not reach character.
        "packages/db/src/schema/chat.ts":
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'export const chatInjections = sqliteTable("chat_injections", { chatId: text("chat_id").references(() => chats.id) });\n',
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/character/verbs/update.ts":
          'import { characters } from "@orb/db";\nexport async function update(ctx) {\n  await ctx.db.update(characters).set({ n: 1 });\n  ctx.emitUserEvent(1, { type: "charactersChanged" });\n}\n',
      },
      expect: { messageIncludes: "claims room seating" },
      why: "the SEATED arm's OTHER side — `character` declares `roomReach: bridge`, and in a tree where nothing seats a character in a room that claim is a standing verdict about a junction that is gone. Without this direction the ratchet is one-sided, which is how a `bridge` row survives the deletion of the seating it was granted for (GATE-AUTHORING §4)",
    },
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        "packages/db/src/schema/chat.ts":
          'export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n' +
          'export const chatWidgets = sqliteTable("chat_widgets", {\n  chatId: text("chat_id").references(() => chats.id),\n  widgetId: text("widget_id").references(() => widgets.id),\n});\n',
        "packages/db/src/schema/nobody.ts": 'export const widgets = sqliteTable("widgets", { id: text("id").primaryKey() });\n',
      },
      expect: { messageIncludes: "cannot be attributed to any domain" },
      why: "THE ATTRIBUTION TOTALITY ARM — seating that lands on a schema file with no same-named domain is un-attributable, so SEATED-red would be SILENTLY blind to it. It is the `users` case generalized: the one real instance is classified in UNSEATABLE_SCHEMA with its reason, and any second one has to be classified too rather than vanishing",
    },
    {
      files: {
        "packages/server/src/domain/chat/bus.ts":
          'import { chats } from "@orb/db";\nexport async function e(ctx) {\n  await ctx.db.update(chats).set({ n: 1 });\n  ctx.emit({ type: "chatUpdated" });\n}\n',
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        // Tables exist; NONE of them FKs `chats.id`. On the real tree that means the spelling moved.
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
      },
      expect: { messageIncludes: "DERIVED NO CHAT-ANCHORED TABLES" },
      why: "the §4.6 BLINDNESS tripwire for the SEATING derivation, which is a SECOND derivation and therefore owes its own: the plane axis's blindness arm watches the write spelling, and would stay perfectly green while `references(() => chats.id)` moved and SEATED-red silently stopped existing",
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
          'import { characters } from "@orb/db";\n// The writer lives elsewhere: it does ctx.db.insert(characters) and emits its own event.\nexport async function dump(ctx) {\n  return await ctx.db.select().from(characters);\n}\n',
      },
      why: "COMMENT POSTURE (issue #117/#132): a read-only domain whose COMMENT quotes a write call is still read-only, so it must not be conscripted into the registry as MISSING. The hand-rolled comment regex this gate used to carry got this right; it got the STRING case wrong, which is why the blanking is now the shared parser-backed one",
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
