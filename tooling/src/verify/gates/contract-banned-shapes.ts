// The CONTRACT partition of the ledger's rejected shapes: a `kind` member on `Principal` (D60) and a
// `guidedActions` key in `appSettingsSchema`'s Zod shape (D33). A different EVIDENCE PLANE from the schema
// partition (`schema-banned-shapes`) — authored contract declarations, not the Drizzle fact — so it is its
// own policy id. Rows + the message: ../lib/ledger-banned-shapes.ts. HARD: contest the D-cite, never the site.
// TWO-SIDED: an unreadable Zod initializer is REPORTED (never skipped), and a row whose named subject no
// longer resolves in its declared home is REPORTED too — a name-keyed ban that stops matching is a no-op.
//
// FAMILY: SINGLETON under its own id, and the reason is the READER, not the topic. It shares
// `../lib/ledger-banned-shapes.ts` with `schema-banned-shapes`, but that module is a shared VOCABULARY —
// the (location, forbidden shape, D-cite) rows plus `bannedMessage`/`contractBanHome`, which exist so one
// D-cite has one spelling — and guide §2 decides a family on a shared SUBJECT READER or computation. The
// two policies' subject readers are disjoint: the schema partition consumes `lib/schema-fact.ts`'s
// `drizzleSchemaFact` and is `family: "drizzle-schema"`; this one reads AUTHORED contract declarations
// through `_shared/reference-fact.ts#readMemberReference` and `lib/schema-fact-value.ts#objectEntries`, and
// touches no Drizzle fact at all. Naming `drizzle-schema` here would claim a fact this policy never reads;
// naming a joint "banned-shapes" family would make a shared data table a family key, which is the "theme
// is not a family" shape §3 forbids. Same call, same reason, as `warning-code-coverage`'s singleton over
// `tupleVocabularyFact`. The vocabulary module's own header states the split first: "TWO PARTITIONS, TWO
// POLICIES, ONE VOCABULARY … they are separate policy ids because they read different subjects."
// POPULATION PORT: an INTENTIONAL NARROWING, stated with its derivation and its positive control at the
// `population:` field below.
//
// The legacy `schema-banned-shapes` descriptor (0593a6a6cbd151faa088ddd3f9cbaca0ce69b4ef — the PARENT of
// the `1bf7ff7d9` split commit; this policy's OWN file does not exist there, because this half was BORN at
// that split, and the legacy blob verified 2026-09-12 at `schema-banned-shapes.ts`) checked both
// the contract rows above and the schema rows below in one combined gate before this split by evidence
// plane.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `schema-banned-shapes` descriptor at 0593a6a6cbd151faa088ddd3f9cbaca0ce69b4ef, the parent of the conversion
// `1bf7ff7d9`; this module did not exist there, so it is measured against the module it was carved from,
// `schema-banned-shapes` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the SAME 7,137 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy
// harness dispatch (no `scanRoot`) admits 7,137 and final `population` admits 105. legacy − final = 7,032 harness
// sources outside `@contracts` — the combined legacy module's IMPORT arm (now biome `noRestrictedImports`) and its
// schema arm (now `schema-banned-shapes`) read them; the contract partition judges only `@contracts` declarations.
// final − legacy = ∅. Controls: inside `packages/contracts/src/assets/__cbbhr_in_index.ts` (virtual) admitted by
// both; outside `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import type { Node as MorphNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference } from "../../_shared/reference-fact.ts";
import type { ContractBannedShape } from "../contract/ledger-banned-shapes.ts";
import { defineGate } from "../contract/policy.ts";
import { bannedMessage, CONTRACT_BANNED_SHAPES, contractBanHome } from "../lib/ledger-banned-shapes.ts";
import { objectEntries, SchemaRefusal, terminalCall } from "../lib/schema-fact-value.ts";

const MESSAGE =
  "a ledger-REJECTED contract shape has been reintroduced — the ledger killed this field by name; drop it or contest the D-cite (see the row's citation in Core-Laws-and-Precedents.md).";
const FIX = "remove the banned interface member / schema key — the ledger row names the correct home for the concern.";

/** Zod builder operations whose FIRST ARGUMENT is an authored shape literal the ban must read. */
const SHAPE_LITERAL_OPS = new Set(["object", "extend"]);
/** Operations whose first argument is ANOTHER SCHEMA whose keys compose in. */
const SHAPE_COMPOSE_OPS = new Set(["merge"]);
/** The chain ROOT. `z.object(...)`'s receiver is the zod MODULE, not a schema, so the walk stops here —
 *  recursing into it would refuse on the module binding and report every compliant schema as unreadable. */
const SHAPE_ROOT_OP = "object";

interface ShapeRead {
  readonly keys: ReadonlySet<string>;
  /** The node whose value the shared readers refused, or null when the whole chain resolved. */
  readonly unresolved: MorphNode | null;
}

/** The callee's member name plus its receiver, for one link of a Zod builder chain. `z.object(…)` reads as
 *  `object` on receiver `z`; a bare `object(…)` (a named import) reads as `object` with no receiver. */
function calleeName(call: import("ts-morph").CallExpression): { readonly name: string; readonly receiver: MorphNode | null } | null {
  const callee = call.getExpression();
  const member = readMemberReference(callee);
  if (member.kind === "resolved") {
    return { name: member.value.name, receiver: member.value.receiver };
  }
  return Node.isIdentifier(callee) ? { name: callee.getText(), receiver: null } : null;
}

/** Walk a Zod builder chain, collecting every statically declared shape KEY. Presence is all the ban needs,
 *  so the VALUES (`z.boolean()` calls) are never read — only the object literals' member names. Every other
 *  operation (`.strict()`, `.partial()`, `.catch()`, …) preserves its receiver's keys and is walked through. */
function collectShapeKeys(node: MorphNode, keys: Set<string>, active: Set<object>): MorphNode | null {
  const call = terminalCall(node);
  if (call.kind === "unresolved") {
    return call.node;
  }
  const current = call.value;
  if (active.has(current.compilerNode)) {
    return current;
  }
  active.add(current.compilerNode);
  const callee = calleeName(current);
  if (callee === null) {
    return current;
  }
  if (SHAPE_LITERAL_OPS.has(callee.name)) {
    const shape = current.getArguments()[0];
    if (shape === undefined) {
      return current;
    }
    for (const entry of objectEntries(shape, `${callee.name}() shape`)) {
      keys.add(entry.name);
    }
  }
  if (SHAPE_COMPOSE_OPS.has(callee.name)) {
    const other = current.getArguments()[0];
    const refusal = other === undefined ? current : collectShapeKeys(other, keys, active);
    if (refusal !== null) {
      return refusal;
    }
  }
  if (callee.name === SHAPE_ROOT_OP) {
    return null;
  }
  // Any other operation (`.strict()`, `.partial()`, `.catch()`, …) preserves its receiver's keys, so the
  // receiver must resolve. A chain with no receiver at all never reached a `z.object(...)` root, so its
  // keys are UNKNOWN — reported, never assumed empty.
  return callee.receiver === null ? current : collectShapeKeys(callee.receiver, keys, active);
}

function readShape(initializer: MorphNode): ShapeRead {
  const keys = new Set<string>();
  try {
    return { keys, unresolved: collectShapeKeys(initializer, keys, new Set<object>()) };
  } catch (error) {
    if (error instanceof SchemaRefusal) {
      return { keys, unresolved: error.fact.node };
    }
    throw error;
  }
}

/** One ruled schema variable's verdict: the banned key's presence, plus the node whose value refused. */
function judgeSchemaVar(node: VariableDeclaration, shape: Extract<ContractBannedShape, { readonly kind: "schema-field" }>): ShapeRead {
  const initializer = node.getInitializer();
  if (initializer === undefined) {
    return { keys: new Set<string>(), unresolved: node.getNameNode() };
  }
  const read = readShape(initializer);
  return { keys: read.keys.has(shape.field) ? new Set([shape.field]) : new Set<string>(), unresolved: read.unresolved };
}

function banSubject(shape: ContractBannedShape): string {
  return shape.kind === "interface-field" ? shape.typeName : shape.schemaVar;
}

const UNRESOLVED_MESSAGE =
  "an exported schema the ledger rules on has an initializer the shared static readers cannot resolve, so its shape keys are UNKNOWN — a ban cannot be established and this is reported rather than skipped (#944). Author the shape as a resolvable Zod object/extend/merge chain. See tooling/src/verify/gates/GATE-AUTHORING.md §5.";

const missingSubject = (subject: string, home: string): string =>
  `the ledger ban on \`${subject}\` no longer resolves: no such declaration exists in its declared home ${home}, so this D-cite is a SILENT NO-OP (GATE-AUTHORING §4.6). Repoint the row in tooling/src/verify/lib/ledger-banned-shapes.ts at the declaration's new home, or delete the row if the ledger retired it.`;

/** DELIBERATELY DISJOINT from `missingSubject`, and it must stay that way. The two blindness arms differ
 *  only in message, so a `messageIncludes` row can discriminate them ONLY if neither text is a substring of
 *  the other (guide §6.1's fail-closed third-answer rule). This message used to interpolate
 *  `missingSubject(...)` verbatim, which put "SILENT NO-OP" in BOTH texts and left `mustFlag[6]` green when
 *  its own arm stopped executing (wave 3 D2). Each arm now carries its own verdict phrase — "SILENT NO-OP"
 *  here means the home file was READ and the subject was absent; "DEAD ROW" means the home file itself is
 *  outside the population — and `mustFlag[6]`/`mustFlag[7]` pin one each. */
const missingHome = (subject: string, home: string, anchor: string): string =>
  `the ledger ban on \`${subject}\` no longer resolves: its declared home ${home} is not in this policy's population at all, so this D-cite is a DEAD ROW (GATE-AUTHORING §4.6) — reported on ${anchor} because the row's own anchor no longer exists. Repoint the row in tooling/src/verify/lib/ledger-banned-shapes.ts at the declaration's new home, or delete the row if the ledger retired it.`;

const PRINCIPAL_HOME = "packages/contracts/src/identity/index.ts";
const SETTINGS_HOME = "packages/contracts/src/settings/index.ts";
/** Both ruled subjects, born-compliant. Every proof carries them so the two-sided missing-subject arm is
 *  never firing incidentally — a fixture that omits a home is proving the OTHER arm on purpose. */
const COMPLIANT_HOMES: Readonly<Record<string, string>> = {
  [PRINCIPAL_HOME]: "export interface Principal {\n  userId: string;\n  role: string;\n}\n",
  [SETTINGS_HOME]: 'import { z } from "zod";\nexport const appSettingsSchema = z.object({ trustHtml: z.boolean() });\n',
};

export const gate = defineGate({
  id: "contract-banned-shapes",
  family: "contract-banned-shapes",
  authority: "hard",
  severity: "error",
  // DELIBERATE POPULATION NARROWING, re-derived 2026-09-05 on the whole tree: `interface Principal` has
  // exactly ONE declaration (packages/contracts/src/identity/index.ts:45 — ast-grep ts=1 hit, tsx=0 hits
  // against 629 tsx interface declarations as the positive control) and `appSettingsSchema =` exactly one
  // (packages/contracts/src/settings/index.ts:364). Both subjects' ONE HOME is `@orb/contracts` by the
  // type-home law, so a same-spelled declaration elsewhere is a DIFFERENT type and accusing it would be a
  // false positive; the legacy gate walked the whole harness project for a subject that cannot live there.
  // The narrowing is safe BECAUSE of the missing-subject arm below: a subject that moves out of contracts
  // reds rather than going quiet.
  population: "@contracts",
  // `types`, NOT `syntax` (#2256, corrected 2026-09-13). The declaration used to read `syntax` while this
  // policy rests its verdict on the CHECKER one import hop out: `_shared/reference-fact.ts#readMemberReference`
  // reaches `resolveStableExpressionInternal` -> `importedTarget`, which calls
  // `lexicalReferenceSymbol(current)?.getAliasedSymbol()` to follow an import door to its declaration — and
  // that reader's own header already says "checker-proven". A syntax declaration on a checker-backed policy
  // is not a formality: `analysis` is DATA the runtime dispatches on, it fixes the proof MODE every row must
  // carry (`lib/policy-validation.ts#expectedMode`), and a `types` owner is priced differently. Every
  // `mustFlag`/`mustPass` row below therefore moved from `mode: "source"` to `mode: "types"` in the same
  // commit and was re-run; no claim about the syntax plane survives in this header.
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const seen = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration],
          visit: (node) => {
            if (!Node.isInterfaceDeclaration(node)) {
              return;
            }
            for (const shape of CONTRACT_BANNED_SHAPES) {
              if (shape.kind !== "interface-field" || node.getName() !== shape.typeName) {
                continue;
              }
              seen.add(shape.typeName);
              const member = node.getProperty(shape.field);
              if (member !== undefined) {
                ctx.report.node(member.getNameNode(), {
                  token: shape.field,
                  offset: 0,
                  message: bannedMessage(`\`${shape.typeName}.${shape.field}\``, shape.cite),
                });
              }
            }
          },
        },
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node) => {
            if (!Node.isVariableDeclaration(node)) {
              return;
            }
            for (const shape of CONTRACT_BANNED_SHAPES) {
              if (shape.kind !== "schema-field" || node.getName() !== shape.schemaVar) {
                continue;
              }
              seen.add(shape.schemaVar);
              const read = judgeSchemaVar(node, shape);
              if (read.unresolved !== null) {
                ctx.report.node(read.unresolved, { message: UNRESOLVED_MESSAGE });
              }
              if (read.keys.has(shape.field)) {
                ctx.report.node(node.getNameNode(), {
                  token: shape.schemaVar,
                  offset: 0,
                  message: bannedMessage(`\`${shape.schemaVar}.${shape.field}\``, shape.cite),
                });
              }
            }
          },
        },
      ],
      evaluate: () => {
        // §4.6 two-sided arm: a ban keyed on an exact NAME must red when the name stops resolving, or a
        // rename turns the whole row into a permanent ✓. The anchor is the population's first path when the
        // row's own home is gone, because a finding must land inside the effective population.
        const paths = ctx.files.map(ctx.relativePath).toSorted();
        const anchor = paths[0];
        for (const shape of CONTRACT_BANNED_SHAPES) {
          const subject = banSubject(shape);
          const home = contractBanHome(shape);
          if (seen.has(subject)) {
            continue;
          }
          if (paths.includes(home)) {
            ctx.report.file(home, { message: missingSubject(subject, home) });
          } else if (anchor !== undefined) {
            ctx.report.file(anchor, { message: missingHome(subject, home, anchor) });
          }
        }
        // `unresolved` is deliberately NOT declared: every unreadable initializer is already REPORTED as a
        // finding above, and GATE-AUTHORING §1 rules that one cause must not produce both a violation and a
        // "the checker is broken" verdict. `members` is the RULE population — zero would mean the row table
        // itself went empty, which is the blindness this receipt exists to catch.
        ctx.receipt({ kind: "population", source: "ledger contract bans", members: CONTRACT_BANNED_SHAPES.length });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { ...COMPLIANT_HOMES, [PRINCIPAL_HOME]: "export interface Principal {\n  userId: string;\n  kind: string;\n}\n" },
      expect: { count: 1, token: "kind", messageIncludes: "D60" },
      why: "a `kind` field on Principal — agents are structurally Principal-less (D60)",
    },
    {
      mode: "types",
      files: {
        ...COMPLIANT_HOMES,
        [SETTINGS_HOME]: 'import { z } from "zod";\nexport const appSettingsSchema = z.object({\n  guidedActions: z.array(z.string()),\n});\n',
      },
      expect: { count: 1, token: "appSettingsSchema", messageIncludes: "D33" },
      why: "appSettingsSchema.guidedActions — a neo phantom; guided actions live only on the preset (D33)",
    },
    {
      mode: "types",
      files: {
        ...COMPLIANT_HOMES,
        "packages/contracts/src/settings/base.ts": 'import { z } from "zod";\nexport const baseSchema = z.object({ guidedActions: z.array(z.string()) });\n',
        [SETTINGS_HOME]:
          'import { z } from "zod";\nimport { baseSchema } from "./base";\nexport const appSettingsSchema = baseSchema.extend({ trustHtml: z.boolean() }).strict();\n',
      },
      expect: { count: 1, messageIncludes: "D33" },
      why: "the banned key reached through `.extend(…).strict()` off an IMPORTED base is the same shape — a reader that only read the outermost object literal would pass it",
    },
    {
      mode: "types",
      files: {
        ...COMPLIANT_HOMES,
        [SETTINGS_HOME]:
          'import { z } from "zod";\nconst SHAPE = { guidedActions: z.array(z.string()) };\nexport const appSettingsSchema = z.object({ ...SHAPE });\n',
      },
      expect: { count: 1, messageIncludes: "D33" },
      why: "an OBJECT SPREAD of a same-file const carries the key just as a literal member does",
    },
    {
      mode: "types",
      files: {
        ...COMPLIANT_HOMES,
        [SETTINGS_HOME]: 'import { z } from "zod";\nexport const appSettingsSchema = z.object({ ["guidedActions"]: z.boolean() });\n',
      },
      expect: { count: 1, messageIncludes: "D33" },
      why: "a COMPUTED static key is the same declared key — the #1506 respelling class",
    },
    {
      mode: "types",
      files: { ...COMPLIANT_HOMES, [SETTINGS_HOME]: "declare function build(): unknown;\nexport const appSettingsSchema = build();\n" },
      expect: { count: 1, messageIncludes: "cannot resolve" },
      why: "FAIL-CLOSED (#944): a ruled schema whose shape the readers cannot read is REPORTED, never silently skipped — a silent skip is the audited escape verbatim",
    },
    {
      mode: "types",
      files: { ...COMPLIANT_HOMES, [PRINCIPAL_HOME]: "export interface Caller {\n  userId: string;\n}\n" },
      expect: { count: 1, messageIncludes: "SILENT NO-OP" },
      why: "§4.6 BLINDNESS: `Principal` renamed away in its own home — the D60 row now matches nothing, and a name-keyed ban that stops matching must RED, not report ✓ forever",
    },
    {
      mode: "types",
      files: { [SETTINGS_HOME]: COMPLIANT_HOMES[SETTINGS_HOME] as string },
      expect: { count: 1, messageIncludes: "not in this policy's population" },
      why: "§4.6, the other half: the row's declared HOME FILE is gone entirely (a move out of contracts), so the finding anchors on the population's first path rather than vanishing with the file",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { ...COMPLIANT_HOMES },
      why: "both ruled subjects present and born-compliant — a kind-less Principal and an appSettingsSchema with no guidedActions key",
    },
    {
      mode: "types",
      files: {
        ...COMPLIANT_HOMES,
        [SETTINGS_HOME]:
          'import { z } from "zod";\nexport const appSettingsSchema = z.object({ trustHtml: z.boolean().nullable().optional().catch(undefined) }).strict();\n',
      },
      why: "the LIVE authoring shape — per-field `.nullable().optional().catch()` wrappers plus a trailing `.strict()` — resolves to its keys and passes",
    },
    {
      mode: "types",
      files: { ...COMPLIANT_HOMES, "packages/contracts/src/chat/index.ts": "export interface Envelope {\n  kind: string;\n}\n" },
      why: "DECLARED LIMIT / no-false-positive: `kind` is banned on `Principal` BY NAME — an ordinary discriminant on another interface is not the ruled shape",
    },
    {
      mode: "types",
      files: {
        ...COMPLIANT_HOMES,
        "packages/contracts/src/preset/index.ts": 'import { z } from "zod";\nexport const presetSchema = z.object({ guidedActions: z.array(z.string()) });\n',
      },
      why: "DECLARED LIMIT: D33 says guided actions live ONLY on the preset — the key on a preset schema is its CORRECT home, and the ban is keyed to `appSettingsSchema` by name",
    },
    {
      mode: "types",
      files: { ...COMPLIANT_HOMES, "packages/contracts/src/notes.ts": 'export const note = "appSettingsSchema.guidedActions was dropped by D33";\n' },
      why: "comment/mention fence: the policy subscribes to declaration node KINDS, so a string (or comment) naming the banned shape is prose, never a declaration",
    },
  ],
});
