// biome-ignore-all lint/security/noSecrets: mustFlag/mustPass fixture source strings (vector-table write/import snippets) are documentation-with-teeth, not secrets.
// Gate: vector-scope-derived (ledger D20; Knowledge-Cluster.md invariants 1–2) — the no-cross-user-leak
// chokepoints on the vector substrate, as physics:
//   • WRITE chokepoint (inv 1): every `.insert/.update/.delete` on the five vector tables lives in
//     `domain/embeddings/persistence/` — producers are lens arms of `embeddings.store`, never inserters
//     (`writeHubScores` is embeddings-persistence too, so the one sanctioned non-`store` write is inside
//     the same dir).
//   • COSINE chokepoint (inv 2): the SQL `vector_distance_cos` appears in CODE (string/template literals)
//     only under `domain/search/persistence/` — top-k retrieval is search's alone; discovery's analytics
//     are in-RAM `pairwiseCosine`; memory delegates to the injected `searchDigests` op. Comments citing
//     the function name are fine (only literals are scanned).
//   • IMPORT scope: the five table symbols are importable only by the sanctioned set — embeddings (owner),
//     search/persistence (reader), chat/memory/persistence (the digest GENERATOR's metadata bookkeeping —
//     tier/blockIdx/contentHash reads, never vectors), discovery/persistence (in-RAM analytics loads), and
//     the foundation `/_debug` probes (read-only, reads `@orb/db` down). A NEW importer — another domain,
//     a transport driver, a verbs file — is RED: every scan must be a scoped `search` engine call whose
//     producer owner-scope is a mandatory param (derived from the producer, never a stamped `ownerId` —
//     the D20 derive-don't-stamp security model).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";

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

const IMPORT_MESSAGE =
  "vector-table symbol imported outside the sanctioned set (embeddings owner · search/persistence reader · chat/memory/persistence bookkeeping · discovery/persistence analytics · the /_debug probes) — every other scan goes through the ONE search engine with a mandatory producer scope (D20; Knowledge-Cluster.md inv 1-2).";
const WRITE_MESSAGE =
  "vector-table WRITE outside domain/embeddings/persistence — every insert/update/delete on the five vector tables is embeddings' (producers are lens arms of embeddings.store, never inserters — D20; Knowledge-Cluster.md inv 1).";
const COSINE_MESSAGE =
  "vector_distance_cos in code outside domain/search/persistence — top-k retrieval is search's alone; discovery is in-RAM pairwiseCosine, memory delegates to the injected searchDigests op (Knowledge-Cluster.md inv 2).";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b) — multi-arm, per-arm SCOPE) ────────────────────
// Three arms, three sanctioned scopes, three messages — ONE gate. The IMPORT arm (a vector-table symbol
// imported from @orb/db in an import-unsanctioned file), the WRITE arm (a `.insert/.update/.delete(table)`
// in a write-unsanctioned file), and the COSINE arm (`vector_distance_cos` in a string/template literal in
// a cosine-unsanctioned file). All arms require server-src (the scanRoot); the per-arm sanctioned zones
// are re-checked inside visit. Each finding carries its arm's message. Per-occurrence. Kept ALONGSIDE the
// legacy Check. (One of the audit's top-cost gates: this port collapses its 3 kind-sweeps into the walk.)
const STRING_KINDS: readonly SyntaxKind[] = [...LITERAL_KINDS];

function reportAt(ctx: GateRunCtx, node: Node, message: string, token: string): void {
  const sf = node.getSourceFile();
  const finding: Finding = {
    file: relPath(ctx.root, sf.getFilePath()),
    line: node.getStartLineNumber(),
    column: sf.getLineAndColumnAtPos(node.getStart()).column,
    message,
    token,
  };
  ctx.report(finding);
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
  const isTableArg =
    firstArg !== undefined &&
    firstArg.isKind(SyntaxKind.Identifier) &&
    VECTOR_TABLES.has(firstArg.getText());
  return isTableArg ? `.${callee.getName()}(${firstArg.getText()})` : "";
}

export const gate: GateDescriptor = {
  name: "vector-scope-derived",
  docRow: "ledger D20 (Knowledge-Cluster.md inv 1-2)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: IMPORT_MESSAGE,
  fix: "go through the ONE search engine with a mandatory producer scope; writes are embeddings.store lens arms, cosine is search/persistence's alone (D20).",
  scanRoot: (p) => SERVER_SRC.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression, ...STRING_KINDS],
  visit: (node, sf, ctx) => {
    const path = sf.getFilePath();
    // Import arm.
    const importedTable = IMPORT_SANCTIONED.test(path) ? "" : vectorTableImport(node);
    if (importedTable !== "") {
      reportAt(ctx, node, IMPORT_MESSAGE, importedTable);
      return;
    }
    // Write arm.
    const write = WRITE_SANCTIONED.test(path) ? "" : vectorWrite(node);
    if (write !== "") {
      reportAt(ctx, node, WRITE_MESSAGE, write);
      return;
    }
    // Cosine arm: a string/template literal PART carrying vector_distance_cos.
    if (!COSINE_SANCTIONED.test(path) && node.getText().includes(COSINE)) {
      reportAt(ctx, node, COSINE_MESSAGE, COSINE);
    }
  },
  mustFlag: [
    {
      files: 'import { chatDigests } from "@orb/db";\nexport const t = chatDigests;\n',
      at: "packages/server/src/domain/hub/x.ts",
      expect: { messageIncludes: "sanctioned set" },
      why: "a vector-table symbol imported outside the sanctioned set — a NEW importer (inv 1)",
    },
    {
      files: 'export const q = "SELECT vector_distance_cos(a, b)";\n',
      at: "packages/server/src/domain/hub/y.ts",
      expect: { messageIncludes: "top-k retrieval is search" },
      why: "vector_distance_cos in code outside search/persistence — top-k retrieval is search's alone (inv 2)",
    },
    {
      files: "export const w = (db: { insert: (t: unknown) => void }) => db.insert(chatDigests);\n",
      at: "packages/server/src/domain/hub/w.ts",
      expect: { messageIncludes: "WRITE outside domain/embeddings/persistence" },
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
