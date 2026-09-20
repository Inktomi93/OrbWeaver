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
//     table is to own it.
//
// THE OWNERSHIP MAP IS DERIVED, NOT HAND-WRITTEN, from the shared `drizzleSchemaFact` (the same schema
// reader `ownerid-registry` consumes — FAMILY "drizzle-schema": two DISTINCT policies, one governing
// cross-domain table ACCESS and one governing ownerId STAMPING, reusing one computation). Every
// `export const X = sqliteTable(…)` a schema source declares is owned by the same-named domain unless a
// SCHEMA_OWNERS/TABLE_OWNERS row overrides it. Only schema files whose producer is NOT a same-named domain
// need a hand row, and the map is TOTAL — a schema file with tables, no same-named domain, and no row is RED
// at the map itself.
//
// SPLIT FROM THE LEGACY MODULE (authority is HARD, not the central ordinary/reviewed-grant vocabulary):
// SCHEMA_OWNERS/TABLE_OWNERS/BULK_READERS/FILE_ALLOWLIST are RULING DATA — like `ownerid-registry`'s
// OWNERID_CLASSIFICATIONS, they decide whether a touch IS a violation at all, never suppress one that
// already fired. There is no comment-marker escape; the only way to change the verdict is a reviewed edit
// to this file's tables.
//
// INTENTIONAL CORRECTION AT CONVERSION: the legacy module reported the READ/WRITE token as `"read <table>"`
// / `"write <table>"`, which is not a literal substring of the reported node's own text — the new contract's
// node-anchored report requires the token to be an EXACT SLICE of `node.getText()` at `offset`
// (`policy-pass-context.ts`). The token is now the bare table identifier (still an exact anchor either way:
// a plain or aliased ImportSpecifier's text always starts with the original name), and read/write are now
// distinguished by the per-finding `message` text instead of a token prefix.
//
// DECLARED LIMITS (measured, each with a mustPass row):
//   • A table reached through a namespace import (`import * as schema from "@orb/db"; schema.characters`) is
//     invisible here — the gate keys on the named ImportSpecifier, the same literal-shape limit as
//     `no-direct-users-read` and `discovery-no-stats-rollups`.
//   • A write through an ALIASED binding (`const t = characters; db.insert(t)`) is seen as a READ, not a
//     write — the write arm matches the imported identifier at the call site.
//   • `persistence/` (including `chat/memory/persistence/`) is scoped out of every finding, by design: it is
//     the sanctioned cross-domain read home. Its population is STILL WALKED (unlike the legacy `scanRoot`
//     exclusion) so a domain whose only files sit under `persistence/` is still detected as existing.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `own-tables-only` descriptor at 35bf7d328513bb5411a72eb1ca29786f75dbb99c, the parent of the conversion `fe7b5ea38`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,358 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,044
// and final `population` admits 1,148. legacy − final = ∅. final − legacy = 104 `domain/**/persistence/**` sources —
// now WALKED (still scoped out of every finding), exactly the change the DECLARED LIMITS paragraph records. Controls:
// inside `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { SchemaModel, SchemaTable } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const DOMAIN_ROOT = "packages/server/src/domain/";
const PERSISTENCE_SEG = "/persistence/";
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const DB_SPECIFIER_RE = /^@orb\/db(?:\/(?:schema|index))?$/u;
const DOMAIN_OF_RE = /packages\/server\/src\/domain\/(?<name>[^/]+)\//u;
const SCHEMA_FILE_RE = /packages\/db\/src\/schema\/(?<name>[^/]+)\.ts$/u;
const WRITE_METHODS = new Set(["insert", "update", "delete"]);
const GATE_SELF = "tooling/src/verify/gates/own-tables-only.ts";

/** One ruling row. Deliberately not a reusable "exemption" shape (§ header): these decide whether a touch
 *  IS a violation, never whether an existing one is suppressed. */
interface OwnershipRuling {
  readonly owners: readonly string[];
  readonly why: string;
}

/** Schema files whose producer is NOT a same-named domain. The map is TOTAL over table-bearing schema
 *  files: no row + no `domain/<name>/` ⇒ RED here, so a new non-domain schema file is classified
 *  deliberately instead of silently becoming un-ownable. Empty owners = "no DOMAIN owns this" (the producer
 *  lives outside `domain/`), which makes every domain-side import of its tables RED — the intended verdict.
 *  Both-ways ratchet: a row naming a schema file that no longer exists is RED. */
const SCHEMA_OWNERS: Readonly<Record<string, OwnershipRuling>> = {
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
  "connection-bindings": {
    owners: ["connection"],
    why:
      "a SATELLITE of the `connection` producer — `connection_bindings` + `provider_rows` live apart from " +
      "`user_connections` (`schema/connection.ts`) ONLY to break an import cycle: the bindings FK " +
      "`automation_rules` and `plugins`, whose schema files import `chat.ts`, which FKs `user_connections`. " +
      "Same producer, two files; the `gallery → assets` satellite mapping above is the precedent. The " +
      "automatic same-named-domain dispatch cannot find it because there is no `domain/connection-bindings/` " +
      "and never will be — the split is a cycle fix, not a second producer.",
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
const TABLE_OWNERS: Readonly<Record<string, OwnershipRuling>> = {
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
 *  with no foreign read left in scanned scope is RED (the sanction died — delete the row). */
const BULK_READERS: Readonly<Record<string, { readonly why: string }>> = {
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
const FILE_ALLOWLIST: Readonly<Record<string, { readonly why: string }>> = {
  "packages/server/src/domain/chat/assembly/world-info/pool.ts": {
    why:
      "the doc-NAMED read-only-join pattern — Tier-1-DB.md §Cross-tier composition #3 calls it 'the pool.ts " +
      "pattern' by this exact file: a domain owning a VIEW of another domain's junctions may read them " +
      "directly when the read is ownership-safe. The world-info pool is scoped by the chat's own ids and " +
      "writes nothing. Ends if the doc drops the named pattern, or if the pool ever writes.",
  },
};

const FIX =
  "pick the smallest honest home: (1) if it is an ownership check or a reusable read, move the query into " +
  "YOUR domain's `persistence/` (the sanctioned cross-domain read home — see `persona/persistence/queries.ts` " +
  "`ensureCharacterOwned`); (2) if it is real cross-domain BEHAVIOR, declare the op's type in your " +
  "`contract/` and wire it at the composition root; (3) if you are WRITING, route the write through the " +
  "OWNING domain's persistence helper — `domain/import` writes six domains' canon and imports `@orb/db` zero " +
  "times. A genuine bulk-serializer/analytics reader takes a BULK_READERS row and a doc-named view takes a " +
  "FILE_ALLOWLIST row, each WITH its reason — neither buys a foreign WRITE.";

const readMessage = (table: string): string =>
  `cross-domain READ of \`${table}\` outside \`persistence/\` — this table is imported by a domain that does ` +
  "not own it. A domain touches its OWN tables directly and reaches another domain's DATA through an " +
  "injected op (AGENTS §2). Tier-1-DB.md §'Cross-tier composition': `persistence/` is the sanctioned home " +
  "for reusable cross-domain reads. " +
  FIX;

const writeMessage = (table: string): string =>
  `cross-domain WRITE into \`${table}\` — a drizzle insert/update/delete into a table this domain does not ` +
  "own. No bulk-serializer class and no allowlist row buys a foreign WRITE; route it through the owning " +
  "domain's persistence helper (the shape `domain/import` already uses for six domains' canon) or an " +
  `injected op. ${FIX}`;

const MESSAGE =
  "a domain touches its OWN tables directly and reaches another domain's DATA through an injected op " +
  "(AGENTS §2: cross-feature dependency is never a sideways import). Tier-1-DB.md §'Cross-tier composition': " +
  "`persistence/` is the home for reusable READ helpers and cross-domain ownership checks; verbs/substrate/" +
  "subsystems write their own domain's tables. The ownership map is derived from `packages/db/src/schema/" +
  "<domain>.ts` (producer-names-the-schema) via the shared `drizzle-schema` fact.";

const STALE_SCHEMA_PREFIX = "SCHEMA_OWNERS row names a schema file that no longer exists (ratchet down) — delete it in own-tables-only.ts: ";
const STALE_TABLE_PREFIX = "TABLE_OWNERS row names a table no schema file declares any more (ratchet down) — delete it in own-tables-only.ts: ";
const STALE_BULK_PREFIX =
  "BULK_READERS row for a domain with NO foreign table read left outside persistence/ (ratchet down) — the bulk-serializer sanction is unused; delete it in own-tables-only.ts: ";
const STALE_FILE_PREFIX = "FILE_ALLOWLIST row for a file with NO foreign table import left (ratchet down) — delete it in own-tables-only.ts: ";

function domainOf(rel: string): string | undefined {
  return DOMAIN_OF_RE.exec(rel)?.groups?.["name"];
}

/** Every schema table grouped by its declaring source file (repo-relative). */
function tablesByFile(model: SchemaModel): ReadonlyMap<string, readonly SchemaTable[]> {
  const byFile = new Map<string, SchemaTable[]>();
  for (const table of model.tables) {
    const list = byFile.get(table.identity.sourcePath) ?? [];
    list.push(table);
    byFile.set(table.identity.sourcePath, list);
  }
  return byFile;
}

interface Ownership {
  readonly tableOwners: ReadonlyMap<string, readonly string[]>;
  readonly schemaFiles: ReadonlySet<string>;
  readonly declaredTables: ReadonlySet<string>;
}

/** Build table→owners from the schema sources, reporting the map's own totality violation (a table-bearing
 *  schema file with neither a same-named domain nor a SCHEMA_OWNERS row). `anchor` is a real member of THIS
 *  policy's own effective population (`report.file` validates against it) — the schema file itself lives
 *  only in the drizzle-schema FACT's population, so a whole-schema-derivation finding like this one cannot
 *  anchor there. */
function deriveOwnership(ctx: GatePolicyContext, model: SchemaModel, anchor: string): Ownership {
  const domainRoots = new Set<string>();
  for (const sf of ctx.files) {
    const name = domainOf(ctx.relativePath(sf));
    if (name !== undefined) {
      domainRoots.add(name);
    }
  }
  const tableOwners = new Map<string, readonly string[]>();
  const declaredTables = new Set<string>();
  const schemaFiles = new Set<string>();
  for (const [sourcePath, tables] of tablesByFile(model)) {
    const name = SCHEMA_FILE_RE.exec(sourcePath)?.groups?.["name"];
    if (name === undefined || sourcePath === SCHEMA_BARREL) {
      continue;
    }
    schemaFiles.add(name);
    const row = SCHEMA_OWNERS[name];
    let owners: readonly string[];
    if (row !== undefined) {
      owners = row.owners;
    } else if (domainRoots.has(name)) {
      owners = [name];
    } else {
      ctx.report.file(anchor, {
        message:
          `schema file ${sourcePath} declares tables but has NO owner: there is no \`${DOMAIN_ROOT}${name}/\` ` +
          `and no SCHEMA_OWNERS row in ${GATE_SELF}. A schema file is named for its PRODUCER (Tier-1-DB.md); ` +
          "classify it deliberately — rename it to its producing domain, or add a SCHEMA_OWNERS row naming " +
          "the owning domain(s) (or none, for a producer outside `domain/`) WITH its reason.",
      });
      owners = [];
    }
    for (const table of tables) {
      declaredTables.add(table.identity.declarationName);
      tableOwners.set(table.identity.declarationName, TABLE_OWNERS[table.identity.declarationName]?.owners ?? owners);
    }
  }
  return { tableOwners, schemaFiles, declaredTables };
}

/** The `X` in `db.insert(X)` / `tx.update(X)` / `db.delete(X)`, or undefined. */
function writtenTableIdentifier(node: Node): Node | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && WRITE_METHODS.has(callee.getName()))) {
    return;
  }
  const arg = node.getArguments()[0];
  return arg?.isKind(SyntaxKind.Identifier) === true ? arg : undefined;
}

/** A candidate the WALK records without judging — the schema fact (and therefore `ownership`) is not
 *  finished until `evaluate`, so the ownership question is deferred to that phase. Pure-AST fields only. */
interface ImportCandidate {
  readonly node: Node; // the ImportSpecifier
  readonly rel: string;
  readonly domain: string;
  readonly table: string;
}

interface WriteCandidate {
  readonly node: Node; // the written table's Identifier argument
  readonly rel: string;
  readonly table: string;
}

/** A foreign-`@orb/db`-shaped value ImportSpecifier candidate, or undefined (type-only, not a `@orb/db`
 *  import, or out of the scanned scope). Ownership is judged later, in `evaluate`. */
function importCandidate(node: Node, ctx: GatePolicyContext): ImportCandidate | undefined {
  if (!Node.isImportSpecifier(node) || node.isTypeOnly()) {
    return;
  }
  const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  if (decl === undefined || decl.isTypeOnly() || !DB_SPECIFIER_RE.test(decl.getModuleSpecifierValue())) {
    return;
  }
  const rel = ctx.relativePath(node.getSourceFile());
  const domain = domainOf(rel);
  if (rel.includes(PERSISTENCE_SEG) || domain === undefined) {
    return;
  }
  return { node, rel, domain, table: node.getName() };
}

function writeCandidate(node: Node, ctx: GatePolicyContext): WriteCandidate | undefined {
  const rel = ctx.relativePath(node.getSourceFile());
  if (rel.includes(PERSISTENCE_SEG) || domainOf(rel) === undefined) {
    return;
  }
  const written = writtenTableIdentifier(node);
  return written === undefined ? undefined : { node: written, rel, table: written.getText() };
}

interface JudgeState {
  readonly ownership: Ownership;
  readonly foreignByFile: Map<string, Set<string>>;
  readonly seenBulkDomain: Set<string>;
  readonly seenAllowlistFile: Set<string>;
}

function recordForeignImport(state: JudgeState, rel: string, table: string): void {
  const set = state.foreignByFile.get(rel) ?? new Set<string>();
  set.add(table);
  state.foreignByFile.set(rel, set);
}

/** The READ arm, judged once the schema fact (and `ownership`) is ready. */
function judgeImport(ctx: GatePolicyContext, state: JudgeState, candidate: ImportCandidate): void {
  const owners = state.ownership.tableOwners.get(candidate.table);
  if (owners === undefined || owners.includes(candidate.domain)) {
    return; // not a table, or this domain's own
  }
  recordForeignImport(state, candidate.rel, candidate.table);
  if (candidate.rel in FILE_ALLOWLIST) {
    state.seenAllowlistFile.add(candidate.rel);
    return;
  }
  if (candidate.domain in BULK_READERS) {
    state.seenBulkDomain.add(candidate.domain);
    return;
  }
  ctx.report.node(candidate.node, { token: candidate.table, offset: 0, message: readMessage(candidate.table) });
}

/** The WRITE arm: unconditionally red once the same file recorded that table as a foreign READ. */
function judgeWrite(ctx: GatePolicyContext, state: JudgeState, candidate: WriteCandidate): void {
  if (!(state.foreignByFile.get(candidate.rel)?.has(candidate.table) ?? false)) {
    return;
  }
  ctx.report.node(candidate.node, { token: candidate.table, offset: 0, message: writeMessage(candidate.table) });
}

/** `anchor` is a real member of this policy's own effective population — see `deriveOwnership`'s header. */
function reportStaleOwnershipRows(ctx: GatePolicyContext, state: JudgeState, anchor: string): void {
  const stale = (message: string): void => {
    ctx.report.file(anchor, { message });
  };
  for (const name of Object.keys(SCHEMA_OWNERS)) {
    if (!state.ownership.schemaFiles.has(name)) {
      stale(`${STALE_SCHEMA_PREFIX}"${name}"`);
    }
  }
  for (const table of Object.keys(TABLE_OWNERS)) {
    if (!state.ownership.declaredTables.has(table)) {
      stale(`${STALE_TABLE_PREFIX}"${table}"`);
    }
  }
  for (const domain of Object.keys(BULK_READERS)) {
    if (!state.seenBulkDomain.has(domain)) {
      stale(`${STALE_BULK_PREFIX}"${domain}"`);
    }
  }
  for (const file of Object.keys(FILE_ALLOWLIST)) {
    if (!state.seenAllowlistFile.has(file)) {
      stale(`${STALE_FILE_PREFIX}"${file}"`);
    }
  }
}

/** Complete proof data for the reverse-liveness arms. Membership comes from the private ruling tables so
 *  adding a ruling cannot leave this corpus silently stale. The synthetic producer is kept distinct from
 *  every ruled schema/domain/file subject, and every generated table binding is collision-free with the
 *  per-table overrides. */
function completeOwnershipProofFiles(): Readonly<Record<string, string>> {
  const files: Record<string, string> = {};
  const schemaModules: string[] = [];
  const addFile = (path: string, source: string): void => {
    if (path in files) {
      throw new Error(`own-tables-only proof construction produced a duplicate path: ${path}`);
    }
    files[path] = source;
  };
  const usedTableIdents = new Set(Object.keys(TABLE_OWNERS));
  const usedDomains = new Set([...Object.keys(SCHEMA_OWNERS), ...Object.keys(BULK_READERS)]);
  for (const row of [...Object.values(SCHEMA_OWNERS), ...Object.values(TABLE_OWNERS)]) {
    for (const owner of row.owners) {
      usedDomains.add(owner);
    }
  }
  for (const file of Object.keys(FILE_ALLOWLIST)) {
    const domain = domainOf(file);
    if (domain !== undefined) {
      usedDomains.add(domain);
    }
  }

  let producerDomain = "own-tables-proof";
  for (let suffix = 2; usedDomains.has(producerDomain); suffix += 1) {
    producerDomain = `own-tables-proof-${suffix}`;
  }
  usedDomains.add(producerDomain);

  const unusedTableIdent = (preferred: string): string => {
    let candidate = preferred;
    for (let suffix = 2; usedTableIdents.has(candidate); suffix += 1) {
      candidate = `${preferred}${suffix}`;
    }
    usedTableIdents.add(candidate);
    return candidate;
  };
  const fixtureTableIdent = (subject: string): string => {
    const suffix = subject
      .split(/[^A-Za-z0-9]+/u)
      .filter((part) => part.length > 0)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join("");
    return unusedTableIdent(`ownTablesProof${suffix}`);
  };
  const tableDeclaration = (ident: string, sqlName: string): string => `export const ${ident} = sqliteTable("${sqlName}", { id: text("id").primaryKey() });\n`;

  let ordinal = 0;
  for (const schemaName of Object.keys(SCHEMA_OWNERS)) {
    ordinal += 1;
    const ident = fixtureTableIdent(schemaName);
    addFile(
      `packages/db/src/schema/${schemaName}.ts`,
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' + tableDeclaration(ident, `own_tables_proof_${ordinal}`),
    );
    schemaModules.push(schemaName);
  }

  const producerTables = Object.keys(TABLE_OWNERS).map((table) => {
    ordinal += 1;
    return tableDeclaration(table, `own_tables_proof_${ordinal}`);
  });
  const foreignTable = unusedTableIdent("ownTablesProofForeign");
  ordinal += 1;
  producerTables.push(tableDeclaration(foreignTable, `own_tables_proof_${ordinal}`));
  addFile(`packages/db/src/schema/${producerDomain}.ts`, 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' + producerTables.join(""));
  schemaModules.push(producerDomain);

  const ownerDomains = new Set([...Object.values(SCHEMA_OWNERS), ...Object.values(TABLE_OWNERS)].flatMap(({ owners }) => owners));
  ownerDomains.add(producerDomain);
  for (const owner of ownerDomains) {
    addFile(`packages/server/src/domain/${owner}/verbs/own-tables-proof-anchor.ts`, "export const ownTablesProofAnchor = true;\n");
  }
  for (const domain of Object.keys(BULK_READERS)) {
    addFile(
      `packages/server/src/domain/${domain}/verbs/own-tables-proof-read.ts`,
      `import { ${foreignTable} } from "@orb/db";\nexport const ownTablesProofRead = ${foreignTable};\n`,
    );
  }
  for (const file of Object.keys(FILE_ALLOWLIST)) {
    addFile(file, `import { ${foreignTable} } from "@orb/db";\nexport const ownTablesProofRead = ${foreignTable};\n`);
  }
  addFile(SCHEMA_BARREL, schemaModules.map((schemaName) => `export * from "./${schemaName}.ts";\n`).join(""));
  return files;
}

const COMPLETE_OWNERSHIP_PROOF_FILES = completeOwnershipProofFiles();
const STALE_FILE_PROOF_FILES = {
  ...COMPLETE_OWNERSHIP_PROOF_FILES,
  ...Object.fromEntries(Object.keys(FILE_ALLOWLIST).map((file) => [file, "export const ownTablesProofQuiet = true;\n"])),
};

export const gate = defineGate({
  id: "own-tables-only",
  family: "drizzle-schema",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // The schema fact is not FINISHED until the shared walk completes, so ownership can only be judged in
    // `evaluate`. The walk itself only records pure-AST candidates (no ownership question asked yet).
    const imports: ImportCandidate[] = [];
    const writes: WriteCandidate[] = [];

    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node) => {
            const candidate = importCandidate(node, ctx);
            if (candidate !== undefined) {
              imports.push(candidate);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            const candidate = writeCandidate(node, ctx);
            if (candidate !== undefined) {
              writes.push(candidate);
            }
          },
        },
      ],
      evaluate: () => {
        const schemaFact = ctx.fact(drizzleSchemaFact).schema();
        recordReadySchemaFact(ctx, schemaFact);
        // A real member of THIS policy's own effective population (@server/domain) — `report.file` cannot
        // anchor on a schema path or on the gate's own source, neither of which is in that population.
        const anchorFile = ctx.files[0];
        if (anchorFile === undefined) {
          throw new Error("own-tables-only received an empty effective source population");
        }
        const anchor = ctx.relativePath(anchorFile);
        const state: JudgeState = {
          ownership: deriveOwnership(ctx, schemaFact.value, anchor),
          foreignByFile: new Map(),
          seenBulkDomain: new Set(),
          seenAllowlistFile: new Set(),
        };
        for (const candidate of imports) {
          judgeImport(ctx, state, candidate);
        }
        for (const candidate of writes) {
          judgeWrite(ctx, state, candidate);
        }
        // The stale arms are WHOLE-SCHEMA claims: withheld unless the real production schema — recognised by
        // its barrel — was actually loaded. A conformance mini-project or a scoped run that never resolves
        // the barrel would otherwise "prove" every sanction had vanished (§4.5's real-tree-anchor shape).
        if (!schemaFact.receipt.paths.includes(SCHEMA_BARREL)) {
          return;
        }
        reportStaleOwnershipRows(ctx, state, anchor);
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/create-from-character.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      expect: { count: 1, token: "characters" },
      why: "the founding shape — a verb reading ANOTHER domain's table straight off the barrel (the real create-from-character defect this gate was minted from)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const messages = sqliteTable("messages", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/export/verbs/export-chat.ts":
          'import { messages } from "@orb/db";\nexport async function f(db: { delete: (t: unknown) => Promise<void> }): Promise<void> {\n  await db.delete(messages);\n}\n',
      },
      expect: { count: 1, token: "messages" },
      why: "the WRITE arm's whole point: `export` carries a BULK_READERS row, so its foreign READ passes — and the `delete` still reds. No class exemption buys a foreign write",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/nobody.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const orphans = sqliteTable("orphans", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "has NO owner" },
      why: "the MAP's own totality arm — a table-bearing schema file with no same-named domain and no SCHEMA_OWNERS row forces the deliberate classification instead of silently making its tables un-ownable",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/assets/workload-contributions.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      expect: { count: 1, token: "characters" },
      why: "a FEATURE-ROOT slot (workload-contributions.ts), not a verb — the scan is `domain/**`, so the root slots and named subsystems are covered too",
    },
    {
      mode: "types",
      files: STALE_FILE_PROOF_FILES,
      expect: {
        countFrom: "FILE_ALLOWLIST",
        messageIncludes: "FILE_ALLOWLIST row for a file with NO foreign table import left (ratchet down) — delete it in own-tables-only.ts: ",
      },
      why: "THE COMPLETE FILE_ALLOWLIST REVERSE RATCHET (#2343): every exact-file permission is present but deliberately quiet while every schema, table, bulk-reader, domain anchor, and schema-barrel companion remains live. The production reverse loop must report every exact-file permission subject; the drizzle-schema family test compares that complete finding set with the source registry.",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/persona.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const personas = sqliteTable("personas", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/persona/verbs/create.ts":
          'import { personas } from "@orb/db";\nexport async function f(db: { insert: (t: unknown) => Promise<void> }): Promise<void> {\n  await db.insert(personas);\n}\n',
      },
      why: "the sanctioned shape the old absolute sentence wrongly banned — a verb writing its OWN domain's table directly",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/persistence/queries.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      why:
        "`persistence/` is scoped out of every FINDING — the sanctioned home for a cross-domain ownership check " +
        "(`ensureCharacterOwned`). The persistence file is still WALKED (population is the whole domain tree), " +
        "which is the intentional correction over the legacy `scanRoot` exclusion: a domain whose only files sit " +
        "under `persistence/` must still count as existing.",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/discovery/verbs/browse.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      why: "a BULK_READERS domain (discovery — library analytics computed by reading other domains' rows in bulk) reading a foreign table",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/world-info.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const worldEntries = sqliteTable("world_entries", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/world-info/verbs/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/chat/assembly/world-info/pool.ts": 'import { worldEntries } from "@orb/db";\nexport const w = worldEntries;\n',
      },
      why: "the FILE_ALLOWLIST row — Tier-1-DB.md §Cross-tier composition #3 names this exact file as 'the pool.ts pattern' (a chat-owned read-only VIEW over world-info's junctions)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characterPersonas = sqliteTable("character_personas", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/connection/connect.ts":
          'import { characterPersonas } from "@orb/db";\nexport async function f(db: { insert: (t: unknown) => Promise<void> }): Promise<void> {\n  await db.insert(characterPersonas);\n}\n',
      },
      why: "the TABLE_OWNERS override: `character_personas` FILE-homes in schema/character.ts but its PRODUCER is persona (its only writers are persona's connect/disconnect verbs) — a per-table classification the file-level map cannot express",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/x.ts": 'import type { characters } from "@orb/db";\nexport type C = typeof characters;\n',
      },
      why: "a TYPE-ONLY import of a foreign table — the DB row type is the `db` home every domain imports downward; only DATA access is the boundary",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/character/verbs/read.ts": "export const x = 1;\n",
        "packages/server/src/domain/persona/verbs/x.ts": 'import * as schema from "@orb/db";\nexport const c = schema.characters;\n',
      },
      why: "DECLARED LIMIT, proven not assumed: a NAMESPACE import is invisible to the ImportSpecifier reader (the same literal-shape limit as no-direct-users-read). Zero exist under domain/; this row is the written baseline a future widening starts from",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const users = sqliteTable("users", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/admin/verbs/set-role.ts":
          'import { users } from "@orb/db";\nexport async function f(db: { update: (t: unknown) => Promise<void> }): Promise<void> {\n  await db.update(users);\n}\n',
      },
      why: "the double-owned identity root (SCHEMA_OWNERS `users` → sessions + admin): admin's user-management verbs legitimately WRITE it, so neither arm may bite",
    },
    {
      mode: "types",
      files: COMPLETE_OWNERSHIP_PROOF_FILES,
      why: "THE COMPLETE OWNERSHIP-RULING TWIN (#2343): every SCHEMA_OWNERS and TABLE_OWNERS subject exists, every owner has a domain anchor, every BULK_READERS and FILE_ALLOWLIST subject performs a foreign read, and the canonical schema barrel is acquired through the production drizzleSchemaFact. All permissions are live, so the policy must reach a complete clean verdict",
    },
  ],
});
