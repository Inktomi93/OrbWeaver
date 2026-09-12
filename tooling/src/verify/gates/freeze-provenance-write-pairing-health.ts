// Policy: freeze-provenance-write-pairing-health — the BLINDNESS tripwires for its ordinary sibling, split
// off because they differ in BOTH axes the contract separates: they are HARD (a tripwire a `@orb-waive`
// marker could silence is not a tripwire — legacy already reported them through the unwaivable Finding
// overload) and they are `entire-population` (both verdicts are whole-tree questions: "does the live table
// still declare the guarded columns" and "did the writers disappear", neither of which composes over a
// narrowed subset). Family `freeze-provenance`, shared with the occurrence policy, whose exported
// `guardedTableVerdict`/`writeChainVerdict` this module reuses so both judge exactly one writer set.
//
// The guarded column names are DERIVED from the live table rather than trusted: a rename that moves a
// column out from under the invariant must RED, never quietly narrow what the sibling guards. That
// derivation is now `drizzleSchemaFact` — identity through the canonical `sqliteTable` door instead of the
// legacy `getVariableDeclaration("messageVariants")` + descendant PropertyAssignment sweep over one hard-
// coded file path.
//
// PORT CORRECTION: legacy had two distinct derivation verdicts — "packages/db/src/schema/chat.ts is
// gone/moved" and "`messageVariants` is not declared in it" — because it read ONE hand-named file. The
// shared fact owns the whole schema tree, so the honest question is no longer about a path: it is whether
// the tree still declares the table at all, wherever it lives. The two messages merge into one, and MOVING
// the declaration to a sibling schema file is now correctly a non-event instead of a false alarm. Both
// legacy rows are carried against the merged verdict.
//
// BLINDNESS MODE B IS LIVE as of 2026-09-11 (#1962) — it was recorded here as BLOCKED, NOT BROKEN, on a
// provider defect this conversion found, and the provider is fixed. `drizzleSchemaFact` used to publish its
// own CENSUS as the receipt's `members` (a sum of tables + columns + foreign keys + indexes), which is the
// §12.3 anti-pattern in the #1953/#1955 class: a receipt states what the provider MEASURED (the denominator
// it walked), never what it FOUND, and emptiness belongs in the fact's own `status`/`unresolved` FIELDS,
// which consumers read and judge. The consequence HERE was that a schema tree declaring NO table refused at
// receipt and withheld this policy before `evaluate`, so the arm that reports "the guarded table is gone"
// could not run on exactly that corpus — the guarantee arrived as a LOUD exit-2 fact tool error instead of
// as a finding. `lib/schema-fact.ts` now receipts the authored sources it walked, `evaluate` judges the
// fact's `empty` status itself, and mode B is the third `mustFlag` row below. Note the halves are not
// symmetric — an `unresolved` COUNT reporting syntax the provider could not read is correct and was NOT
// moved: `unresolved`/`missing` still route into `recordReadySchemaFact`'s fail-closed throw here, because
// those mean the reader could not look, which is not a verdict this policy may soften into a finding.
//
// The REAL-TREE ANCHOR guards both arms off a mini fixture run, where every subject would falsely "prove"
// itself dead. It is also the anchor both findings report on, because neither has a node when it fires:
// a table that is not declared has no declaration to point at, and a tree with no writers has no write.

import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { GUARDED_TABLE, TRIPLE, WRITE_POPULATION, writeChainVerdict } from "../lib/freeze-provenance.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

/** Present on every real run, inside the policy's own population, needed by no example that is not
 *  deliberately arming these arms. */
const ANCHOR = "packages/db/src/schema/index.ts";

const MESSAGE =
  "the freeze-provenance write-pairing invariant has gone BLIND: either the `messageVariants` table no " +
  "longer declares the D129-F triple it guards, or not one `message_variants` insert/update survives in " +
  "packages/*/src. Both make freeze-provenance-write-pairing report a clean tree forever — retarget it in " +
  "tooling/src/verify/gates/freeze-provenance-write-pairing.ts.";

export const gate = defineGate({
  id: "freeze-provenance-write-pairing-health",
  family: "freeze-provenance",
  authority: "hard",
  severity: "error",
  population: WRITE_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  create: (ctx) => {
    /** `db.update(<ours>)` / `db.insert(<ours>)` builders reached anywhere in the population. The legacy
     *  counter incremented on each reached WRITE METHOD; counting the builders instead is what the message
     *  has always claimed to count ("not one insert/update was found") and costs one chain read per call. */
    let writeSites = 0;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            const callee = Node.isCallExpression(node) ? node.getExpression() : undefined;
            if (callee === undefined || !Node.isPropertyAccessExpression(callee)) {
              return;
            }
            const verb = callee.getName();
            if ((verb === "update" || verb === "insert") && writeChainVerdict(node) === "ours") {
              writeSites += 1;
            }
          },
        },
      ],
      evaluate: (): void => {
        // The declared fact is consumed UNCONDITIONALLY: a policy that returns before reading one it
        // declared is a contract refusal ("declared facts were not consumed"), and the self-guard below is
        // about whether a VERDICT is honest here, not about whether the schema was read.
        const fact = ctx.fact(drizzleSchemaFact).schema();
        const onRealTree = ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === ANCHOR);
        // BLINDNESS MODE B — a schema population that declares NO Drizzle table at all. It is the same
        // verdict as derivation loss (the guarded table cannot be derived), it just arrives through the
        // fact's `empty` status instead of through a census miss, so it is reported here rather than routed
        // into `recordReadySchemaFact`'s fail-closed throw. `empty` is the fact's own modelled value, not a
        // broken reader: `unresolved`/`missing` still throw below, because those mean the reader could not
        // look. Expressible only since `drizzleSchemaFact` receipted its MEASURED denominator (#1962) —
        // until then the provider refused first and withheld this policy before `evaluate`.
        if (fact.status === "empty") {
          ctx.receipt({ kind: "population", source: "freeze-provenance-write-pairing-health", members: 1 });
          if (onRealTree) {
            ctx.report.file(ANCHOR, {
              line: 1,
              message: `BLIND: the Drizzle schema no longer declares \`${GUARDED_TABLE}\` anywhere — its population declares no table at all — so the guarded columns cannot be derived — ${MESSAGE}`,
            });
          }
          return;
        }
        recordReadySchemaFact(ctx, fact);
        if (!onRealTree) {
          return; // not the real tree — a blindness claim here would judge a synthetic fileset
        }
        const table = fact.value.tables.find((candidate) => candidate.identity.declarationName === GUARDED_TABLE);
        if (table === undefined) {
          ctx.report.file(ANCHOR, {
            line: 1,
            message: `BLIND: the Drizzle schema no longer declares \`${GUARDED_TABLE}\` anywhere, so the guarded columns cannot be derived — ${MESSAGE}`,
          });
          return;
        }
        const declared = new Set(table.columns.map((column) => column.identity.propertyName));
        const missing = TRIPLE.filter((column) => !declared.has(column));
        if (missing.length > 0) {
          ctx.report.node(table.declaration, {
            token: GUARDED_TABLE,
            offset: 0,
            message: `BLIND: \`${GUARDED_TABLE}\` no longer declares ${missing.join(", ")} — the guarded shape changed under the gate. ${MESSAGE}`,
          });
          return;
        }
        if (writeSites === 0) {
          ctx.report.file(ANCHOR, {
            line: 1,
            message: `BLIND: not one \`${GUARDED_TABLE}\` insert/update was found in packages/*/src — the writers moved or the table symbol was renamed. ${MESSAGE}`,
          });
        }
      },
    };
  },

  mustFlag: [
    {
      mode: "types",
      files: {
        [ANCHOR]: 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id") });\n',
      },
      expect: { count: 1, messageIncludes: "anywhere, so the guarded columns cannot be derived" },
      why: "BLINDNESS by DERIVATION LOSS: the real-tree anchor is loaded and the schema tree still declares tables, but the guarded one is gone — the gate must announce it, never go silently green. (Legacy split this into a `chat.ts is gone/moved` row and a `not declared in chat.ts` row because it read one hand-named path; the shared fact owns the whole tree, so the two merge and a MOVE is correctly no longer an alarm.)",
    },
    {
      mode: "types",
      files: {
        [ANCHOR]:
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const messageVariants = sqliteTable("message_variants", { content: text("content"), rawContent: text("raw_content") });\n',
      },
      expect: { count: 1, token: "messageVariants", messageIncludes: "no longer declares macroFreezes" },
      why: "BLINDNESS by RENAME: the columns are DERIVED from the live table declaration, so dropping or renaming one reds instead of quietly narrowing what the sibling guards — and this finding has a node, so it anchors on the declaration rather than on the anchor file",
    },
    {
      mode: "types",
      files: {
        [ANCHOR]:
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const messageVariants = sqliteTable("message_variants", { content: text("content"), rawContent: text("raw_content"), macroFreezes: text("macro_freezes") });\n',
      },
      expect: { count: 1, messageIncludes: "not one `messageVariants` insert/update was found" },
      why: "BLINDNESS by SUBJECT LOSS: schema intact, but not a single write site in the tree — the writers moved or the table symbol was renamed, and a zero-finding pass on the sibling would otherwise read as health",
    },
    {
      mode: "types",
      files: { [ANCHOR]: "export const schemaHomeIsGone = true;\n" },
      expect: { count: 1, messageIncludes: "its population declares no table at all" },
      why: "BLINDNESS MODE B: the schema population is loaded but declares no Drizzle table at all — the guarded home was emptied or moved out from under the schema population, and the guarded columns cannot be derived from anything. This row is the one the header recorded as BLOCKED until 2026-09-11: the provider receipted its CENSUS, so this exact corpus refused at the fact receipt and withheld the policy before `evaluate` (#1962). It dies if `lib/schema-fact.ts` goes back to receipting what it FOUND",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ANCHOR]:
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const messageVariants = sqliteTable("message_variants", { content: text("content"), rawContent: text("raw_content"), macroFreezes: text("macro_freezes") });\n',
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "../../../../../db/src/schema/index.ts";\n' +
          "export function editContent(db: D, id: string, content: string) {\n" +
          "  return db.update(messageVariants).set({ content, rawContent: null, macroFreezes: null });\n" +
          "}\n",
      },
      why: "THE HEALTHY TREE: the triple is declared and one writer reaches it through the shared chain reader, so both arms stay quiet. This row also proves the write-site counter counts a REAL builder rather than a text match — the import resolves to the planted schema home, which is what `guardedTableVerdict` requires",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id") });\n',
      },
      why: "THE ANCHOR SELF-GUARD, and the row that dies without it: the anchor file is not loaded (a plain fixture run), so the tripwire declares nothing dead. Delete the anchor check and this fixture — whose schema declares no `messageVariants` at all — flags the derivation-loss arm",
    },
    {
      mode: "types",
      files: { "packages/db/src/schema/chat.ts": "export const schemaHomeIsGone = true;\n" },
      why: "THE ANCHOR SELF-GUARD FOR MODE B, the twin of the row above: same empty schema population as mode B's `mustFlag`, but off the real-tree anchor, so the new `empty` arm must stay silent rather than declare the whole schema dead from a synthetic fileset. It also proves `empty` is DELIVERED rather than refused — a withheld policy would fail this row as a tool error, which is exactly what it did before #1962",
    },
  ],
});
