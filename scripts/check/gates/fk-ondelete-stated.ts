// Gate: fk-ondelete-stated — every `.references(...)` states its `onDelete` action, explicitly.
//
// SQLite's DEFAULT is `ON DELETE NO ACTION`: the parent delete simply FAILS with a constraint error at
// commit time. That is a legitimate policy (`restrict` says it deliberately) but it is never a legitimate
// DEFAULT — an author who omits the option has not chosen "refuse the delete", they have chosen nothing,
// and the choice surfaces months later as a user-facing "cannot delete" on a row nobody meant to pin.
// Every deletion policy in this schema is load-bearing and documented at the column (D18 membership
// cascade · D26 the pure-slot attribution SET NULLs · D27 the fork self-FK SET NULL · the RESTRICT probes
// on `plugins.bundleAssetId` / `rpg_checkpoints.snapshotId`), so the option is the DECISION and this gate
// makes omitting it unrepresentable.
//
// PURE PREVENTION. All 126 referencing columns across the 76 tables already state `onDelete` — this gate
// was minted at zero violations, on purpose: it is the cheap AST rule that keeps the 127th honest. There
// is no allowlist and no baseline; a genuinely-wanted NO ACTION is spelled `{ onDelete: "no action" }`,
// which passes here and reads as the decision it is.
//
// SCOPE: `packages/db/src/schema/**` — the only home of `sqliteTable`/`.references()` in the repo
// (`db-structure` enforces that layout).
//
// DECLARED LIMIT (same shape-reader as `fk-columns-indexed`): the check keys on the literal
// `.references(<fn>, <object>)` call. A reference whose options object is a spread of a shared const
// (`{ ...CASCADE }`) would read as stating nothing and RED — deliberately fail-CLOSED: the author names
// the action at the column, where the reader of the column looks for it.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { isSchemaFile } from "../schema-read.ts";

const REFERENCES = "references";
const ON_DELETE = "onDelete";

const MESSAGE =
  "a `.references(...)` with no `onDelete` action — SQLite's silent default is `NO ACTION` (the parent " +
  "delete fails at commit), which is a real policy but never a defaulted one. State the deletion policy " +
  "at the column: it is the decision, and the column comment is where the next reader looks for it. " +
  "Tier-1-DB.md §Invariants.";

const FIX =
  'pass the options object: `.references(() => parent.id, { onDelete: "cascade" | "set null" | "restrict" ' +
  '| "no action" })`. Pick by what the row MEANS without its parent — subordinate data `cascade` ' +
  "(memberships, junctions, variants), a nullable pointer whose row outlives the parent `set null` " +
  "(avatars, anchors, attribution), a parent that must not vanish under a live dependent `restrict` " +
  "(an installed plugin's bundle). DDL changed ⇒ regenerate the baseline (see `structure:db-baseline`).";

/** The `.references(` call's options object, if it literally states `onDelete`. */
function statesOnDelete(call: Node): boolean {
  if (!call.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const options = call.getArguments()[1];
  if (options?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
    return false;
  }
  return options.getProperty(ON_DELETE) !== undefined;
}

function checkFile(sf: SourceFile, ctx: GateRunCtx): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === REFERENCES)) {
      continue;
    }
    if (!statesOnDelete(call)) {
      // Anchored on the `references` name node, so the caret lands on the call, not the whole column chain.
      ctx.report(callee.getNameNode());
    }
  }
}

export const gate: GateDescriptor = {
  name: "fk-ondelete-stated",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Tier-1-DB.md §Invariants",
  status: "active",
  scopeSafety: "incremental-safe", // per-file: the reference and its options are one expression
  message: MESSAGE,
  fix: FIX,
  scanRoot: isSchemaFile,
  visitFile: checkFile,

  mustFlag: [
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const messages = sqliteTable("messages", {\n' +
        '  id: text("id").primaryKey(),\n' +
        '  chatId: text("chat_id").references(() => chats.id),\n' +
        "});\n",
      expect: { count: 1, messageIncludes: "no `onDelete` action" },
      why: "the whole rule — an FK declared with no deletion policy silently becomes NO ACTION",
    },
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const messages = sqliteTable("messages", {\n' +
        '  id: text("id").primaryKey(),\n' +
        '  chatId: text("chat_id").references(() => chats.id, {}),\n' +
        "});\n",
      expect: { count: 1 },
      why: "an options object that carries no `onDelete` — the arm an `args.length === 2` check would miss",
    },
  ],
  mustPass: [
    {
      at: "packages/db/src/schema/chat.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const messages = sqliteTable("messages", {\n' +
        '  id: text("id").primaryKey(),\n' +
        '  chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),\n' +
        '  personaId: text("persona_id").references(() => personas.id, { onDelete: "set null" }),\n' +
        "});\n",
      why: "the tree's actual shape — every reference states its action (all 126 referencing columns did on the day this gate landed)",
    },
    {
      at: "packages/db/src/schema/plugin.ts",
      files:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const plugins = sqliteTable("plugins", {\n' +
        '  id: text("id").primaryKey(),\n' +
        '  bundleAssetId: text("bundle_asset_id").references(() => assets.id, { onDelete: "restrict", onUpdate: "cascade" }),\n' +
        "});\n",
      why: "`restrict` plus a sibling `onUpdate` — the gate demands the DELETE decision and is indifferent to the rest of the options",
    },
  ],
};
