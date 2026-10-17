// Reviewed grants: suppressions.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_SUPPRESSIONS_B: readonly ReviewedGateGrant[] = [
  {
    id: "suppressions:source-lint-style-use-shorthand-function-type",
    policyId: "suppressions",
    subject: "lint/style/useShorthandFunctionType",
    operation: "source",
    why: "RULING — the shorthand `export type X = (…) => …` trips the house `no-inline-types` gate outside a contract home — two house rules collide and the gate wins (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 4 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/style/useShorthandFunctionType` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-suspicious-no-array-index-key",
    policyId: "suppressions",
    subject: "lint/suspicious/noArrayIndexKey",
    operation: "source",
    why: "RULING — positional identity — the index IS the row's identity in a snapshot nothing reorders mid-list (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 24 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noArrayIndexKey` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-suspicious-no-bitwise-operators",
    policyId: "suppressions",
    subject: "lint/suspicious/noBitwiseOperators",
    operation: "source",
    why: "RULING — byte codecs (PNG/CRC) are DEFINED in bitwise terms — the operators are the specification (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 22 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noBitwiseOperators` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-suspicious-no-control-characters-in-regex",
    policyId: "suppressions",
    subject: "lint/suspicious/noControlCharactersInRegex",
    operation: "source",
    why: "RULING — the regex exists to STRIP control characters — naming them is the function (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 2 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noControlCharactersInRegex` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-suspicious-no-explicit-any",
    policyId: "suppressions",
    subject: "lint/suspicious/noExplicitAny",
    operation: "source",
    why: "RULING — type-extraction-only instantiation of a vendor's own generic escape hatch — never a runtime value, never reaches app logic (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 15 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noExplicitAny` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-suspicious-no-template-curly-in-string",
    policyId: "suppressions",
    subject: "lint/suspicious/noTemplateCurlyInString",
    operation: "source",
    why: "TOOL FALSE POSITIVE — gate self-proof strings intentionally carry template-literal source text for the synthetic project to parse (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 9 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/suspicious/noTemplateCurlyInString` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-react-hooks-exhaustive-deps",
    policyId: "suppressions",
    subject: "react-hooks/exhaustive-deps",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the eslint twin of the value-keyed deps ruling above — same site, same reason (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 2 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `react-hooks/exhaustive-deps` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-react-you-might-not-need-an-effect-no-derived-state",
    policyId: "suppressions",
    subject: "react-you-might-not-need-an-effect/no-derived-state",
    operation: "source",
    why: "RULING — not derivable in render — it runs only once the bus echo CONFIRMS the row is gone from the roster (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `react-you-might-not-need-an-effect/no-derived-state` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-react-you-might-not-need-an-effect-no-external-store-subscription",
    policyId: "suppressions",
    subject: "react-you-might-not-need-an-effect/no-external-store-subscription",
    operation: "source",
    why: "RULING — the subscription drives an IMPERATIVE flush (jump the reveal cursor), not a state mirror (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `react-you-might-not-need-an-effect/no-external-store-subscription` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-ts-expect-error",
    policyId: "suppressions",
    subject: "@ts-expect-error",
    operation: "source",
    why: "RULING — probe-only compatibility seams intentionally import untyped JS or browser-virtual modules whose runtime shape is asserted immediately after the directive (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 5 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `@ts-expect-error` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-typescript-eslint-no-unnecessary-condition",
    policyId: "suppressions",
    subject: "@typescript-eslint/no-unnecessary-condition",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the lib type is wider than the runtime value (JSON.stringify(undefined) is `undefined` despite a `string` signature) (Carried VERBATIM from the legacy RATIFIED_RULES table at 65aa7f4743; 5 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `@typescript-eslint/no-unnecessary-condition` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:tests-lint-performance-no-namespace-import",
    policyId: "suppressions",
    subject: "lint/performance/noNamespaceImport",
    operation: "tests",
    why: 'RULING — the namespace object IS the value being passed, exactly as the source table\'s drizzle row already rules ("drizzle needs the whole schema module both as a value and as `typeof schema`"). `tests/support/node/db.ts:15`: "drizzle-kit\'s snapshot API takes the whole schema module as a Record — namespace import is the canonical way to pass every table." `tests/server/domain/assets/persistence/asset-refs.int.test.ts:15`: "the comparator\'s denominator IS every table the schema module exports." `tests/client/agent-nav/index.dom.test.ts:11`: "vi.spyOn needs the module namespace object to wrap the REAL exported action (the dispatch-proof this file exists for)." Named imports cannot express any of the three: two need the module as a Record, one needs the mutable binding object.',
    endsWhen:
      "drizzle-kit takes an explicit table list, the parity comparator derives its denominator from a generated manifest, and `vi.spyOn` is replaced by injection at the agent-nav seam.",
  },
  {
    id: "suppressions:tests-lint-style-no-process-env",
    policyId: "suppressions",
    subject: "lint/style/noProcessEnv",
    operation: "tests",
    why: "RULING — the test's SUBJECT is the env boundary — it crafts `process.env` to drive the sole env reader, or reads ONE opt-in gate flag for a hardware-gated suite; there is no other seam to drive (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 65aa7f4743; 32 live site(s) under governed tests at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed tests site under `lint/style/noProcessEnv` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:tests-lint-style-use-naming-convention",
    policyId: "suppressions",
    subject: "lint/style/useNamingConvention",
    operation: "tests",
    why: "RULING — the fixture mirrors an exact external or canonical serialized/protocol key (including wire fields, environment names, persisted JSON keys, and repo-owned discriminants); its snake_case or CONSTANT spelling is the format under test, so renaming forks the fixture from the contract.",
    endsWhen:
      "the ruling itself is reversed, or the last governed tests site under `lint/style/useNamingConvention` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:tests-lint-suspicious-no-bitwise-operators",
    policyId: "suppressions",
    subject: "lint/suspicious/noBitwiseOperators",
    operation: "tests",
    why: "RULING — specification-defined codecs, byte mutations, and bit masks (including POSIX permission masks) are written in the bitwise operators that define them; these fixtures exercise that exact representation.",
    endsWhen:
      "the ruling itself is reversed, or the last governed tests site under `lint/suspicious/noBitwiseOperators` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:tests-lint-suspicious-no-misplaced-assertion",
    policyId: "suppressions",
    subject: "lint/suspicious/noMisplacedAssertion",
    operation: "tests",
    why: 'RULING — this is the NAMED ASSERTION HELPER pattern, and the rule cannot see it. `tests/support/node/chat/assertions.ts:31,43,78` each state "named assertion helper — asserts for the calling test (satisfies requireAssertions)": three shared helpers whose whole purpose is to own one non-obvious assertion (static prompt-prefix drift, KV-cache poisoning, bus event ordering) for every caller. The rule flags an `expect` outside a `test` body, which is exactly what a shared helper is; inlining them would duplicate the assertion and its failure message across every call site.',
    endsWhen: "the shared chat assertions move behind a custom vitest matcher the rule recognises, or the helpers lose their callers.",
  },
  {
    id: "suppressions:tests-lint-suspicious-no-template-curly-in-string",
    policyId: "suppressions",
    subject: "lint/suspicious/noTemplateCurlyInString",
    operation: "tests",
    why: 'TOOL FALSE POSITIVE — the source table already rules this rule for "gate self-proof strings [that] intentionally carry template-literal source text for the synthetic project to parse", and both remaining test sites are that same shape. `tests/tooling/review-mirror/index.test.ts:64` is "the parser fixture\'s template source" and `:68` asserts the "expected source bytes, not a test interpolation". (The three former `split-arm-parity.test.ts` sites were retired with the legacy fixture suite at #2176 Phase F.)',
    endsWhen:
      "the gate and parser fixtures are authored as files rather than as embedded source strings, at which point the interpolation is real code and the rule stops firing.",
  },
  {
    id: "suppressions:tests-ts-expect-error",
    policyId: "suppressions",
    subject: "@ts-expect-error",
    operation: "tests",
    why: "RULING — a type-level NEGATIVE pin (`.test-d` and inline): the directive IS the assertion that the type refuses the shape, and tsc reds the day it stops; plus an untyped `.cjs` config import whose shape is asserted immediately after (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 65aa7f4743; 52 live site(s) under governed tests at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed tests site under `@ts-expect-error` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-style-use-consistent-method-signatures",
    policyId: "suppressions",
    subject: "lint/style/useConsistentMethodSignatures",
    operation: "source",
    why: "RULING — `platform.d.ts` AUGMENTS lib's `Map<K,V>`/`WeakMap<K,V>` with the V8 `getOrInsert`/`getOrInsertComputed` members. Every other member of those interfaces is method-style and therefore BIVARIANT; a property-style member merged in makes the whole interface invariant and revoked assignabilities the standard library grants (measured 2026-08-03: three real sites went red). The file header records the measurement. Admitted to this policy by work item 0036, which widened the population to the repo-root declarations.",
    endsWhen:
      "TypeScript's lib ships `getOrInsert`/`getOrInsertComputed` and the `platform.d.ts` blocks are deleted, or biome gains a bivariance-aware exemption for augmentations.",
  },
  {
    id: "suppressions:tests-useConsistentMethodSignatures",
    policyId: "suppressions",
    subject: "lint/style/useConsistentMethodSignatures",
    operation: "tests",
    why: "RULING — method-style signature keeps the parameter BIVARIANT, which is the only way `Element` satisfies a DOM-free structural interface without importing DOM types. The biome rule exists for consistency and is technically correct that the shape differs, but the bivariance is load-bearing (file header documents the reasoning).",
    endsWhen: "biome gains a bivariance-aware exemption for method signatures, or the hit-extent-walk interface stops needing bivariance.",
  },
];
