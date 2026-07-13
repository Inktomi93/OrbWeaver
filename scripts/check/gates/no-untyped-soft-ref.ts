// Gate: no-untyped-soft-ref (D24 typed per-type FK tables + D37 the audit_logs actor→real-FK fix). A
// schema column whose JS key ends in `Id` (an entity reference) MUST carry a `.references()` FK —
// "boundaries are physics, FK-enforced" (D24). A soft ref (a `text`/`integer` id column with NO FK, kept
// coherent by a hand-rolled sweep) is banned; the ONE sanctioned exception is `audit_logs.entityId` (an
// append-only log that must OUTLIVE an arbitrary referent of unknown type — D24), plus `users.externalId`
// (an EXTERNAL IdP subject string, not an orbweaver-table reference at all). A new unlisted `*Id` column
// without a `.references()` at landing either gets its FK or a justified allowlist row with a D-cite.
//
// The allowlist is a two-direction ratchet: a stale entry (a listed pair that GAINS a `.references()` or
// vanishes) is RED too, so the exception list can't rot.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const SCHEMA_DIR = /\/packages\/db\/src\/schema\//u;
const TABLE_FN = "sqliteTable";
const ID_KEY = /Id$/u;
const COLUMN_ROOTS = new Set(["text", "integer"]);

/** `table.column` (JS key) pairs sanctioned to be an id-shaped column with NO FK, each with its cite. */
export const SOFT_REF_ALLOWLIST: Readonly<Record<string, string>> = {
  // The append-only audit log must outlive an arbitrary referent of unknown type — the ONE D24 soft ref.
  "audit_logs.entityId": "D24 the sole sanctioned soft-ref (append-only log, polymorphic referent)",
  // An external IdP subject identifier (the SSO `sub`), not a reference to any orbweaver table.
  "users.externalId": "external IdP subject string, not an orbweaver-table FK",
  // The Claude Agent SDK's OWN resume handle (the prompt-cache lineage id the SDK returns) — an
  // EXTERNAL identifier, not a reference to any orbweaver table (D8/D25).
  "session_entries.sdkSessionId": "external agent-sdk resume handle, not an orbweaver-table FK",
};

const SOFT_MESSAGE = (pair: string): string =>
  `column \`${pair}\` is an id-shaped column with NO \`.references()\` FK — a soft ref is banned ` +
  "(boundaries are physics, FK-enforced: D24). Add the FK, or if it is legitimately non-relational add a " +
  "justified allowlist row (scripts/check/gates/no-untyped-soft-ref.ts) with a D-cite. See " +
  "Core-Path-Registry.md D24.";
const STALE_MESSAGE = (pair: string): string =>
  `SOFT_REF_ALLOWLIST names "${pair}" but that column now has a \`.references()\` FK (or no longer ` +
  "exists) — delete the stale entry (scripts/check/gates/no-untyped-soft-ref.ts). See D24.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** The root callee identifier of a `text("x").a().b()` builder chain (`text`/`integer`/…). Walks the
 *  call/property-access spine down to its leading identifier. */
function chainRoot(expr: Node): string {
  let current = expr;
  while (
    current.isKind(SyntaxKind.CallExpression) ||
    current.isKind(SyntaxKind.PropertyAccessExpression)
  ) {
    current = current.getExpression();
  }
  return current.isKind(SyntaxKind.Identifier) ? current.getText() : "";
}

type IdColumn = { pair: string; line: number; hasRef: boolean };

/** Every id-shaped column (key ends `Id`, rooted at text/integer, no `.primaryKey()`) in one table. */
function idColumns(colsObj: Node, tableSqlName: string): IdColumn[] {
  if (!colsObj.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return [];
  }
  const out: IdColumn[] = [];
  for (const prop of colsObj.getProperties()) {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
      continue;
    }
    if (!ID_KEY.test(prop.getName())) {
      continue;
    }
    const init = prop.getInitializerOrThrow();
    if (!COLUMN_ROOTS.has(chainRoot(init))) {
      continue;
    }
    const chain = init.getText();
    if (chain.includes(".primaryKey(")) {
      continue;
    }
    out.push({
      pair: `${tableSqlName}.${prop.getName()}`,
      line: prop.getStartLineNumber(),
      hasRef: chain.includes(".references("),
    });
  }
  return out;
}

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 (c) — collect-then-judge ratchet) ────────────────────────
// STAMP arm (per-node): a `sqliteTable(...)` with an id-shaped column (`*Id`, text/integer, no FK) not on
// the SOFT_REF_ALLOWLIST → per-site finding at visit. STALE arm (whole-tree): a listed pair whose column
// gained a FK or vanished → finalize. The stale arm is name-keyed (table.column pairs) against the LIVE
// allowlist, so a synthetic tree misfires unless guarded — on (a) project scope and (b) the schema BARREL
// being LOADED (the batch-6 sentinel-file pattern). The barrel is loaded on every real run, so the ratchet
// is preserved. Per-occurrence.
const SOFT_REF_SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const seenSoftPairs = new Set<string>();

export const gate: GateDescriptor = {
  name: "no-untyped-soft-ref",
  docRow: "Core-Path-Registry.md D24 (D37)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "an id-shaped column (JS key ends `Id`) carries NO `.references()` FK — a soft ref is banned (boundaries are physics, FK-enforced: D24). Add the FK, or if it is legitimately non-relational add a justified allowlist row in scripts/check/gates/no-untyped-soft-ref.ts with a D-cite. See Core-Path-Registry.md D24.",
  fix: "add the `.references(() => target.id)` FK, or add a D-cited row to SOFT_REF_ALLOWLIST if the column is legitimately non-relational.",
  scanRoot: (p) => SCHEMA_DIR.test(`/${p}`),
  kinds: [SyntaxKind.CallExpression],
  begin: () => {
    seenSoftPairs.clear();
  },
  visit: (node, sf, ctx) => {
    if (!node.isKind(SyntaxKind.CallExpression)) {
      return;
    }
    const callee = node.getExpression();
    if (!(callee.isKind(SyntaxKind.Identifier) && callee.getText() === TABLE_FN)) {
      return;
    }
    const [nameArg, colsArg] = node.getArguments();
    if (
      nameArg === undefined ||
      !nameArg.isKind(SyntaxKind.StringLiteral) ||
      colsArg === undefined
    ) {
      return;
    }
    const rel = relPath(ctx.root, sf.getFilePath());
    for (const col of idColumns(colsArg, nameArg.getLiteralText())) {
      if (col.hasRef) {
        continue;
      }
      seenSoftPairs.add(col.pair);
      if (!(col.pair in SOFT_REF_ALLOWLIST)) {
        ctx.report({
          file: rel,
          line: col.line,
          column: 0,
          message: SOFT_MESSAGE(col.pair),
          token: `soft-ref ${col.pair}`,
        });
      }
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, SOFT_REF_SCHEMA_BARREL)) {
      return; // not the real full schema tree — the name-keyed stale arm would misfire (§4.4)
    }
    for (const pair of Object.keys(SOFT_REF_ALLOWLIST)) {
      if (!seenSoftPairs.has(pair)) {
        ctx.report({
          file: "packages/db/src/schema",
          line: 0,
          column: 0,
          message: STALE_MESSAGE(pair),
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'export const t = sqliteTable("t", { widgetId: text("widget_id") });\n',
      at: "packages/db/src/schema/x.ts",
      expect: { messageIncludes: "soft ref is banned" },
      why: "a `*Id` text column with no .references() FK, not on the allowlist — a banned soft ref (D24)",
    },
  ],
  // NOTE: the SOFT_REF_ALLOWLIST stale/ratchet arm (a listed pair that gains an FK or vanishes) is
  // `fileLoaded`-guarded to the real schema barrel — its coverage moves to the live `pnpm check:structure`
  // run. Only the pure FLAG/PASS branches port as examples below.
  mustPass: [
    {
      files:
        'export const t = sqliteTable("t", { widgetId: text("widget_id").references(() => w.id) });\n',
      at: "packages/db/src/schema/y.ts",
      why: "the `*Id` column carries a .references() FK — a typed ref, passes",
    },
    {
      // an allowlisted no-FK id column (audit_logs.entityId — the sole D24 soft ref) passes.
      files: 'export const t = sqliteTable("audit_logs", { entityId: text("entity_id") });\n',
      at: "packages/db/src/schema/audit.ts",
      why: "an allowlisted no-FK id column (audit_logs.entityId, the sole D24 soft ref) passes",
    },
    {
      // a primary-key id + a non-id column are not soft refs.
      files:
        'export const t = sqliteTable("t", { id: text("id").primaryKey(), name: text("name") });\n',
      at: "packages/db/src/schema/z.ts",
      why: "a primary-key id and a non-id column are not id-shaped soft refs — passes",
    },
  ],
};
