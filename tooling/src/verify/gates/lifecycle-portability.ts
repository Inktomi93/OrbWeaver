// Gate: lifecycle-portability — THE completeness gate for the export/import plane. Two arms, both keyed on
// live sources of truth: (A) every OWNER-STAMPED canon table the schema declares is either carried by a
// `PORTABLE_KINDS` member or classified NON-PORTABLE with a reason + an end condition; (B) every declared
// single-entity DOOR names a proc/route that actually exists. Registry tables live here (not in contracts)
// because the gate is their only consumer — a contracts export with one gate reader is the dead-export
// archetype; if a real second consumer ever appears, D54's reachability rule re-homes it THEN, not now.
//
// WHY: databank was born after the portability spec froze its 10-kind list, so a full-account backup
// silently lost the whole document library for months, and nothing on the tree could notice. That is
// structural, not an oversight: `PORTABLE_KINDS` had no relationship to the schema's set of owned-canon
// producers. Arm A mints it. A new domain that stamps `ownerId` and registers nothing is now RED AT BIRTH.
//
// DECLARED LIMITS (each with a mustPass row):
//   • Arm A derives OWNERSHIP from the resolved `owner_id` SQL COLUMN NAME (the shared Drizzle fact's
//     `column.sqlName`, not the `text("owner_id")` text the legacy regex matched). A table whose owner is
//     INHERITED through an FK chain (D23 — `gallery_items` via its asset, `world_entries` via its book) is
//     invisible here BY DESIGN: its portability is its parent's, so classifying it separately would be a
//     second, forkable answer to one question.
//   • Arm B resolves a tRPC cite to `<router>.<proc>` and an HTTP cite to its route-path literal. It proves
//     the door EXISTS, not that it is reachable from the UI — client chrome is CT/side-eye territory.

// COLUMNS ARE RESOLVED, NOT REQUIRED INLINE (#945): the ownership stamp is read off the SHARED Drizzle
// schema fact, which follows an imported/aliased columns binding (and object spreads) and refuses loudly on
// any other shape. `sqliteTable("x", importedColumns, …)` used to yield ZERO columns here, erasing this
// gate's obligations while the schema file scan stayed healthy.
//
// FAMILY `drizzle-schema` — the shared subject reader is `lib/schema-fact.ts`'s `drizzleSchemaFact`
// provider, the same one `ownerid-registry`, `schema-branding`, `db-enum-from-tuple` and
// `nullable-column-inequality` consume. Arm A owns INTENT only (is this owned canon carried or classified);
// the provider owns table/column identity. Arm B's door corpus is this policy's own population and no
// sibling shares it, which is why the family string names the reader rather than the topic.
//
// WHAT THE CONVERSION REPLACED, arm by arm. The legacy module walked `ctx.project.getSourceFiles()` twice
// and hand-parsed the schema with `_shared/schema-read` plus a `text("owner_id")` REGEX over the resolved
// column text; the fact supplies `column.sqlName` directly, so an aliased `text` import or a renamed local
// builder can no longer launder a stamp. Arm B read the http registrars as BLANKED FILE TEXT
// (`blankTsComments`, because a route path quoted in a header comment would keep a deleted door reading as
// live — issues #117/#132); it now collects StringLiteral NODES, which cannot see a comment at all, so the
// defended property is structural rather than defended by a blanker. That is why `lib/comment-spans.ts` is
// gone from this module. The `ctx.scope.kind !== "project"` guard and the duplicated
// `judgeCompletenessSynthetic` arm are gone with it: the barrel anchor alone decides whether the
// whole-tree arms may speak, and the coverage arm needs no second implementation.
//
// POPULATION PORT — an INTENTIONAL NARROWING, recorded rather than claimed byte-identical. The legacy
// descriptor declared NO `scanRoot`: its `run` received all 7,394 candidate sources and derived a semantic
// population internally (the census notation `P9/run`). The final population declares exactly what the two
// arms read — the schema, the tRPC routers and the http registrars: 74 of 7,394 candidates, 0 admitted by
// the final expression that the legacy body would have read and ignored. Compiled both spellings over
// `git ls-files '*.ts' '*.tsx'`: legacy 7,394 / final 74 / finalOnly 0, with four planted controls (schema
// ✓, router ✓, http ✓, a server domain file ✗).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `lifecycle-portability` descriptor at 7183b7abaee141b0e2e85cb79e939878bd482f77, the parent of the conversion
// `472bc940c` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The legacy
// descriptor had no `scanRoot`, so its effective population is its in-run path filter — run:
// `SCHEMA_FILE_RE.test(rel) && rel !== SCHEMA_BARREL` + `fileLoaded(ctx, SCHEMA_BARREL)`; readDoorCorpus:
// `rel.startsWith(ROUTER_DIR)` / `rel.startsWith(HTTP_DIR)`. Over the SAME 7,377 harness candidates at that tree
// (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`) it admits 74 and the final `population` admits 74 (the
// bare harness dispatch was 7,377). legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/db/src/schema/__cbbhr_in_assets.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` rejected by both.
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_KINDS } from "@orb/contracts/portability";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const ROUTER_DIR = "packages/server/src/transport/trpc/routers/";
const HTTP_DIR = "packages/server/src/entry/http/";
const OWNER_COLUMN = "owner_id";
const GATE_SELF = "tooling/src/verify/gates/lifecycle-portability.ts";
/** The router factory call whose ONE argument holds the procs (`t.router({…})`). */
const ROUTER_FACTORY = "t.router";
const TS_EXT_RE = /\.ts$/u;

/** Why an owner-stamped canon family does NOT travel in a backup. Every arm is a RULING, not a shrug. */
type NonPortableClass =
  /** Secrets never leave the box (spec R10). */
  | "RULED-OUT"
  /** Re-computable from canon that DOES travel — carrying it would be carrying a cache. */
  | "DERIVED"
  /** Execution state with no meaning on another box (queue rows, schedules). */
  | "RUNTIME"
  /** Ruled to travel, not built yet — the row names the wave that ends it. */
  | "DEFERRED"
  /** Ruled to be LOST on a cross-box restore, with the reason the loss is acceptable. */
  | "ACCEPTED-LOSSY";

interface NonPortableRow {
  readonly classification: NonPortableClass;
  /** Why this classification holds and the condition that ends it. */
  readonly why: string;
}

/** The canon tables each portable kind CARRIES. Exhaustive over `PortableKind` by tsc — a new kind cannot
 *  be added without saying what it carries, and arm A cross-checks the claim against the schema. */
const PORTABLE_CANON_TABLES: Record<PortableKind, readonly string[]> = {
  character: ["characters"],
  // R6 — the chat arm is now the ORB-NATIVE BUNDLE (`kit/serde/chat-bundle`), not the ST jsonl interchange, so
  // the chat-anchored planes travel: `chat_injections`, the rpg campaign's six tables, and `chat_tags` (which
  // carried an ACCEPTED-LOSSY row here reading "Ends with the orb-native chat bundle (R6)" until this wave
  // ended it). `chats` itself carries no ownerId (membership-scoped, D18) so arm A never derives it; listed
  // because the kind does carry it, and the stale arm still proves the table exists. Every table here is
  // owner-DERIVED except `chat_tags`, which IS owner-stamped (D30 — the per-TAGGER overlay).
  chat: ["chats", "chatTags"],
  persona: ["personas"],
  "world-info": ["worldBooks"],
  regex: ["regexScripts"],
  // `globalDocuments` is the owner's personal-bank junction — owner-STAMPED (there the ownerId column IS
  // the scope subject, not a stamp), and it travels as the portable file's `global` flag.
  databank: ["documents", "globalDocuments"],
  preset: ["presets"],
  theme: ["themes"],
  "user-settings": ["userSettings"],
  tag: ["tags"],
  gallery: ["galleryItems"],
  assets: ["assets"],
};

/** The owner-stamped tables that deliberately do NOT travel. Two-sided: a row naming a table the schema no
 *  longer declares is RED (delete it), and an owner-stamped table with neither a row here nor a
 *  `PORTABLE_CANON_TABLES` cell is RED (classify it). */
const NON_PORTABLE_CANON: Readonly<Record<string, NonPortableRow>> = {
  userConnections: {
    classification: "DEFERRED",
    why: "a connection is provider + model + a `credentialId` into RULED-OUT `user_credentials` + a box-local `baseUrl` (inference program §5.3); the credential half can never travel and the URL half is per-box, so today the restore posture is re-create from the picker (the local-light floor re-seeds at boot, §7.2). Ends when the Connections pane ships an export arm that carries the credential-FREE half (provider, model, declared, extras, transport, bindings) and the import re-links keys.",
  },
  userCredentials: {
    classification: "RULED-OUT",
    why: "spec R10 — secrets never leave the box; the restore posture is re-enter your keys. Ends never (a portable credential IS the defect).",
  },
  plugins: {
    classification: "RULED-OUT",
    why: "O-4: installed CODE is not user data. Ends if plugins ever become declarative config rather than executables.",
  },
  pluginKv: {
    classification: "RULED-OUT",
    why: "the KV store of RULED-OUT `plugins` — restoring a plugin's state without the plugin is worse than not restoring it. Ends with the `plugins` row.",
  },
  rosterPresets: {
    classification: "DEFERRED",
    why:
      "#26 (D61 B6) — saved parties are owner-authored library artifacts (the tag/theme class, so PORTABLE in spirit), but v1 shipped " +
      "without a portable kind by the program doc's own scope (saved-rosters-design.md §7 names no portability; D170). " +
      "A party is a name + FKs into the owner's character library, so a portable kind must " +
      "resolve members by the characters the bundle also carries. Ends when `roster-preset` registers a PORTABLE_KINDS member " +
      "(serde + verbs + descriptor + import-order slot AFTER characters + round-trip pin).",
  },
  refinerySchemas: {
    classification: "DEFERRED",
    why:
      "R3/SF0 — owner-authored custom payload schemas (the tag/theme artifact class, so PORTABLE in spirit). Whether schema rows ride " +
      "the portability bundle is an OPEN OWNER FORK recorded in the NL design (2026-08-08-card-refinery-nl-schema-design.md §8, the same " +
      "question flagged for prose overrides — one lane, same answer for both). Ends when that fork is ruled: portable ⇒ register the kind " +
      "(serde + verbs + descriptor + order slot + round-trip pin); not ⇒ reclassify RULED-OUT with the ruling cite.",
  },
  automationRules: {
    classification: "DEFERRED",
    why:
      "O-4 RULED these portable (owner-authored artifacts, the tag/theme class). TRUTH-REPAIRED 2026-08-07 (R6): this row used to " +
      "say 'the descriptor is R6's named work', which R6 could not deliver and did not — R6 is the orb-native CHAT BUNDLE, and " +
      "automation rules are not chat-anchored. They need their OWN portable family (serde + verbs + descriptor + import-order " +
      "slot + doors), which is a separate wave. Ends when `automation` registers a PORTABLE_KINDS member.",
  },
  automationOwnerBudgets: {
    classification: "RULED-OUT",
    why:
      "C5's owner-GLOBAL fire-rate ceiling — a LOOP-SAFETY BELT, not user data. An ABSENT row is dispatched " +
      "as the DDL default, so a " +
      "restored account is bounded by the shipped ceiling rather than by nothing: dropping it loses a tuned " +
      "number, never a capability or a piece of authored work. Carrying it would also restore a ceiling that " +
      "was tuned against a library the restore may not reproduce. Ends if the ceiling ever becomes an " +
      "AUTHORED artifact (a per-rule schedule, a spend plan) rather than a single defaulted belt.",
  },
  globalVariables: {
    classification: "DEFERRED",
    why: "O-4 RULED these portable, same wave and same corrected end condition as `automationRules` (NOT R6 — see that row). Ends when the automation descriptor lands.",
  },
  workloads: {
    classification: "RUNTIME",
    why: "queue rows — a job that ran on the old box has no meaning on the new one. Ends never.",
  },
  workloadSchedules: {
    classification: "RUNTIME",
    why: "recurring-job wiring bound to workload rows + this box's clock. Ends if schedules become user-authored artifacts in their own right.",
  },
  characterSummaries: {
    classification: "DERIVED",
    why: "re-computed from the character canon that DOES travel. Carrying it would ship a cache that a restore immediately invalidates. Ends never.",
  },
  dailyStats: {
    classification: "DERIVED",
    why: "turn economics rolled up from messages. Re-derivable by the stats reconcile the import already runs. Ends never.",
  },
  modelStats: { classification: "DERIVED", why: "same rollup plane as `dailyStats`. Ends never." },
  ownerStats: { classification: "DERIVED", why: "same rollup plane as `dailyStats`. Ends never." },
  statsCanonVersions: {
    classification: "DERIVED",
    why: "monotonic coordination token for rebuilding the stats rollup plane; restore rebuilds the rollups and starts a fresh token. Ends never.",
  },
  embedGenerations: {
    classification: "DERIVED",
    why:
      "immutable provenance for vector rows, derived from the owner's box-local connection configuration and rebuilt with the vector substrate. " +
      "A restore must re-index against its own connections rather than carry another box's generation identities. Ends never.",
  },
  embedGenerationTargets: {
    classification: "RUNTIME",
    why:
      "the in-flight per-owner generation and epoch that coordinate local re-index workers. It has no portable meaning without this box's connections, " +
      "candidate rows, and workload state; restore starts a fresh target. Ends never.",
  },
  keywordCooccurrence: { classification: "DERIVED", why: "a discovery analytics index over library canon; rebuilt by reindex. Ends never." },
  themeClusters: { classification: "DERIVED", why: "discovery clustering over embeddings, themselves derived. Ends never." },
  embedSpaceState: {
    classification: "DERIVED",
    why:
      "the last COMPLETE embed space per (owner, vector scope) — a statement ABOUT the vector substrate, which is " +
      "itself DERIVED and does not travel (inference program §10-5). Carrying it would be worse than dropping it: it " +
      "would tell the new box that a corpus it has not embedded yet is settled, which is precisely the false-settled " +
      "state the table exists to prevent. Absent, the restored box reads as `unrecorded` and serves its live space " +
      "until its first sweep records one. Ends never.",
  },
};

/** A single-entity door: the transport + the cite arm B resolves. */
interface DoorSpec {
  readonly transport: "trpc" | "http";
  /** trpc: `<router>.<proc>` · http: the route-path literal (`/api/export/character/:characterId`). */
  readonly cite: string;
}

/** A cited decision that a family has NO door of this kind. */
interface RuledNoDoor {
  readonly ruled: string;
}

type Door = DoorSpec | RuledNoDoor;

/** Where a family's lifecycle chrome lives (the ruled anatomy, D121-D). */
type ChromeHome = "band+kebab" | "backup-pane";

interface LifecycleDoors {
  readonly singleExport: Door;
  readonly singleImport: Door;
  readonly chrome: ChromeHome;
}

function isSpec(door: Door): door is DoorSpec {
  return "cite" in door;
}

/** THE door table. Exhaustive over `PortableKind` by tsc: a new kind must state both doors and its chrome
 *  home, or say in words why it has none. Every `DoorSpec` is checked against the real tree by arm B.
 *  THE LAW THIS TABLE ENCODES: a single-entity door is a THIN ARM over the family's bundle verbs — never a
 *  second implementation (preset `importFile` and `POST /api/import/chat` are the founding precedents). */
const LIFECYCLE_DOORS: Record<PortableKind, LifecycleDoors> = {
  character: {
    singleExport: { transport: "http", cite: "/api/export/character/:characterId" },
    singleImport: { transport: "http", cite: "/api/import" },
    chrome: "band+kebab",
  },
  chat: {
    singleExport: { transport: "http", cite: "/api/export/chat/:chatId" },
    singleImport: { transport: "http", cite: "/api/import/chat" },
    chrome: "band+kebab",
  },
  persona: {
    singleExport: { transport: "trpc", cite: "persona.export" },
    singleImport: { transport: "trpc", cite: "persona.import" },
    chrome: "band+kebab",
  },
  "world-info": {
    singleExport: { transport: "trpc", cite: "worldInfo.exportBook" },
    singleImport: { transport: "trpc", cite: "worldInfo.importFile" },
    chrome: "band+kebab",
  },
  // RULING SUPERSEDED (owner, REGX2, 2026-08-03 — board ruling I-4). Both halves used to be `{ ruled }` cells
  // reading "O-2 class: scripts travel embedded in the CARD they belong to (the D121-E lift) and in the
  // bundle. No evidenced demand for sharing one script standalone." / "same as export — the card IS the
  // sharing unit for a script." The owner's REGX2 ruling IS that evidenced demand, so the exemption's end
  // condition was met and the doors were built. The MECHANISM the old cells protected is preserved intact:
  // both are THIN ARMS over the bundle descriptor's own verbs (`exportScript` shares `toPortableFile` with
  // the descriptor's `exportAll`; `importScriptFile` IS `createImportRegexScript`, the descriptor's own
  // per-file import), so the family still has exactly ONE serialization path.
  regex: {
    singleExport: { transport: "trpc", cite: "regex.exportScript" },
    singleImport: { transport: "trpc", cite: "regex.importScriptFile" },
    chrome: "band+kebab",
  },
  databank: {
    singleExport: {
      ruled: "a document's SOURCE file is what people share, and they already have it — the portable file exists to move a whole bank between boxes.",
    },
    singleImport: {
      ruled: "the single-document import door already exists as UPLOAD (`databank.upload`), which re-extracts rather than trusting a carried canon.",
    },
    chrome: "backup-pane",
  },
  preset: {
    singleExport: {
      ruled: "client-side: the cached row → `buildPresetFile` → browser download (O-16 one-home, the contracts-homed codec). No server door to cite.",
    },
    singleImport: { transport: "trpc", cite: "preset.importFile" },
    chrome: "band+kebab",
  },
  theme: {
    singleExport: {
      ruled:
        "O-2 recommends a per-theme pair once the serde spine exists; the spine landed with this wave, so the door is the next S lane. Ends when `settings.exportTheme` exists.",
    },
    singleImport: { ruled: "same wave as the export half." },
    chrome: "backup-pane",
  },
  "user-settings": {
    singleExport: { ruled: "a namespace blob is not a shareable artifact — the backup pane's checkbox IS its granularity (spec R7)." },
    singleImport: { ruled: "same — per-namespace merge only, through the bundle." },
    chrome: "backup-pane",
  },
  tag: {
    singleExport: {
      ruled:
        "O-2 RULED bundle-only: tags are a small library and the backup pane's per-family checkbox already exports them. No evidenced demand for sharing one tag.",
    },
    singleImport: { ruled: "O-2 bundle-only, same reason." },
    chrome: "backup-pane",
  },
  gallery: {
    singleExport: { ruled: "media CURATION, not an artifact — the blobs themselves already have `/blob/:hash` (D21)." },
    singleImport: { ruled: "same — curation restores with the library it curates." },
    chrome: "backup-pane",
  },
  assets: {
    singleExport: { ruled: "the CAS blob plane. Per-blob download is `/blob/:hash` (D21); the bundle arm is always-on, never a user checkbox." },
    singleImport: { ruled: "blobs arrive with the entity that references them." },
    chrome: "backup-pane",
  },
};

const MESSAGE =
  "the lifecycle/portability registry is incomplete — every owner-stamped canon family must be CARRIED by a " +
  "portable kind or CLASSIFIED non-portable with a reason, and every declared single-entity door must name a " +
  "proc/route that exists. This is the F1 killer: `documents` was owned canon for months while a full-account " +
  'backup silently dropped the whole databank library, because nothing tied PORTABLE_KINDS to the schema. See Spine-Config-and-Serialization.md §"Serialization / serde core".';

const FIX =
  "for a MISSING family: either register the kind (serde + owning-domain export/import verbs + a descriptor at " +
  "`entry/compose/portability.ts` + a `PORTABLE_IMPORT_ORDER` slot + a bundle round-trip pin) and add its tables " +
  "to PORTABLE_CANON_TABLES, or add a NON_PORTABLE_CANON row with its classification and the condition that ENDS " +
  "the exemption. For a dangling DOOR cite: fix the cite, or replace the DoorSpec with a `{ ruled }` cell saying " +
  "why the family has no door. Never delete the row to go green.";

const DOC_POINTER = "docs/law/Spine-Config-and-Serialization.md";
const STALE_NON_PORTABLE =
  "NON_PORTABLE_CANON row names a table the schema no longer declares (ratchet down) — delete the row in tooling/src/verify/gates/lifecycle-portability.ts: ";
const STALE_CARRIED =
  "PORTABLE_CANON_TABLES names a table the schema no longer declares (ratchet down) — fix the kind's carried set in tooling/src/verify/gates/lifecycle-portability.ts: ";

/** table → the kind that carries it (the claim side of arm A). */
function carriedTables(): ReadonlyMap<string, PortableKind> {
  const carried = new Map<string, PortableKind>();
  for (const kind of PORTABLE_KINDS) {
    for (const table of PORTABLE_CANON_TABLES[kind]) {
      carried.set(table, kind);
    }
  }
  return carried;
}

/** `world-info` → `worldInfo` (a router FILE is kebab, its tRPC key is camel). */
function toCamel(kebab: string): string {
  return kebab.replace(/-(?<ch>[a-z])/gu, (_m, ...args) => {
    const groups = args.at(-1) as { readonly ch?: string } | undefined;
    return (groups?.ch ?? "").toUpperCase();
  });
}

/** The DECLARATION names of every table the schema declares, and which of those are OWNER-STAMPED by the
 *  literal `owner_id` SQL column. The registries key on the declaration name (`chatTags`), which is what the
 *  authors of `PORTABLE_CANON_TABLES` spell, so the identity comes off `table.identity.declarationName`
 *  rather than off `sqlName`. */
interface SchemaFacts {
  readonly declared: ReadonlySet<string>;
  readonly ownerStamped: ReadonlyMap<string, SchemaModel["tables"][number]>;
}

function readSchemaFacts(schema: SchemaModel): SchemaFacts {
  const declared = new Set<string>();
  const ownerStamped = new Map<string, SchemaModel["tables"][number]>();
  for (const table of schema.tables) {
    const name = table.identity.declarationName;
    declared.add(name);
    if (table.columns.some((column) => column.sqlName === OWNER_COLUMN)) {
      ownerStamped.set(name, table);
    }
  }
  return { declared, ownerStamped };
}

export const gate = defineGate({
  id: "lifecycle-portability",
  family: "drizzle-schema",
  // HARD, and the census agrees: `lifecycle-portability.ts:92` is "17 authoritative portability
  // classifications" under the gate-runtime exception-authority census's "Hard policy and authoritative runtime data" —
  // "not exception rows", so there is no per-site waiver door to preserve. The escape from a finding is a
  // ROW (register the kind, or classify it with its end condition), never a comment at a call site. The
  // legacy descriptor was suppressible only because it never declared otherwise; its findings anchored on
  // line 1 of the gate file itself, where a marker would have been meaningless.
  authority: "hard",
  severity: "error",
  population: {
    in: ["@db", "@server"],
    under: ["packages/db/src/schema/**", "packages/server/src/transport/trpc/routers/**", "packages/server/src/entry/http/**"],
  },
  analysis: "types",
  // Both arms are COVERAGE claims: "is every owner-stamped table answered" and "does every declared door
  // resolve" cannot compose over an arbitrary subset. Marked selected-files it would false-green on every
  // scoped run, which is exactly the class of hole that let databank sit unregistered.
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    /** `<router>.<proc>` for every proc a router source declares — the properties of the ONE `t.router({…})`
     *  argument, never a nested `z.object({…})`. Reading every descendant object literal instead would ADD
     *  phantom cites, and a phantom cite is a LYING GREEN (the door table would resolve against an input
     *  schema's field name). */
    const trpcCites = new Set<string>();
    /** Every authored string literal in the http registrars. A route path quoted in a COMMENT is not a node
     *  and therefore cannot reach this set — the property the legacy blanker defended, now structural. */
    const httpLiterals = new Set<string>();

    const doorIsLive = (door: DoorSpec): boolean => (door.transport === "trpc" ? trpcCites.has(door.cite) : httpLiterals.has(door.cite));

    /** Arm A, the COVERAGE half: an owner-stamped table with neither a carrier nor a classification. */
    const reportUncovered = (facts: SchemaFacts, carried: ReadonlyMap<string, PortableKind>): void => {
      for (const name of [...facts.ownerStamped.keys()].toSorted()) {
        if (carried.has(name) || Object.hasOwn(NON_PORTABLE_CANON, name)) {
          continue;
        }
        const table = facts.ownerStamped.get(name) as SchemaModel["tables"][number];
        ctx.report.node(table.declaration, {
          token: name,
          offset: 0,
          message:
            `\`${name}\` is OWNER-STAMPED canon that no portable kind carries and no NON_PORTABLE_CANON row ` +
            `classifies — a full-account backup silently drops it. ${MESSAGE}`,
        });
      }
    };

    /** Arm A, the RATCHET half: both registries clean down, and no table gets two answers. */
    const reportStale = (facts: SchemaFacts, carried: ReadonlyMap<string, PortableKind>): void => {
      const report = (token: string, message: string): void => ctx.report.file(SCHEMA_BARREL, { line: 1, token, message });
      for (const table of Object.keys(NON_PORTABLE_CANON)) {
        if (!facts.declared.has(table)) {
          report(table, `${STALE_NON_PORTABLE}"${table}"`);
        }
        if (carried.has(table)) {
          report(
            table,
            `\`${table}\` is BOTH carried by kind "${carried.get(table) ?? ""}" and classified NON-PORTABLE — one answer ` +
              "per family; delete the losing row in tooling/src/verify/gates/lifecycle-portability.ts.",
          );
        }
      }
      for (const [table, kind] of carried) {
        if (!facts.declared.has(table)) {
          report(table, `${STALE_CARRIED}"${table}" (kind "${kind}")`);
        }
      }
    };

    /** Arm B: every declared DoorSpec resolves to a real proc/route (the registry-cite tripwire — a renamed
     *  proc must RED here rather than leave the table quietly lying). */
    const reportDoors = (): void => {
      for (const kind of PORTABLE_KINDS) {
        const doors = LIFECYCLE_DOORS[kind];
        const halves: readonly (readonly [string, Door])[] = [
          ["export", doors.singleExport],
          ["import", doors.singleImport],
        ];
        for (const [half, door] of halves) {
          if (!isSpec(door) || doorIsLive(door)) {
            continue;
          }
          ctx.report.file(SCHEMA_BARREL, {
            line: 1,
            token: door.cite,
            message:
              `the "${kind}" single-${half} door cites \`${door.cite}\`, which no ${door.transport === "trpc" ? "router" : "http registrar"} ` +
              `declares — the door table is lying (a rename left it behind). Fix the cite, or replace the DoorSpec with a cited \`{ ruled }\` cell in ${GATE_SELF} (${DOC_POINTER}).`,
          });
        }
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            const path = ctx.relativePath(sourceFile);
            if (!(path.startsWith(ROUTER_DIR) && Node.isCallExpression(node)) || node.getExpression().getText() !== ROUTER_FACTORY) {
              return;
            }
            const arg = node.getArguments()[0];
            if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
              return;
            }
            const router = toCamel(path.slice(ROUTER_DIR.length).replace(TS_EXT_RE, ""));
            for (const prop of arg.getProperties()) {
              if (Node.isPropertyAssignment(prop)) {
                trpcCites.add(`${router}.${prop.getName()}`);
              }
            }
          },
        },
        {
          kinds: [SyntaxKind.StringLiteral],
          visit: (node, sourceFile) => {
            if (ctx.relativePath(sourceFile).startsWith(HTTP_DIR) && Node.isStringLiteral(node)) {
              httpLiterals.add(node.getLiteralText());
            }
          },
        },
      ],
      evaluate: () => {
        const fact = ctx.fact(drizzleSchemaFact).schema();
        recordReadySchemaFact(ctx, fact);
        const facts = readSchemaFacts(fact.value);
        const carried = carriedTables();
        reportUncovered(facts, carried);
        // The stale and door arms are WHOLE-REGISTRY claims, so they speak only where the PRODUCTION schema
        // is present, recognised by its barrel (the §4.5 real-tree-anchor shape, and NOT any row's own path
        // — a table deleted outright must still be judged). A fixture that never plants the barrel would
        // otherwise "prove" that every registry row had lost its subject.
        if (!ctx.files.map(ctx.relativePath).includes(SCHEMA_BARREL)) {
          return;
        }
        reportStale(facts, carried);
        reportDoors();
      },
    };
  },

  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/journal.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const ownerId = text("owner_id");\n' +
          'export const journalEntries = sqliteTable("journal_entries", { ownerId, body: text("body") });\n',
      },
      expect: { count: 1, token: "journalEntries", messageIncludes: "OWNER-STAMPED canon that no portable kind carries" },
      why: "THE #1035 SHORTHAND RED: the ownership stamp arrives as a shorthand member, so arm A must still see an owner-stamped table — dropped, the table read as unowned and carried no portability obligation. The finding now anchors on the TABLE DECLARATION rather than on line 1 of the gate file",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/journal-columns.ts":
          'import { text } from "drizzle-orm/sqlite-core";\nexport const journalColumns = { ownerId: text("owner_id"), body: text("body") };\n',
        "packages/db/src/schema/journal.ts":
          'import { sqliteTable } from "drizzle-orm/sqlite-core";\n' +
          'import { journalColumns } from "./journal-columns";\n' +
          'export const journalEntries = sqliteTable("journal_entries", journalColumns);\n',
      },
      expect: { count: 1, token: "journalEntries", messageIncludes: "OWNER-STAMPED canon that no portable kind carries" },
      why: "THE #945 IMPORTED-COLUMNS RED: arm A used to read the ownership stamp off the table initializer's TEXT, so an imported columns object made an owner-stamped table look unowned — i.e. carrying no portability obligation at all",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/journal.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const journalEntries = sqliteTable("journal_entries", { ownerId: text("owner_id"), body: text("body") });\n',
      },
      expect: { count: 1, token: "journalEntries", messageIncludes: "OWNER-STAMPED canon that no portable kind carries" },
      why: "the founding shape — a new domain stamps `ownerId` and registers nothing (exactly how `documents` sat outside portability while backups silently dropped it). RED AT BIRTH is the whole point",
    },
    {
      mode: "types",
      files: {
        [SCHEMA_BARREL]: 'export * from "./journal.ts";\n',
        "packages/db/src/schema/journal.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const journalEntries = sqliteTable("journal_entries", { body: text("body") });\n',
      },
      expect: { countFrom: "PORTABLE_CANON_TABLES", token: "characters", messageIncludes: "PORTABLE_CANON_TABLES names a table the schema no longer declares" },
      why: "THE RATCHET ARM, mode (B) of §4.4a, and the first proof it has ever had: the barrel resolves so this IS the production schema, and every carried/classified table is gone — a registry row that outlives its subject must RED rather than sit there looking like a ruling. `countFrom: PORTABLE_CANON_TABLES` rather than a literal (#2001): the count is the registry's own cardinality (14 carried + 17 classified + 11 door cites), so pinning it would make every registry edit a two-site edit and turn a legitimate row addition into a red proof. The `token` pins WHICH row instead",
    },
    {
      mode: "types",
      files: {
        [SCHEMA_BARREL]: 'export * from "./journal.ts";\n',
        "packages/db/src/schema/journal.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const journalEntries = sqliteTable("journal_entries", { body: text("body") });\n',
        "packages/server/src/transport/trpc/routers/persona.ts": "export const personaRouter = t.router({ list: 1 });\n",
      },
      expect: { countFrom: "PORTABLE_CANON_TABLES", token: "persona.export", messageIncludes: "the door table is lying" },
      why: "ARM B, and the first proof IT has ever had: a real router source that declares `list` but not `export`, so the `persona` single-export door cites a proc nothing declares. The router IS read (its `list` proc resolves), which is what makes this a cite failure rather than an empty-corpus artefact — the distinction the legacy arm could not express at all, because it only ever ran on the real tree. `countFrom: PORTABLE_CANON_TABLES` (#2001): this fixture also arms the whole ratchet sweep, so the door cite is ONE finding among the registry's cardinality; the `token` is what pins this arm",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/empty.ts": "export const NOT_A_TABLE = 1;\n",
      },
      expect: { messageIncludes: "drizzle schema fact empty" },
      why: "THE SUPPLY REFUSAL (law §6.3): a schema tree that declares NO drizzle table gives the `drizzle-schema` fact a zero-member receipt, and the dispatcher withholds every consumer before `evaluate` (the 9b29c5595 receipt); both coverage arms rest on that census, so a silent clean here would certify portability over nothing. Successor to the frozen-replay arm retired at b1e5e3e30 (#2176).",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const ownerId = text("owner_id");\n' +
          'export const characters = sqliteTable("characters", { ownerId });\n',
      },
      why: "the SHORTHAND's green twin: the same resolved stamp on a table a portable kind DOES carry — passes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/world-info.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const worldEntries = sqliteTable("world_entries", { bookId: text("book_id") });\n',
      },
      why: "DECLARED LIMIT, written down: ownership INHERITED through an FK chain (D23 — `world_entries` via its book) is invisible to arm A by design. Its portability is its parent's (the `world-info` kind carries `worldBooks`, never the entries), so classifying it separately would be a second forkable answer. THE ROW THAT DIES WITHOUT THE `owner_id` COLUMN FENCE, and it took a correction to make that true: the row used to spell `galleryItems`, which is CARRIED by the `gallery` kind, so deleting the fence left it green and the claim in this `why` was unproven (§4.1, measured — cutting `column.sqlName === OWNER_COLUMN` kept all 1,520 rows green). `worldEntries` is in neither registry, so the fence is the only thing keeping it quiet",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
      },
      why: "an owner-stamped table that IS carried (kind `character`) — the passing shape the whole registry exists to keep true, and the row that dies without the PORTABLE_CANON_TABLES lookup",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/credentials.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userCredentials = sqliteTable("user_credentials", { ownerId: text("owner_id") });\n',
      },
      why: "an owner-stamped table with a CITED non-portable classification (RULED-OUT, spec R10 secrets-never-leave-the-box) — a ruling is a legal answer, silence is not. The row that dies without the NON_PORTABLE_CANON lookup",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/credentials.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const userCredentials = sqliteTable("user_credentials", { ownerId: text("owner_id") });\n',
        "packages/server/src/transport/trpc/routers/persona.ts": "export const personaRouter = t.router({ list: 1 });\n",
      },
      why: "THE BARREL SELF-GUARD (§4.5) — the control the legacy module expressed by carrying a SECOND implementation of arm A (`judgeCompletenessSynthetic`) instead. Every carried table, every classified table and every door cite is unresolvable in this fileset, and the `persona` router deliberately declares `list` rather than `export`, so an unguarded run would fire ~42 findings. The barrel is absent, so the whole-registry arms stay silent and only the coverage arm speaks — which passes, because `userCredentials` is classified",
    },
  ],
});
