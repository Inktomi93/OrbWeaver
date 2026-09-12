// A feature's DI bundle type must be a hand-written interface you can READ to learn the feature's deps —
// never reflected off a builder with `ReturnType<typeof makeCtx>`. Scoped to the one filename that carries
// that bundle (`context.ts`), which is why the population, not a path regex, fences it.
//
// The subject is the GLOBAL utility type `ReturnType`, resolved through the ambient-global reader. The
// legacy gate compared `node.getText() === "ReturnType"`, so a file that declared its OWN `ReturnType<T>`
// alias — or imported one — was RED for a name it owned, while nothing else changed.
//
// THREE ANSWERS: the ambient utility type is the finding; a symbol with a PROVEN declaration elsewhere is a
// different type and passes; a `ReturnType` the checker binds to nothing at all is REPORTED as unreadable
// (GATE-AUTHORING §5, #944).
//
// DECLARED LIMIT, with its own mustPass row: the policy judges the identifier's OWN resolved identity. A
// context.ts that reaches the utility type through another module's alias (`type Ctx = Reflected<typeof
// makeCtx>` where `Reflected<F> = ReturnType<F>` lives elsewhere) is not reported here — the reflection is
// authored in the OTHER file, and this policy's population is the context.ts bundle.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { resolveGlobalMemberOrigin } from "../lib/reference-fact.ts";

const UTILITY = "ReturnType";
const MESSAGE =
  "`ReturnType<>` in context.ts — the DI bundle type must be an explicit, hand-written interface (read it to know the feature's deps), never reflected off a builder. Write the interface. See Spine-TypeScript-and-Patterns.md §7.4.";
const UNREADABLE =
  "this `ReturnType` in a context.ts binds to no declaration the checker can name, so whether it is TypeScript's reflected utility type or a local one CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";

/** Does this identifier bind SOME declaration the checker can point at? A local alias, an imported type, a
 *  type parameter — any of them proves the identifier is not the ambient utility, which is the only
 *  identity the law bans. No declaration at all is the unreadable arm, never a pass. */
function bindsAnyDeclaration(node: Node): boolean {
  return (node.getSymbol()?.getDeclarations() ?? []).length > 0;
}

export const gate = defineGate({
  id: "no-context-returntype",
  family: "no-context-returntype",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], named: ["context.ts"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "write the DI bundle as an explicit exported interface listing each dependency.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Identifier],
        visit: (node): void => {
          if (!Node.isIdentifier(node) || node.getText() !== UTILITY) {
            return;
          }
          const origin = resolveGlobalMemberOrigin(node);
          if (origin.kind === "resolved") {
            if (origin.value.globalName === UTILITY && origin.value.memberPath.length === 0) {
              ctx.report.node(node, { token: UTILITY, offset: 0 });
            }
            return;
          }
          if (!bindsAnyDeclaration(node)) {
            ctx.report.node(node, { message: UNREADABLE, token: UTILITY, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/context.ts": "declare function makeCtx(): { db: number };\nexport type Ctx = ReturnType<typeof makeCtx>;\n",
      },
      expect: { count: 1, token: "ReturnType" },
      why: "the founding shape — the DI bundle reflected off its builder instead of written down",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/context.ts":
          "declare function makeCtx(): { db: number };\ndeclare function makeAux(): { log: number };\nexport type Ctx = ReturnType<typeof makeCtx>;\nexport type Aux = ReturnType<typeof makeAux>;\n",
      },
      expect: { count: 2 },
      why: "the verdict is per OCCURRENCE — two reflected bundles are two findings and two waiver positions",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/context.ts": "declare function makeCtx(): { db: number };\nexport const x: unknown = ReturnType;\n",
      },
      expect: { count: 1, token: "ReturnType", messageIncludes: "CANNOT be established" },
      why: "#1990/D1 — THE UNREADABLE ARM, PROVEN: `ReturnType` is only ever declared as a TYPE, so reading it in VALUE position binds no symbol at all — `identifier.getSymbol()` is undefined, so both `resolveGlobalMemberOrigin` and `bindsAnyDeclaration` (:30-32) refuse. Reported rather than passed (#944)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/client/src/features/chat/context.ts": "export interface Ctx {\n  db: number;\n}\n" },
      why: "the explicit interface this policy exists to drive traffic to",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/context.ts": "export interface Ctx {\n  db: number;\n}\n",
        "packages/client/src/features/chat/other.ts": "declare function makeCtx(): { db: number };\nexport type Reflected = ReturnType<typeof makeCtx>;\n",
      },
      why: "SCOPE: reflection outside a context.ts is not this law — the DI bundle is the subject, not the utility type. The context.ts beside it keeps the population non-empty, so this row proves the FENCE rather than an empty run",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/context.ts":
          "type ReturnType<F> = { reflected: F };\ndeclare function makeCtx(): { db: number };\nexport type Ctx = ReturnType<typeof makeCtx>;\n",
      },
      why: "A LOCAL SHADOW: a context.ts that declares its OWN `ReturnType` alias is not reflecting off a builder at all. The legacy text check RED'd both the declaration and the use; only the resolved global origin can tell them apart",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/reflect.ts": "export type ReturnType<F> = { reflected: F };\n",
        "packages/client/src/features/chat/context.ts":
          'import type { ReturnType } from "./reflect.ts";\ndeclare function makeCtx(): { db: number };\nexport type Ctx = ReturnType<typeof makeCtx>;\n',
      },
      why: "SAME NAME, IMPORTED: a project type named `ReturnType` is a proven declaration and not TypeScript's ambient utility — the identity, not the spelling, decides",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/reflect.ts": "export type Reflected<F extends () => unknown> = ReturnType<F>;\n",
        "packages/client/src/features/chat/context.ts":
          'import type { Reflected } from "./reflect.ts";\ndeclare function makeCtx(): { db: number };\nexport type Ctx = Reflected<typeof makeCtx>;\n',
      },
      why: "THE DECLARED LIMIT, written down: reflection reached through ANOTHER module's alias is not reported here. The `ReturnType` is authored in reflect.ts, which is outside this population; widening to chase alias chains would make the policy's subject the whole type graph rather than the DI bundle",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/context.ts":
          "declare function makeCtx(): { db: number };\n" +
          "// @orb-waive no-context-returntype(ReturnType): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export type Ctx = ReturnType<typeof makeCtx>;\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the IDENTIFIER itself and passes the utility name as the token, so the position is `ReturnType` rather than the alias `Ctx` it builds. The fixture is mustFlag[0] (:161, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes. The two-occurrence row beside it (mustFlag[1]) is deliberately NOT the base: two findings need two markers",
    },
  ],
});
