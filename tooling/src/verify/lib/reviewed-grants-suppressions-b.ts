// Reviewed grants: suppressions.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_SUPPRESSIONS_B: readonly ReviewedGateGrant[] = [
  {
    id: "suppressions:tests-lint-style-use-error-cause",
    policyId: "suppressions",
    subject: "lint/style/useErrorCause",
    operation: "tests",
    why: "Verified Biome false positive at the private corpus failure owner: native SuppressedError retains the caught capture failure in error and the original intake failure in suppressed. Its constructor has no ErrorOptions parameter; both native identities are asserted by the filesystem controls.",
    endsWhen: "Biome recognizes native SuppressedError ownership, or the final governed tests-scope directive for this native constructor disappears.",
  },
  {
    id: "suppressions:tests-typescript-eslint-no-unsafe-type-assertion",
    policyId: "suppressions",
    subject: "@typescript-eslint/no-unsafe-type-assertion",
    operation: "tests",
    why: "RULING — passive tRPC and socket recorders correlate actual protocol observations by procedure path or stream fields without validating or normalizing their bytes. Parsing would change malformed identifiers, omitted defaults and transform-sensitive inputs; these observations grant no application, domain or identity authority.",
    endsWhen: "a native typed wire recorder preserves these raw observations, the protocol observations disappear, or the final adjacent directive is removed.",
  },
  {
    id: "suppressions:tests-orb-no-test-fabrication",
    policyId: "suppressions",
    subject: "orb/no-test-fabrication",
    operation: "tests",
    why: "RULING — boot-trace, heap-capture, browser-network, request-ring and appearance fallback plants control external protocol failures, events and retention. Separate scalar-appearance and unbranded-asset-row negatives must reach their real verifier intake and refuse. These exact plants grant no application, domain or identity authority.",
    endsWhen:
      "native protocol fault/event injection replaces the external plants, the individually reviewed scalar/Drizzle runtime validations are removed, their actual observations disappear, or the final directive is removed.",
  },
  {
    id: "suppressions:tests-typescript-eslint-consistent-type-assertions",
    policyId: "suppressions",
    subject: "@typescript-eslint/consistent-type-assertions",
    operation: "tests",
    why: "RULING — boot-trace, heap-capture, request-ring and appearance fallback plants expose consumed external protocol methods; browser-network uses Page only as a WeakMap key. Individually reviewed internal negatives cover unknown owner coverage before authority judgment, a bogus dispatcher receipt and an unbranded asset row at real runtime validation. These exact plants mint no domain or heap identity.",
    endsWhen:
      "native protocol injection or an opaque identity seam replaces the external plants, the exact owner-coverage/receipt/Drizzle runtime validations are removed, their observations disappear, or the final directive is removed.",
  },
  {
    id: "suppressions:source-orb-brand-in-name-position",
    policyId: "suppressions",
    subject: "orb/brand-in-name-position",
    operation: "source",
    why: "RULING — plugin sandbox DTOs, origin-wide channel payloads and portable chat-bundle fields carry unvalidated wire identifiers. Applying host brands before parsing would claim validation these boundaries have not performed. Only the actual raw-wire declarations and their boundary adapters receive adjacent permissions.",
    endsWhen: "these boundaries parse their identifiers to canonical host brands, the raw-wire fields disappear, or the final directive is removed.",
  },
  {
    id: "suppressions:tests-orb-brand-in-name-position",
    policyId: "suppressions",
    subject: "orb/brand-in-name-position",
    operation: "tests",
    why: "RULING — the guest-host fixture preserves the actual unvalidated plugin wire; the tRPC type pin deliberately accepts a bare string; the hook fixture carries Claude Code's external session identifier rather than an Orbweaver SessionId. Branding these fields would change the subjects being proved.",
    endsWhen:
      "the actual wire gains validated brands, tRPC natively brands its input, the external hook identity stops being carried, or the final directive is removed.",
  },
  {
    id: "suppressions:source-orb-client-cache-surgery-only-in-data",
    policyId: "suppressions",
    subject: "orb/client-cache-surgery-only-in-data",
    operation: "source",
    why: "RULING — the mutation seam owns response echoes, optimistic writes and rollback; the bus carrier patches existing canonical pages; the start-chat seam seeds first-frame reads; the cache-peek door reads without subscribing; the event-to-filter seam invalidates the mapped queries. These actual data owners must call the client primitives they encapsulate.",
    endsWhen:
      "those owners no longer perform their cache operation, the query client accepts the operation as declarative input instead, or the final directive is removed.",
  },
  {
    id: "suppressions:source-orb-no-inline-invalidate-outside-seam",
    policyId: "suppressions",
    subject: "orb/no-inline-invalidate-outside-seam",
    operation: "source",
    why: "RULING — the central invalidation module owns the exhaustive event-to-filter mapping and issues its mapped invalidateQueries call. This is the encapsulating seam, not a feature bypass.",
    endsWhen: "the query client consumes that event mapping directly, the seam no longer issues the call, or the directive is removed.",
  },
  {
    id: "suppressions:source-orb-no-raw-clock",
    policyId: "suppressions",
    subject: "orb/no-raw-clock",
    operation: "source",
    why: "RULING — the kit time engine supplies the ambient default and the lifecycle composition root constructs the clock injected into application tiers. These two actual construction sites establish the injected seam rather than bypass it.",
    endsWhen: "a platform capability supplies those clocks without an ambient read, the construction sites disappear, or the final directive is removed.",
  },
  {
    id: "suppressions:source-orb-no-raw-intl-time",
    policyId: "suppressions",
    subject: "orb/no-raw-intl-time",
    operation: "source",
    why: "RULING — the kit time engine owns platform zone resolution and constructs the memoized time formatters handed to callers. Its actual Intl construction is the formatting seam every other caller must use.",
    endsWhen:
      "the time engine no longer resolves zones or constructs Intl formatters, an equivalent platform seam replaces those operations, or the final directive is removed.",
  },
  {
    id: "suppressions:source-orb-no-floorless-control-in-wrap",
    policyId: "suppressions",
    subject: "orb/no-floorless-control-in-wrap",
    operation: "source",
    why: "RULING — the RPG condition chip supplies CHIP_TOUCH_FLOOR_AT_COARSE around its remove target, and the pack icon picker supplies PICKER_GAP_AT_COARSE for its touch-target pitch. These actual coarse geometry remedies are outside the same-file literal-row heuristic; only their adjacent native lines receive the reviewed exception.",
    endsWhen:
      "the chip or picker no longer needs its floorless control, the measured coarse geometry remedy changes, or the final source directive disappears.",
  },
  {
    id: "suppressions:source-orb-ui-size-via-variant",
    policyId: "suppressions",
    subject: "orb/ui-size-via-variant",
    operation: "source",
    why: "RULING — the character sort and Labels sort Select triggers retain field chrome while taking content width so their adjacent filters keep the remaining row space. Select's inline layout also removes that chrome and is not equivalent. Only these actual content-width field cases receive line-local native directives; other sealed-box overrides remain prohibited.",
    endsWhen:
      "Select exposes a content-width field variant that replaces these directives, the content-width field requirement ends, or the final source directive disappears.",
  },
  {
    id: "suppressions:source-orb-baseui-derives-not-respells",
    policyId: "suppressions",
    subject: "orb/baseui-derives-not-respells",
    operation: "source",
    why: "RULING — Combobox items remain string chips with groups supplied separately; Select items remain its renderer-owned flat/group option union. These two actual item models deliberately narrow Base UI's loose collection surface. Native-derived value/defaultValue and Autocomplete items need no directive; handler derivation remains HARD.",
    endsWhen:
      "the final actual item-model directive disappears, Combobox accepts object-backed collections, or Select stops rendering its own closed item model.",
  },
  {
    id: "suppressions:source-orb-no-banned-tw-utility",
    policyId: "suppressions",
    subject: "orb/no-banned-tw-utility",
    operation: "source",
    why: "RULING — the canonical shrink-to-fit transcript bubble retains max-w-prose; applying the teaching/body reading measure would narrow transcript geometry against its owner ruling. Only the actual production recipe receives a line-local directive.",
    endsWhen: "a separately ruled transcript bubble cap receives its own token and replaces this recipe, or the final source directive disappears.",
  },
  {
    id: "suppressions:source-drizzle-derived-replacement",
    policyId: "suppressions",
    subject: "drizzle/enforce-delete-with-where",
    operation: "source",
    why: "RULING — the admitted every-owner analytics pass atomically replaces complete derived duplicate/theme planes; singular runs retain actual owner predicates. Only the actual statement-local every-owner replacement carries the directive, not canonical-data writes or an omitted tenant fence.",
    endsWhen:
      "the complete derived-plane replacement disappears or becomes owner-local, or native tooling expresses the same deliberate full replacement without a directive.",
  },
  {
    id: "suppressions:source-disposable-owner-transfer",
    policyId: "suppressions",
    subject: "lint/nursery/useDisposables",
    operation: "source",
    why: "RULING — the current bindings return/move an actual graph owner, borrow an already-adopted operation view/shared caught fault, or preserve an existing process-compatibility lifetime. Their real caller/stack owns cancellation and joins; lexical using here would dispose a transferred/borrowed owner at the wrong scope. This does not permit locally acquired resources without an owner.",
    endsWhen:
      "these transfer/borrow/process-lifetime cases no longer exist, or native analysis recognizes their real ownership and the final directive disappears.",
  },
  {
    id: "suppressions:source-native-response-formdata",
    policyId: "suppressions",
    subject: "@typescript-eslint/no-deprecated",
    operation: "source",
    why: "RULING — the native owned-response adapter must preserve Response.formData delegation and current producer headers/consumption. It is not selecting an unbounded multipart intake policy; callers retain buffering/trust responsibility. No other deprecated API is justified by this case.",
    endsWhen:
      "the native Response compatibility promise ends, the native declaration drops its warning, or an equivalent native method replaces this actual delegation.",
  },
  {
    id: "suppressions:source-firehose-producer-projection",
    policyId: "suppressions",
    subject: "orb/firehose-import-allowlist",
    operation: "source",
    why: "RULING — the canonical chat-events producer projects its own already-created compatibility channel. This property projection is not a firehose import consumer or member-facing stream; the approved watcher/barrel consumer boundary stays enabled. Keep the precise inline exception, not a whole producer-file exemption.",
    endsWhen: "the canonical compatibility projection disappears or the native restriction distinguishes it from actual consumer reads.",
  },
  {
    id: "suppressions:tests-disposable-root-observation",
    policyId: "suppressions",
    subject: "lint/nursery/useDisposables",
    operation: "tests",
    why: "RULING — the live test/helper bindings transfer an exact scheduler/provider owner to the real root or returned moved lifetime, or borrow a graph bus to observe the root's physical cancellation/rollback/join behavior. Test-local disposal would duplicate ownership or alter the subject. Unowned test-resource leaks are not covered.",
    endsWhen: "the actual transfer/borrowed-root observations disappear, or native analysis recognizes their ownership and no directive remains.",
  },
  {
    id: "suppressions:tests-native-formdata-controls",
    policyId: "suppressions",
    subject: "@typescript-eslint/no-deprecated",
    operation: "tests",
    why: "RULING — native formData itself is exercised against a fixed synthetic Response and a trusted fixture-controlled SDK outbound multipart edit, preserving actual selected image bytes/MIME/instruction. Replacing it with a parser mock/different API would stop testing that contract. No unrelated deprecated test API is covered.",
    endsWhen: "the actual native API/trusted outbound subject changes or the declaration warning disappears.",
  },
  {
    id: "suppressions:tests-linux-proc-assertion",
    policyId: "suppressions",
    subject: "lint/nursery/noConditionalExpect",
    operation: "tests",
    why: "RULING — only the physical /proc/self/fd assertion is conditional on the independent Linux platform capability. Portable capsule assertions remain unconditional; neither success nor a product result decides whether this expect runs.",
    endsWhen:
      "a portable physical-descriptor proof replaces proc, or an actual platform-selected suite preserves this same production subject without the directive.",
  },
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
    id: "suppressions:tests-native-node-test-child",
    policyId: "suppressions",
    subject: "vitest/no-import-node-test",
    operation: "tests",
    why: "TOOL FALSE POSITIVE — a supervised standalone Node child uses the native test runner because Vitest requires worker state that the child does not have. The maintained parent remains Vitest-owned and observes native execution, completion and exit status; this does not permit Node test imports in Vitest workers.",
    endsWhen: "the standalone native test child disappears, or the installed rule distinguishes native executables from Vitest workers without a directive.",
  },
  {
    id: "suppressions:tests-orb-test-ambient-source-string",
    policyId: "suppressions",
    subject: "orb/test-ambient-source-string",
    operation: "tests",
    why: "TOOL FALSE POSITIVE — parser, search and self-proof source strings describe ambient calls without executing them. The physical child CPU stimulus instead requires actual elapsed time to exercise supervision. These line-local permissions apply only to the source-string rule, never to actual ambient runtime or business calls.",
    endsWhen:
      "the final legitimate source-text or physical-stimulus permission disappears, or the native source-string rule distinguishes these inputs without a line permission.",
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
