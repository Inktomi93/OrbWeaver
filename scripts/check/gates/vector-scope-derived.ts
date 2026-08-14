// biome-ignore-all lint/security/noSecrets: mustFlag/mustPass fixture source strings (vector-table write/import snippets) are documentation-with-teeth, not secrets.
// Gate: vector-scope-derived (D20; Knowledge-Cluster.md invariants 1-2) — the no-cross-user-leak
// chokepoints on the vector substrate: WRITE (inv 1) — every insert/update/delete on the five vector
// tables lives in domain/embeddings/persistence/; COSINE (inv 2) — `vector_distance_cos` in code only
// under domain/search/persistence/; IMPORT — the five table symbols importable only by the sanctioned domain set. A new importer is RED.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

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

/** Is this ImportSpecifier a vector-table symbol imported from @orb/db? Returns the table name, else "". */
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
  const isTableArg = firstArg?.isKind(SyntaxKind.Identifier) && VECTOR_TABLES.has(firstArg.getText());
  return isTableArg ? `.${callee.getName()}(${firstArg.getText()})` : "";
}

export const gate: GateDescriptor = {
  name: "vector-scope-derived",
  docRow: "ledger D20 (Knowledge-Cluster.md inv 1-2)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: GROUP_MESSAGE,
  fix: "go through the ONE search engine with a mandatory producer scope; writes are embeddings.store lens arms, cosine is search/persistence's alone (D20).",
  scanRoot: (p) => SERVER_SRC.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression, ...LITERAL_KINDS],
  visit: (node, sf, ctx) => {
    const path = sf.getFilePath();
    // Import arm.
    const importedTable = IMPORT_SANCTIONED.test(path) ? "" : vectorTableImport(node);
    if (importedTable !== "") {
      reportAt(ctx, node, importedTable);
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
      files: "// vector_distance_cos is search's — cited in a comment\nexport const x = 1;\n",
      at: "packages/server/src/domain/hub/z.ts",
      why: "the cosine function named in a COMMENT (not a literal) — only literals are scanned, passes",
    },
  ],
};
