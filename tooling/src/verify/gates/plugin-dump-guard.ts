// Policy: plugin-dump-guard (Core-Path-Registry.md D46; the plugin-host guest-traversal boundary,
// docs/history/design/issue-712-gate-family.md) — guest-controlled values cross the QuickJS membrane only
// through the canonical helper, and that helper's ITERATIVE handle guard must run BEFORE the
// materialization. `ctx.dump` walks the guest structure on the HOST stack, so an unguarded deep object
// overflows it and corrupts the shared WASM runtime for every plugin in the process.
//
// AUTHORITY IS hard and the module is NOT split, which is a deliberate deviation from the census row
// ("split guarded-dump policy and subject-health"). That split existed because the two arms had different
// EXECUTION axes under the legacy runtime — a per-node report plus a whole-tree blindness claim — and the
// final contract gives one policy one execution. It does not need two policies: both arms are `hard` and
// `error`, and the blindness arm is not a finding at all any more. Zero measured dump sites is a
// POPULATION RECEIPT of zero, which the runtime refuses as a tool error, so "the boundary moved and the
// policy is blind" now fails the run instead of reporting a finding somebody could look at and shrug.
//
// IDENTITY, NOT SPELLING, on the two axes that matter:
//   * `ctx.dump` is the METHOD declared by the installed `quickjs-emscripten-core` package, read off the
//     receiver's TYPE. The legacy check accepted any property named `dump` on anything, so a host-side
//     `logger.dump(x)` inside the membrane would have been judged as a guest materialization.
//   * `handleSafeToDump` is the DECLARATION in the membrane's own module, so a same-named import from
//     somewhere else is not the guard this law means.
// The ordering/dominance analysis is unchanged: the guard must precede the dump statement in the same
// helper body, must be negated, must judge the SAME context and handle, and every unsafe path through its
// consequent must terminate.
import type { CallExpression, FunctionDeclaration, Node as MorphNode, SourceFile, Statement } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import { declaredByPackage, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";
import { quickjsLookalikeProof, quickjsProof } from "./_proof/quickjs.ts";

const PLUGIN_HOST_DIR = "packages/server/src/infra/plugin-host/";
const MEMBRANE = `${PLUGIN_HOST_DIR}membrane.ts`;
const HELPER = "tryDumpGuestValue";
const GUARD = "handleSafeToDump";
const QUICKJS_PACKAGE = "quickjs-emscripten-core";
const DUMP = "dump";
const DUMP_POPULATION = "membrane guest-dump sites";

const MESSAGE =
  "a QuickJS membrane `ctx.dump` can materialize guest-controlled recursive structure without first " +
  "passing the iterative handle depth/node guard — the walk runs on the HOST stack, so an overflow " +
  "corrupts the shared WASM runtime for every plugin in the process. See " +
  "docs/history/design/issue-712-gate-family.md";
const FIX = `route guest values through ${HELPER}; the helper must call ${GUARD} and RETURN on its false path before its one ctx.dump.`;

/** Is this call `<receiver>.dump(handle)` where `dump` is declared by the installed QuickJS package? */
function isGuestDumpCall(node: MorphNode): node is CallExpression {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const member = readMemberReference(node.getExpression());
  if (member.kind === "unresolved" || member.value.name !== DUMP) {
    return false;
  }
  const origin = resolveTypeMemberOrigin(node.getExpression());
  return origin.kind === "resolved" && declaredByPackage(origin.value.declarations, QUICKJS_PACKAGE);
}

/** Does every path through this statement terminate? (a return/throw, a block whose statements do, or an
 *  if/else whose BOTH arms do). */
function alwaysExits(node: MorphNode): boolean {
  if (Node.isReturnStatement(node) || Node.isThrowStatement(node)) {
    return true;
  }
  if (Node.isBlock(node)) {
    return node.getStatements().some(alwaysExits);
  }
  if (!Node.isIfStatement(node)) {
    return false;
  }
  const alternate = node.getElseStatement();
  return alternate !== undefined && alwaysExits(node.getThenStatement()) && alwaysExits(alternate);
}

/** The guard call inside `if (!<guard>(…)) …`, when that guard is the membrane's own declaration. */
function negatedGuardCall(statement: Statement, membrane: SourceFile): CallExpression | undefined {
  if (!Node.isIfStatement(statement)) {
    return;
  }
  const condition = statement.getExpression();
  if (!Node.isPrefixUnaryExpression(condition) || condition.getOperatorToken() !== SyntaxKind.ExclamationToken) {
    return;
  }
  const call = condition.getOperand();
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  const declarations = Node.isIdentifier(callee) ? (callee.getSymbol()?.getDeclarations() ?? []) : [];
  const declared = declarations.some(
    (declaration) =>
      Node.isFunctionDeclaration(declaration) && declaration.getName() === GUARD && declaration.getSourceFile().compilerNode === membrane.compilerNode,
  );
  return declared ? call : undefined;
}

/** The statement of `body` that contains `node`. */
function owningStatement(body: MorphNode, node: MorphNode): Statement | undefined {
  return Node.isBlock(body)
    ? body.getStatements().find((statement) => statement.getStart() <= node.getStart() && statement.getEnd() >= node.getEnd())
    : undefined;
}

/** Is this dump the ONE materialization inside the canonical helper, dominated by its own handle guard? */
function guardedHelperDump(node: CallExpression, membrane: SourceFile): boolean {
  const fn: FunctionDeclaration | undefined = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
  if (fn?.getName() !== HELPER) {
    return false;
  }
  const dumpCallee = node.getExpression();
  const dumpHandle = node.getArguments()[0]?.getText();
  const body = fn.getBody();
  const dumpStatement = body === undefined || dumpHandle === undefined ? undefined : owningStatement(body, node);
  if (body === undefined || dumpHandle === undefined || dumpStatement === undefined || !Node.isPropertyAccessExpression(dumpCallee)) {
    return false;
  }
  return Node.isBlock(body)
    ? body.getStatements().some((statement) => {
        const guard = statement.getStart() < dumpStatement.getStart() ? negatedGuardCall(statement, membrane) : undefined;
        const [guardContext, guardHandle] = guard?.getArguments() ?? [];
        return (
          guard !== undefined &&
          Node.isIfStatement(statement) &&
          alwaysExits(statement.getThenStatement()) &&
          guardContext?.getText() === dumpCallee.getExpression().getText() &&
          guardHandle?.getText() === dumpHandle
        );
      })
    : false;
}

export const gate = defineGate({
  id: "plugin-dump-guard",
  family: "plugin-dump-guard",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: [`${PLUGIN_HOST_DIR}**`] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    let dumpSites = 0;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            const membrane = ctx.files.find((file) => ctx.relativePath(file) === MEMBRANE);
            if (membrane === undefined || sourceFile.compilerNode !== membrane.compilerNode || !isGuestDumpCall(node)) {
              return;
            }
            dumpSites += 1;
            if (!guardedHelperDump(node, membrane)) {
              ctx.report.node(node, { token: DUMP, offset: node.getText().indexOf(DUMP), message: MESSAGE, fix: FIX });
            }
          },
        },
      ],
      evaluate: (): void => {
        // THE BLINDNESS ARM, as a receipt rather than a finding: zero measured guest-dump sites means the
        // boundary moved (or the membrane is gone) and this policy is judging nothing. The runtime refuses
        // a zero-member population receipt, so the run fails instead of reporting a clean pass.
        ctx.receipt({ kind: "population", source: DUMP_POPULATION, members: dumpSites, unresolved: 0 });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "export function attachAsync(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n  return ctx.dump(handle);\n}\n",
      },
      expect: { count: 1, token: DUMP },
      why: "the founding bypass: a guest handle materialized directly, with no iterative pre-walk at all",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "declare function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean;\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
          "  const value = ctx.dump(handle);\n  if (!handleSafeToDump(ctx, handle)) {\n    return;\n  }\n  return value;\n}\n",
      },
      expect: { count: 1, token: DUMP },
      why: "PRESENCE IS NOT ORDERING — a guard after the dump cannot prevent the host-stack traversal that already happened",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
          "  handleSafeToDump(ctx, handle);\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
      },
      expect: { count: 1, token: DUMP },
      why: "calling the guard and IGNORING its false result does not guard the materialization",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle, other: QuickJSHandle): unknown {\n" +
          "  if (!handleSafeToDump(ctx, other)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
      },
      expect: { count: 1, token: DUMP },
      why: "the guard and the dump must judge the SAME handle through the SAME QuickJS context",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle, debug: boolean): unknown {\n" +
          "  if (!handleSafeToDump(ctx, handle)) {\n    if (debug) {\n      return { ok: false };\n    }\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
      },
      expect: { count: 1, token: DUMP },
      why: "a NESTED conditional return exits only one unsafe path; every false-guard path must terminate before the dump",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          'import { handleSafeToDump } from "./guards.ts";\n' +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
          "  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
        [`${PLUGIN_HOST_DIR}guards.ts`]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\nexport function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n',
      },
      expect: { count: 1, token: DUMP },
      why: "THE COUNTERFACTUAL ON THE GUARD: a same-named function IMPORTED from another module is not the membrane's own iterative walk. The legacy check compared the callee's text and accepted any of them",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
          "  if (handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
      },
      expect: { count: 1, token: DUMP },
      why:
        "AN INVERTED GUARD: the condition is NOT negated, so the guard's TRUE (safe) branch exits and the " +
        "dump runs only when the guard says UNSAFE — backwards protection. `negatedGuardCall` requires a " +
        "`!`-prefixed condition, so this shape is never recognized as a guard and the dump still reports",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "export function otherHelper(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
          "  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
      },
      expect: { count: 1, token: DUMP },
      why:
        "A GUARDED DUMP IN A NON-CANONICAL HELPER: the guard is correctly negated and dominates the dump, " +
        "but the dump sits in a function other than `tryDumpGuestValue` — `guardedHelperDump` trusts only " +
        "that one declared home, so a well-formed local guard in a differently-named helper still reports",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
          "  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
      },
      why: "the live shape: the one raw dump sits behind the canonical iterative guard in the same helper",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "declare function note(): void;\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle, debug: boolean): unknown {\n" +
          "  if (!handleSafeToDump(ctx, handle)) {\n    if (debug) {\n      note();\n    }\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
      },
      why: "nested diagnostics are legal while the unsafe branch still exits UNCONDITIONALLY before the materialization",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
          "  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n",
        [`${PLUGIN_HOST_DIR}realm.ts`]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\nexport function hostResult(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n  return ctx.dump(handle);\n}\n',
      },
      why: "a dump OUTSIDE the guest-input membrane is a deliberate scope control — realm.ts materializes host-produced values, which is a different boundary",
    },
    {
      mode: "types",
      files: {
        ...quickjsProof(),
        ...quickjsLookalikeProof(),
        [MEMBRANE]:
          'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
          'import type { QuickJSContext as Other } from "not-quickjs";\n' +
          "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx !== null && handle.alive;\n}\n" +
          "export function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
          "  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n" +
          "export function log(other: Other, handle: QuickJSHandle): unknown {\n  return other.dump(handle);\n}\n",
      },
      why: "THE COUNTERFACTUAL ON THE DUMP: a same-named `dump` member declared by a DIFFERENT package, called inside the membrane itself. The legacy check accepted any property named `dump` on anything, so a host-side logger in this file would have been judged as a guest materialization",
    },
  ],
});
