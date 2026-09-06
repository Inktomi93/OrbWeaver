// Ledger D20 / Knowledge-Cluster.md invariants 1-2 — the no-cross-user-leak chokepoints on the vector
// substrate. Three arms, one reason: IMPORT (a vector-table symbol named outside the sanctioned domain
// set), WRITE (an insert/update/delete on a vector table outside domain/embeddings/persistence), COSINE
// (`vector_distance_cos` outside domain/search/persistence). Table identity is the DECLARATION HOME through
// the shared origin reader, so an alias, a namespace member and a bracket read are the same table while a
// same-named export elsewhere is not; the write method is read the same way. Limits live in mustPass.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin } from "../lib/sealed-origin.ts";

/** The six primary vector tables, sealed by their declaration home in the db schema. */
const VECTOR_TABLE_HOME: SealedHome = {
  pathInfix: "/packages/db/src/schema/",
  exportedNames: new Set(["characterEmbeddings", "imageEmbeddings", "chatDigests", "chatSegments", "chatDigestSpeakers", "documentChunks"]),
};

const WRITE_METHODS = new Set(["insert", "update", "delete"]);
const COSINE = "vector_distance_cos";

const IMPORT_SANCTIONED = [
  "packages/server/src/domain/embeddings/",
  "packages/server/src/domain/search/persistence/",
  "packages/server/src/domain/chat/memory/persistence/",
  "packages/server/src/domain/discovery/persistence/",
  "packages/server/src/foundation/observability/debug/",
];
const WRITE_SANCTIONED = "packages/server/src/domain/embeddings/persistence/";
const COSINE_SANCTIONED = "packages/server/src/domain/search/persistence/";

const LITERAL_KINDS = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
] as const;

const MESSAGE =
  "a vector-substrate chokepoint was bypassed: a vector-table symbol named outside the sanctioned set " +
  "(embeddings owner · search/persistence reader · chat/memory/persistence bookkeeping · " +
  "discovery/persistence analytics · the /_debug probes), a vector-table WRITE outside " +
  "domain/embeddings/persistence (writes are embeddings.store lens arms, never inserters), or " +
  "`vector_distance_cos` used outside domain/search/persistence (top-k retrieval is search's alone; " +
  "discovery is in-RAM pairwiseCosine, memory delegates to the injected searchDigests op) — D20; " +
  "Knowledge-Cluster.md inv 1-2.";

const FIX =
  "go through the ONE search engine with a mandatory producer scope; writes are embeddings.store lens arms, cosine is search/persistence's alone (D20).";

/** Legacy `scanRoot` tested `/packages\\/server\\/src\\//` against a slash-prefixed repo path — the `@server`
 *  root exactly. The sanctioned homes stay IN the population and are decided per arm below, so a re-home
 *  reds at its new path instead of carrying its exemption silently. */
const SERVER_POPULATION = { in: ["@server"], ext: ["ts", "tsx"] } as const;

/** A reference SPELLED like a vector table: an import specifier (whose `getName()` is the exported name even
 *  under an alias) or a member read of that name. The NAME is the candidate gate; the origin is the verdict. */
function vectorCandidate(node: MorphNode): { readonly name: string; readonly anchor: MorphNode } | null {
  if (Node.isImportSpecifier(node)) {
    const name = node.getName();
    return VECTOR_TABLE_HOME.exportedNames.has(name) ? { name, anchor: node } : null;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return null;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && VECTOR_TABLE_HOME.exportedNames.has(member.value.name) ? { name: member.value.name, anchor: node } : null;
}

/** Is this expression a vector table, in any spelling? A bare identifier bound to a vector-table import is
 *  the same table as the namespace member and the bracket read. */
function vectorTableArgument(argument: MorphNode): string | null {
  const candidate = vectorCandidate(argument);
  if (candidate !== null) {
    return readSealedOrigin(candidate.anchor, VECTOR_TABLE_HOME).kind === "sealed" ? candidate.name : null;
  }
  if (!Node.isIdentifier(argument)) {
    return null;
  }
  const verdict = readSealedOrigin(argument, VECTOR_TABLE_HOME);
  return verdict.kind === "sealed" ? verdict.exportedName : null;
}

export const gate = defineGate({
  id: "vector-scope-derived",
  family: "vector-scope-derived",
  authority: "ordinary",
  severity: "error",
  population: SERVER_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    let path = "";
    return {
      visitFile: (sourceFile) => {
        path = ctx.relativePath(sourceFile);
      },
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node) => {
            const candidate = vectorCandidate(node);
            if (candidate === null || IMPORT_SANCTIONED.some((home) => path.startsWith(home))) {
              return;
            }
            // FAIL-CLOSED: a vector-table NAME whose origin cannot be read is reported. The chokepoint must
            // not be walkable through an unreadable barrel.
            if (readSealedOrigin(candidate.anchor, VECTOR_TABLE_HOME).kind !== "foreign") {
              ctx.report.node(candidate.anchor, { token: candidate.name, offset: candidate.anchor.getText().indexOf(candidate.name) });
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!Node.isCallExpression(node) || path.startsWith(WRITE_SANCTIONED)) {
              return;
            }
            const callee = readMemberReference(node.getExpression());
            if (callee.kind !== "resolved" || !WRITE_METHODS.has(callee.value.name)) {
              return;
            }
            const argument = node.getArguments()[0];
            const table = argument === undefined ? null : vectorTableArgument(argument);
            if (table !== null) {
              const nameNode = callee.value.nameNode;
              ctx.report.node(nameNode, { token: callee.value.name, offset: nameNode.getText().indexOf(callee.value.name) });
            }
          },
        },
        {
          kinds: [...LITERAL_KINDS],
          visit: (node) => {
            // The cosine arm reads LITERAL kinds only: the member-access kinds above carry their own string
            // child, so a text scan over every subscribed kind would double-report `db["vector_distance_cos"]`.
            if (!path.startsWith(COSINE_SANCTIONED) && node.getText().includes(COSINE)) {
              ctx.report.node(node, { token: COSINE, offset: node.getText().indexOf(COSINE) });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/hub/x.ts": 'import { chatDigests } from "../../../../db/src/schema/embeddings.ts";\nexport const t = chatDigests;\n',
      },
      expect: { count: 1, token: "chatDigests" },
      why: "the founding shape — a vector-table symbol named outside the sanctioned set (inv 1), a NEW importer of the substrate",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/hub/namespace-write.ts":
          'import * as schema from "../../../../db/src/schema/embeddings.ts";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(schema.chatDigests);\n',
      },
      expect: { count: 2 },
      why: "a vector table reached through a NAMESPACE is both an unsanctioned import use and an unsanctioned write — property-access syntax hides neither chokepoint",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/hub/bracket-write.ts":
          'import * as schema from "../../../../db/src/schema/embeddings.ts";\nexport const w = (db: Record<string, (t: unknown) => void>): void => db["insert"](schema["chatDigests"]);\n',
      },
      expect: { count: 2 },
      why: 'the BRACKET spelling of the namespace-reached write is the SAME double bypass — before the shared reader `db["insert"](schema["chatDigests"])` produced ZERO findings (#1506)',
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/search/persistence/aliased-write.ts":
          'import { chatDigests as table } from "../../../../../db/src/schema/embeddings.ts";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(table);\n',
      },
      expect: { count: 1, token: "insert" },
      why: "a SANCTIONED READER cannot become a vector WRITER by aliasing the imported table name — write ownership follows the table's declaration, not the local binding's spelling",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/embeddings/persistence/reexport.ts": 'export { chatDigests } from "../../../../../db/src/schema/embeddings.ts";\n',
        "packages/server/src/domain/hub/via-reexport.ts":
          'import { chatDigests } from "../embeddings/persistence/reexport.ts";\nexport const t = chatDigests;\n',
      },
      expect: { count: 1, token: "chatDigests" },
      why: "A RE-EXPORT through a sanctioned home is NOT a laundry — the canonical declaration is still the schema's, so the unsanctioned importer is still one",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/hub/y.ts": 'export const q = "SELECT vector_distance_cos(a, b)";\n' },
      expect: { count: 1, token: COSINE },
      why: "`vector_distance_cos` in code outside search/persistence — top-k retrieval is search's alone (inv 2)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/hub/unreadable.ts": 'import { chatDigests } from "./missing.ts";\nexport const t = chatDigests;\n',
      },
      expect: { count: 1, token: "chatDigests" },
      why: "FAIL-CLOSED — a vector-table name whose door does not resolve is reported; a leak chokepoint an unreadable module can walk through is not one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/embeddings/persistence/store.ts":
          'import { chatDigests } from "../../../../../db/src/schema/embeddings.ts";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(chatDigests);\n',
      },
      why: "the embeddings owner importing AND writing the table — the ONE sanctioned writer, and the reason the write arm exists at all",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/embeddings/persistence/aliased-store.ts":
          'import { chatDigests as table } from "../../../../../db/src/schema/embeddings.ts";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(table);\n',
      },
      why: "the sanctioned writer stays sanctioned when the local binding is aliased — the seal is symmetric",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/lib/local-digests.ts": 'export const chatDigests = { label: "an in-RAM digest cache" };\n',
        "packages/server/src/domain/hub/foreign.ts": 'import { chatDigests } from "./lib/local-digests.ts";\nexport const t = chatDigests;\n',
      },
      why: "THE HOME COUNTERFACTUAL — a GENUINE export named `chatDigests` resolving cleanly to a declaration outside the schema. The legacy reader matched the name plus an `@orb/db` specifier regex; deleting the schema-home comparison turns this row red",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/search/persistence/cosine.ts": 'export const q = "SELECT vector_distance_cos(a, b)";\n' },
      why: "cosine INSIDE search/persistence is the sanctioned home — top-k retrieval is exactly what lives there",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/z.ts": "// vector_distance_cos is search's — cited in a comment\nexport const x = 1;\n",
        "packages/server/src/domain/hub/quiet.ts": "export const quiet = 1;\n",
      },
      why: "the cosine function named in a COMMENT is not code — only literal nodes are read, which is what makes this policy comment-SAFE",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/hub/waived.ts":
          '// @orb-waive vector-scope-derived(chatDigests): a one-off migration read of the digest table; ends when the backfill lands behind embeddings.store.\nimport { chatDigests } from "../../../../db/src/schema/embeddings.ts";\nexport const t = chatDigests;\n',
      },
      why: "the ONE central positioned waiver naming the exact reported token — the three arms are distinguished by token (the table name, the write method, the cosine function), which is what makes a per-arm waiver expressible",
    },
  ],
});
