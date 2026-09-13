// Ledger D20 / Knowledge-Cluster.md invariants 1-2 — the no-cross-user-leak chokepoints on the vector
// substrate. Three arms, one reason: IMPORT (a vector-table symbol named outside the sanctioned domain
// set), WRITE (an insert/update/delete on a vector table outside domain/embeddings/persistence), COSINE
// (`vector_distance_cos` outside domain/search/persistence). Table identity is the DECLARATION HOME through
// the shared origin reader, so an alias, a namespace member and a bracket read are the same table while a
// same-named export elsewhere is not; the write method is read the same way. Limits live in mustPass.
//
// BOTH THE IMPORT AND THE WRITE ARM FAIL CLOSED, and until #2057 only the import arm did. The write arm
// read the sealed verdict RAW (`kind === "sealed"`) and was SILENT on `unreadable`, so an insert through a
// door nobody can read walked the chokepoint while this header already claimed the write method was "read
// the same way". The claim was right and the code was not: both arms now route through
// `sealedOriginReports`, and the write arm's unreadable answer carries its own disjoint text
// (`UNREADABLE_WRITE`) so the two verdicts are told apart by a `messageIncludes` row rather than by a count.
// The bare-identifier branch gained the NAME PREFILTER that fail-closure structurally requires
// (`lib/origin-verdict.ts`) — it had none, because before this it only ever acquitted.
//
// FAMILY `vector-scope-derived` — a declared SINGLETON. It is a THREE-ARM policy (import · write · cosine)
// over one substrate, and no sibling shares an arm; `lib/sealed-origin.ts` and `lib/reference-fact.ts` are
// shared readers, which guide §2 says is not a family.
//
// POPULATION PORT: byte-identical, legacy at `0d83d99f1^` (`scanRoot: (p) => SERVER_SRC.test(\`/\${p}\`)` —
// the `@server` root exactly). The sanctioned homes stay IN the population and are decided per arm, so a
// re-home reds at its new path instead of carrying its exemption silently; all FIVE `IMPORT_SANCTIONED`
// entries now carry a row each, which is what stops a future re-home deleting one silently.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { referenceNamesExport } from "../lib/origin-verdict.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin, sealedOriginReports } from "../lib/sealed-origin.ts";

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

/** THE FAIL-CLOSED THIRD ANSWER (#944) on the WRITE arm, a SEPARATE text rather than a `${MESSAGE} …`
 *  suffix: the unreadable arm reports the SAME single finding under the SAME token as the sealed verdict
 *  and differs ONLY in message, so a shared prefix would leave both arms unpinnable in either direction
 *  (guide §6.1). The two texts share no fragment — `MESSAGE` contains no "CANNOT be established". */
const UNREADABLE_WRITE =
  "an insert/update/delete is aimed at an argument SPELLED like one of the six vector tables whose declaration cannot be read, so whether this write lands on the vector substrate CANNOT be established. Reported rather than admitted by a broken door: a chokepoint an unreadable barrel can walk through is not one (D20; Knowledge-Cluster.md inv 1-2).";

const FIX =
  "go through the ONE search engine with a mandatory producer scope; writes are embeddings.store lens " +
  "arms, cosine is search/persistence's alone (D20). A deliberate site is waived with `@orb-waive " +
  "vector-scope-derived(<position>): <reason>` on the line above, where <position> is whichever arm fired: " +
  "the sealed table/call's own name at its occurrence, or the literal `vector_distance_cos`.";

/** Legacy `scanRoot` tested `/packages\\/server\\/src\\//` against a slash-prefixed repo path — the `@server`
 *  root exactly. The sanctioned homes stay IN the population and are decided per arm below, so a re-home
 *  reds at its new path instead of carrying its exemption silently. */
const SERVER_POPULATION = { in: ["@server"] } as const;

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

/** Does this bare reference NAME one of the six tables — through an import ALIAS or a const-alias hop as
 *  well as directly? THE MANDATORY COMPANION OF FAIL-CLOSURE (`lib/origin-verdict.ts`): the member/import
 *  spellings are prefiltered by `vectorCandidate`, and the bare-identifier spelling had no gate at all
 *  because it only ever ACQUITTED. Fail-closing it without one would turn every unreadable argument of
 *  every insert/update/delete in `@server` into an accusation. */
function namesVectorTable(node: MorphNode): boolean {
  return [...VECTOR_TABLE_HOME.exportedNames].some((name) => referenceNamesExport(node, name));
}

/** Is this write aimed at a vector table? The NAME is the candidate gate; the shared DECISION is the
 *  verdict. A proven seal and an UNREADABLE door both report — differing only in message — while a `foreign`
 *  origin and a reference that provably binds something else (a local object, a project interface's
 *  property) are not subjects.
 *
 *  THE WRITE ARM USED TO READ THE VERDICT RAW (`kind === "sealed"`) and was SILENT on `unreadable`, so a
 *  write through a door nobody can read walked the chokepoint while the header claimed the write method was
 *  "read the same way" as the import arm (#2057). That is a FOURTH polarity the guide's §4.6 table did not
 *  name: not accusing-with-verdict, not accusing-with-decision, not the acquitting shape — an ACCUSING arm
 *  whose predicate is an identity ACQUITTAL, which fails OPEN exactly where the import arm fails closed. */
function writeVerdict(anchor: MorphNode): "sealed" | "unreadable" | null {
  const verdict = readSealedOrigin(anchor, VECTOR_TABLE_HOME);
  if (!sealedOriginReports(verdict, anchor)) {
    return null;
  }
  return verdict.kind === "sealed" ? "sealed" : "unreadable";
}

function vectorTableWrite(argument: MorphNode): "sealed" | "unreadable" | null {
  const candidate = vectorCandidate(argument);
  if (candidate !== null) {
    return writeVerdict(candidate.anchor);
  }
  return Node.isIdentifier(argument) && namesVectorTable(argument) ? writeVerdict(argument) : null;
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
            // FAIL-CLOSED THROUGH THE SHARED DECISION: a vector-table NAME whose IMPORT DOOR cannot be
            // read is reported (the chokepoint must not be walkable through an unreadable barrel), while a
            // candidate that provably binds a non-module declaration is not a subject. `readSealedOrigin`
            // returns the VERDICT; `sealedOriginReports` is the decision.
            if (sealedOriginReports(readSealedOrigin(candidate.anchor, VECTOR_TABLE_HOME), candidate.anchor)) {
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
            const target = argument === undefined ? null : vectorTableWrite(argument);
            if (target !== null) {
              const nameNode = callee.value.nameNode;
              const details = { token: callee.value.name, offset: nameNode.getText().indexOf(callee.value.name) };
              ctx.report.node(nameNode, target === "unreadable" ? { ...details, message: UNREADABLE_WRITE } : details);
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
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/bracket-cosine.ts":
          'export const q = (db: Record<string, (a: unknown, b: unknown) => unknown>): unknown => db["vector_distance_cos"](1, 2);\n',
      },
      expect: { count: 1, token: COSINE },
      why: "the BRACKET-SPELLED cosine call flags EXACTLY ONCE, and that count is the receipt for `LITERAL_KINDS` (w9 :262, #2046) — the ElementAccessExpression carries the string literal as its own child, so the literal arm already reaches it. Adding the member-access kinds to the subscription makes the wrapper node report a SECOND finding at the same site, which the count-1 expectation reds: a double report is one occurrence the author cannot waive, because two findings sharing a carrier and a token make every marker over-broad",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/search/persistence/unreadable-write.ts":
          'import { chatDigests } from "./missing.ts";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(chatDigests);\n',
      },
      expect: { count: 1, token: "insert", messageIncludes: "CANNOT be established" },
      why: 'THE FAIL-CLOSED THIRD ANSWER (#944) ON THE WRITE ARM, and this row REPLACES one that asserted the opposite (#2057). Its predecessor was a mustPass whose `why` called the acquittal a DECLARED LIMIT — but the module header claims the write method is read the SAME WAY as the import arm, and the import arm fails CLOSED, so the limit was a fail-OPEN wearing a limit\'s clothes: a write through a door nobody can read walked the chokepoint. The file is a SANCTIONED IMPORTER, so the import arm abstains and the bare-identifier write branch is the only one speaking — which is what makes this a clean single-arm receipt. The `messageIncludes` is load-bearing: the unreadable arm emits the SAME one finding under the SAME `insert` token as the sealed verdict, so a bare `{ count: 1, token }` would pass identically whether the arm fired or was failed open, and `MESSAGE` contains no "CANNOT be established" fragment for it to match by accident',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/local-bag.ts": "const bag = { chatDigests: 1 };\nexport const n = bag.chatDigests;\n",
      },
      why: 'THE LOCAL-OBJECT COUNTERFACTUAL — a plain object whose KEY is spelled like the sealed export binds a property, not a module member, so it is NOT A SUBJECT. `readSealedOrigin` returns `unresolved` here and the shared decision function scopes that refusal (lib/sealed-origin.ts): reading the VERDICT as the DECISION (`kind !== "foreign"`) accuses this row on unmodified source (#2006)',
    },
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
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/chat/memory/persistence/digests.ts":
          'import { chatDigests } from "../../../../../../db/src/schema/embeddings.ts";\nexport const t = chatDigests;\n',
      },
      why: "SANCTIONED HOME 3 of 5 — chat/memory's own persistence does the digest BOOKKEEPING (which segments are indexed), so it names the table while delegating every vector read to the injected `searchDigests` op. Each `IMPORT_SANCTIONED` entry now owns a row: an unexercised list entry is a §5b.1 declaration the module does not use, and the one a future re-home deletes silently (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/discovery/persistence/near-duplicates.ts":
          'import { chatDigests } from "../../../../../db/src/schema/embeddings.ts";\nexport const t = chatDigests;\n',
      },
      why: "SANCTIONED HOME 4 of 5 — discovery/persistence reads the substrate for ANALYTICS (hubness, near-duplicates) on its own in-RAM cosine; that is why it may name the table and may not use `vector_distance_cos`, which the cosine arm still enforces here",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/foundation/observability/debug/vectors.ts":
          'import { chatDigests } from "../../../../../db/src/schema/embeddings.ts";\nexport const t = chatDigests;\n',
      },
      why: "SANCTIONED HOME 5 of 5 — the `/api/_debug` probes report on the substrate's health and are the one non-domain reader the seal admits",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/search/persistence/upsert.ts":
          'import { chatDigests } from "../../../../../db/src/schema/embeddings.ts";\nexport const w = (db: { upsert: (t: unknown) => void }): void => db.upsert(chatDigests);\n',
      },
      why: "DECLARED LIMIT, and the receipt for `WRITE_METHODS` — a sanctioned READER calling a method that is NOT one of the three Drizzle write verbs on the vector table. The write arm is scoped to `insert`/`update`/`delete` because those are the Drizzle client's mutation surface; widening it to any resolved method makes every method call on a vector table a write and reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts": 'export const chatDigests = { name: "chat_digests" };\n',
        "packages/server/src/domain/search/persistence/unreadable-other.ts":
          'import { chatSummaries } from "./missing.ts";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(chatSummaries);\n',
      },
      why: "THE MANDATORY COMPANION OF THE WRITE ARM'S FAIL-CLOSURE (#2057) — an insert through an equally unreadable door whose argument is NOT spelled like any of the six tables. `lib/origin-verdict.ts` states the rule and the live measurement behind it: fail-closed reporting is correct for a CANDIDATE whose identity cannot be read, and applied to every node of a kind it converts each unreadable node into an accusation. The bare-identifier branch had no gate at all because it only ever ACQUITTED; closing it without `referenceNamesExport` makes every unreadable write argument in `@server` a finding, and dropping the prefilter reds this row",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/search/persistence/local-table.ts":
          "const chatDigests = { rows: [] as readonly unknown[] };\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(chatDigests);\n",
      },
      why: 'THE REFUSAL SCOPING on the write arm (#2057) — a LOCAL const SPELLED exactly like a sealed table, so it clears the name prefilter and is still NOT A SUBJECT: it provably binds a local declaration rather than an unreadable module door. This is the write-arm twin of the `local-bag.ts` row the import arm carries, and the reason the fail-closure goes through `sealedOriginReports` rather than through `verdict.kind !== "foreign"` — relaxing the decision to the raw verdict reds this row',
    },
  ],
});
