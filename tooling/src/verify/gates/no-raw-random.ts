// Policy: no-raw-random (Spine-Testing.md §3) — production draws entropy from an INJECTED seeded PRNG, the
// same seam tests pin, never from the ambient `Math.random`.
//
// IDENTITY, NOT SPELLING: the legacy check compared the callee's TEXT to `"Math.random"`, which a local
// `Math` shadow false-reds and an alias (`const rng = Math; rng.random()`), a computed-literal member
// (`Math["random"]()`) or a destructured global walks straight past. The subject is now the ambient `Math`
// the checker resolved from TypeScript's own lib declarations, read through the shared
// `readAmbientInvocation` reader this policy shares with `no-raw-clock`.
//
// THE SUBJECT IS THE CALL, not a reference to the function — preserved from the legacy reader deliberately.
// `prng: Math.random` (entry/compose, infra/providers/backends/kit/retry.ts, kit/macro) PASSES the ambient
// generator as the injected default rather than drawing from it, and widening onto those sites is a
// burn-down with its own decision to make, not a conversion. The limit is a `mustPass` row.
//
// AUTHORITY IS reviewed-grant: the composition root SEEDS the PRNG it injects into every tier, which is a
// recurring repository PERMISSION and one exact `(subject, operation)` row in the central table. THE
// CONVERSION FOUND TWO MORE DEAD ROWS, exactly as this gate's own 2026-08-22 header predicted for its
// predecessors: `packages/client/src/main.tsx` and `packages/kit/src/ids/` draw no ambient entropy on this
// tree at all (`kit/ids` mints through `nanoid`), so translating them would have minted two grants that are
// STALE on their first complete run. They are DELETED with a receipt rather than carried.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { AmbientSource } from "../lib/ambient-determinism.ts";
import { readAmbientInvocation } from "../lib/ambient-determinism.ts";
import { readMemberReference } from "../lib/reference-fact.ts";

const OPERATION = "ambient-entropy-draw";
const RANDOM_MEMBER = "random";

const AMBIENT_RANDOM: readonly AmbientSource[] = [{ globalName: "Math", memberPath: [RANDOM_MEMBER], token: "Math.random" }];

const MESSAGE =
  "ambient Math.random() — determinism: inject a seeded PRNG / the seeded id generator instead (the same " +
  "seam tests pin). (Spine-Testing.md §3, UI-Gates-and-Lessons.md §11.5)";
const FIX = "take an injected PRNG (the seeded generator threaded from the composition root) instead of drawing from the ambient `Math.random`.";

/** THE CANDIDATE PREFILTER (perf): a `random` MEMBER read normalizes every dotted/optional/computed
 *  spelling. A call through a bare local alias (`const random = Math.random; random()`) is outside it — a
 *  declared limit with its own row, and one the legacy text comparison shared. */
function randomCandidate(node: MorphNode): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return false;
  }
  const member = readMemberReference(callee);
  return member.kind === "resolved" && member.value.name === RANDOM_MEMBER;
}

export const gate = defineGate({
  id: "no-raw-random",
  family: "ambient-determinism",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@packages", "@tooling"], notNamed: ["*.test.*"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const draws = new Map<string, MorphNode>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile: SourceFile) => {
            if (!randomCandidate(node)) {
              return;
            }
            // FAIL-CLOSED on an unreadable callee; a callee that PROVABLY binds an injected PRNG passes.
            if (readAmbientInvocation(node, AMBIENT_RANDOM).kind === "other") {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            if (!draws.has(subject)) {
              draws.set(subject, node);
            }
          },
        },
      ],
      evaluate: () => {
        for (const [subject, node] of [...draws].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(node, { subject, operation: OPERATION, message: `${MESSAGE} Drawer: ${subject}.`, fix: FIX });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/logic.ts": "export function rollDice(): number {\n  return Math.random();\n}\n" },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/feature/logic.ts" },
      why: "the founding shape — an ambient draw on a production path, with the exact grant SUBJECT in the message",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/alias.ts": "const rng = Math;\nexport function rollDice(): number {\n  return rng.random();\n}\n" },
      expect: { count: 1 },
      why: "AN IMMUTABLE ALIAS of the global draws from the same generator — the legacy text comparison read `rng.random` and passed it",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/bracket.ts": 'export function rollDice(): number {\n  return Math["random"]();\n}\n' },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL spelling of the same member — a respelling the text comparison could not see at all",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/twice.ts":
          "export function a(): number {\n  return Math.random();\n}\nexport function b(): number {\n  return Math.random();\n}\n",
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two draws in one carrier are ONE finding, because a reviewed grant licenses one `(subject, operation)` and two matching findings make the row OVER-BROAD and license neither",
    },
    {
      mode: "types",
      files: { "tooling/src/instrument/roll.ts": "export function jitter(): number {\n  return Math.random();\n}\n" },
      expect: { count: 1 },
      why: "the tooling tree is IN this policy's population — unlike `no-raw-clock`, whose legacy predicate fenced tooling out because tools measure the real wall clock. The population difference between the two siblings is deliberate and this row pins it",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/injected.ts": "export function rollDice(prng: () => number): number {\n  return prng();\n}\n" },
      why: "THE SANCTIONED SHAPE — an injected PRNG call binds a parameter, so it is not a subject rather than being excused",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/shadow.ts": "const Math = {\n  random(): number {\n    return 0;\n  },\n};\nexport const draw = Math.random();\n",
      },
      why: "THE COUNTERFACTUAL — a LOCAL object named `Math` shadows the global entirely, so its `random()` is a different generator. The legacy text comparison red it; deleting the origin resolution turns this row red again",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/compose/pass-through.ts":
          "export function wire(make: (deps: { readonly prng: () => number }) => number): number {\n  return make({ prng: Math.random });\n}\n",
      },
      why: "DECLARED LIMIT, and the reason this policy's subject is the CALL: passing `Math.random` as an injected default is a REFERENCE, not a draw. Widening onto it would red `infra/providers/backends/kit/retry.ts` and three `kit/macro` seams at once — a burn-down with its own decision, not a conversion",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/const-alias.ts": "const random = Math.random;\nexport function rollDice(): number {\n  return random();\n}\n",
      },
      why: "DECLARED LIMIT — a bare local alias of the METHOD is outside the candidate prefilter, which is a `random` MEMBER read. The legacy text comparison missed this shape too, so it is a written baseline rather than a regression",
    },
  ],
});
