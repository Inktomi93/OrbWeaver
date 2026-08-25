// biome-ignore-all lint/security/noSecrets: mustFlag/mustPass fixture source strings (vector-table write/import snippets) are documentation-with-teeth, not secrets.
// Gate: vector-scope-derived (D20; Knowledge-Cluster.md invariants 1-2) — the no-cross-user-leak
// chokepoints on the vector substrate: WRITE (inv 1) — every insert/update/delete on the five vector
// tables lives in domain/embeddings/persistence/; COSINE (inv 2) — `vector_distance_cos` in code only
// under domain/search/persistence/; IMPORT — named and `@orb/db` namespace table reads are confined to the
// sanctioned domain set. Write table args resolve their @orb/db import declaration, so named aliases and
// namespace members retain the table's ownership identity.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";

const VECTOR_TABLES = new Set([
  "characterEmbeddings",
  "imageEmbeddings",
  "chatDigests",
  "chatSegments",
  "chatDigestSpeakers",
  // databank's 5th primary vector table (D49 #5; databank-design/02 §2). Born into the baseline with the
  // same chokepoint physics: writes are embeddings.store lens arms (land with DB2 proper), reads go
  // through the ONE search engine — never a direct databank import of the table symbol.
  "documentChunks",
]);
const DB_SPECIFIER = /^@orb\/db(?:\/|$)/u;
const SERVER_SRC = /\/packages\/server\/src\//u;
const IMPORT_SANCTIONED = new RegExp(
  "/packages/server/src/(?:" +
    "domain/embeddings/|" +
    "domain/search/persistence/|" +
    "domain/chat/memory/persistence/|" +
    "domain/discovery/persistence/|" +
    "foundation/observability/debug/" +
    ")",
  "u",
);
const WRITE_SANCTIONED = /\/packages\/server\/src\/domain\/embeddings\/persistence\//u;
const COSINE_SANCTIONED = /\/packages\/server\/src\/domain\/search\/persistence\//u;
const COSINE = "vector_distance_cos";
const WRITE_METHODS = new Set(["insert", "update", "delete"]);
const LITERAL_KINDS = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
] as const;

// A single combined group message: the three arms differ only in WHICH chokepoint was bypassed, and the
// node overload (§1, GATE-AUTHORING.md) carries no per-finding message — the `token` (table name / write
// label / `vector_distance_cos`) is what distinguishes an occurrence; see mustFlag below.
const GROUP_MESSAGE =
  "a vector-substrate chokepoint was bypassed: a vector-table symbol imported outside the sanctioned set " +
  "(embeddings owner · search/persistence reader · chat/memory/persistence bookkeeping · discovery/persistence " +
  "analytics · the /_debug probes), a vector-table WRITE outside domain/embeddings/persistence (writes are " +
  "embeddings.store lens arms, never inserters), or `vector_distance_cos` used outside domain/search/persistence " +
  "(top-k retrieval is search's alone; discovery is in-RAM pairwiseCosine, memory delegates to the injected " +
  "searchDigests op) — D20; Knowledge-Cluster.md inv 1-2.";

function reportAt(ctx: GateRunCtx, node: Node, token: string): void {
  ctx.report(node, { token, offset: 0 });
}

/** Is this ImportSpecifier a vector-table symbol imported from `@orb/db`? Returns the table name, else "". */
function vectorTableImport(node: Node): string {
  if (!node.isKind(SyntaxKind.ImportSpecifier)) {
    return "";
  }
  const name = node.getName();
  if (!VECTOR_TABLES.has(name)) {
    return "";
  }
  const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return decl !== undefined && DB_SPECIFIER.test(decl.getModuleSpecifierValue()) ? name : "";
}

/** The vector table exported by an \@orb/db ImportSpecifier, including `import { x as local }`. */
function importedVectorTable(node: Node): string {
  if (!node.isKind(SyntaxKind.ImportSpecifier)) {
    return "";
  }
  return vectorTableImport(node);
}

function comesFromDbNamespace(node: Node): boolean {
  return node.getDefinitionNodes().some((definition) => {
    if (definition.getKind() !== SyntaxKind.NamespaceImport) {
      return false;
    }
    const declaration = definition.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    return declaration !== undefined && DB_SPECIFIER.test(declaration.getModuleSpecifierValue());
  });
}

/** Resolve a direct vector-table identifier, a named \@orb/db import alias, or an \@orb/db namespace member. */
function vectorTableAccess(node: Node): string {
  if (node.isKind(SyntaxKind.Identifier)) {
    if (VECTOR_TABLES.has(node.getText())) {
      return node.getText();
    }
    for (const definition of node.getDefinitionNodes()) {
      const table = importedVectorTable(definition);
      if (table !== "") {
        return table;
      }
    }
    return "";
  }
  if (!(node.isKind(SyntaxKind.PropertyAccessExpression) && VECTOR_TABLES.has(node.getName()))) {
    return "";
  }
  const receiver = node.getExpression();
  if (!receiver.isKind(SyntaxKind.Identifier)) {
    return "";
  }
  return comesFromDbNamespace(receiver) ? node.getName() : "";
}

/** Is this CallExpression a `.insert/.update/.delete(vectorTable)` write? Returns a label, else "". */
function vectorWrite(node: Node): string {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return "";
  }
  const callee = node.getExpression();
  if (!callee.isKind(SyntaxKind.PropertyAccessExpression)) {
    return "";
  }
  if (!WRITE_METHODS.has(callee.getName())) {
    return "";
  }
  const [firstArg] = node.getArguments();
  if (firstArg === undefined) {
    return "";
  }
  const table = vectorTableAccess(firstArg);
  return table === "" ? "" : `.${callee.getName()}(${firstArg.getText()})`;
}

export const gate: GateDescriptor = {
  name: "vector-scope-derived",
  docRow: "ledger D20 (Knowledge-Cluster.md inv 1-2)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: GROUP_MESSAGE,
  fix: "go through the ONE search engine with a mandatory producer scope; writes are embeddings.store lens arms, cosine is search/persistence's alone (D20).",
  scanRoot: (p) => SERVER_SRC.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.CallExpression, ...LITERAL_KINDS],
  visit: (node, sf, ctx) => {
    const path = sf.getFilePath();
    // Import arm.
    const importedTable = IMPORT_SANCTIONED.test(path) ? "" : vectorTableImport(node);
    if (importedTable !== "") {
      reportAt(ctx, node, importedTable);
      return;
    }
    const namespaceTable = IMPORT_SANCTIONED.test(path) ? "" : vectorTableAccess(node);
    if (namespaceTable !== "" && node.isKind(SyntaxKind.PropertyAccessExpression)) {
      reportAt(ctx, node, namespaceTable);
      return;
    }
    // Write arm.
    const write = WRITE_SANCTIONED.test(path) ? "" : vectorWrite(node);
    if (write !== "") {
      reportAt(ctx, node, write);
      return;
    }
    // Cosine arm: a string/template literal PART carrying vector_distance_cos.
    if (!COSINE_SANCTIONED.test(path) && node.getText().includes(COSINE)) {
      reportAt(ctx, node, COSINE);
    }
  },
  mustFlag: [
    {
      files: 'import { chatDigests } from "@orb/db";\nexport const t = chatDigests;\n',
      at: "packages/server/src/domain/hub/x.ts",
      expect: { token: "chatDigests" },
      why: "a vector-table symbol imported outside the sanctioned set — a NEW importer (inv 1)",
    },
    {
      files: 'import * as schema from "@orb/db";\nexport const w = (db: Db) => db.insert(schema.chatDigests);\n',
      at: "packages/server/src/domain/hub/namespace-write.ts",
      expect: { count: 2 },
      why: "a vector table reached through an @orb/db namespace is both an unsanctioned import use and an unsanctioned write; property-access syntax cannot hide either chokepoint bypass",
    },
    {
      files: 'import { chatDigests as table } from "@orb/db";\nexport const w = (db: Db) => db.insert(table);\n',
      at: "packages/server/src/domain/search/persistence/aliased-write.ts",
      expect: { token: ".insert(table)" },
      why: "a sanctioned reader cannot become a vector writer by aliasing the imported table name — write ownership follows the import declaration's symbol identity",
    },
    {
      files: 'export const q = "SELECT vector_distance_cos(a, b)";\n',
      at: "packages/server/src/domain/hub/y.ts",
      expect: { token: COSINE },
      why: "vector_distance_cos in code outside search/persistence — top-k retrieval is search's alone (inv 2)",
    },
    {
      files: "export const w = (db: { insert: (t: unknown) => void }) => db.insert(chatDigests);\n",
      at: "packages/server/src/domain/hub/w.ts",
      expect: { token: ".insert(chatDigests)" },
      why: "a `.insert(vectorTable)` write outside embeddings/persistence — writes are embeddings.store lens arms (inv 1)",
    },
  ],
  mustPass: [
    {
      files: 'import { chatDigests } from "@orb/db";\nexport const t = chatDigests;\n',
      at: "packages/server/src/domain/embeddings/persistence/store.ts",
      why: "the embeddings owner importing the table symbol — a sanctioned importer, passes",
    },
    {
      files: "export const w = (db: { insert: (t: unknown) => void }) => db.insert(chatDigests);\n",
      at: "packages/server/src/domain/embeddings/persistence/store.ts",
      why: "the same vector-table write INSIDE embeddings/persistence (WRITE_SANCTIONED) — a lens arm, passes",
    },
    {
      files: 'import { chatDigests as table } from "@orb/db";\nexport const w = (db: Db) => db.insert(table);\n',
      at: "packages/server/src/domain/embeddings/persistence/aliased-store.ts",
      why: "the embeddings persistence owner remains the sanctioned writer when the local import binding is aliased",
    },
    {
      files: "// vector_distance_cos is search's — cited in a comment\nexport const x = 1;\n",
      at: "packages/server/src/domain/hub/z.ts",
      why: "the cosine function named in a COMMENT (not a literal) — only literals are scanned, passes",
    },
  ],
};
