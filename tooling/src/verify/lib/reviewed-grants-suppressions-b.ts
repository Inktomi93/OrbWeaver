// Reviewed grants: suppressions.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_SUPPRESSIONS_B: readonly ReviewedGateGrant[] = [
      {
        id: "suppressions:source-lint-style-use-shorthand-function-type",
        policyId: "suppressions",
        subject: "lint/style/useShorthandFunctionType",
        operation: "source",
        why: "RULING — the shorthand `export type X = (…) => …` trips the house `no-inline-types` gate outside a contract home — two house rules collide and the gate wins (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 4 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `lint/style/useShorthandFunctionType` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-lint-suspicious-no-array-index-key",
        policyId: "suppressions",
        subject: "lint/suspicious/noArrayIndexKey",
        operation: "source",
        why: "RULING — positional identity — the index IS the row's identity in a snapshot nothing reorders mid-list (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 24 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noArrayIndexKey` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-lint-suspicious-no-bitwise-operators",
        policyId: "suppressions",
        subject: "lint/suspicious/noBitwiseOperators",
        operation: "source",
        why: "RULING — byte codecs (PNG/CRC) are DEFINED in bitwise terms — the operators are the specification (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 22 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noBitwiseOperators` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-lint-suspicious-no-control-characters-in-regex",
        policyId: "suppressions",
        subject: "lint/suspicious/noControlCharactersInRegex",
        operation: "source",
        why: "RULING — the regex exists to STRIP control characters — naming them is the function (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 2 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noControlCharactersInRegex` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-lint-suspicious-no-deprecated-imports",
        policyId: "suppressions",
        subject: "lint/suspicious/noDeprecatedImports",
        operation: "source",
        why: "RULING — the vendor deprecates an overload we do not use; the supported form is what the call site spells (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 10 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noDeprecatedImports` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-lint-suspicious-no-explicit-any",
        policyId: "suppressions",
        subject: "lint/suspicious/noExplicitAny",
        operation: "source",
        why: "RULING — type-extraction-only instantiation of a vendor's own generic escape hatch — never a runtime value, never reaches app logic (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 15 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `lint/suspicious/noExplicitAny` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-lint-suspicious-no-template-curly-in-string",
        policyId: "suppressions",
        subject: "lint/suspicious/noTemplateCurlyInString",
        operation: "source",
        why: "TOOL FALSE POSITIVE — gate self-proof strings intentionally carry template-literal source text for the synthetic project to parse (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 9 live site(s) under governed source at conversion.)",
        endsWhen:
          "the analyzer stops mis-reading this shape — an upgrade whose `lint/suspicious/noTemplateCurlyInString` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-lint-suspicious-no-unnecessary-conditions",
        policyId: "suppressions",
        subject: "lint/suspicious/noUnnecessaryConditions",
        operation: "source",
        why: "TOOL FALSE POSITIVE — biome's type service cannot see through the cross-package zod-union inference, so a live runtime branch reads as unreachable (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 19 live site(s) under governed source at conversion.)",
        endsWhen:
          "the analyzer stops mis-reading this shape — an upgrade whose `lint/suspicious/noUnnecessaryConditions` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-lint-suspicious-use-await",
        policyId: "suppressions",
        subject: "lint/suspicious/useAwait",
        operation: "source",
        why: "RULING — a buffered replay generator has nothing to await but must remain async to implement the AsyncIterable contract (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `lint/suspicious/useAwait` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-react-hooks-exhaustive-deps",
        policyId: "suppressions",
        subject: "react-hooks/exhaustive-deps",
        operation: "source",
        why: "TOOL FALSE POSITIVE — the eslint twin of the value-keyed deps ruling above — same site, same reason (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 2 live site(s) under governed source at conversion.)",
        endsWhen:
          "the analyzer stops mis-reading this shape — an upgrade whose `react-hooks/exhaustive-deps` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-react-you-might-not-need-an-effect-no-derived-state",
        policyId: "suppressions",
        subject: "react-you-might-not-need-an-effect/no-derived-state",
        operation: "source",
        why: "RULING — not derivable in render — it runs only once the bus echo CONFIRMS the row is gone from the roster (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `react-you-might-not-need-an-effect/no-derived-state` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-react-you-might-not-need-an-effect-no-external-store-subscription",
        policyId: "suppressions",
        subject: "react-you-might-not-need-an-effect/no-external-store-subscription",
        operation: "source",
        why: "RULING — the subscription drives an IMPERATIVE flush (jump the reveal cursor), not a state mirror (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `react-you-might-not-need-an-effect/no-external-store-subscription` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-ts-expect-error",
        policyId: "suppressions",
        subject: "@ts-expect-error",
        operation: "source",
        why: "RULING — probe-only compatibility seams intentionally import untyped JS or browser-virtual modules whose runtime shape is asserted immediately after the directive (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 5 live site(s) under governed source at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed source site under `@ts-expect-error` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:source-typescript-eslint-no-unnecessary-condition",
        policyId: "suppressions",
        subject: "@typescript-eslint/no-unnecessary-condition",
        operation: "source",
        why: "TOOL FALSE POSITIVE — the lib type is wider than the runtime value (JSON.stringify(undefined) is `undefined` despite a `string` signature) (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 5 live site(s) under governed source at conversion.)",
        endsWhen:
          "the analyzer stops mis-reading this shape — an upgrade whose `@typescript-eslint/no-unnecessary-condition` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:tests-format",
        policyId: "suppressions",
        subject: "format",
        operation: "tests",
        why: 'RULING — the same one-line-blob ruling the source table already carries, in its test form: `tests/server/domain/export/_support.ts:28` states "keep the blob on one line so the noSecrets suppression attaches to it", and a formatter wrap would move the base64 avatar onto lines the SECOND suppression no longer covers. Unratified before 2026-09-12 only because RATIFIED_TEST_RULES was never extended, never because anyone judged it debt.',
        endsWhen:
          "the export fixture stops embedding a base64 blob, or the formatter stops wrapping it; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:tests-lint-correctness-no-process-global",
        policyId: "suppressions",
        subject: "lint/correctness/noProcessGlobal",
        operation: "tests",
        why: "RULING — a `vi.hoisted` setup body runs before the file's own `node:process` import binds, so the global is the only handle the hoisted setup has (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 02382639e; 5 live site(s) under governed tests at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed tests site under `lint/correctness/noProcessGlobal` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:tests-lint-correctness-use-unique-element-ids",
        policyId: "suppressions",
        subject: "lint/correctness/useUniqueElementIds",
        operation: "tests",
        why: "RULING — the test's SUBJECT is the id itself. `tests/client/a11y/accessible-name-quality.suite.ct.tsx:130`: \"a FIXED id is the point — this one mount pins the describedby target the probe must strip; a `useId` value would be unwritable in the sibling's attribute.\" The rule exists to stop a component minting a colliding id; a single-mount a11y probe asserting an `aria-describedby` relationship has to spell both halves.",
        endsWhen: "the accessible-name probe drives its describedby target through a `useId` handle the sibling attribute can read, or the arm is deleted.",
      },
      {
        id: "suppressions:tests-lint-nursery-no-playwright-wait-for-timeout",
        policyId: "suppressions",
        subject: "lint/nursery/noPlaywrightWaitForTimeout",
        operation: "tests",
        why: 'RULING, and the one with a MEASUREMENT behind it — the source table already rules this rule for probe/golden harnesses that "deliberately observe a bounded time window"; these four are the same shape where THERE IS NO STATE TO WAIT FOR, so the rule\'s premise (a readiness guess) does not hold. `tests/ui/code-editor/code-editor.ct.tsx:256`: "inverted premise — this wait is what REMOVES the flake (4/20 red without it, 0/40 with it), and CM6 exposes no state to wait FOR at `timestamp + interactionDelay`". `tests/ui/primitives/message-list/message-list.ct.tsx:537`: "the sampling interval of a stability trace — there is no state to wait FOR, the absence of movement is the assertion." `tests/client/lib/motion-flaggers.ct.tsx:527`: "this negative control must leave enough wall time for forbidden observer work to occur"; `:552`: "Chrome tracing has no DOM condition; the plant owns a fixed 250ms block inside this capture interval." Deleting any of the four would delete the assertion, not the wait.',
        endsWhen:
          "CodeMirror 6 exposes an observable post-interaction state, the stability traces move to a rendered settle signal, and the tracing control gains a DOM condition — at which point every site converts to a barrier and this row is consumed zero times.",
      },
      {
        id: "suppressions:tests-lint-nursery-use-nullish-coalescing",
        policyId: "suppressions",
        subject: "lint/nursery/useNullishCoalescing",
        operation: "tests",
        why: "TOOL FALSE POSITIVE, in the same family as the source table's own `useNullishCoalescing` row — `??` is not equivalent to the ternary these sites spell. `tests/server/domain/chat/_support.ts:158` and `tests/server/domain/stats/_support.ts:87` both read \"an EXPLICIT null IS the husk (the whole opt-in), and `??` would coalesce it back into the claimed default — only an OMITTED field may fall through.\" The predicate is `=== undefined`, deliberately narrower than `??`'s null-or-undefined, because a seeded explicit `null` is a value the fixture means.",
        endsWhen: "the seed helpers stop distinguishing an explicit `null` from an omitted field (the husk opt-in is expressed some other way).",
      },
      {
        id: "suppressions:tests-lint-performance-no-namespace-import",
        policyId: "suppressions",
        subject: "lint/performance/noNamespaceImport",
        operation: "tests",
        why: 'RULING — the namespace object IS the value being passed, exactly as the source table\'s drizzle row already rules ("drizzle needs the whole schema module both as a value and as `typeof schema`"). `tests/support/db.ts:15`: "drizzle-kit\'s snapshot API takes the whole schema module as a Record — namespace import is the canonical way to pass every table." `tests/server/domain/assets/persistence/asset-refs.int.test.ts:15`: "the comparator\'s denominator IS every table the schema module exports." `tests/client/agent-nav/index.dom.test.ts:11`: "vi.spyOn needs the module namespace object to wrap the REAL exported action (the dispatch-proof this file exists for)." Named imports cannot express any of the three: two need the module as a Record, one needs the mutable binding object.',
        endsWhen:
          "drizzle-kit takes an explicit table list, the parity comparator derives its denominator from a generated manifest, and `vi.spyOn` is replaced by injection at the agent-nav seam.",
      },
      {
        id: "suppressions:tests-lint-style-no-non-null-assertion",
        policyId: "suppressions",
        subject: "lint/style/noNonNullAssertion",
        operation: "tests",
        why: 'RULING — the assertion states what the LINE ABOVE proved, which is verbatim the source table\'s own ruling for this rule ("the index is bound-proved one line above; the assertion states what the loop guarantees"). One live site after the 2026-09-12 burn-down: `tests/server/domain/rpg/contract/service.int.test.ts:46`, "asserted non-null above", where the mutation-rejection arm reaches through a shape a preceding assertion already pinned. THE OTHER THREE SITES IN THIS CLASS WERE FIXED, NOT GRANTED — `tests/server/domain/chat/wire-capture-fidelity.suite.int.test.ts:275,289,313` claimed "the backend always implements runChatTurn", which is a claim about the runtime the type deliberately does not make; they now go through a `requireRunChatTurn` guard that throws by name.',
        endsWhen: "the rpg contract suite reaches its mutation target through a narrowed handle rather than re-asserting a proved shape.",
      },
      {
        id: "suppressions:tests-lint-style-no-process-env",
        policyId: "suppressions",
        subject: "lint/style/noProcessEnv",
        operation: "tests",
        why: "RULING — the test's SUBJECT is the env boundary — it crafts `process.env` to drive the sole env reader, or reads ONE opt-in gate flag for a hardware-gated suite; there is no other seam to drive (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 02382639e; 32 live site(s) under governed tests at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed tests site under `lint/style/noProcessEnv` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:tests-lint-style-use-naming-convention",
        policyId: "suppressions",
        subject: "lint/style/useNamingConvention",
        operation: "tests",
        why: "RULING — the fixture mirrors a FOREIGN wire (ST cards/chats/settings, OpenAI-compatible bodies, OIDC claims, SDK frames, env keys) — the snake_case/CONSTANT key IS the format under test; renaming forks the fixture from the wire (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 02382639e; 119 live site(s) under governed tests at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed tests site under `lint/style/useNamingConvention` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:tests-lint-style-use-throw-only-error",
        policyId: "suppressions",
        subject: "lint/style/useThrowOnlyError",
        operation: "tests",
        why: "RULING — a DEPENDENCY's non-Error throw is the test's SUBJECT — the arm proves the app's error path (policied 500, request id, ring entry) holds when foreign code throws a string; our own code obeys the rule and the fixture is the instrument, never a value the code under test owns (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 02382639e; 1 live site(s) under governed tests at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed tests site under `lint/style/useThrowOnlyError` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:tests-lint-suspicious-no-bitwise-operators",
        policyId: "suppressions",
        subject: "lint/suspicious/noBitwiseOperators",
        operation: "tests",
        why: "RULING — an INDEPENDENT reference codec (a textbook CRC-32, hand-crafted zip/PNG bytes) written in the operators that define it — the test proves the shipped codec against a second implementation (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 02382639e; 6 live site(s) under governed tests at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed tests site under `lint/suspicious/noBitwiseOperators` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:tests-lint-suspicious-no-explicit-any",
        policyId: "suppressions",
        subject: "lint/suspicious/noExplicitAny",
        operation: "tests",
        why: "RULING — deliberately off-schema / hostile input pushed PAST the wire type to prove the runtime boundary refuses it — the `any` is the test's instrument, never a value the code under test owns (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 02382639e; 29 live site(s) under governed tests at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed tests site under `lint/suspicious/noExplicitAny` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
      },
      {
        id: "suppressions:tests-lint-suspicious-no-misplaced-assertion",
        policyId: "suppressions",
        subject: "lint/suspicious/noMisplacedAssertion",
        operation: "tests",
        why: 'RULING — this is the NAMED ASSERTION HELPER pattern, and the rule cannot see it. `tests/support/chat/assertions.ts:31,43,78` each state "named assertion helper — asserts for the calling test (satisfies requireAssertions)": three shared helpers whose whole purpose is to own one non-obvious assertion (static prompt-prefix drift, KV-cache poisoning, bus event ordering) for every caller. The rule flags an `expect` outside a `test` body, which is exactly what a shared helper is; inlining them would duplicate the assertion and its failure message across every call site.',
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
        id: "suppressions:tests-lint-suspicious-no-unknown-attribute",
        policyId: "suppressions",
        subject: "lint/suspicious/noUnknownAttribute",
        operation: "tests",
        why: "TOOL FALSE POSITIVE — `tests/client/lib/_ct-stories.tsx:519`: \"React supports transition lifecycle events absent from Biome's DOM allowlist.\" `onTransitionStart` is a real React synthetic event the analyzer's attribute table does not carry; the story mounts it precisely to drive the transition-lifecycle arm the CT asserts.",
        endsWhen: "biome's DOM attribute allowlist gains the React transition lifecycle events, or the story stops driving them.",
      },
      {
        id: "suppressions:tests-lint-suspicious-use-await",
        policyId: "suppressions",
        subject: "lint/suspicious/useAwait",
        operation: "tests",
        why: 'RULING — an async signature is a CONTRACT here, not an oversight, which is the source table\'s own `useAwait` ruling ("a buffered replay generator has nothing to await but must remain async to implement the AsyncIterable contract"). `tests/server/infra/storage/zip.int.test.ts:49`: "this is the lazy async producer contract packZip consumes; yielding 50k entries must not preallocate an array." `tests/support/tool-fixtures.ts:50`: "vitest\'s fixture signature is async; the value is a constant." In both, dropping `async` breaks the consumer\'s type.',
        endsWhen: "`packZip` accepts a synchronous iterable and vitest's fixture signature admits a non-async provider.",
      },
      {
        id: "suppressions:tests-lint-suspicious-use-error-message",
        policyId: "suppressions",
        subject: "lint/suspicious/useErrorMessage",
        operation: "tests",
        why: 'RULING — the test\'s SUBJECT is the very case the rule forbids, which is the stated rationale of the whole RATIFIED_TEST_RULES table. `tests/kit/error-message/index.test.ts:10`: "the whole point of this test is the no-message case" — `errorMessage(new Error())` must return the empty string, and constructing the message-less Error is how that arm is reached.',
        endsWhen: "`errorMessage` stops having a no-message arm to pin.",
      },
      {
        id: "suppressions:tests-ts-expect-error",
        policyId: "suppressions",
        subject: "@ts-expect-error",
        operation: "tests",
        why: "RULING — a type-level NEGATIVE pin (`.test-d` and inline): the directive IS the assertion that the type refuses the shape, and tsc reds the day it stops; plus an untyped `.cjs` config import whose shape is asserted immediately after (Carried VERBATIM from the legacy RATIFIED_TEST_RULES table at 02382639e; 52 live site(s) under governed tests at conversion.)",
        endsWhen:
          "the ruling itself is reversed, or the last governed tests site under `@ts-expect-error` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
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
