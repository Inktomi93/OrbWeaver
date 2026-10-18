// Policy: no-opaque-test-fixture (#1630, Spine-Testing.md §5) — a test FIXTURE module may not hand a test
// an `unknown`. A fixture's declared export type is the contract every downstream type obligation is
// checked against, so an export typed `unknown` deletes all of them at once and the test still compiles:
// the two rpg CT fixtures spelled `rpg.getGame` behind `: unknown` carried 1-of-6 `RpgStatProfile` fields
// and an unmintable `ruleset: "d20"`, and replacing them with a builder that parses through
// `rpgGameConfigSchema` turned three silent holes into `TS2741`/`TS2739`. Census + the 2.4 %-precision
// measurement that killed the name-keyed ast-grep alternative: 2026-09-05.
//
// ARMS — one subject, two authored positions, both EXPORTED:
//   · an exported function/arrow/function-expression whose RETURN type resolves to `unknown`;
//   · an exported `const`/`let` whose own type resolves to `unknown`.
//
// DECLARED LIMITS, each with its own mustPass row:
//   · NOT EXPORTED is not judged. A module-local helper's `unknown` cannot defeat a downstream obligation,
//     because nothing outside the module consumes it; the fixture's contract is what it hands out.
//   · `any` is not this policy's subject. It is a different defect with a different fix, and `unknown` is
//     the one the founding case used.
//   · A PARAMETER typed `unknown` is not judged: accepting an opaque input is how a parse-boundary helper
//     is supposed to be written, and narrowing happens inside.
//   · `Promise<unknown>` IS NOT UNWRAPPED, and that limit is MEASURED rather than assumed. The first draft
//     of this policy did unwrap one await, on the reasoning that it is the same defect one `await` away.
//     Run against the tree on 2026-09-19 that arm reported 23 findings, every one of them in
//     `tests/e2e/support/trpc.ts` and every one a MUTATION helper whose result the caller discards
//     (`updateSettingsSection`, `setGameFeatures`, …: `return trpcMutation(…)`, nothing reads the value).
//     Nothing downstream is typed against those returns, so no obligation is deleted and there is no defect
//     to catch — the arm's whole yield would have been 23 waivers, which is the "a new allowance parks
//     current debt" shape §4 forbids outright. A consumed `Promise<unknown>` is a real gap and this policy
//     states it rather than pretending otherwise; closing it needs a reader that can tell a discarded
//     result from a consumed one, which is a different subject.
//
// Native assertion rules judge cast expressions in maintained tests; they do not judge fixture export types.
// D325 exempts tooling only from value narrowing, not any, double or literal assertions. Explicit raw
// `as unknown` boundaries remain legal, so declared or inferred unknown exports still need this owner.
//
// FAMILY: singleton — native assertion rules share no declaration-output reader with this policy.
//
// POPULATION: new policy, no legacy predecessor. `@tests` fenced by `under` to the two homes a fixture
// module actually lives in — a `support/**` directory at any depth, and the `fixtures.ts` / `*.fixtures.ts`
// naming convention. `under` is used for BOTH halves rather than `under` + `named` because the resolver
// ANDs those two fences (`lib/population-resolver.ts:282-289`) and this scope is their UNION; `under`
// members are OR'd, and its globs are matched against the whole repo-relative path.
//
// RETIRED MARKERS: none — a new policy, no legacy owner and no marker census to port.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const MESSAGE =
  "a test fixture export is typed `unknown` — every downstream type obligation the fixture should have " +
  "carried is deleted at once, and the test still compiles (Spine-Testing.md §5). Return the real contract " +
  "type: a `satisfies` annotation, or the value a schema `parse` already gives you.";

const FIX =
  "declare the real type — parse through the owning zod schema and return its inferred type, or annotate " +
  "the literal with `satisfies <T>`. A genuine parse-boundary helper that must hand back an opaque value " +
  "waives that occurrence with `@orb-waive no-opaque-test-fixture(<position>): <reason + end condition>`, " +
  "where the position is the reported authored token: the type annotation's own leading slice when one is " +
  "written, and the declaration's NAME when the `unknown` is inferred.";

function outputAnnotation(node: MorphNode): MorphNode | undefined {
  if (Node.isFunctionDeclaration(node)) {
    return node.getReturnTypeNode();
  }
  if (!Node.isVariableDeclaration(node)) {
    throw new Error("native declaration output selected another declaration kind");
  }
  const initializer = node.getInitializer();
  return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
    ? initializer.getReturnTypeNode()
    : node.getTypeNode();
}

/** The node a finding anchors on and the exact authored slice it reports. The annotation is preferred —
 *  it is the thing to change — and the declaration NAME carries an INFERRED `unknown`, which has no
 *  annotation to point at. `waivableCoordinate` keeps a generic annotation (`Opaque<T>`) nameable by its
 *  paren-free head rather than emitting a token the waiver grammar refuses (#2107); `undefined` from it is
 *  a finding nobody could name, so the site is skipped rather than reported unwaivably. */
function anchorOf(declaration: MorphNode, annotation: MorphNode | undefined): { readonly node: MorphNode; readonly token: string } | undefined {
  const name = Node.isFunctionDeclaration(declaration) || Node.isVariableDeclaration(declaration) ? declaration.getNameNode() : undefined;
  const node = annotation ?? name;
  if (node === undefined) {
    return;
  }
  const token = waivableCoordinate(node.getText());
  return token === undefined ? undefined : { node, token };
}

export const gate = defineGate({
  id: "no-opaque-test-fixture",
  family: "no-opaque-test-fixture",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@tests"],
    under: ["**/support/**", "**/fixtures.ts", "**/fixtures.tsx", "**/*.fixtures.ts", "**/*.fixtures.tsx"],
  },
  // Native output meaning is required: aliases and inferred unknown cannot be judged by keyword matching.
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const declarations: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.VariableDeclaration],
          visit: (node): void => {
            if (!(Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node))) {
              return;
            }
            if (ctx.nativeTypes === undefined) {
              throw new Error("native declaration output context is unavailable");
            }
            declarations.push(node);
            ctx.nativeTypes.request({ kind: "declaration-outputs", nodes: [node] });
          },
        },
      ],
      evaluate: () => {
        if (ctx.nativeTypes === undefined) {
          throw new Error("native declaration output context is unavailable");
        }
        const outputs = ctx.nativeTypes.declarationOutputs(declarations);
        for (const declaration of declarations) {
          const output = outputs.get(declaration);
          if (output === undefined) {
            throw new Error("native declaration output is unavailable");
          }
          if (output === true) {
            const anchor = anchorOf(declaration, outputAnnotation(declaration));
            if (anchor !== undefined) {
              ctx.report.node(anchor.node, { token: anchor.token, offset: 0 });
            }
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "tests/client/features/rpg/fixtures.ts": 'export function makeGame(): unknown {\n  return { ruleset: "d20" };\n}\n',
      },
      expect: { count: 1, token: "unknown" },
      why: "THE FOUNDING SHAPE (#1630): a `fixtures.ts` helper whose declared return type is `unknown`. The two rpg CT fixtures were exactly this, and every field obligation on `RpgGameView` went with it — the test compiled against `unknown` and asserted nothing about the shape it was handed",
    },
    {
      mode: "types",
      files: {
        "tests/support/rpg.fixtures.ts": 'export const makeGame = (): unknown => ({ ruleset: "d20" });\n',
      },
      expect: { count: 1, token: "unknown" },
      why: "THE ARROW SPELLING of the same defect, in the OTHER population home. `export const f = (): unknown => …` reaches the verdict through the VariableDeclaration door rather than the FunctionDeclaration one, and a policy that subscribed to only the first would read this file clean",
    },
    {
      mode: "types",
      files: {
        "tests/client/features/rpg/fixtures.ts": 'export const GAME: unknown = { ruleset: "d20" };\n',
      },
      expect: { count: 1, token: "unknown" },
      why: "AN EXPORTED CONST annotated `unknown` — a fixture does not have to be a function to hand a test an opaque value, and the re-cut names this arm explicitly",
    },
    {
      mode: "types",
      files: {
        "tests/support/rpg.fixtures.ts": 'type Opaque = unknown;\nexport function makeGame(): Opaque {\n  return { ruleset: "d20" };\n}\n',
      },
      expect: { count: 1, token: "Opaque" },
      why: 'THE ALIAS, and the row that justifies `analysis: "types"` rather than a keyword match: `type Opaque = unknown` is the same contract written so a syntax reader cannot see it. The token is the AUTHORED annotation (`Opaque`), not the resolved type — a position must be an exact slice of the source',
    },
    {
      mode: "types",
      files: {
        "tests/support/rpg.fixtures.ts": 'export function makeGame() {\n  return JSON.parse("{}") as unknown;\n}\n',
      },
      expect: { count: 1, token: "makeGame" },
      why: "An inferred unknown has no return annotation, so the finding anchors on the declaration name. Native assertion rules permit an explicit as-unknown raw boundary; the exported opaque type remains this declaration owner's separate subject.",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tests/client/features/rpg/fixtures.ts":
          'interface Game {\n  readonly ruleset: string;\n}\nexport function makeGame(): Game {\n  return { ruleset: "d20" };\n}\n',
      },
      why: "THE PRESCRIBED FIX and the acquitting control: the same helper returning its real contract type. Without this row the policy is proven only where it accuses",
    },
    {
      mode: "types",
      files: {
        "tests/support/rpg.fixtures.ts":
          "function localMake(): unknown {\n  return {};\n}\nexport function makeGame(): string {\n  return String(localMake());\n}\n",
      },
      why: "THE EXPORTED-ONLY NARROWING, stated as a run: a module-LOCAL helper typed `unknown` cannot defeat a downstream obligation, because nothing outside the module consumes it and the export that does leave narrows it. Cut the `isExported()` tests in `subjectOfFunction`/`subjectOfVariable` and this row reds while every mustFlag row stays green — it is the only row that dies without that fence. (Note the shape it deliberately is NOT: `export const GAME = localMake()` INFERS `unknown` and flags, correctly — the leak is the export's own type, not the local helper's)",
    },
    {
      mode: "types",
      files: {
        "tests/support/rpg.fixtures.ts": "export function narrow(input: unknown): string {\n  return String(input);\n}\n",
      },
      why: "THE PARAMETER LIMIT: accepting an opaque INPUT is how a parse boundary is supposed to be written, and the narrowing happens inside. A reader that matched the `unknown` keyword anywhere in the signature would red this, which is the shape the fix text tells authors to write",
    },
    {
      mode: "types",
      files: {
        "tests/support/rpg.fixtures.ts": "export function makeGame(): any {\n  return {};\n}\n",
      },
      why: "THE `any` LIMIT: a different defect with a different fix, and not this policy's subject — the founding case used `unknown`. Stated as a row so the boundary is a baseline rather than an assumption",
    },
    {
      mode: "types",
      files: {
        "tests/e2e/support/trpc.ts": "export function updateSettingsSection(section: string): Promise<unknown> {\n  return Promise.resolve(section);\n}\n",
      },
      why: "THE `Promise<unknown>` LIMIT, carrying the bytes it was MEASURED on. Unwrapping one await was the first draft's arm; it reported 23 findings on the tree, all in this very file and all mutation helpers whose result the caller discards, so the arm bought 23 waivers and zero catches. This row is the baseline: make `isOpaque` unwrap a Promise again and it reds, which is the signal to go and re-derive the 23 before widening",
    },
    {
      mode: "types",
      files: {
        "tests/client/features/rpg/rpg-context-section.ct.tsx": "export function makeGame(): unknown {\n  return {};\n}\n",
        "tests/client/features/rpg/fixtures.ts": 'export function ok(): string {\n  return "";\n}\n',
      },
      why: "THE POPULATION FENCE, with its in-population anchor beside it (§3: an outside-only fixture refuses for emptiness and proves no fence). A `.ct.tsx` spec under `tests/` that is neither a `fixtures` module nor under a `support/` directory is not a fixture and is not judged — drop the `under` fence and this row reds while nothing else moves",
    },
    {
      mode: "types",
      files: {
        "tests/support/rpg.fixtures.ts":
          "// @orb-waive no-opaque-test-fixture(unknown): the proof stand-in reason; ends when this fixture stops flagging.\nexport function makeGame(): unknown {\n  return {};\n}\n",
      },
      why: "POSITIONAL IDENTITY: the reported token is the type ANNOTATION, so an author waives `unknown` — never the helper's name, and never the returned literal. The fixture is mustFlag[0]'s shape plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
