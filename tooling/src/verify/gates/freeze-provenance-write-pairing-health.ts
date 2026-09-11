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
// BLINDNESS MODE B IS BLOCKED, NOT BROKEN, and it is blocked on a provider defect this conversion found.
// `drizzleSchemaFact` publishes its own CENSUS as the receipt's `members` (`lib/schema-fact.ts:378` sums
// tables + columns + foreign keys + indexes), which is the §12.3 anti-pattern in the #1953/#1955 class:
// a receipt states what the provider MEASURED (the denominator it walked), never what it FOUND, and
// emptiness belongs in the fact's own `status`/`unresolved` FIELDS, which consumers read and judge. Note
// the halves are not symmetric — an `unresolved` COUNT reporting syntax the provider could not read is
// correct and must not be "fixed" while `members` moves. The consequence here: a schema tree that declares
// NO table refuses at receipt and withholds this policy before `evaluate`, so the arm that would report
// "the guarded table is gone" cannot run on exactly that corpus. The guarantee still holds — it arrives as
// a LOUD exit-2 fact tool error instead of as a finding, which is the classification
// `drizzle-registry-conversion.test.ts` already made — and it becomes expressible as a finding the moment
// `schema-fact` moves to a measured denominator. Until then the arm below proves the case that CAN run: a
// schema tree with tables, but without this one.
//
// The REAL-TREE ANCHOR guards both arms off a mini fixture run, where every subject would falsely "prove"
// itself dead. It is also the anchor both findings report on, because neither has a node when it fires:
// a table that is not declared has no declaration to point at, and a tree with no writers has no write.

import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import { GUARDED_TABLE, TRIPLE, WRITE_POPULATION, writeChainVerdict } from "./freeze-provenance-write-pairing.ts";

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
            if ((verb === "update" || verb === "insert") && writeChainVerdict(node, ctx.relativePath) === "ours") {
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
        recordReadySchemaFact(ctx, fact);
        if (!ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === ANCHOR)) {
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
      expect: { count: 1, messageIncludes: "no longer declares `messageVariants` anywhere" },
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
  ],
});
