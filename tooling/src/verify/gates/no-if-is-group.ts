import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const IS_GROUP_REGEX = /^(?:isGroup|isGroupChat|isGroupMode|is_group)$/;

export const gate = defineGate({
  id: "no-if-is-group",
  family: "no-if-is-group",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@tooling", "@tests", "@scripts"],
    notUnder: ["tests/**", "scripts/**", "**/tests/**", "**/tools/**", "**/scripts/**"],
    notNamed: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"],
  },
  analysis: "syntax",
  execution: "selected-files",
  resources: [],
  message:
    "`isGroup`-style boolean branches on group-vs-solo identity — the design forbids it (solo is the degenerate case of group). Gate on the explicit COUNT of the room's characters, NO-OPing at one (so byte-identity holds). See Core-Laws-and-Precedents.md §7 D16 (unified group chat).",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.VariableDeclaration, SyntaxKind.Identifier],
        visit: (node) => {
          if (Node.isVariableDeclaration(node)) {
            if (IS_GROUP_REGEX.test(node.getName())) {
              ctx.report.node(node);
            }
          } else if (Node.isIdentifier(node) && IS_GROUP_REGEX.test(node.getText())) {
            const parent = node.getParent();
            if ((Node.isIfStatement(parent) && parent.getExpression() === node) || (Node.isConditionalExpression(parent) && parent.getCondition() === node)) {
              ctx.report.node(node);
            }
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      why: "const isGroup",
      files: { "packages/client/src/probe.ts": "const isGroup = true;\n" },
    },
    {
      mode: "source",
      why: "if (isGroup)",
      files: { "packages/client/src/probe.ts": "if (isGroup) { doSomething(); }\n" },
    },
    {
      mode: "source",
      why: "ternary isGroup",
      files: { "packages/client/src/probe.ts": "const x = isGroup ? a : b;\n" },
    },
    {
      mode: "source",
      why: "the spelling ban deliberately catches a shadowed local declaration",
      files: { "packages/server/src/probe.ts": "function local(): void { const isGroupChat = false; }\n" },
    },
  ],
  mustPass: [
    {
      mode: "source",
      why: "length > 1",
      files: { "packages/client/src/probe.ts": "if (speakers.length > 1) { doSomething(); }\n" },
    },
    {
      mode: "source",
      why: "tests exemption",
      files: {
        "packages/client/src/clean.ts": "export const clean = true;\n",
        "tests/client/foo.test.ts": "const isGroup = true;\n",
      },
    },
    {
      mode: "source",
      why: "DECLARED LIMIT: an isGroup property reached through member access is not a direct condition identifier",
      files: { "packages/client/src/probe.ts": "if (state.isGroup) { doSomething(); }\n" },
    },
    {
      mode: "source",
      why: "DECLARED LIMIT: a destructured isGroup binding pattern is outside the direct VariableDeclaration-name arm",
      files: { "packages/client/src/probe.ts": "const { isGroup } = state;\n" },
    },
  ],
});
