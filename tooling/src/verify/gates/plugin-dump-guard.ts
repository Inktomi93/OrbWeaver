// Gate: plugin-dump-guard — guest-controlled values in the QuickJS membrane cross `ctx.dump` only inside
// the canonical helper, and its iterative handle guard must precede the materialization. Other host-produced
// dump sites are outside this exact boundary.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

const PLUGIN_HOST_DIR = "packages/server/src/infra/plugin-host/";
const MEMBRANE = `${PLUGIN_HOST_DIR}membrane.ts`;
const GATE_SELF = "tooling/src/verify/gates/plugin-dump-guard.ts";
const HELPER = "tryDumpGuestValue";
let dumpSites = 0;

function isDumpCall(node: Node): node is CallExpression {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const callee = node.getExpression();
  if (callee.isKind(SyntaxKind.PropertyAccessExpression)) {
    return callee.getName() === "dump";
  }
  if (!callee.isKind(SyntaxKind.ElementAccessExpression)) {
    return false;
  }
  const key = callee.getArgumentExpression();
  return key?.isKind(SyntaxKind.StringLiteral) === true && key.getLiteralText() === "dump";
}

function isMembraneSource(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return normalized.endsWith(MEMBRANE) || normalized.endsWith(`${PLUGIN_HOST_DIR}__g_membrane.ts`);
}

function guardedHelperDump(node: CallExpression): boolean {
  const fn = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
  if (fn?.getName() !== HELPER) {
    return false;
  }
  const dumpCallee = node.getExpression();
  if (!dumpCallee.isKind(SyntaxKind.PropertyAccessExpression)) {
    return false;
  }
  const dumpHandle = node.getArguments()[0]?.getText();
  if (dumpHandle === undefined) {
    return false;
  }
  return fn.getDescendantsOfKind(SyntaxKind.IfStatement).some((statement) => {
    if (statement.getStart() >= node.getStart()) {
      return false;
    }
    const condition = statement.getExpression();
    if (!condition.isKind(SyntaxKind.PrefixUnaryExpression) || condition.getOperatorToken() !== SyntaxKind.ExclamationToken) {
      return false;
    }
    const guard = condition.getOperand();
    if (!guard.isKind(SyntaxKind.CallExpression)) {
      return false;
    }
    const guardCallee = guard.getExpression();
    const [guardContext, guardHandle] = guard.getArguments();
    const exitsOnUnsafe =
      statement.getThenStatement().isKind(SyntaxKind.ReturnStatement) ||
      statement.getThenStatement().getDescendantsOfKind(SyntaxKind.ReturnStatement).length > 0;
    return (
      exitsOnUnsafe &&
      guardCallee.isKind(SyntaxKind.Identifier) &&
      guardCallee.getText() === "handleSafeToDump" &&
      guardContext?.getText() === dumpCallee.getExpression().getText() &&
      guardHandle?.getText() === dumpHandle
    );
  });
}

export const gate: GateDescriptor = {
  name: "plugin-dump-guard",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Core-Path-Registry.md D46; plugin-host guest traversal boundary",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a QuickJS membrane `ctx.dump` can materialize guest-controlled recursive structure without first passing the iterative handle depth/node guard — host-stack overflow can corrupt the shared WASM runtime",
  fix: `route guest values through ${HELPER}; the helper must call handleSafeToDump before its one ctx.dump`,
  scanRoot: (path) => path.includes(PLUGIN_HOST_DIR),
  kinds: [SyntaxKind.CallExpression],
  begin: () => {
    dumpSites = 0;
  },
  visit: (node, sf, ctx) => {
    if (!(isMembraneSource(sf.getFilePath()) && isDumpCall(node))) {
      return;
    }
    dumpSites += 1;
    if (!guardedHelperDump(node)) {
      ctx.report(node, { token: "dump", offset: node.getText().indexOf("dump") });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind === "project" && fileLoaded(ctx, MEMBRANE) && dumpSites === 0) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: "plugin-dump-guard found zero membrane dump sites — the boundary moved or the gate is blind",
      });
    }
  },
  mustFlag: [
    {
      files: "function attachAsync(ctx: Ctx, handle: Handle) { return ctx.dump(handle); }\n",
      at: `${PLUGIN_HOST_DIR}membrane.ts`,
      expect: { count: 1, token: "dump" },
      why: "the founding bypass: an async argument is materialized directly with no iterative pre-walk",
    },
    {
      files:
        "function tryDumpGuestValue(ctx: Ctx, handle: Handle) { const value = ctx.dump(handle); if (!handleSafeToDump(ctx, handle)) return; return value; }\n",
      at: `${PLUGIN_HOST_DIR}membrane.ts`,
      expect: { count: 1, token: "dump" },
      why: "presence is not ordering — a guard after the dump cannot prevent host-stack traversal",
    },
    {
      files: "function tryDumpGuestValue(ctx: Ctx, handle: Handle) { handleSafeToDump(ctx, handle); return { ok: true, value: ctx.dump(handle) }; }\n",
      at: `${PLUGIN_HOST_DIR}membrane.ts`,
      expect: { count: 1, token: "dump" },
      why: "calling the guard and ignoring its false result does not guard the materialization",
    },
    {
      files:
        "function tryDumpGuestValue(ctx: Ctx, handle: Handle, other: Handle) { if (!handleSafeToDump(ctx, other)) return { ok: false }; return { ok: true, value: ctx.dump(handle) }; }\n",
      at: `${PLUGIN_HOST_DIR}membrane.ts`,
      expect: { count: 1, token: "dump" },
      why: "the guard and dump must judge the same handle through the same QuickJS context",
    },
  ],
  mustPass: [
    {
      files:
        "function tryDumpGuestValue(ctx: Ctx, handle: Handle) { if (!handleSafeToDump(ctx, handle)) return { ok: false }; return { ok: true, value: ctx.dump(handle) }; }\n",
      at: `${PLUGIN_HOST_DIR}membrane.ts`,
      why: "the one raw dump sits behind the canonical iterative guard in the same helper",
    },
    {
      files: "export function hostResult(ctx: Ctx, handle: Handle) { return ctx.dump(handle); }\n",
      at: `${PLUGIN_HOST_DIR}realm.ts`,
      why: "a dump outside the guest-input membrane file is a deliberate scope control",
    },
  ],
};
