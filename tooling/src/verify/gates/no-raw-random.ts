// Policy: no-raw-random (Spine-Testing.md §3) — production draws entropy from an INJECTED seeded PRNG, the
// same seam tests pin, never from the ambient `Math.random`.
//
// IDENTITY, NOT SPELLING: the legacy check compared the callee's TEXT to `"Math.random"`, which a local
// `Math` shadow false-reds while an alias (`const rng = Math; rng.random()`), a computed-literal member
// (`Math["random"]()`) and a DESTRUCTURED member (`const { random } = Math; random()`) all walk straight
// past. The subject is now the ambient `Math` the checker resolved from TypeScript's own lib declarations,
// read through the shared `readAmbientInvocation` reader this policy shares with `no-raw-clock`; each of
// those spellings carries a `mustFlag` row.
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
//
// FAMILY `ambient-determinism` — the shared reader is `lib/ambient-determinism.ts#readAmbientInvocation`,
// consumed identically by this policy and `no-raw-clock`; only the `AmbientSource` tuple differs, so the
// three-valued ambient verdict cannot drift between the generator and the clock.
// POPULATION PORT: intentional correction, stated — the legacy NEGATIVE fence is re-expressed as a POSITIVE
// root list. The legacy descriptor admitted everything EXCEPT `.test.` / `tests/` / `scripts/` / `tools/`
// (`9808b93c0^:38`); the final population is `{ in: ["@packages", "@tooling"], notNamed: ["*.test.*"] }`.
// `@tooling` is IN the list here and absent from `no-raw-clock`'s, which is exactly the legacy pair's own
// asymmetry (the clock's predicate fenced `tooling/` out because tools measure the real wall clock, this
// one never did) — the difference between the two siblings is deliberate and `mustFlag[4]` pins it. The two
// halves differ only where the legacy complement admitted a path outside `packages/*/src` and `tooling/src`.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { AmbientSource } from "../contract/ambient-determinism.ts";
import { defineGate } from "../contract/policy.ts";
import { readAmbientInvocation } from "../lib/ambient-determinism.ts";
import { readMemberReference } from "../lib/reference-fact.ts";

const OPERATION = "ambient-entropy-draw";
const RANDOM_MEMBER = "random";

const AMBIENT_RANDOM: readonly AmbientSource[] = [{ globalName: "Math", memberPath: [RANDOM_MEMBER], token: "Math.random" }];

const MESSAGE =
  "ambient Math.random() — determinism: inject a seeded PRNG / the seeded id generator instead (the same " +
  "seam tests pin). (Spine-Testing.md §3, UI-Gates-and-Lessons.md §11.5)";
const FIX = "take an injected PRNG (the seeded generator threaded from the composition root) instead of drawing from the ambient `Math.random`.";
/** THE FAIL-CLOSED THIRD ANSWER (#944), a SEPARATE text rather than a `${MESSAGE} …` suffix: the unreadable
 *  arm produces the SAME finding count as the ambient verdict and differs only in message, so a shared
 *  prefix leaves neither arm pinnable in either direction (guide §4.1). The two texts are disjoint. */
const UNREADABLE =
  "a call spelled like the ambient generator has a callee the shared readers cannot place, so whether it draws entropy from the runtime CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";

/** THE CANDIDATE PREFILTER (perf): two arms cover every spelling that reaches the ambient generator under
 *  the name `random` — a `random` MEMBER read (every dotted/optional/computed spelling) and a BARE
 *  `random()` call (the destructured `const { random } = Math` and the method alias
 *  `const random = Math.random`). The bare arm is one symbol hop per candidate; the whole 4,377-file
 *  population holds a handful of them. */
function randomCandidate(node: MorphNode): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  if (Node.isIdentifier(callee)) {
    return callee.getText() === RANDOM_MEMBER;
  }
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
  population: { in: ["@packages", "@tooling"], notNamed: ["*.test.*"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const draws = new Map<string, { readonly node: MorphNode; readonly unreadable: boolean }>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile: SourceFile) => {
            if (!randomCandidate(node)) {
              return;
            }
            // FAIL-CLOSED on an unreadable callee; a callee that PROVABLY binds an injected PRNG passes.
            const verdict = readAmbientInvocation(node, AMBIENT_RANDOM);
            if (verdict.kind === "other") {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            if (!draws.has(subject)) {
              draws.set(subject, { node, unreadable: verdict.kind === "unreadable" });
            }
          },
        },
      ],
      evaluate: () => {
        for (const [subject, found] of [...draws].toSorted(([left], [right]) => left.localeCompare(right))) {
          const message = found.unreadable ? `${UNREADABLE} Drawer: ${subject}.` : `${MESSAGE} Drawer: ${subject}.`;
          ctx.report.node(found.node, { subject, operation: OPERATION, message, fix: FIX });
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
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/const-alias.ts": "const random = Math.random;\nexport function rollDice(): number {\n  return random();\n}\n",
      },
      expect: { count: 1 },
      why: "a bare local alias of the METHOD — the BARE-CALL arm, which closes the spelling rather than declaring it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/destructured.ts": "const { random } = Math;\nexport function rollDice(): number {\n  return random();\n}\n",
      },
      expect: { count: 1 },
      why: "the DESTRUCTURED global — the shared global reader resolves a binding element to its receiver's member, so this is the same generator one binding later",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/opaque.ts":
          "declare function opaque(): any;\nexport function rollDice(): number {\n  return opaque().random();\n}\n",
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), reached by no declared row before #2041: the `random` member prefilter admits it, and off an OPAQUE `any`-typed receiver the leaf binds no declaration at all, so `classifyOriginRefusal` answers case (b) and the draw is REPORTED rather than passed on the strength of its spelling. It is the exact complement of the `shadow.ts` mustPass row — a LOCAL object's `random` is a proven different declaration and passes, no declaration at all is no evidence and fails closed. The `messageIncludes` is what separates them: the unreadable arm emits the SAME single finding as the ambient verdict",
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
  ],
});
