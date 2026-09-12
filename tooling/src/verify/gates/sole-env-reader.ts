// Policy: sole-env-reader (Tier-2-Foundation.md invariant #1) — `foundation/env` is the ONE place that
// touches `process.env`; every other tier imports the frozen `env` object. Biome's `noProcessEnv` catches the
// dotted spelling; this policy is the AST backstop that also catches `process["env"]`, reads only real access
// nodes (a comment naming process.env is not a read), and — since the conversion — resolves the RECEIVER's
// identity rather than its text.
//
// IDENTITY, NOT SPELLING: the legacy check was `obj.getText() === "process"`, which a local variable named
// `process` false-reds and a re-bound one walks past. The subject is now the `env` member of the real
// `process` — either the AMBIENT global or the DEFAULT export of the `node:process` module, which is how
// every live reader on this tree spells it (`import process from "node:process"`). Both doors resolve
// through the shared origin readers; a member of anything else is provably not a subject.
//
// TWO CANDIDATE ARMS, because the bag can be reached without ever writing `process.env`: the MEMBER read in
// any spelling, and the DESTRUCTURE SITE (`const { env } = process`, `const { env: bag } = process`), whose
// binding element carries the property name while every later use is a bare identifier. The destructure arm
// is prefiltered to the binding element ITSELF — one node per destructure — so it costs nothing on a tree
// whose ~1,000 `env` identifiers are uses of the FROZEN object, each of which resolves cleanly to
// `foundation/env` and is proven not to be a subject rather than being excused.
//
// THE OPERATION IS DERIVED FROM THE READ'S OWN SHAPE, uniformly, with no path knowledge inside the policy:
// a read with a STATICALLY-READABLE KEY carries `process-env-read:<KEY>`, and a dynamic key or a read of the
// whole bag (`envSchema.parse(process.env)`, `{ ...process.env }`) carries the bare `process-env-read`.
// That is what preserves the legacy ledger's PER-KEY grain for the sanctioned call-time reader
// (`domain/sessions/substrate/role-policy.ts` reads exactly five governance vars at call time so per-test
// `vi.stubEnv` drives the role matrix) while the sole reader's own many reads collapse per carrier — and it
// does it without a file allowlist, because the grain follows the read rather than the path.
//
// AUTHORITY IS reviewed-grant. Both legacy tables were recurring PERMISSIONS: the `foundation/env/` home,
// and the five `SANCTIONED_KEYS` of the role-policy exception. Each is one exact `(subject, operation)` row
// in the central table, and the legacy per-key stale arm IS that table's liveness — a key role-policy stops
// reading leaves its row consumed zero times, which is the central STALE alarm.
//
// THE AMBIENT DOOR IS PLANTED, NOT SPELLED (#2030, design §4.8b). The proof workspace loads TypeScript's own
// lib files but has NO `@types/node`, so a bare `process` in a fixture binds nothing: the global reader takes
// its fail-closed `unreadable` arm and this policy reports with the SAME count and the SAME message as the
// precise ambient branch. Measured by planting a `throw` in each arm and running this module's own
// rows: the fail-closed arm was reached by `mustFlag[0]`, `mustFlag[1]` and `mustPass[1]`, the `node:process`
// module door by `mustFlag[2..7]`, and THE AMBIENT-GLOBAL ARM BY NOTHING AT ALL. The two bare rows keep their
// fixtures and now claim fail-closure, which is what they prove; `_proof/node-types.ts` plants `@types/node`'s
// real `declare module "node:process" { global { var process: NodeJS.Process } }` shape for the rows that
// claim the ambient verdict, and its lookalike twin pins the `globalName` comparison. Planting is the fix:
// widening `reference-fact-global.ts`'s trust rule to make a fixture resolve would weaken a real identity
// fence for test convenience.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readMemberReference, resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "../lib/reference-fact.ts";
import { originModuleSpecifier } from "../lib/sealed-origin.ts";
import { NODE_LOOKALIKE_HOME, NODE_TYPES_HOME, nodeLookalikeProof, nodeTypesProof } from "./_proof/node-types.ts";

const PROCESS_GLOBAL = "process";
const ENV_MEMBER = "env";
const OPERATION = "process-env-read";
/** The two authored spellings of node's own process door; the canonical origin reports the one it entered. */
const PROCESS_DOORS: readonly string[] = ["node:process", "process"];

const MESSAGE =
  "reads process.env outside foundation/env — env is the SOLE reader: import the frozen `env` and " +
  "dot-access a typed key (core/Tier-2-Foundation.md inv #1).";
const FIX = "import the frozen `env` from foundation/env and dot-access a typed key; foundation/env is the ONE place that touches process.env.";

/** Is this `env` member read taken off the real `process` — the ambient global or the `node:process` default
 *  export? Fail-closed on an unreadable receiver (a written or cyclic binding still HOLDS the identity); a
 *  member of a provably different declaration is not a subject. */
function readsProcessEnv(node: MorphNode): boolean {
  const global = resolveGlobalMemberOrigin(node);
  if (global.kind === "resolved") {
    return global.value.globalName === PROCESS_GLOBAL && global.value.memberPath.length === 1 && global.value.memberPath[0] === ENV_MEMBER;
  }
  const module = resolveModuleMemberOrigin(node);
  if (module.kind === "resolved") {
    const path = module.value.memberPath;
    return PROCESS_DOORS.includes(originModuleSpecifier(module.value)) && path.length === 1 && path[0] === ENV_MEMBER;
  }
  return classifyOriginRefusal(module.reason, node) === "unreadable";
}

/** Is this identifier the NAME of a destructuring binding element whose property is `env` — the one spelling
 *  that reaches the bag without a member read of it (`const { env } = process`)? */
function namesEnvBag(node: MorphNode): boolean {
  if (Node.isIdentifier(node)) {
    return destructuresEnv(node);
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && member.value.name === ENV_MEMBER;
}

/** Is this identifier the NAME of a destructuring binding element whose property is `env`? */
function destructuresEnv(node: MorphNode): boolean {
  const parent = node.getParent();
  if (parent === undefined || !Node.isBindingElement(parent) || parent.getNameNode() !== node) {
    return false;
  }
  const property = parent.getPropertyNameNode() ?? parent.getNameNode();
  if (Node.isIdentifier(property)) {
    return property.getText() === ENV_MEMBER;
  }
  return (Node.isStringLiteral(property) || Node.isNoSubstitutionTemplateLiteral(property)) && property.getLiteralText() === ENV_MEMBER;
}

/** The KEY this read asks for, when the syntax names one: `process.env.FOO`, `process.env["FOO"]`. A dynamic
 *  key and a read of the whole bag name none, and share the bare operation. A destructure names none either —
 *  it takes the whole bag. */
function readKey(node: MorphNode): string | undefined {
  const parent = node.getParent();
  if (parent === undefined || !(Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent))) {
    return;
  }
  if (parent.getExpression() !== node) {
    return;
  }
  const member = readMemberReference(parent);
  return member.kind === "resolved" ? member.value.name : undefined;
}

export const gate = defineGate({
  id: "sole-env-reader",
  family: "sole-env-reader",
  authority: "reviewed-grant",
  severity: "error",
  population: "@server",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const reads = new Map<string, { readonly node: MorphNode; readonly subject: string; readonly operation: string }>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression, SyntaxKind.Identifier],
          visit: (node, sourceFile: SourceFile) => {
            if (!(namesEnvBag(node) && readsProcessEnv(node))) {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            const key = readKey(node);
            const operation = key === undefined ? OPERATION : `${OPERATION}:${key}`;
            const identity = `${subject} ${operation}`;
            if (!reads.has(identity)) {
              reads.set(identity, { node, subject, operation });
            }
          },
        },
      ],
      evaluate: () => {
        for (const [, read] of [...reads].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(read.node, {
            subject: read.subject,
            operation: read.operation,
            message: `${MESSAGE} Read: ${read.operation} in ${read.subject}.`,
            fix: FIX,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/hub/x.ts": "export const x = process.env.SOME_VAR;\n" },
      expect: { count: 1, messageIncludes: "process-env-read:SOME_VAR" },
      why: "THE FAIL-CLOSED ARM, in the spelling that reaches it: an UNDECLARED `process` (no import, no ambient declaration in the workspace) resolves through NEITHER door, so `classifyOriginRefusal` calls it unreadable and the read is reported rather than admitted. The key still comes off the syntax, so the grant OPERATION survives a receiver the reader cannot name",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/hub/y.ts": 'export const x = process["env"].SOME_VAR;\n' },
      expect: { count: 1, messageIncludes: "process-env-read:SOME_VAR" },
      why: 'the same fail-closure through the bracket trick `process["env"]` the property-form biome rule can miss — an unreadable receiver is reported in BOTH spellings, and the AST backstop still normalizes them to one fact',
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/hub/door.ts": 'import process from "node:process";\nexport const x = process.env["OWNER_HANDLES"];\n' },
      expect: { count: 1, messageIncludes: "process-env-read:OWNER_HANDLES" },
      why: 'THE LIVE SPELLING: every reader on this tree imports `process` from `node:process`, which is a MODULE default export and not the ambient global. The legacy `getText() === "process"` test happened to pass it; the identity reader proves it',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/keys.ts":
          'import process from "node:process";\nexport const a = process.env["OWNER_HANDLES"];\nexport const b = process.env["OWNER_GROUP"];\n',
      },
      expect: { count: 2 },
      why: "TWO KEYS ARE TWO FINDINGS: the grant grain follows the READ, which is what preserves the legacy SANCTIONED_KEYS ledger's per-key ratchet for the sanctioned call-time reader",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/bag.ts":
          'import process from "node:process";\nexport const snapshot = { ...process.env };\nexport const parsed = JSON.stringify(process.env);\n',
      },
      expect: { count: 1, messageIncludes: "Read: process-env-read in" },
      why: "a read of the WHOLE BAG names no key, so both sites share the bare operation and dedupe per carrier — one grant row, not one per call site",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/dynamic.ts":
          'import process from "node:process";\nexport const pick = (key: string): string | undefined => process.env[key];\n',
      },
      expect: { count: 1, messageIncludes: "Read: process-env-read in" },
      why: "a DYNAMIC key names none either — it shares the bare operation rather than being dropped, so a computed read can never be silently unaccounted",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/destructured.ts": 'import process from "node:process";\nconst { env } = process;\nexport const x = env["SOME_VAR"];\n',
      },
      expect: { count: 1, messageIncludes: "Read: process-env-read in" },
      why: "the DESTRUCTURE SITE — the bag reached without ever writing `process.env`, which a member-read-only visitor cannot see at all. It takes the WHOLE bag, so it names no key and shares the bare operation",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/renamed-destructure.ts":
          'import process from "node:process";\nconst { env: bag } = process;\nexport const x = bag["SOME_VAR"];\n',
      },
      expect: { count: 1 },
      why: "the RENAMED destructure carries the property name on the binding element, not on the binding — the arm reads the property, so renaming the local is not an escape",
    },
    {
      mode: "types",
      files: {
        ...nodeTypesProof(),
        "packages/server/src/domain/hub/ambient.ts": "export const x = process.env.SOME_VAR;\n",
      },
      expect: { count: 1, messageIncludes: "process-env-read:SOME_VAR" },
      why: `THE AMBIENT GLOBAL, ACTUALLY RESOLVED: the same bare spelling as mustFlag[0] with node's real declaration planted at ${NODE_TYPES_HOME}, so the receiver binds to a TRUSTED \`declare var process\` inside a \`global\` augmentation and the read takes the PRECISE global arm instead of fail-closure. Without the plant this row is indistinguishable from the unreadable one — same count, same message (#2030)`,
    },
    {
      mode: "types",
      files: {
        ...nodeTypesProof(),
        "packages/server/src/domain/hub/ambient-bracket.ts": 'export const x = process["env"].SOME_VAR;\n',
      },
      expect: { count: 1, messageIncludes: "process-env-read:SOME_VAR" },
      why: "the bracket spelling of the RESOLVED ambient global — the element-access respelling reaches the same member of the same declaration, which is the claim `mustFlag[1]` could not make while the receiver bound to nothing",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/server/src/domain/hub/z.ts": "// process.env is only read in foundation/env (inv #1)\nexport const x = 1;\n" },
      why: "a process.env mention in a COMMENT — only real access nodes are read, which is the whole reason this AST backstop exists beside the lint rule",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/local.ts": 'const process = { env: { SOME_VAR: "x" } };\nexport const x = process.env.SOME_VAR;\n',
      },
      why: 'THE COUNTERFACTUAL — a LOCAL object named `process` is provably a different declaration, so its `env` is not the runtime\'s. The legacy `getText() === "process"` comparison red it, and deleting the origin resolution turns this row red again',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/frozen.ts": 'import { env } from "../../foundation/env/index.ts";\nexport const x = env.SOME_VAR;\n',
        "packages/server/src/foundation/env/index.ts": 'export const env = Object.freeze({ SOME_VAR: "x" });\n',
      },
      why: "THE SANCTIONED SHAPE — a consumer dot-accessing the frozen `env` object touches no `process` at all, which is the whole point of the invariant",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/hub/other-member.ts": 'import process from "node:process";\nexport const pid = process.pid;\n' },
      why: "a DIFFERENT member of the same `process` object passes — the invariant is about the environment bag, not about the process global",
    },
    {
      mode: "types",
      files: {
        ...nodeLookalikeProof(),
        "packages/server/src/domain/hub/lookalike.ts": "export const x = procezz.env.SOME_VAR;\n",
      },
      why: `THE NAME COMPARISON, PINNED: a SECOND trusted ambient global (${NODE_LOOKALIKE_HOME}) declaring the same \`env\` bag under a different name resolves to the PRECISE global arm and is still not a subject, because the arm compares the resolved \`globalName\` to \`process\`. Without this row the resolved branch would pass any ambient \`x.env.KEY\` the same way the legacy text comparison did`,
    },
  ],
});
