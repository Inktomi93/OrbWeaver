// Policy: no-mutating-register-api (client-architecture-lockdown.md §5 rule 1, §16 G8) — a function-valued
// declaration named exactly `register` is banned in client source, wherever it is declared. Side-effect
// registration reintroduces the import-order nondeterminism the assembled-at-the-door rule removes: what a
// registry contains then depends on which module happened to be imported first.
//
// SPLIT OUT OF `registry-assembly-at-door-only`, and the reason is POPULATION rather than taste. That
// policy's subject is "assembly outside the door", so its population subtracts `main.tsx` and every
// `compose/` module; this ban has no door at all — a mutating `register` API is illegal INSIDE the
// composition root too. Keeping both arms in one descriptor under the final contract would have silently
// blinded this one inside exactly the modules that do the most registering.
//
// THE SUBJECT IS THE NAME, deliberately: §5 rule 1 bans the mutating registration VOCABULARY, not one
// module's export. There is nothing to resolve — the finding is about a declaration this file authored, and
// its shape (a method, a function declaration, or a const bound to a function/arrow) is authored syntax.
//
// POPULATION PORT: `@client`, whole — deliberately WITHOUT the sibling's `main.tsx`/`compose/` subtraction,
// which is the entire reason for the split above (mustFlag[3] is that site). The `@client` root is itself a
// narrowing and is pinned by the `@server` mustPass row, which is the only row that dies without it.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const REGISTER = "register";

const MESSAGE =
  "a mutating `register()`-named function/method — side-effect registration is banned wherever it is " +
  "declared (client-architecture-lockdown.md §5 rule 1), because what a registry contains then depends on " +
  "import order. Export a definition VALUE and let the door assemble it.";
const FIX =
  "replace the register() API with an exported definition value assembled at the composition root (main.tsx or a compose/ module). A deliberate occurrence waives with `@orb-waive no-mutating-register-api(register): <reason + end condition>` — the reported position is always the literal text `register`, because the report passes that token explicitly at the declaration's own offset, never the enclosing object or variable.";

/** Function-VALUED declarations named exactly `register`, in every shape they can take. */
function isBannedRegisterDeclaration(node: MorphNode): boolean {
  if (Node.isMethodDeclaration(node) || Node.isFunctionDeclaration(node)) {
    return node.getName() === REGISTER;
  }
  if (!Node.isVariableDeclaration(node) || node.getName() !== REGISTER) {
    return false;
  }
  const initializer = node.getInitializer();
  return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer));
}

export const gate = defineGate({
  id: "no-mutating-register-api",
  family: "registry-assembly-at-door-only",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.MethodDeclaration, SyntaxKind.FunctionDeclaration, SyntaxKind.VariableDeclaration],
        visit: (node): void => {
          if (isBannedRegisterDeclaration(node)) {
            ctx.report.node(node, { token: REGISTER, offset: node.getText().indexOf(REGISTER), message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/lib/x.ts": "export const registry = {\n  register(id: string): void {\n    void id;\n  },\n};\n" },
      expect: { count: 1, token: REGISTER },
      why: "the founding shape — a mutating register() METHOD, the side-effect registration §5 rule 1 bans",
    },
    {
      mode: "source",
      files: { "packages/client/src/lib/fn.ts": "export function register(id: string): void {\n  void id;\n}\n" },
      expect: { count: 1, token: REGISTER },
      why: "the FUNCTION-DECLARATION spelling of the same API",
    },
    {
      mode: "source",
      files: { "packages/client/src/lib/arrow.ts": "export const register = (id: string): void => {\n  void id;\n};\n" },
      expect: { count: 1, token: REGISTER },
      why: "the CONST-BOUND ARROW spelling — a function value under another declaration kind",
    },
    {
      mode: "source",
      files: { "packages/client/src/main.tsx": "export const registry = {\n  register(id: string): void {\n    void id;\n  },\n};\n" },
      expect: { count: 1, token: REGISTER },
      why: "THE REASON THIS IS ITS OWN POLICY: the ban has no door. Inside `main.tsx` — subtracted from the sibling policy's population because assembly is legal there — a mutating register API is still illegal, and folding the two arms into one descriptor would have made exactly this site invisible",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/lib/value.ts": 'export const definition = { id: "a", title: "A" };\n' },
      why: "the fix: an exported definition VALUE the door assembles, with no mutating API at all",
    },
    {
      mode: "source",
      files: { "packages/client/src/lib/data.ts": 'export const register = { id: "a" };\n' },
      why: "a NON-FUNCTION binding that happens to be named `register` registers nothing — the ban is on the mutating API, and the declaration's value shape is what says which it is",
    },
    {
      mode: "source",
      files: { "packages/client/src/lib/other.ts": "export function registerAll(ids: readonly string[]): void {\n  void ids;\n}\n" },
      why: "a differently-named function is a different vocabulary — the rule names `register` exactly",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/lib/clean.ts": "export const clean = true;\n",
        "packages/server/src/domain/tool-use/registry.ts": "export function register(id: string): void {\n  void id;\n}\n",
      },
      why: "THE POPULATION FENCE, pinned: §5 rule 1 is a CLIENT assembly law, so the identical declaration in `@server` — where registries legitimately register at startup — is not a finding. Deleting the `@client` population leaves every other row green; this is the only row that dies without it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/lib/waived.ts":
          "// @orb-waive no-mutating-register-api(register): the proof's stand-in reason; ends when this fixture stops flagging.\nexport function register(id: string): void {\n  void id;\n}\n",
      },
      why: "POSITIONAL IDENTITY: the report passes the token `register` explicitly at the declaration's own offset, so an author waives the NAME — not the module and not the value it is bound to. The fixture is mustFlag[1] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
