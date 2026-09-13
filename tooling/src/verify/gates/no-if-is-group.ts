// Gate: no-if-is-group (Core-Laws-and-Precedents.md §7 D16, unified group chat) — solo is the DEGENERATE
// case of group, so a boolean that splits the two is the branch the design forbids: the code must gate on
// the room's character COUNT and no-op at one, which is what keeps byte-identity between the two paths.
//
// TWO ARMS, ONE SUBJECT: the declaration of the boolean (VariableDeclaration named in the vocabulary) and
// its use AS A CONDITION (an Identifier that IS an `if` expression or a ternary condition). The second arm's
// parent test is a NARROWING — a member read (`state.isGroup`) and a destructured binding are declared
// limits, each with its own mustPass row, because the spelling ban is about code this file AUTHORED.
//
// FAMILY: a declared SINGLETON under its own id. The vocabulary is four spellings owned here; no sibling
// policy reads them and a regex over a name needs no shared `lib/` reader.
//
// POPULATION PORT: `@authored` minus every `tests`/`tools`/`scripts` DIRECTORY and every `*.test.*` /
// `*.spec.*` NAME. The declaration spelled the nine roots and then subtracted `tests/**` and
// `scripts/**` alongside `**/tests/**` and `**/scripts/**` — redundant, because this resolver's leading
// `**/` matches ZERO segments, so `**/tests/**` already excludes the root `tests/` tree. Both dead rows
// are gone and the admitted set was re-derived against the real tree before the change landed: 4,440 of
// 7,394 candidates under the old spelling and under the new, with a zero-length diff in both directions.
// LEGACY SHA: (45743d76d^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-if-is-group` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the conversion `45743d76d`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,006 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 4,252
// and final `population` admits 4,252. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/server/src/domain/regex/verbs/scripts/__cbbhr_out_bulk-remove.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const IS_GROUP_REGEX = /^(?:isGroup|isGroupChat|isGroupMode|is_group)$/;

export const gate = defineGate({
  id: "no-if-is-group",
  family: "no-if-is-group",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@authored"],
    notUnder: ["**/tests/**", "**/tools/**", "**/scripts/**"],
    notNamed: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"],
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    "`isGroup`-style boolean branches on group-vs-solo identity — the design forbids it (solo is the degenerate case of group). Gate on the explicit COUNT of the room's characters, NO-OPing at one (so byte-identity holds). See Core-Laws-and-Precedents.md §7 D16 (unified group chat).",
  fix: "gate on the room's character COUNT and no-op at one, instead of a group-vs-solo boolean. A foreign shape that must carry the spelling waives that occurrence with `@orb-waive no-if-is-group(<name>): <reason + end condition>`, where `<name>` is the BANNED SPELLING itself: both arms pass no token, so the sink derives the first identifier of the reported node's own text — the BINDING NAME for a declaration (never its initializer) and the condition identifier for an `if`/ternary.",
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
      expect: { count: 1, token: "isGroup" },
      why: "const isGroup",
      files: { "packages/client/src/probe.ts": "const isGroup = true;\n" },
    },
    {
      mode: "source",
      expect: { count: 1, token: "isGroup" },
      why: "if (isGroup)",
      files: { "packages/client/src/probe.ts": "if (isGroup) { doSomething(); }\n" },
    },
    {
      mode: "source",
      expect: { count: 1, token: "isGroup" },
      why: "ternary isGroup",
      files: { "packages/client/src/probe.ts": "const x = isGroup ? a : b;\n" },
    },
    {
      mode: "source",
      expect: { count: 1, token: "isGroupChat" },
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
      why: "EVERY EXCLUSION GLOB, pinned by a file only IT excludes — and separately is the whole point, because the fences OVERLAP on the obvious `tests/**/*.test.ts` fixture and a single file leaves each one individually unpinned (measured: with only that fixture, deleting the whole root exclusion left all nine rows green). One file per glob: the root `tests/` helper and the package-nested `tests/` directory (`**/tests/**` — its `**/` matches ZERO segments, which is why no separate root exclusion is needed), a package `tools/` module, a root script, and a package-local `*.test.ts` name that no directory glob would catch",
      files: {
        "packages/client/src/clean.ts": "export const clean = true;\n",
        "tests/client/support/helper.ts": "const isGroup = true;\nexport const h = isGroup;\n",
        "packages/client/src/features/x/probe.test.ts": "const isGroup = true;\nexport const p = isGroup;\n",
        "packages/server/src/domain/chat/tests/helper.ts": "const isGroupChat = true;\nexport const h = isGroupChat;\n",
        "packages/client/src/tools/codemod.ts": "const isGroupMode = true;\nexport const m = isGroupMode;\n",
        "scripts/dev/tool.ts": "const isGroupMode = true;\nexport const m = isGroupMode;\n",
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
    {
      mode: "source",
      files: {
        "packages/client/src/probe.ts":
          "// @orb-waive no-if-is-group(isGroup): the proof's stand-in reason; ends when this fixture stops flagging.\nconst isGroup = true;\n",
      },
      why: "POSITIONAL IDENTITY: the VariableDeclaration arm calls `ctx.report.node(node)` with no token, so the sink DERIVES the first identifier of the declaration's text — the BINDING NAME (`isGroup`), never the initializer. The fixture is mustFlag[0] (count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
  ],
});
