// Policy: freeze-provenance-write-pairing — a `message_variants` write that touches the D129-F provenance
// triple (`content`/`rawContent`/`macroFreezes`) must write ALL of it. An UPDATE that replaces `content`
// and leaves the pair attached claims a provenance for bytes that no longer exist (the 2026-08-07
// editMessage finding); half a pair is unreplayable.
//
// FAMILY `freeze-provenance` — the shared readers are `lib/drizzle-write-target.ts`
// (`readDrizzleWriteTable`: which table does this write chain name) and `lib/authored-key-set.ts`
// (`readAuthoredKeySet`: which column names can this payload author, on any branch). Both were ADDED for
// this conversion, because `lib/` had value readers and no key-set reader: `readStaticAuthoredValue`
// refuses all seven live writes (their FIELDS are `params.x` and builder calls), and
// `resolveAuthoredComposite`/`readObjectLiteral`/`readReturnedObjectLiteral` each stop at one literal.
// The `-health` sibling shares the family and owns the blindness tripwires, which are HARD: a tripwire
// that a `@orb-waive` marker could silence is not a tripwire. Legacy reported them through the Finding
// overload for exactly that reason, so the split preserves the authority rather than inventing it.
//
// POPULATION: `@packages` is a byte-identical port of the legacy `scanRoot`
// (`p.includes("packages/") && p.includes("/src/")`) — the same six `packages/*/src/` roots.
// `packages/showcase-plugins/` has no `src/` and was outside both. `tests/**` stays outside (its own
// mustPass row): a pin PROVING this defect must seed the broken row by hand.
//
// PORT CORRECTIONS, each deliberate:
//   · IDENTITY replaces the two corpus-derivation nets. Legacy derived an alias set and a builder-name set
//     by sweeping the whole project in `begin` ("belt and braces"). `resolveModuleMemberOrigin` decides the
//     same question exactly — import aliases, `const T = messageVariants`, and cross-module re-export
//     renames all report canonical `messageVariants` — and `readCallReturns` follows a builder factory
//     same-module or imported. Both nets retire with the walks that built them; every one of their
//     mustFlag rows is carried and still bites.
//   · The door is now checked. Legacy keyed on the NAME alone, so any same-named export anywhere would
//     have matched; identity now also requires the `@orb/db` door or the `packages/db/src/schema/` home.
//   · A CROSS-MODULE const spread is now READ instead of refused. The shared binding resolver follows the
//     import, so the legacy "build them in the same module" limit is gone; the UNREADABLE-OBJECT arm keeps
//     its fail-closed row against a payload that is genuinely unreadable (a runtime member read).
//   · No depth cap. `MAX_DEPTH = 6` becomes a node-identity cycle guard in both shared readers, so a
//     legitimately deep-but-finite chain resolves instead of degrading to a refusal.
//   · ARM 5's relevance test is STRUCTURAL. Legacy asked whether the file's CODE TEXT mentioned the table
//     (with a comment blanker in front of it, because a header discussing the rule would otherwise arm the
//     tripwire). A visitor cannot see a comment: relevance is now "this file imports a binding whose origin
//     is the table", which is prose-blind by construction. The COMMENT-POSTURE row is carried as its pin.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readAuthoredKeySet } from "../lib/authored-key-set.ts";
import { readDrizzleWriteTable } from "../lib/drizzle-write-target.ts";
import { resolveModuleMemberOrigin } from "../lib/reference-fact.ts";

/** The Drizzle declaration every guarded write goes through, and the two homes that prove a binding IS it. */
export const GUARDED_TABLE = "messageVariants";
const DB_DOOR = "@orb/db";
const SCHEMA_HOME_PREFIX = "packages/db/src/schema/";
const CONTENT = "content";
const RAW = "rawContent";
const FREEZES = "macroFreezes";
/** The three columns that describe ONE body. Written together or not at all. The `-health` sibling proves
 *  they are still the live table's columns; keeping them here keeps this policy free of a fact it would
 *  otherwise declare and barely read. */
export const TRIPLE: readonly string[] = [CONTENT, RAW, FREEZES];
/** Shared with the `-health` sibling so both judge exactly the same writer set. */
export const WRITE_POPULATION = "@packages" as const;

type WriteKind = "update" | "insert";

/** The three call shapes that write columns, and which rule judges each. `onConflictDoUpdate`'s `set` lands
 *  on an ALREADY-EXISTING row, so it is an UPDATE — the repo's house upsert idiom (20+ live call sites) and
 *  the shape most likely to be how the next `message_variants` writer spells itself.
 *  A Record, not a switch: a switch over this union forces a suppression on the unreachable default. */
const KIND_BY_METHOD: Record<string, WriteKind | undefined> = { set: "update", values: "insert", onConflictDoUpdate: "update" };

const MESSAGE =
  "a `message_variants` write that touches the D129-F freeze-provenance triple (`content`/`rawContent`/" +
  "`macroFreezes`) must write ALL of it. An UPDATE — including an upsert's `onConflictDoUpdate({ set })`, " +
  "which lands on an already-existing row — that replaces `content` while leaving the pair attached serves a " +
  "host a record describing bytes that are gone (the editMessage finding, 2026-08-07: an edit that typed the " +
  "raw text back in left `raw_content` non-null AND equal to `content`, the one shape the storage rule " +
  "forbids). The pair is written together or not at all, on INSERT and UPDATE alike; half of it is provenance " +
  "nothing can replay. The rule + why the reverse reading is not claimed: " +
  "packages/server/src/domain/chat/persistence/canon-write.ts.";

const FIX =
  "spread `CLEARED_FREEZE_PROVENANCE` into the `.set()` (a non-freeze content write drops the replaced " +
  "body's provenance) or `freezeProvenanceColumns(content, raw, freezes)` (the freeze itself) — both in " +
  "packages/server/src/domain/chat/persistence/canon-write.ts. An INSERT may omit BOTH columns (DB NULL is " +
  "honest absence) and a clear-only UPDATE writing BOTH to null is fine; neither may carry one without the " +
  "other. The waiver is the central marker at the WRITE METHOD — " +
  "`// @orb-waive freeze-provenance-write-pairing(set): <reason>` (or `(values)` / `(onConflictDoUpdate)`), " +
  "on the line above the statement. One marker consumes one occurrence, and a chained `.values(…)` plus " +
  "`.onConflictDoUpdate(…)` are two positions, which is why the method name IS the position.";

/** ARM 3's message: an object this reader could not fully derive is a violation, not a pass. */
const UNREADABLE_PAYLOAD = `${MESSAGE} This write's payload cannot read as a fixed set of column names, so it is REFUSED rather than assumed: `;

/** ARM 5's message: a write builder whose TABLE argument reduces to no name at all. */
const UNREADABLE_TABLE =
  "a `message_variants` write builder in a file that imports this table names a table this gate cannot read " +
  "(a computed lookup, a namespace member). Silence here is exactly how an aliased or computed table walks " +
  "past a column invariant, so it is REFUSED: name the table INLINE at the builder.";

/** THE TABLE-IDENTITY QUESTION, answered by BINDING and by the DOOR rather than by spelling. `other` is a
 *  name that provably is not ours — including an identifier nothing binds, which is a plain name this
 *  policy has simply never met. `unreadable` is reserved for a table EXPRESSION that reduces to no name at
 *  all, which is ARM 5's subject. */
export function guardedTableVerdict(tableNode: MorphNode, relativePath: (sourceFile: SourceFile) => string): "ours" | "other" | "unreadable" {
  const origin = resolveModuleMemberOrigin(tableNode);
  if (origin.kind === "unresolved") {
    return origin.reason === "missing" ? "other" : "unreadable";
  }
  const { memberPath, canonical } = origin.value;
  const home = canonical.kind === "project" ? relativePath(canonical.sourceFile).startsWith(SCHEMA_HOME_PREFIX) : canonical.moduleSpecifier === DB_DOOR;
  return memberPath.length === 0 && canonical.exportedName === GUARDED_TABLE && home ? "ours" : "other";
}

/** The table a write chain under `callee` targets, or `null` when the chain has no Drizzle write verb in it
 *  at all (`map.set(…)`) — the boundary that stops ARM 5's fail-closed posture from redding every `.set()`. */
export function writeChainVerdict(callee: MorphNode, relativePath: (sourceFile: SourceFile) => string): "ours" | "other" | "unreadable" | "no-write-chain" {
  const table = readDrizzleWriteTable(callee);
  if (table.kind === "unresolved") {
    return "unreadable";
  }
  return table.value === null ? "no-write-chain" : guardedTableVerdict(table.value, relativePath);
}

/** ARM 1 — an UPDATE that replaces `content` without deciding the provenance pair: the row keeps a record
 *  describing bytes that are gone. A both-columns write with NO content is legal (see {@link violatesPair}). */
function violatesUpdate(names: ReadonlySet<string>): boolean {
  return names.has(CONTENT) && !names.has(RAW);
}

/** ARM 2 — the pair is written together or not at all, on INSERT and UPDATE alike. Omitting BOTH is honest
 *  absence (the columns default NULL); carrying one is a record nothing can replay, and on an UPDATE it also
 *  leaves the other half describing the wrong body. */
function violatesPair(names: ReadonlySet<string>): boolean {
  return names.has(RAW) !== names.has(FREEZES);
}

/** THE UPSERT ARM's payload: `onConflictDoUpdate({ target, set })` writes columns on an ALREADY-EXISTING
 *  row, so its `set` object is judged by the UPDATE rule. A config this reader cannot reduce to a literal,
 *  or one carrying no `set`, is refused rather than skipped — silently skipping it is exactly what let this
 *  whole shape through the first pass. */
function conflictSetNode(argument: MorphNode): MorphNode | undefined {
  const object = Node.isObjectLiteralExpression(argument) ? argument : undefined;
  const property = object?.getProperty("set");
  return property !== undefined && Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
}

function payloadNode(method: string, argument: MorphNode): MorphNode | undefined {
  return method === "onConflictDoUpdate" ? conflictSetNode(argument) : argument;
}

/** One write call, reduced to the three things a verdict needs, or `undefined` when the node is not one of
 *  the three column-writing methods at all. */
function writeCall(
  node: MorphNode,
): { readonly nameNode: MorphNode; readonly receiver: MorphNode; readonly method: string; readonly kind: WriteKind; readonly argument: MorphNode } | undefined {
  const callee = Node.isCallExpression(node) ? node.getExpression() : undefined;
  if (callee === undefined || !Node.isPropertyAccessExpression(callee) || !Node.isCallExpression(node)) {
    return;
  }
  const method = callee.getName();
  const kind = KIND_BY_METHOD[method];
  const argument = node.getArguments()[0];
  return kind === undefined || argument === undefined
    ? undefined
    : { nameNode: callee.getNameNode(), receiver: callee.getExpression(), method, kind, argument };
}

/** ARMS 1-3, once the chain is known to target the guarded table: the payload's key set, or a refusal. */
function pairingFinding(method: string, kind: WriteKind, argument: MorphNode): string | null {
  const payload = payloadNode(method, argument);
  if (payload === undefined) {
    return `${UNREADABLE_PAYLOAD}\`${method}\` carries no readable write object.`;
  }
  const keys = readAuthoredKeySet(payload);
  if (keys.kind === "unresolved") {
    return `${UNREADABLE_PAYLOAD}${keys.detail}.`;
  }
  return violatesPair(keys.value) || (kind === "update" && violatesUpdate(keys.value)) ? MESSAGE : null;
}

export const gate = defineGate({
  id: "freeze-provenance-write-pairing",
  family: "freeze-provenance",
  authority: "ordinary",
  severity: "error",
  population: WRITE_POPULATION,
  // The shared identity readers resolve through the checker's symbols; this policy reads no type, but it
  // is not a pure-syntax plane and says so.
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    /** Files that import a binding whose origin is the guarded table — ARM 5's structural relevance test. */
    const importers = new Set<SourceFile>();
    /** ARM 5 candidates, judged in `evaluate` so the verdict never depends on walk order within a file. */
    const unreadableTables: { readonly node: MorphNode; readonly method: string; readonly sourceFile: SourceFile }[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile): void => {
            const named = Node.isImportSpecifier(node) ? (node.getAliasNode() ?? node.getNameNode()) : undefined;
            if (named !== undefined && guardedTableVerdict(named, ctx.relativePath) === "ours") {
              importers.add(sourceFile);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            const write = writeCall(node);
            if (write === undefined) {
              return;
            }
            const verdict = writeChainVerdict(write.receiver, ctx.relativePath);
            if (verdict === "unreadable") {
              unreadableTables.push({ node: write.nameNode, method: write.method, sourceFile });
              return;
            }
            const message = verdict === "ours" ? pairingFinding(write.method, write.kind, write.argument) : null;
            if (message !== null) {
              ctx.report.node(write.nameNode, { token: write.method, offset: 0, message });
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const candidate of unreadableTables) {
          if (importers.has(candidate.sourceFile)) {
            ctx.report.node(candidate.node, { token: candidate.method, offset: 0, message: UNREADABLE_TABLE });
          }
        }
      },
    };
  },

  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function editContent(db: D, id: string, content: string) {\n" +
          "  return db.update(messageVariants).set({ content }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      expect: { count: 1, line: 3, token: "set" },
      why: "THE FOUNDING DEFECT, verbatim: `editMessageContentStatements` before 2026-08-07 — it replaced the body and left the freeze provenance attached, so a host read a record describing bytes that were gone",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function half(db: D, id: string, content: string, rawContent: string) {\n" +
          "  return db.update(messageVariants).set({ content, rawContent }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      expect: { count: 1, token: "set" },
      why: "HALF the triple is still a lie: a raw stored without its freeze record cannot be replayed, and the shorthand spelling must bite exactly like the `key: value` one",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function seed(db: D, content: string, rawContent: string) {\n" +
          "  return db.insert(messageVariants).values({ id: 'v', content, rawContent });\n" +
          "}\n",
      },
      expect: { count: 1, token: "values" },
      why: "the INSERT-PAIR arm: a fresh row may omit BOTH provenance columns, but carrying `rawContent` with no `macroFreezes` writes a record nothing can replay",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function opaque(db: D, id: string, params: { extra: object }) {\n" +
          "  return db.update(messageVariants).set({ ...params.extra }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      expect: { count: 1, token: "set", messageIncludes: "cannot read as a fixed set of column names" },
      why: "UNREADABLE-OBJECT, fail-closed: a payload spread from a RUNTIME member read could be writing `content` and no reader can tell — a best-effort gate would go silently green on exactly the shape that hides the defect. (The legacy row used a CROSS-MODULE const, which the shared binding resolver now READS; that widening is recorded in the header and its own mustPass row proves the resolution.)",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function hoisted(db: D, id: string) {\n" +
          "  const q = db.update(messageVariants);\n" +
          "  return q.set({ content: 'x' }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      expect: { count: 1, line: 4, token: "set" },
      why: "hoisting the builder into a local is not an escape — the receiver resolves through its binding",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function upsert(db: D, id: string, content: string) {\n" +
          "  return db.insert(messageVariants).values({ id }).onConflictDoUpdate({ target: messageVariants.id, set: { content } });\n" +
          "}\n",
      },
      expect: { count: 1, token: "onConflictDoUpdate" },
      why: "THE UPSERT HOLE (verifier, 2026-08-07): `onConflictDoUpdate({ set })` lands on an ALREADY-EXISTING row and reproduces the founding defect exactly, and the first pass saw NOTHING there. This is the repo's house idiom, i.e. the likeliest spelling of the next writer. The bare `.values({ id })` beside it is legal (an insert may omit both columns), which is why exactly ONE finding is expected — and the token pins WHICH of the two chained methods flags",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants as mv } from "@orb/db";\n' +
          "export function aliased(db: D, id: string, content: string) {\n" +
          "  return db.update(mv).set({ content }).where(eq(mv.id, id));\n" +
          "}\n",
      },
      expect: { count: 1, token: "set" },
      why: "IMPORT-ALIAS at the table argument was a silent zero in the first pass while the same aliasing at the BUILDER was resolved — the inconsistency the verifier named. The shared module-origin reader ends the alias at the declared `messageVariants`",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "const T = messageVariants;\n" +
          "export function viaConst(db: D, id: string, content: string) {\n" +
          "  return db.update(T).set({ content }).where(eq(T.id, id));\n" +
          "}\n",
      },
      expect: { count: 1, token: "set" },
      why: "a same-module `const T = messageVariants` table alias — the twin of the builder hoist above, and the shape the retired corpus alias-derivation net existed to catch",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "function builder(db: D) {\n  return db.update(messageVariants);\n}\n" +
          "export function viaFactory(db: D, id: string, content: string) {\n" +
          "  return builder(db).set({ content }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      expect: { count: 1, token: "set" },
      why: "a same-module function RETURNING the builder — the third aliasing shape, and the one the shared module-origin reader alone cannot reach (a non-exported local is not a module export), which is why `readCallReturns` falls back to the shared lexical symbol",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "const TABLES = { v: messageVariants };\n" +
          "export function computed(db: D, k: 'v', content: string) {\n" +
          "  return db.update(TABLES[k]).set({ content });\n" +
          "}\n",
      },
      expect: { count: 1, token: "set", messageIncludes: "cannot read" },
      why: "ARM 5, the UNRESOLVED-TABLE tripwire: a computed table argument reduces to no name at all, so instead of guessing (clever and wrong) the gate REDS it — but only in a file that IMPORTS this table, so the rest of the repo's dynamic drizzle is untouched",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { variants } from "./barrel.ts";\nexport function renamed(db: D, id: string, content: string) {\n  return db.update(variants).set({ content });\n}\n',
        "packages/server/src/domain/chat/persistence/barrel.ts": 'export { messageVariants as variants } from "@orb/db";\n',
      },
      expect: { count: 1, token: "set" },
      why: "CROSS-MODULE RE-EXPORT RENAME, closed rather than declared: the importing file's specifier says `variants` and nothing local ties it to the table, so identity is decided by BINDING — the shared module-origin reader follows the import into barrel.ts and reports canonical `messageVariants`",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { updater } from "./b.ts";\nexport function foreign(db: D, content: string) {\n  return updater(db).set({ content });\n}\n',
        "packages/server/src/domain/chat/persistence/b.ts":
          'import { messageVariants } from "@orb/db";\nexport const updater = (db: D) => db.update(messageVariants);\n',
      },
      expect: { count: 1, token: "set" },
      why: "CROSS-MODULE BUILDER FACTORY: `updater` is followed through its import into b.ts and its returned builder names the table — the shape the retired corpus builder-derivation net existed to catch, now exact",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "const CLEARED_FREEZE_PROVENANCE = { rawContent: null, macroFreezes: null } as const;\n" +
          "export function editContent(db: D, id: string, content: string) {\n" +
          "  return db.update(messageVariants).set({ content, ...CLEARED_FREEZE_PROVENANCE }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      why: "the FIXED shape (canon-write's `editMessageContentStatements` today): the clear rides a same-module const behind an `as const` — the reader must see through the wrapper",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "function economics(v: V) {\n  return { content: v.content, reasoning: v.reasoning };\n}\n" +
          "function provenance(c: string, r: string | null) {\n  return { rawContent: r === c ? null : r, macroFreezes: null };\n}\n" +
          "function columns(v: V) {\n  return { id: v.id, ...economics(v), ...provenance(v.content, v.raw) };\n}\n" +
          "export function insertVariant(db: D, v: V) {\n  return db.insert(messageVariants).values(columns(v));\n}\n",
      },
      why: "canon-write's REAL insert shape: the keys arrive three hops deep through same-module functions (`variantColumns` → `variantEconomics` + `freezeProvenanceColumns`). A reader that stopped at the call would refuse the healthy production writer — this is the row the whole key-set reader exists for",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\nimport { CLEARED } from "./cols.ts";\n' +
          "export function crossModule(db: D, id: string, content: string) {\n" +
          "  return db.update(messageVariants).set({ content, ...CLEARED }).where(eq(messageVariants.id, id));\n" +
          "}\n",
        "packages/server/src/domain/chat/persistence/cols.ts": "export const CLEARED = { rawContent: null, macroFreezes: null } as const;\n",
      },
      why: 'THE PORT CORRECTION, proven rather than asserted: legacy refused any object assembled in another module and redded this healthy shape (its declared limit, "build them in the same module"). The shared binding resolver follows the import, so the pair is read and the write passes',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function editReasoning(db: D, id: string, reasoning: string | null) {\n" +
          "  return db.update(messageVariants).set({ reasoning }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      why: "a write touching NONE of the triple is not this gate's business (`editReasoningStatements`) — the rule is about the body's provenance, not about every column",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function importVariant(db: D, v: V) {\n" +
          "  return db.insert(messageVariants).values({ id: v.id, content: v.content, model: v.model });\n" +
          "}\n",
      },
      why: "DECLARED LIMIT + sanctioned shape: an INSERT omitting BOTH provenance columns is honest absence (they default NULL) — `import-write.ts` does exactly this, and demanding the triple on a fresh row would be ceremony",
    },
    {
      mode: "types",
      files: {
        "tests/server/domain/chat/verbs/x.int.test.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export async function seedBrokenRow(db: D, id: string) {\n" +
          "  await db.update(messageVariants).set({ content: 'mutated' }).where(eq(messageVariants.id, id));\n" +
          "}\n",
        // `resolvePopulation` throws on an expression that admits zero paths, so the fenced-OUT fixture
        // needs one in-population neighbour; a file that writes nothing keeps the row's claim exact.
        "packages/server/src/domain/chat/persistence/x.ts": "export const unrelated = 1;\n",
      },
      why: "THE POPULATION FENCE, and the row that dies without it: `tests/**` is outside `@packages`. A pin PROVING this defect must be able to seed the broken row by hand (fork.int.test.ts and chat.int.test.ts both do); widening the population to `@authored` makes this exact fixture flag",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messages } from "@orb/db";\n' +
          "export function editSlot(db: D, id: string, content: string) {\n" +
          "  return db.update(messages).set({ content }).where(eq(messages.id, id));\n" +
          "}\n",
      },
      why: "another table's `content` is not this invariant — the freeze provenance lives on `message_variants` alone, and the sibling `db.update(messages).set(...)` calls next door must never bite",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "some-other-package";\n' +
          "export function foreignTable(db: D, id: string, content: string) {\n" +
          "  return db.update(messageVariants).set({ content }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      why: "THE DOOR HALF OF IDENTITY, and the row that dies without it: legacy keyed on the NAME alone, so any export anywhere spelled `messageVariants` was this table. Identity now also requires the `@orb/db` door or the `packages/db/src/schema/` home — drop that clause and this foreign same-named table flags",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function scrubProvenance(db: D, id: string) {\n" +
          "  return db.update(messageVariants).set({ rawContent: null, macroFreezes: null }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      why: "THE RULED JUDGEMENT (2026-08-07): a CLEAR-ONLY update — both provenance columns, no `content` — is LEGAL. Nulling both is the strictly-safe direction: it cannot produce the stale pair this gate exists to prevent, and it is the shape a future host-plane scrub or backfill would take. Only the CONTENT arm needs the pair; the pair arm needs them together",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "const CLEARED = { rawContent: null, macroFreezes: null } as const;\n" +
          "export function upsertOk(db: D, id: string, content: string) {\n" +
          "  return db.insert(messageVariants).values({ id, content }).onConflictDoUpdate({ target: messageVariants.id, set: { content, ...CLEARED } });\n" +
          "}\n",
      },
      why: "the HEALTHY upsert: the conflict `set` decides the provenance, so the house idiom stays usable on this table — the new arm bans the defect, not the pattern. Proves the reader reaches THROUGH the config object into `set` and still resolves a spread from there",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function other(db: D, id: string) {\n" +
          "  return db.update(someOtherTable).set({ content: 'x' }).where(eq(someOtherTable.id, id));\n" +
          "}\n",
      },
      why: "the ARM 5 NEAR-MISS that keeps it honest: an UNDECLARED table identifier in a file that DOES import ours binds to nothing, but it is a plain NAME that is provably not this table — `unreadable` is reserved for a table expression that reduces to no name at all, not for every name the reader has not met",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function counter(m: Map<string, number>, content: string) {\n" +
          "  return m.set(content, 1);\n" +
          "}\n",
      },
      why: "`map.set(…)` in a file that imports the table: there is no Drizzle write verb in the chain at all, so the shared chain reader answers `null` and the gate stays silent — the boundary that stops ARM 5's fail-closed posture from redding every `.set()` in the repo",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          "// Nothing here writes messageVariants — that lives in canon-write.ts, with its freeze provenance.\n" +
          "const TABLES = { v: someOtherTable };\n" +
          "export function computed(db: D, k: 'v', content: string) {\n" +
          "  return db.update(TABLES[k]).set({ content });\n" +
          "}\n",
      },
      why: "COMMENT POSTURE (issue #117/#132), carried as the pin for the port correction: ARM 5's relevance test is now an IMPORT, not a text match, so a file whose COMMENT names the table while dealing with a different one can never arm the tripwire — the class the legacy comment-blanker defended is structural now",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\n' +
          "export function editContent(db: D, id: string, content: string) {\n" +
          "  // @orb-waive freeze-provenance-write-pairing(set): the host-plane scrub owns this row's provenance; ends when the scrub verb lands.\n" +
          "  return db.update(messageVariants).set({ content }).where(eq(messageVariants.id, id));\n" +
          "}\n",
      },
      why: "THE IDENTITY ARM (§4.2): the founding-defect fixture, which produces exactly ONE finding, with the correct central marker at the reported position — the method name. Its twin is the first mustFlag row; if the reported policy id or position were anything else, the marker would not consume and this row would flag",
    },
  ],
});
