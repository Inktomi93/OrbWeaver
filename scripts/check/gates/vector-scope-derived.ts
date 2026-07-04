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
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const VECTOR_TABLES = new Set([
  "characterEmbeddings",
  "imageEmbeddings",
  "chatDigests",
  "chatSegments",
  "chatDigestSpeakers",
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

/** Vector-table named imports from `@orb/db` in an unsanctioned file. */
function importViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const decl of sf.getImportDeclarations()) {
    if (!DB_SPECIFIER.test(decl.getModuleSpecifierValue())) {
      continue;
    }
    for (const named of decl.getNamedImports()) {
      if (VECTOR_TABLES.has(named.getName())) {
        out.push({ file: rel, line: named.getStartLineNumber(), message: IMPORT_MESSAGE });
      }
    }
  }
  return out;
}

/** `db.insert(vectorTable)` / `.update` / `.delete` call sites in an unsanctioned file. */
function writeViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!callee.isKind(SyntaxKind.PropertyAccessExpression)) {
      continue;
    }
    if (!WRITE_METHODS.has(callee.getName())) {
      continue;
    }
    const [firstArg] = call.getArguments();
    if (
      firstArg !== undefined &&
      firstArg.isKind(SyntaxKind.Identifier) &&
      VECTOR_TABLES.has(firstArg.getText())
    ) {
      out.push({ file: rel, line: call.getStartLineNumber(), message: WRITE_MESSAGE });
    }
  }
  return out;
}

/** `vector_distance_cos` inside string/template literals (comments never match) in an unsanctioned file. */
function cosineViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const kind of LITERAL_KINDS) {
    for (const lit of sf.getDescendantsOfKind(kind)) {
      if (lit.getText().includes(COSINE)) {
        out.push({ file: rel, line: lit.getStartLineNumber(), message: COSINE_MESSAGE });
      }
    }
  }
  return out;
}

export const vectorScopeDerived: Check = {
  name: "vector-scope-derived",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!SERVER_SRC.test(path)) {
        continue;
      }
      const rel = relPath(root, path);
      if (!IMPORT_SANCTIONED.test(path)) {
        violations.push(...importViolations(sf, rel));
      }
      if (!WRITE_SANCTIONED.test(path)) {
        violations.push(...writeViolations(sf, rel));
      }
      if (!COSINE_SANCTIONED.test(path)) {
        violations.push(...cosineViolations(sf, rel));
      }
    }
    return violations;
  },
};
