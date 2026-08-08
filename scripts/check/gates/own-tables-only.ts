// Gate: own-tables-only — the enforceable half of Tier-1-DB.md §"Cross-tier composition": a domain touches
// its OWN tables directly, and reaches another domain's DATA through an injected op, never through the
// `@orb/db` barrel. `persistence/` is the ONE sanctioned home for a cross-domain read (the curated reusable
// READ helpers + the ownership checks a verb chains before it writes — `persona/persistence/queries.ts`'s
// `ensureCharacterOwned` is the archetype), so `persistence/` is scoped OUT and everything else under
// `domain/` is scoped IN: verbs, substrate, the named subsystems (assembly/ memory/ themes/ duplicates/ …)
// and the feature-root slots.
//
// WHY THIS SHAPE, AND NOT THE OLDER ABSOLUTE SENTENCE. Tier-1-DB.md used to read "A verb never imports
// @orb/db; only persistence/ does." That sentence was false from birth (verbs imported tables six days
// before it was written) and self-contradicted by the sanctioned direct-consumer patterns five lines below
// it; 69 verb files write their own domain's tables directly and always have. The line that IS real, and
// that this gate mints, is OWNERSHIP: writing `chats` from `domain/chat/verbs/` is the architecture working;
// reading `characters` from `domain/persona/verbs/` is a cross-domain reach that belongs in persona's
// `persistence/` (or in an injected op). The doc was amended to the real convention in the same commit.
//
// TWO ARMS, and the WRITE arm is the strict one:
//   • READ — a foreign table imported into scanned code is RED unless the domain carries a BULK_READERS row
//     (the doc-sanctioned bulk-serializer / analytics posture) or the file carries a FILE_ALLOWLIST row.
//   • WRITE — a foreign table in a drizzle `insert(T)`/`update(T)`/`delete(T)` position is RED
//     UNCONDITIONALLY. No class exemption and no file row buys a foreign write: the ONLY way to write a
//     table is to own it. This is already the tree's convention — `domain/import` writes canon into six
//     other domains' tables and imports `@orb/db` ZERO times, routing every write through the owning
//     domain's own `persistence/import-write.ts`.
//
// THE OWNERSHIP MAP IS DERIVED, NOT HAND-WRITTEN. `packages/db/src/schema/<file>.ts` maps ~1:1 to
// `domain/<file>/` (the producer-names-the-schema rule the `db-structure` gate enforces), so the map is read
// off the schema files at run time: every `export const X = sqliteTable(` in `schema/<f>.ts` is owned by
// domain `<f>`. Only the schema files whose producer is NOT a same-named domain need a hand row, and the map
// is TOTAL — a schema file with tables, no same-named domain, and no row is RED at the map itself
// (`SCHEMA_OWNERS`), so a new non-domain schema file forces the classification instead of silently making
// its tables un-ownable. Per-TABLE producer overrides live in `TABLE_OWNERS`.
//
// DECLARED LIMITS (measured, each with a mustPass row):
//   • A table reached through a namespace import (`import * as schema from "@orb/db"; schema.characters`) is
//     invisible here — the gate keys on the named ImportSpecifier, the same literal-shape limit as
//     `no-direct-users-read` and `discovery-no-stats-rollups` (zero namespace imports of `@orb/db` exist
//     under `domain/`).
//   • A write through an ALIASED binding (`const t = characters; db.insert(t)`) is seen as a READ, not a
//     write — the write arm matches the imported identifier at the call site.
//   • `persistence/` (including `chat/memory/persistence/`) is scoped out entirely, by design: it is the
//     sanctioned cross-domain read home, and its ownership-safety is enforced by the owner-predicate
//     convention + `no-direct-users-read` + `discovery-no-stats-rollups`, not by this gate.
import type { ImportDeclaration, ImportSpecifier, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionRow, ExemptionTable, GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const DOMAIN_ROOT = "packages/server/src/domain/";
const PERSISTENCE_SEG = "/persistence/";
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const DB_SPECIFIER_RE = /^@orb\/db(?:\/(?:schema|index))?$/u;
const DOMAIN_OF_RE = /packages\/server\/src\/domain\/(?<name>[^/]+)\//u;
const SCHEMA_FILE_RE = /packages\/db\/src\/schema\/(?<name>[^/]+)\.ts$/u;
const SQLITE_TABLE_RE = /^sqliteTable\s*\(/u;
const LEADING_SLASH_RE = /^\/+/u;
const WRITE_METHODS = new Set(["insert", "update", "delete"]);

/** Schema files whose producer is NOT a same-named domain. The map is TOTAL over table-bearing schema
 *  files: no row + no `domain/<name>/` ⇒ RED here, so a new non-domain schema file is classified
 *  deliberately instead of silently becoming un-ownable. Empty owners = "no DOMAIN owns this" (the producer
 *  lives outside `domain/`), which makes every domain-side import of its tables RED — the intended verdict.
 *  Both-ways ratchet: a row naming a schema file that no longer exists is RED. */
const SCHEMA_OWNERS: ExemptionTable<ExemptionRow & { readonly owners: readonly string[] }> = {
  users: {
    owners: ["sessions", "admin"],
    why:
      "the identity root is DOUBLE-owned on purpose: `sessions` writes it on the resolution path, `admin` " +
      "does user management (Spine-Identity-and-Auth.md), so BOTH keep their direct access. Outside those " +
      "two, a `users` touch reds here AND at the older, narrower `no-direct-users-read` — deliberately: " +
      "that gate carries the identity-specific remedy (take userId from the resolved Principal), which is " +
      "the one a reader wants first. The rows agree; neither is redundant with the other's scope " +
      "(`no-direct-users-read` also covers `persistence/`, which this gate scopes out).",
  },
  audit: {
    owners: [],
    why:
      "`audit_logs` WRITES are foundation/observability's `logAudit`, not a domain's (Tier-1-DB.md " +
      "§'NOT owned'); the table lives in db only because the schema does. No domain owns it, so any " +
      "domain-side import of `auditLogs` is RED — a verb records an audit entry through the injected " +
      "`ctx.audit` op it already carries.",
  },
  gallery: {
    owners: ["assets"],
    why: "a satellite table of the assets producer — the same mapping `db-structure`'s NON_DOMAIN_PRODUCERS makes (gallery → domain/assets).",
  },
  "sdk-session": {
    owners: [],
    why:
      "`session_entries` is produced by `infra/providers/backends/agent-sdk/session/` (db-structure's " +
      "NON_DOMAIN_PRODUCERS), which is INFRA, not a domain — a sealed executor no domain reaches into (D8). " +
      "Domain-side is RED by construction.",
  },
  "rate-limit": {
    owners: [],
    why: "`rate_limit_buckets` is produced by `transport/rate-limit.ts` (db-structure's NON_DOMAIN_PRODUCERS) — a transport-tier table, never a domain's.",
  },
};

/** Per-TABLE producer overrides — a table whose FILE home and whose PRODUCER differ. Both-ways ratchet: a
 *  row naming a table no schema file declares any more is RED. */
const TABLE_OWNERS: ExemptionTable<ExemptionRow & { readonly owners: readonly string[] }> = {
  characterPersonas: {
    owners: ["persona"],
    why:
      "the M:N character↔persona junction. Its FILE home is `schema/character.ts` and its own header says it " +
      "'stays in character.ts (the association owner)' — but that is a placement note, not a producer claim: " +
      "the ONLY writers on the tree are `persona/verbs/connection/{connect,disconnect}.ts`, and the only " +
      "domain-side readers are persona's. Producer-names-the-owner (Tier-1-DB.md), so persona owns it.",
  },
};

/** Domains whose foreign READS are doc-sanctioned in bulk — the Tier-1-DB.md §"Cross-tier composition" #2
 *  posture. READ-ONLY: the write arm ignores this table entirely. Both-ways ratchet: a domain listed here
 *  with no foreign read left in scanned scope is RED (the sanction died — delete the row).
 *  NOT listed, deliberately: `search` and `import`. They are the SAME doc class, but every foreign table
 *  they touch today is reached from `persistence/` (import touches `@orb/db` zero times) — so they need no
 *  sanction, and the day one moves a foreign read out of `persistence/` that becomes a reviewed act. */
const BULK_READERS: ExemptionTable = {
  discovery: {
    why:
      "library-analytics (AGENTS §6 domain map): themes / duplicates / hubness / distillation are computed BY " +
      "reading other domains' rows in bulk — Tier-1-DB.md §Cross-tier composition puts discovery in the same " +
      "bulk read-only posture as search on the vector tables. Its verbs' own headers state the owner scope " +
      "derives via a `characters` join because `character_summaries` keeps no ownerId. Ends the day discovery's " +
      "foreign reads all move into its own `persistence/`.",
  },
  export: {
    why:
      "THE sanctioned bulk serializer (Tier-1-DB.md §Cross-tier composition #2 + Spine-Config-and-Serialization.md): " +
      "import + export share one serde core that reads schema tables directly — bulk serializers, not CRUD " +
      "callers. `export-character.ts`'s own header says the direct `@orb/db` reads are export's job. Ends if " +
      "export ever routes its reads through the owning domains (the shape `domain/import` already uses).",
  },
};

/** Individually-sanctioned files. READ-ONLY, same as BULK_READERS. Both-ways ratchet: a row whose file has
 *  no foreign table import left is RED. Keep this list SHORT — a second file wanting the same reason is the
 *  signal that the reason belongs in the law, not in a row. */
const FILE_ALLOWLIST: ExemptionTable = {
  "packages/server/src/domain/chat/assembly/world-info/pool.ts": {
    why:
      "the doc-NAMED read-only-join pattern — Tier-1-DB.md §Cross-tier composition #3 calls it 'the pool.ts " +
      "pattern' by this exact file: a domain owning a VIEW of another domain's junctions may read them " +
      "directly when the read is ownership-safe. The world-info pool is scoped by the chat's own ids and " +
      "writes nothing. Ends if the doc drops the named pattern, or if the pool ever writes.",
  },
};

// THE ONE REASON, carrying BOTH source arms by token (`read <table>` / `write <table>`); their per-finding
// messages folded in here when they stopped riding the Finding overload, which bypasses `hasGateIgnore`
// (GATE-AUTHORING §1) so every marker on them was inert. The NO-OWNER arm and the stale arms keep the
// overload: the first is genuinely file-level (there is no node — the file simply has no owner) and the
// second anchors on the gate file.
const MESSAGE =
  "cross-domain table access outside `persistence/`. A `read <table>` token: the table is imported by a " +
  "domain that does not own it. A `write <table>` token: a drizzle insert/update/delete into a table this " +
  "domain does not own — no bulk-serializer class and no allowlist row buys a foreign WRITE; route it " +
  "through the owning domain's persistence helper (the shape `domain/import` already uses for six domains' " +
  "canon) or an injected op. " +
  "A domain touches its OWN tables directly and reaches " +
  "another domain's DATA through an injected op (AGENTS §2: cross-feature dependency is never a sideways " +
  "import). Tier-1-DB.md §'Cross-tier composition': `persistence/` is the home for reusable READ helpers and " +
  "cross-domain ownership checks; verbs/substrate/subsystems write their own domain's tables. The ownership " +
  "map is derived from `packages/db/src/schema/<domain>.ts` (producer-names-the-schema).";

const FIX =
  "pick the smallest honest home: (1) if it is an ownership check or a reusable read, move the query into " +
  "YOUR domain's `persistence/` (the sanctioned cross-domain read home — see `persona/persistence/queries.ts` " +
  "`ensureCharacterOwned`); (2) if it is real cross-domain BEHAVIOR, declare the op's type in your " +
  "`contract/` and wire it at the composition root; (3) if you are WRITING, route the write through the " +
  "OWNING domain's persistence helper — `domain/import` writes six domains' canon and imports `@orb/db` zero " +
  "times. A genuine bulk-serializer/analytics reader takes a BULK_READERS row and a doc-named view takes a " +
  "FILE_ALLOWLIST row, each WITH its reason — neither buys a foreign WRITE.";

const GATE_SELF = "scripts/check/gates/own-tables-only.ts";

const STALE_SCHEMA_PREFIX = "SCHEMA_OWNERS row names a schema file that no longer exists (ratchet down) — delete it in own-tables-only.ts: ";
const STALE_TABLE_PREFIX = "TABLE_OWNERS row names a table no schema file declares any more (ratchet down) — delete it in own-tables-only.ts: ";
const STALE_BULK_PREFIX =
  "BULK_READERS row for a domain with NO foreign table read left outside persistence/ (ratchet down) — the bulk-serializer sanction is unused; delete it in own-tables-only.ts: ";
const STALE_FILE_PREFIX = "FILE_ALLOWLIST row for a file with NO foreign table import left (ratchet down) — delete it in own-tables-only.ts: ";

function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(idx + 1);
}

function domainOf(rel: string): string | undefined {
  return DOMAIN_OF_RE.exec(rel)?.groups?.["name"];
}

// ---- the derived ownership map ------------------------------------------------------------------
/** table name → the domains that may touch it. Rebuilt in `begin` from the schema sources. */
const tableOwners = new Map<string, readonly string[]>();
/** every table name the schema declares (the TABLE_OWNERS stale arm's truth set). */
const declaredTables = new Set<string>();
/** schema file basenames present in the project (the SCHEMA_OWNERS stale arm's truth set). */
const schemaFiles = new Set<string>();

/** The tables a schema source declares: `export const X = sqliteTable(…)`. */
function tablesIn(sf: SourceFile): string[] {
  const out: string[] = [];
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      if (SQLITE_TABLE_RE.test(decl.getInitializer()?.getText() ?? "")) {
        out.push(decl.getName());
      }
    }
  }
  return out;
}

/** Does `domain/<name>/` exist in this project? (Producer-mirror: the default owner of `schema/<name>.ts`.) */
function domainExists(ctx: GateRunCtx, name: string): boolean {
  const prefix = `${DOMAIN_ROOT}${name}/`;
  return ctx.project.getSourceFiles().some((sf) => repoRel(sf.getFilePath()).startsWith(prefix));
}

/** Build table→owners from the schema sources. Reports the map's own totality violation (a table-bearing
 *  schema file with neither a same-named domain nor a SCHEMA_OWNERS row). */
function deriveOwnership(ctx: GateRunCtx): void {
  tableOwners.clear();
  declaredTables.clear();
  schemaFiles.clear();
  for (const sf of ctx.project.getSourceFiles()) {
    const rel = repoRel(sf.getFilePath());
    const name = SCHEMA_FILE_RE.exec(rel)?.groups?.["name"];
    if (name === undefined || rel === SCHEMA_BARREL) {
      continue;
    }
    schemaFiles.add(name);
    const tables = tablesIn(sf);
    if (tables.length === 0) {
      continue; // relations.ts and friends declare no rows — nothing to own.
    }
    const row = SCHEMA_OWNERS[name];
    let owners: readonly string[];
    if (row !== undefined) {
      owners = row.owners;
    } else if (domainExists(ctx, name)) {
      owners = [name];
    } else {
      // THE SANCTIONED Finding overload (§1): a FILE-LEVEL finding — the schema file as a whole has no
      // owner, so there is no offending node to anchor on or hang a marker off.
      ctx.report({
        file: rel,
        line: 1,
        column: 0,
        message:
          `schema file declares tables but has NO owner: there is no \`${DOMAIN_ROOT}${name}/\` and no ` +
          `SCHEMA_OWNERS row in ${GATE_SELF}. A schema file is named for its PRODUCER (Tier-1-DB.md); ` +
          "classify it deliberately — rename it to its producing domain, or add a SCHEMA_OWNERS row naming " +
          "the owning domain(s) (or none, for a producer outside `domain/`) WITH its reason.",
      });
      owners = [];
    }
    for (const t of tables) {
      declaredTables.add(t);
      tableOwners.set(t, TABLE_OWNERS[t]?.owners ?? owners);
    }
  }
}

// ---- per-run accumulators -----------------------------------------------------------------------
/** file path → the foreign table identifiers it imported (the write arm's lookup + the stale arms' proof). */
const foreignByFile = new Map<string, Set<string>>();
const seenBulkDomain = new Set<string>();
const seenAllowlistFile = new Set<string>();

function isDbImport(decl: ImportDeclaration): boolean {
  return DB_SPECIFIER_RE.test(decl.getModuleSpecifierValue());
}

/** The `X` in `db.insert(X)` / `tx.update(X)` / `db.delete(X)`, or undefined. */
function writtenTableIdentifier(node: Node): string | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && WRITE_METHODS.has(callee.getName()))) {
    return;
  }
  const arg = node.getArguments()[0];
  return arg?.isKind(SyntaxKind.Identifier) === true ? arg.getText() : undefined;
}

/** The two SOURCE arms' tokens — `read <table>` / `write <table>`. The kind is the stable position an
 *  `@orb-gate-ignore own-tables-only(write messages): <reason>` names; the table is the identity. The owning
 *  domain is NOT in the token: it is a fact about the tree, not about this site, so folding it in would make
 *  the position move when ownership is re-declared elsewhere. MESSAGE carries both arms' prose. */
const readToken = (table: string): string => `read ${table}`;
const writeToken = (table: string): string => `write ${table}`;

/** The per-node scan site: the file's repo-relative path + owning domain, resolved once in `visit`. (No
 *  `SourceFile` — it existed only to compute a report column, which the node overload now derives itself.) */
interface Site {
  readonly ctx: GateRunCtx;
  readonly rel: string;
  readonly domain: string;
}

/** The WRITE arm: a drizzle write whose target identifier was imported as a FOREIGN table in this file. */
function visitWrite(node: Node, { ctx, rel }: Site): void {
  const written = writtenTableIdentifier(node);
  if (written === undefined || !(foreignByFile.get(rel)?.has(written) ?? false)) {
    return;
  }
  ctx.report(node, { token: writeToken(written), offset: 0 });
}

/** The READ arm: a VALUE `ImportSpecifier` naming a table this domain does not own. Records the name either
 *  way (the write arm reads it; the row ratchets prove their sanctions are still earned). */
function visitImport(node: ImportSpecifier, { ctx, rel, domain }: Site): void {
  if (node.isTypeOnly()) {
    return;
  }
  const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  if (decl === undefined || decl.isTypeOnly() || !isDbImport(decl)) {
    return;
  }
  const table = node.getName();
  const owners = tableOwners.get(table);
  if (owners === undefined || owners.includes(domain)) {
    return; // not a table, or this domain's own
  }
  const set = foreignByFile.get(rel) ?? new Set<string>();
  set.add(table);
  foreignByFile.set(rel, set);

  if (rel in FILE_ALLOWLIST) {
    seenAllowlistFile.add(rel);
    return;
  }
  if (domain in BULK_READERS) {
    seenBulkDomain.add(domain);
    return;
  }
  ctx.report(node, { token: readToken(table), offset: 0 });
}

export const gate: GateDescriptor = {
  name: "own-tables-only",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Tier-1-DB.md §Cross-tier composition",
  status: "active",
  scopeSafety: "incremental-safe", // per-file verdicts; the ratchet arms self-guard in finalize
  message: MESSAGE,
  fix: FIX,
  // `persistence/` is scoped OUT — it is the sanctioned cross-domain read home. Everything else under
  // domain/ is scanned, sanctioned files included (the macro-resolution-home precedent: the only exemption
  // is a CITED row, so a moved file goes RED instead of carrying its sanction along).
  scanRoot: (p) => p.includes(DOMAIN_ROOT) && !p.includes(PERSISTENCE_SEG),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],

  begin: (ctx) => {
    foreignByFile.clear();
    seenBulkDomain.clear();
    seenAllowlistFile.clear();
    deriveOwnership(ctx);
  },

  visit: (node, sf, ctx) => {
    const rel = repoRel(sf.getFilePath());
    const domain = domainOf(rel);
    if (domain === undefined) {
      return;
    }
    const site: Site = { ctx, rel, domain };
    if (node.isKind(SyntaxKind.CallExpression)) {
      visitWrite(node, site);
      return;
    }
    if (node.isKind(SyntaxKind.ImportSpecifier)) {
      visitImport(node, site);
    }
  },

  finalize: (ctx) => {
    // The stale arms are WHOLE-TREE claims: never below project scope, and never on a fileset that is not
    // the real tree (a conformance mini-project also reports scope.kind === "project", and its handful of
    // files would "prove" every sanction had vanished). The schema BARREL is the anchor — present on every
    // real run, never needed by an example.
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, SCHEMA_BARREL)) {
      return;
    }
    const stale = (message: string): void => {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message });
    };
    for (const name of Object.keys(SCHEMA_OWNERS)) {
      if (!schemaFiles.has(name)) {
        stale(`${STALE_SCHEMA_PREFIX}"${name}"`);
      }
    }
    for (const table of Object.keys(TABLE_OWNERS)) {
      if (!declaredTables.has(table)) {
        stale(`${STALE_TABLE_PREFIX}"${table}"`);
      }
    }
    for (const domain of Object.keys(BULK_READERS)) {
      if (!seenBulkDomain.has(domain)) {
        stale(`${STALE_BULK_PREFIX}"${domain}"`);
      }
    }
    for (const file of Object.keys(FILE_ALLOWLIST)) {
      if (!seenAllowlistFile.has(file)) {
        stale(`${STALE_FILE_PREFIX}"${file}"`);
      }
    }
  },

  mustFlag: [
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", {});\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/create-from-character.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      expect: { count: 1, token: "read characters" },
      why: "the founding shape — a verb reading ANOTHER domain's table straight off the barrel (the real create-from-character defect this gate was minted from)",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const messages = sqliteTable("messages", {});\n',
        "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/export/verbs/export-chat.ts":
          'import { messages } from "@orb/db";\nexport async function f(db: { delete: (t: unknown) => Promise<void> }): Promise<void> {\n  await db.delete(messages);\n}\n',
      },
      expect: { count: 1, token: "write messages" },
      why: "the WRITE arm's whole point: `export` carries a BULK_READERS row, so its foreign READ passes — and the `delete` still reds. No class exemption buys a foreign write",
    },
    {
      files: {
        "packages/db/src/schema/nobody.ts": 'export const orphans = sqliteTable("orphans", {});\n',
        "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "has NO owner" },
      why: "the MAP's own totality arm — a table-bearing schema file with no same-named domain and no SCHEMA_OWNERS row forces the deliberate classification instead of silently making its tables un-ownable",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", {});\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/assets/workload-contributions.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      expect: { count: 1, token: "read characters" },
      why: "a FEATURE-ROOT slot (workload-contributions.ts), not a verb — the scan is `domain/** minus persistence/`, so the root slots and named subsystems are covered too",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/persona.ts": 'export const personas = sqliteTable("personas", {});\n',
        "packages/server/src/domain/persona/verbs/create.ts":
          'import { personas } from "@orb/db";\nexport async function f(db: { insert: (t: unknown) => Promise<void> }): Promise<void> {\n  await db.insert(personas);\n}\n',
      },
      why: "the sanctioned shape the old absolute sentence wrongly banned — a verb writing its OWN domain's table directly (69 verb files do this and always have)",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", {});\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/persistence/queries.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      why: "`persistence/` is scoped OUT — the sanctioned home for a cross-domain ownership check (`ensureCharacterOwned`); this is the convention the amended law names, not a violation",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", {});\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/discovery/verbs/browse.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      why: "a BULK_READERS domain (discovery — library analytics computed by reading other domains' rows in bulk, Tier-1-DB §Cross-tier composition) reading a foreign table",
    },
    {
      files: {
        "packages/db/src/schema/world-info.ts": 'export const worldEntries = sqliteTable("world_entries", {});\n',
        "packages/server/src/domain/world-info/verbs/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/chat/assembly/world-info/pool.ts": 'import { worldEntries } from "@orb/db";\nexport const w = worldEntries;\n',
      },
      why: "the FILE_ALLOWLIST row — Tier-1-DB.md §Cross-tier composition #3 names this exact file as 'the pool.ts pattern' (a chat-owned read-only VIEW over world-info's junctions)",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characterPersonas = sqliteTable("character_personas", {});\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/connection/connect.ts":
          'import { characterPersonas } from "@orb/db";\nexport async function f(db: { insert: (t: unknown) => Promise<void> }): Promise<void> {\n  await db.insert(characterPersonas);\n}\n',
      },
      why: "the TABLE_OWNERS override: `character_personas` FILE-homes in schema/character.ts but its PRODUCER is persona (its only writers are persona's connect/disconnect verbs) — a per-table classification the file-level map cannot express",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", {});\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/x.ts": 'import type { characters } from "@orb/db";\nexport type C = typeof characters;\n',
      },
      why: "a TYPE-ONLY import of a foreign table — the DB row type is the `db` home every domain imports downward (Tier-1-DB §7.4); only DATA access is the boundary",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", {});\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/x.ts": 'import { batchMany, fetchOwned } from "@orb/db/kit";\nexport const k = [batchMany, fetchOwned];\n',
      },
      why: "`@orb/db/kit` primitives (batchMany/fetchOwned/isConstraintViolation/parsers) are legal everywhere — they are drizzle-typed utilities, not tables",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", {});\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/x.ts": 'import * as schema from "@orb/db";\nexport const c = schema.characters;\n',
      },
      why: "DECLARED LIMIT, proven not assumed: a NAMESPACE import is invisible to the ImportSpecifier reader (the same literal-shape limit as no-direct-users-read). Zero exist under domain/; this row is the written baseline a future widening starts from",
    },
    {
      files: {
        "packages/db/src/schema/users.ts": 'export const users = sqliteTable("users", {});\n',
        "packages/server/src/domain/admin/verbs/set-role.ts":
          'import { users } from "@orb/db";\nexport async function f(db: { update: (t: unknown) => Promise<void> }): Promise<void> {\n  await db.update(users);\n}\n',
      },
      why: "the double-owned identity root (SCHEMA_OWNERS `users` → sessions + admin): admin's user-management verbs legitimately WRITE it, so neither arm may bite — the elsewhere case is covered by `no-direct-users-read` (which also reaches persistence/, scoped out here)",
    },
  ],
};
