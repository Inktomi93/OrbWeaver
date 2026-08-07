// Gate: freeze-provenance-write-pairing — a `message_variants` write that touches the D129-F provenance triple
// must write ALL of it. An UPDATE that replaces `content` and leaves `rawContent`/`macroFreezes` attached claims
// a provenance for bytes that no longer exist (the 2026-08-07 editMessage finding); half a pair is unreplayable.
// ARMS: UPDATE-TRIPLE · INSERT-PAIR · UNREADABLE-OBJECT (fail-closed) · BLINDNESS (schema gone/renamed · 0 sites).
// LIMITS (each owes a mustPass row): packages/*/src only — a test seeding a row is a fixture, not a writer; and
// value resolution is ONE-MODULE — an object assembled across files is refused, never assumed.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue, unwrapExpression } from "../ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** The drizzle table symbol every write goes through. Keyed BY NAME, so §4.6's blindness tripwire below is
 *  mandatory: a rename must RED, never turn this gate into a no-op that reports ✓ forever. */
const TABLE = "messageVariants";
const CONTENT = "content";
const RAW = "rawContent";
const FREEZES = "macroFreezes";
/** The three columns that describe ONE body. Written together or not at all. */
const TRIPLE: readonly string[] = [CONTENT, RAW, FREEZES];
/** The column-name derivation's home — read on the real tree so a renamed/dropped column reds (§3, §4.6). */
const SCHEMA_HOME = "packages/db/src/schema/chat.ts";
/** Real-tree anchor for the blindness arms: present on every real run, never planted by an example except the
 *  ones that PROVE blindness. `ctx.scope.kind === "project"` is TRUE in conformance mini-projects too (§4.5). */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const GATE_SELF = "scripts/check/gates/freeze-provenance-write-pairing.ts";
/** Resolution depth cap. canon-write's deepest real chain is `.values(variantColumns(…))` → the returned
 *  object literal → `...freezeProvenanceColumns(…)` → its returned object literal = 4. */
const MAX_DEPTH = 6;

const MESSAGE =
  "a `message_variants` write that touches the D129-F freeze-provenance triple (`content`/`rawContent`/" +
  "`macroFreezes`) must write ALL of it. An UPDATE that replaces `content` while leaving the pair attached " +
  "serves a host a record describing bytes that are gone (the editMessage finding, 2026-08-07: an edit that " +
  "typed the raw text back in left `raw_content` non-null AND equal to `content`, the one shape the storage " +
  "rule forbids); an INSERT carrying half the pair is provenance nothing can replay. A write object this gate " +
  "cannot READ is refused rather than assumed — build it in the same module. The rule + why the reverse " +
  "reading is not claimed: packages/server/src/domain/chat/persistence/canon-write.ts.";

const FIX =
  "spread `CLEARED_FREEZE_PROVENANCE` into the `.set()` (a non-freeze content write drops the replaced body's " +
  "provenance) or `freezeProvenanceColumns(content, raw, freezes)` (the freeze itself) — both in " +
  "packages/server/src/domain/chat/persistence/canon-write.ts. An INSERT may omit BOTH columns (DB NULL is " +
  "honest absence); it may never carry one without the other.";

/** No local allowlist ON PURPOSE: the only sanctioned key would be a repo-relative PATH, and that exempts the
 *  whole one-home writer file — coarser than the defect. The escape hatch is the shared node-anchored
 *  `@orb-gate-ignore freeze-provenance-write-pairing: <reason>` marker, whose bare/stale/over-exempting arms
 *  `gate-ignore-inventory` already owns (§4.3/§4.4). Findings are therefore reported through the NODE overload
 *  so that marker is honoured (§1 — the Finding overload would silently defeat it). No `token` is emitted: at
 *  most ONE finding exists per write call, and biome puts one statement per line, so two guarded things cannot
 *  share a line and §4.3a's position requirement does not attach. */
type WriteKind = "update" | "insert";

/** How many `messageVariants` write calls the scan saw — the §4.6 blindness counter. A tree with ZERO is a
 *  renamed table / moved writers, not a clean tree. */
let writeSites = 0;

/** The single same-file declaration named `name`, or undefined when there is none — or MORE THAN ONE, which is
 *  a shadowed name this reader must not guess at (fail closed, the caller marks the object unreadable). */
function localValue(sf: SourceFile, name: string): Node | undefined {
  const vars = sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration).filter((d) => d.getName() === name);
  const fns = sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).filter((f) => f.getName() === name);
  if (vars.length + fns.length !== 1) {
    return;
  }
  return vars[0]?.getInitializer() ?? fns[0];
}

function isFunctionish(node: Node): boolean {
  return Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node);
}

/** Every expression this function RETURNS (its own returns only — a nested closure's are not this one's). A
 *  concise arrow's body is its single return. */
function returnedExpressions(fn: Node): readonly Node[] {
  if (Node.isArrowFunction(fn) && !Node.isBlock(fn.getBody())) {
    return [fn.getBody()];
  }
  if (!isFunctionish(fn)) {
    return [];
  }
  const out: Node[] = [];
  for (const ret of fn.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
    const expr = ret.getExpression();
    if (expr !== undefined && ret.getFirstAncestor(isFunctionish) === fn) {
      out.push(expr);
    }
  }
  return out;
}

/** The accumulated verdict for one write object: which column names it sets, and whether every part of it was
 *  READABLE. `readable: false` is fail-closed — an object whose keys cannot be derived is refused. */
type Acc = { readonly names: Set<string>; readable: boolean };

/** The authored key of one property — through a string-literal name (`"content": x`). */
function propertyKey(prop: Node): string | undefined {
  if (Node.isShorthandPropertyAssignment(prop)) {
    return prop.getName();
  }
  if (!Node.isPropertyAssignment(prop)) {
    return;
  }
  const nameNode = prop.getNameNode();
  if (Node.isComputedPropertyName(nameNode)) {
    return; // a computed column name is unreadable, not absent
  }
  return readStringValue(nameNode) ?? nameNode.getText();
}

/** One resolution step's context: the module we may resolve names in, how deep we already are, and the names
 *  already being resolved (the cycle guard). Carried as ONE param so the folders stay inside the 4-arg cap. */
type Res = { readonly sf: SourceFile; readonly depth: number; readonly seen: ReadonlySet<string> };

/** The next step down, optionally entering `name` (which then cannot be re-entered). */
function deeper(res: Res, name?: string): Res {
  return { sf: res.sf, depth: res.depth + 1, seen: name === undefined ? res.seen : new Set([...res.seen, name]) };
}

function objectInto(acc: Acc, obj: ObjectLiteralExpression, res: Res): void {
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      mergeInto(acc, prop.getExpression(), deeper(res));
      continue;
    }
    const key = propertyKey(prop);
    if (key === undefined) {
      acc.readable = false;
      continue;
    }
    acc.names.add(key);
  }
}

/** `...NAME` / a bare identifier value — resolved one hop through its same-module declaration. */
function identifierInto(acc: Acc, ident: Node, res: Res): void {
  const name = ident.getText();
  const value = res.seen.has(name) ? undefined : localValue(res.sf, name);
  if (value === undefined) {
    acc.readable = false;
    return;
  }
  mergeInto(acc, value, deeper(res, name));
}

/** `...f(…)` / `.values(f(…))` — the union of every object literal `f` returns (a conditional writer "may
 *  write" each key, which is the conservative read for a pairing rule). */
function callInto(acc: Acc, call: Node, res: Res): void {
  const callee = Node.isCallExpression(call) ? unwrapExpression(call.getExpression()) : call;
  const name = Node.isIdentifier(callee) ? callee.getText() : undefined;
  const fn = name === undefined || res.seen.has(name) ? undefined : localValue(res.sf, name);
  const returns = fn === undefined ? [] : returnedExpressions(fn);
  if (returns.length === 0 || name === undefined) {
    acc.readable = false;
    return;
  }
  const next = deeper(res, name);
  for (const ret of returns) {
    mergeInto(acc, ret, next);
  }
}

/** Fold one expression's column keys into `acc`, seeing THROUGH `as`/`satisfies`/parens (§5's literal-shape
 *  blindness class), object/array/ternary composition, and one-module identifier + call resolution. */
function mergeInto(acc: Acc, node: Node, res: Res): void {
  if (res.depth > MAX_DEPTH) {
    acc.readable = false;
    return;
  }
  const n = unwrapExpression(node);
  if (Node.isObjectLiteralExpression(n)) {
    objectInto(acc, n, res);
    return;
  }
  if (Node.isArrayLiteralExpression(n)) {
    for (const el of n.getElements()) {
      mergeInto(acc, el, deeper(res));
    }
    return;
  }
  if (Node.isConditionalExpression(n)) {
    mergeInto(acc, n.getWhenTrue(), deeper(res));
    mergeInto(acc, n.getWhenFalse(), deeper(res));
    return;
  }
  if (Node.isIdentifier(n)) {
    identifierInto(acc, n, res);
    return;
  }
  if (Node.isCallExpression(n)) {
    callInto(acc, n, res);
    return;
  }
  acc.readable = false;
}

/** Is `receiver` a drizzle builder for OUR table — `db.update(messageVariants)` / `db.insert(messageVariants)`,
 *  including through an intermediate `const q = …` binding, so hoisting the builder out is not an escape. */
function tableWriteKind(receiver: Node, sf: SourceFile, depth: number): WriteKind | undefined {
  if (depth > MAX_DEPTH) {
    return;
  }
  const n = unwrapExpression(receiver);
  if (Node.isIdentifier(n)) {
    const value = localValue(sf, n.getText());
    return value === undefined ? undefined : tableWriteKind(value, sf, depth + 1);
  }
  if (!Node.isCallExpression(n)) {
    return;
  }
  const callee = n.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return;
  }
  const verb = callee.getName();
  const arg0 = n.getArguments()[0];
  if ((verb === "update" || verb === "insert") && arg0 !== undefined && unwrapExpression(arg0).getText() === TABLE) {
    return verb;
  }
  return tableWriteKind(callee.getExpression(), sf, depth + 1);
}

/** ARM 1 — an UPDATE naming SOME of the triple but not all of it: the replaced body keeps a provenance that
 *  describes bytes that are gone (or gains half a record). Naming NONE of it is a non-content write, fine. */
function violatesUpdate(names: ReadonlySet<string>): boolean {
  const hit = TRIPLE.filter((c) => names.has(c)).length;
  return hit > 0 && hit < TRIPLE.length;
}

/** ARM 2 — an INSERT carrying exactly ONE half of the pair. Omitting BOTH is honest absence (the columns
 *  default NULL and no consumer is promised anything); carrying one is a record nothing can replay. */
function violatesInsert(names: ReadonlySet<string>): boolean {
  return [RAW, FREEZES].filter((c) => names.has(c)).length === 1;
}

/** ARM 3 rides here: an object the reader could not fully derive is a violation, not a pass. */
function violates(kind: WriteKind, acc: Acc): boolean {
  if (!acc.readable) {
    return true;
  }
  return kind === "update" ? violatesUpdate(acc.names) : violatesInsert(acc.names);
}

/** The column names actually declared on the table today — the live source of truth the arms key off. */
function declaredColumns(schema: SourceFile): ReadonlySet<string> | undefined {
  const decl = schema.getVariableDeclaration(TABLE);
  if (decl === undefined) {
    return;
  }
  return new Set(decl.getDescendantsOfKind(SyntaxKind.PropertyAssignment).map((p) => p.getName()));
}

function reportBlind(ctx: GateRunCtx, detail: string): void {
  ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `BLIND: ${detail} — retarget scripts/check/gates/freeze-provenance-write-pairing.ts` });
}

/** ARM 4 — the §4.6 tripwire, in the two ways this gate can go silently green: its DERIVATION died (the schema
 *  home moved, or a guarded column was renamed away) or its SUBJECTS did (not one write site in the tree). */
function judgeBlindness(ctx: GateRunCtx): void {
  const schema = ctx.project.getSourceFile(`${ctx.root}/${SCHEMA_HOME}`);
  if (schema === undefined) {
    reportBlind(ctx, `${SCHEMA_HOME} is gone/moved, so the guarded columns can no longer be derived`);
    return;
  }
  const columns = declaredColumns(schema);
  if (columns === undefined) {
    reportBlind(ctx, `\`${TABLE}\` is not declared in ${SCHEMA_HOME} — this gate keys on that name`);
    return;
  }
  const missing = TRIPLE.filter((c) => !columns.has(c));
  if (missing.length > 0) {
    reportBlind(ctx, `\`${TABLE}\` no longer declares ${missing.join(", ")} — the guarded shape changed under the gate`);
    return;
  }
  if (writeSites === 0) {
    reportBlind(ctx, `not one \`${TABLE}\` insert/update was found in packages/*/src — the writers moved or the table symbol was renamed`);
  }
}

export const gate: GateDescriptor = {
  name: "freeze-provenance-write-pairing",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // The blindness arms count write sites across the WHOLE tree and read the db schema — a scoped run over one
  // changed file would see zero sites and judge a fileset it never scanned.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  // Package sources only. `tests/**` writes variant rows directly ON PURPOSE (seeding the very half-written row
  // a pin then asserts on); they are fixtures, not writers, and the invariant is a property of the writer set.
  scanRoot: (p) => p.includes("packages/") && p.includes("/src/"),
  kinds: [SyntaxKind.CallExpression],

  begin: () => {
    writeSites = 0;
  },

  visit: (node, sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const callee = node.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) {
      return;
    }
    const method = callee.getName();
    if (method !== "set" && method !== "values") {
      return;
    }
    const kind = tableWriteKind(callee.getExpression(), sf, 0);
    const arg = node.getArguments()[0];
    if (kind === undefined || arg === undefined) {
      return;
    }
    writeSites += 1;
    const acc: Acc = { names: new Set<string>(), readable: true };
    mergeInto(acc, arg, { sf, depth: 0, seen: new Set<string>() });
    if (violates(kind, acc)) {
      ctx.report(callee.getNameNode());
    }
  },

  finalize: (ctx) => {
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return; // not the real tree — a blindness claim here would judge a synthetic fileset (§4.5)
    }
    judgeBlindness(ctx);
  },

  mustFlag: [
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function editContent(db: D, id: string, content: string) {\n" +
        "  return db.update(messageVariants).set({ content }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1, line: 3 },
      why: "THE FOUNDING DEFECT, verbatim: `editMessageContentStatements` before 2026-08-07 — it replaced the body and left the freeze provenance attached, so a host read a record describing bytes that were gone",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function half(db: D, id: string, content: string, rawContent: string) {\n" +
        "  return db.update(messageVariants).set({ content, rawContent }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1 },
      why: "HALF the triple is still a lie: a raw stored without its freeze record cannot be replayed, and the shorthand spelling must bite exactly like the `key: value` one",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function seed(db: D, content: string, rawContent: string) {\n" +
        "  return db.insert(messageVariants).values({ id: 'v', content, rawContent });\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1 },
      why: "the INSERT-PAIR arm: a fresh row may omit BOTH provenance columns, but carrying `rawContent` with no `macroFreezes` writes a record nothing can replay",
    },
    {
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\nimport { COLS } from "./cols.ts";\n' +
          "export function opaque(db: D, id: string) {\n" +
          "  return db.update(messageVariants).set({ ...COLS }).where(eq(messageVariants.id, id));\n" +
          "}\n",
        "packages/server/src/domain/chat/persistence/cols.ts": "export const COLS = { content: 'x' };\n",
      },
      expect: { count: 1 },
      why: "UNREADABLE-OBJECT, fail-closed: an object assembled in ANOTHER module could be writing `content` and this reader cannot tell — a best-effort gate would go silently green on exactly the shape that hides the defect",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function hoisted(db: D, id: string) {\n" +
        "  const q = db.update(messageVariants);\n" +
        "  return q.set({ content: 'x' }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1, line: 4 },
      why: "hoisting the builder into a local is not an escape — the receiver resolves one hop through its same-module binding",
    },
    {
      files: { "packages/db/src/schema/index.ts": "export const anchor = 1;\n" },
      expect: { count: 1, messageIncludes: "is gone/moved" },
      why: "BLINDNESS mode B (§4.4a): the real-tree anchor is present but the schema home that DERIVES the guarded columns is gone — the gate must announce it, never go silently green",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const anchor = 1;\n",
        [SCHEMA_HOME]: "export const messageVariants = sqliteTable('message_variants', { content: text('content'), rawContent: text('raw_content') });\n",
      },
      expect: { count: 1, messageIncludes: "no longer declares macroFreezes" },
      why: "BLINDNESS by RENAME (§4.6): the columns are derived from the live table declaration, so dropping/renaming one reds instead of quietly narrowing what the gate guards",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const anchor = 1;\n",
        [SCHEMA_HOME]:
          "export const messageVariants = sqliteTable('message_variants', { content: text('content'), rawContent: text('raw_content'), macroFreezes: text('macro_freezes') });\n",
      },
      expect: { count: 1, messageIncludes: "not one" },
      why: "BLINDNESS by SUBJECT LOSS: schema intact, but not a single write site in the tree — the writers moved or the table symbol was renamed, and a zero-finding pass would otherwise read as health",
    },
  ],
  mustPass: [
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "const CLEARED_FREEZE_PROVENANCE = { rawContent: null, macroFreezes: null } as const;\n" +
        "export function editContent(db: D, id: string, content: string) {\n" +
        "  return db.update(messageVariants).set({ content, ...CLEARED_FREEZE_PROVENANCE }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "the FIXED shape (canon-write's `editMessageContentStatements` today): the clear rides a same-module const behind an `as const` — the reader must see through the wrapper (§5's literal-shape blindness class)",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "function economics(v: V) {\n  return { content: v.content, reasoning: v.reasoning };\n}\n" +
        "function provenance(c: string, r: string | null) {\n  return { rawContent: r === c ? null : r, macroFreezes: null };\n}\n" +
        "function columns(v: V) {\n  return { id: v.id, ...economics(v), ...provenance(v.content, v.raw) };\n}\n" +
        "export function insertVariant(db: D, v: V) {\n  return db.insert(messageVariants).values(columns(v));\n}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "canon-write's REAL insert shape: the keys arrive three hops deep through same-module functions (`variantColumns` → `variantEconomics` + `freezeProvenanceColumns`). A reader that stopped at the call would refuse the healthy production writer",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function editReasoning(db: D, id: string, reasoning: string | null) {\n" +
        "  return db.update(messageVariants).set({ reasoning }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "a write touching NONE of the triple is not this gate's business (`editReasoningStatements`) — the rule is about the body's provenance, not about every column",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function importVariant(db: D, v: V) {\n" +
        "  return db.insert(messageVariants).values({ id: v.id, content: v.content, model: v.model });\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "DECLARED LIMIT + sanctioned shape: an INSERT omitting BOTH provenance columns is honest absence (they default NULL) — `import-write.ts` does exactly this, and demanding the triple on a fresh row would be ceremony",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export async function seedBrokenRow(db: D, id: string) {\n" +
        "  await db.update(messageVariants).set({ content: 'mutated' }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "tests/server/domain/chat/verbs/x.int.test.ts",
      why: "DECLARED LIMIT: `tests/**` is out of scanRoot. A pin PROVING this defect must be able to seed the broken row by hand (fork.int.test.ts and chat.int.test.ts both do); scanning tests would red the gate's own proofs",
    },
    {
      files:
        'import { messages } from "@orb/db";\n' +
        "export function editSlot(db: D, id: string, content: string) {\n" +
        "  return db.update(messages).set({ content }).where(eq(messages.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "another table's `content` is not this invariant — the freeze provenance lives on `message_variants` alone, and the sibling `db.update(messages).set(...)` calls next door must never bite",
    },
  ],
};
