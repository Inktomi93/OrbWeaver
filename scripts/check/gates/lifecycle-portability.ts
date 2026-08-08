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
//   • Arm A derives OWNERSHIP from the literal `text("owner_id")` column spelling. A table whose owner is
//     INHERITED through an FK chain (D23 — `gallery_items` via its asset, `world_entries` via its book) is
//     invisible here BY DESIGN: its portability is its parent's, so classifying it separately would be a
//     second, forkable answer to one question.
//   • Arm B resolves a tRPC cite to `<router>.<proc>` and an HTTP cite to its route-path literal. It proves
//     the door EXISTS, not that it is reachable from the UI — client chrome is CT/side-eye territory.

import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_KINDS } from "@orb/contracts/portability";
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionRow, ExemptionTable, GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const SCHEMA_FILE_RE = /packages\/db\/src\/schema\/(?<name>[^/]+)\.ts$/u;
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const ROUTER_DIR = "packages/server/src/transport/trpc/routers/";
const HTTP_DIR = "packages/server/src/entry/http/";
const SQLITE_TABLE_RE = /^sqliteTable\s*\(/u;
const OWNER_COLUMN_RE = /text\(\s*"owner_id"\s*\)/u;
const LEADING_SLASH_RE = /^\/+/u;
const GATE_SELF = "scripts/check/gates/lifecycle-portability.ts";
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

interface NonPortableRow extends ExemptionRow {
  readonly classification: NonPortableClass;
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
const NON_PORTABLE_CANON: ExemptionTable<NonPortableRow> = {
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
  automationRules: {
    classification: "DEFERRED",
    why:
      "O-4 RULED these portable (owner-authored artifacts, the tag/theme class). TRUTH-REPAIRED 2026-08-07 (R6): this row used to " +
      "say 'the descriptor is R6's named work', which R6 could not deliver and did not — R6 is the orb-native CHAT BUNDLE, and " +
      "automation rules are not chat-anchored. They need their OWN portable family (serde + verbs + descriptor + import-order " +
      "slot + doors), which is a separate wave. Ends when `automation` registers a PORTABLE_KINDS member.",
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
  keywordCooccurrence: { classification: "DERIVED", why: "a discovery analytics index over library canon; rebuilt by reindex. Ends never." },
  themeClusters: { classification: "DERIVED", why: "discovery clustering over embeddings, themselves derived. Ends never." },
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
  // RULING SUPERSEDED (owner, REGX2, 2026-08-03 — workboard I-4). Both halves used to be `{ ruled }` cells
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
  "backup silently dropped the whole databank library, because nothing tied PORTABLE_KINDS to the schema " +
  "(docs/architecture/history/export-import-portability.md).";

const FIX =
  "for a MISSING family: either register the kind (serde + owning-domain export/import verbs + a descriptor at " +
  "`entry/compose/portability.ts` + a `PORTABLE_IMPORT_ORDER` slot + a bundle round-trip pin) and add its tables " +
  "to PORTABLE_CANON_TABLES, or add a NON_PORTABLE_CANON row with its classification and the condition that ENDS " +
  "the exemption. For a dangling DOOR cite: fix the cite, or replace the DoorSpec with a `{ ruled }` cell saying " +
  "why the family has no door. Never delete the row to go green.";

const DOC_POINTER = "docs/architecture/history/export-import-portability.md";
const STALE_NON_PORTABLE =
  "NON_PORTABLE_CANON row names a table the schema no longer declares (ratchet down) — delete the row in scripts/check/gates/lifecycle-portability.ts: ";
const STALE_CARRIED =
  "PORTABLE_CANON_TABLES names a table the schema no longer declares (ratchet down) — fix the kind's carried set in scripts/check/gates/lifecycle-portability.ts: ";

/** Every table the schema declares, and which of those are OWNER-STAMPED. Rebuilt in `begin`. */
const declaredTables = new Set<string>();
const ownerStamped = new Set<string>();

function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  const scripts = path.indexOf("/scripts/");
  if (idx !== -1) {
    return path.slice(idx + 1);
  }
  return scripts === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(scripts + 1);
}

/** Read every `export const X = sqliteTable(…)` in a schema source, recording ownership by the literal
 *  `text("owner_id")` column spelling (the DECLARED LIMIT in the header). */
function readSchema(sf: SourceFile): void {
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer()?.getText() ?? "";
      if (!SQLITE_TABLE_RE.test(init)) {
        continue;
      }
      declaredTables.add(decl.getName());
      if (OWNER_COLUMN_RE.test(init)) {
        ownerStamped.add(decl.getName());
      }
    }
  }
}

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

type Reporter = (message: string) => void;

/** The COVERAGE half: an owner-stamped table with neither a carrier nor a classification. */
function reportUncovered(carried: ReadonlyMap<string, PortableKind>, report: Reporter): void {
  for (const table of [...ownerStamped].sort()) {
    if (!(carried.has(table) || table in NON_PORTABLE_CANON)) {
      report(
        `\`${table}\` is OWNER-STAMPED canon that no portable kind carries and no NON_PORTABLE_CANON row ` +
          `classifies — a full-account backup silently drops it. ${MESSAGE}`,
      );
    }
  }
}

/** The RATCHET half: both registries clean down, and no table gets two answers. */
function reportStale(carried: ReadonlyMap<string, PortableKind>, report: Reporter): void {
  for (const table of Object.keys(NON_PORTABLE_CANON)) {
    if (!declaredTables.has(table)) {
      report(`${STALE_NON_PORTABLE}"${table}"`);
    }
    if (carried.has(table)) {
      report(
        `\`${table}\` is BOTH carried by kind "${carried.get(table) ?? ""}" and classified NON-PORTABLE — one answer ` +
          "per family; delete the losing row in scripts/check/gates/lifecycle-portability.ts.",
      );
    }
  }
  for (const [table, kind] of carried) {
    if (!declaredTables.has(table)) {
      report(`${STALE_CARRIED}"${table}" (kind "${kind}")`);
    }
  }
}

/** Arm A: every owner-stamped table is carried or classified; both registries ratchet down. */
function judgeCompleteness(ctx: GateRunCtx): void {
  const carried = carriedTables();
  const report: Reporter = (message) => {
    ctx.report({ file: GATE_SELF, line: 1, column: 0, message });
  };
  reportUncovered(carried, report);
  reportStale(carried, report);
}

/** The tRPC procs a router source declares — the properties of the ONE `t.router({…})` argument, never a
 *  nested `z.object({…})`. Reading every descendant object literal instead would ADD phantom cites, and a
 *  phantom cite is a LYING GREEN (the door table would resolve against an input schema's field name). */
function procsIn(sf: SourceFile, router: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== ROUTER_FACTORY) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg === undefined || !arg.isKind(SyntaxKind.ObjectLiteralExpression)) {
      continue;
    }
    for (const prop of arg.getProperties()) {
      if (prop.isKind(SyntaxKind.PropertyAssignment)) {
        names.add(`${router}.${prop.getName()}`);
      }
    }
  }
  return names;
}

/** Everything a door cite can resolve AGAINST: the live tRPC proc set + the http registrar sources. */
interface DoorCorpus {
  readonly trpcCites: ReadonlySet<string>;
  readonly httpText: readonly string[];
}

function readDoorCorpus(ctx: GateRunCtx): DoorCorpus {
  const trpcCites = new Set<string>();
  const httpText: string[] = [];
  for (const sf of ctx.project.getSourceFiles()) {
    const rel = repoRel(sf.getFilePath());
    if (rel.startsWith(ROUTER_DIR)) {
      for (const cite of procsIn(sf, toCamel(rel.slice(ROUTER_DIR.length).replace(TS_EXT_RE, "")))) {
        trpcCites.add(cite);
      }
    } else if (rel.startsWith(HTTP_DIR)) {
      httpText.push(sf.getFullText());
    }
  }
  return { trpcCites, httpText };
}

function doorIsLive(door: DoorSpec, corpus: DoorCorpus): boolean {
  return door.transport === "trpc" ? corpus.trpcCites.has(door.cite) : corpus.httpText.some((text) => text.includes(`"${door.cite}"`));
}

/** Arm B: every declared DoorSpec resolves to a real proc/route (the registry-cite tripwire — a renamed
 *  proc must RED here rather than leave the table quietly lying). */
function judgeDoors(ctx: GateRunCtx): void {
  const corpus = readDoorCorpus(ctx);
  for (const kind of PORTABLE_KINDS) {
    const doors = LIFECYCLE_DOORS[kind];
    const halves: readonly (readonly [string, Door])[] = [
      ["export", doors.singleExport],
      ["import", doors.singleImport],
    ];
    for (const [half, door] of halves) {
      if (isSpec(door) && !doorIsLive(door, corpus)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message:
            `the "${kind}" single-${half} door cites \`${door.cite}\`, which no ${door.transport === "trpc" ? "router" : "http registrar"} ` +
            `declares — the door table is lying (a rename left it behind). Fix the cite, or replace the DoorSpec with a cited \`{ ruled }\` cell in scripts/check/gates/lifecycle-portability.ts (${DOC_POINTER}).`,
        });
      }
    }
  }
}

/** `world-info` → `worldInfo` (a router FILE is kebab, its tRPC key is camel). */
function toCamel(kebab: string): string {
  return kebab.replace(/-(?<ch>[a-z])/gu, (_m, ...args) => {
    const groups = args.at(-1) as { readonly ch?: string } | undefined;
    return (groups?.ch ?? "").toUpperCase();
  });
}

export const gate: GateDescriptor = {
  name: "lifecycle-portability",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — docs/architecture/history/export-import-portability.md",
  status: "active",
  // WHOLE-PROJECT by construction: both arms are coverage claims over the schema + the router/http corpus.
  // Marked incremental-safe it would false-green on every scoped run, which is exactly the class of hole
  // that let databank sit unregistered.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  run: (ctx) => {
    declaredTables.clear();
    ownerStamped.clear();
    for (const sf of ctx.project.getSourceFiles()) {
      const rel = repoRel(sf.getFilePath());
      if (SCHEMA_FILE_RE.test(rel) && rel !== SCHEMA_BARREL) {
        readSchema(sf);
      }
    }
    // The stale/coverage arms are WHOLE-TREE claims: a conformance mini-project also reports
    // scope.kind === "project", and its handful of files would "prove" every table had vanished.
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, SCHEMA_BARREL)) {
      judgeCompletenessSynthetic(ctx);
      return;
    }
    judgeCompleteness(ctx);
    judgeDoors(ctx);
  },

  mustFlag: [
    {
      files: {
        "packages/db/src/schema/journal.ts":
          'export const journalEntries = sqliteTable("journal_entries", { ownerId: text("owner_id"), body: text("body") });\n',
      },
      expect: { count: 1, messageIncludes: "OWNER-STAMPED canon that no portable kind carries" },
      why: "the founding shape — a new domain stamps `ownerId` and registers nothing (exactly how `documents` sat outside portability while backups silently dropped it). RED AT BIRTH is the whole point",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/gallery.ts": 'export const galleryItems = sqliteTable("gallery_items", { assetId: text("asset_id") });\n',
      },
      why: "DECLARED LIMIT, written down: ownership INHERITED through an FK chain (D23 — gallery_items via its asset) is invisible to arm A by design. Its portability is its parent's; a separate classification would be a second forkable answer",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
      },
      why: "an owner-stamped table that IS carried (kind `character`) — the passing shape the whole registry exists to keep true",
    },
    {
      files: {
        "packages/db/src/schema/credentials.ts": 'export const userCredentials = sqliteTable("user_credentials", { ownerId: text("owner_id") });\n',
      },
      why: "an owner-stamped table with a CITED non-portable classification (RULED-OUT, spec R10 secrets-never-leave-the-box) — a ruling is a legal answer, silence is not",
    },
  ],
};

/** The synthetic-project arm: only the coverage half runs (the stale + door arms need the real tree, and a
 *  mini-project would "prove" every registry row dangling). Kept as the conformance examples' judge. */
function judgeCompletenessSynthetic(ctx: GateRunCtx): void {
  const carried = new Set<string>();
  for (const kind of PORTABLE_KINDS) {
    for (const table of PORTABLE_CANON_TABLES[kind]) {
      carried.add(table);
    }
  }
  for (const table of [...ownerStamped].sort()) {
    if (carried.has(table) || table in NON_PORTABLE_CANON) {
      continue;
    }
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message: `\`${table}\` is OWNER-STAMPED canon that no portable kind carries and no NON_PORTABLE_CANON row classifies — register it or classify it in scripts/check/gates/lifecycle-portability.ts (${DOC_POINTER}).`,
    });
  }
}
