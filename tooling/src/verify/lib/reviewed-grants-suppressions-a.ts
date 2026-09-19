// Reviewed grants: suppressions.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_SUPPRESSIONS_A: readonly ReviewedGateGrant[] = [
  {
    id: "suppressions:source-format",
    policyId: "suppressions",
    subject: "format",
    operation: "source",
    why: "RULING — a byte blob kept on ONE line on purpose — the formatter's wrap would make it unreadable and diff-noisy (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `format` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-jsx-a11y-control-has-associated-label",
    policyId: "suppressions",
    subject: "jsx-a11y/control-has-associated-label",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the label is supplied by a nested/sibling control the rule's traversal does not reach (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 3 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `jsx-a11y/control-has-associated-label` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-jsx-a11y-interactive-supports-focus",
    policyId: "suppressions",
    subject: "jsx-a11y/interactive-supports-focus",
    operation: "source",
    why: "RULING — the APG grid pattern — focus lives on the gridcell children, never the row (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 2 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `jsx-a11y/interactive-supports-focus` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-jsx-a11y-no-autofocus",
    policyId: "suppressions",
    subject: "jsx-a11y/no-autofocus",
    operation: "source",
    why: "RULING — deliberate focus placement on a surface the user just opened for that field (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 4 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `jsx-a11y/no-autofocus` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-jsx-a11y-no-noninteractive-tabindex",
    policyId: "suppressions",
    subject: "jsx-a11y/no-noninteractive-tabindex",
    operation: "source",
    why: "RULING — the eslint twin of the scrollable-region ruling on the same element (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `jsx-a11y/no-noninteractive-tabindex` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-a11y-no-label-without-control",
    policyId: "suppressions",
    subject: "lint/a11y/noLabelWithoutControl",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the control is nested INSIDE the label, which the rule's traversal misses (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 3 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/a11y/noLabelWithoutControl` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-a11y-no-noninteractive-element-interactions",
    policyId: "suppressions",
    subject: "lint/a11y/noNoninteractiveElementInteractions",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the handler is a load-status callback (onError), not a user interaction — the standard React fallback pattern (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 3 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/a11y/noNoninteractiveElementInteractions` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-a11y-no-noninteractive-tabindex",
    policyId: "suppressions",
    subject: "lint/a11y/noNoninteractiveTabindex",
    operation: "source",
    why: "RULING — WCAG 2.1.1 keyboard-scrollable overflow region — tabIndex=0 is what makes arrow/Page scrolling reachable without a mouse (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/a11y/noNoninteractiveTabindex` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-a11y-no-static-element-interactions",
    policyId: "suppressions",
    subject: "lint/a11y/noStaticElementInteractions",
    operation: "source",
    why: "RULING — an APG pattern whose interactive semantics live on the children (roving tabindex), stated at the site (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/a11y/noStaticElementInteractions` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-a11y-use-focusable-interactive",
    policyId: "suppressions",
    subject: "lint/a11y/useFocusableInteractive",
    operation: "source",
    why: "RULING — rows are structural groupings in the APG grid pattern; a focusable row would create a second tab stop (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/a11y/useFocusableInteractive` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-a11y-use-semantic-elements",
    policyId: "suppressions",
    subject: "lint/a11y/useSemanticElements",
    operation: "source",
    why: "RULING — a hand-rolled ARIA mechanism no native element can render (the D58 segmented SVG magnitude family, ui-package-design §10.4) (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 7 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/a11y/useSemanticElements` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-complexity-no-excessive-cognitive-complexity",
    policyId: "suppressions",
    subject: "lint/complexity/noExcessiveCognitiveComplexity",
    operation: "source",
    why: "RULING — flat ENUMERATIONS, not tangled control flow (#596): every increment is one independent column or step of a one-home inventory at real nesting depth 0 — a DB column list's `?? null` per column (canon-write `variantEconomics`, 20), the rebuild fold's signed mirror per column (stats-delta `canonMessageDelta`, 28), and the ordered boot/teardown protocol (entry/lifecycle, 45 + 20). Biome scores the enumeration's LENGTH and then DOUBLES every increment for a closure — nine null-guarded stops at depth 0 score 20 — so the number is not measuring what the rule is for. Splitting scatters the one-home shape the enumeration exists to show (the column list, the drift-gate mirror, the boot ordering). Each site states its own ruling at the marker; the EXCEED arm still REDs a NEW marker past the file's budget, so this ratifies the decided set and not the next one written. (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 6 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/complexity/noExcessiveCognitiveComplexity` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-complexity-no-useless-constructor",
    policyId: "suppressions",
    subject: "lint/complexity/noUselessConstructor",
    operation: "source",
    why: "RULING — the narrowing constructor IS the point — it pins the error subclass's argument type (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/complexity/noUselessConstructor` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-complexity-no-useless-return",
    policyId: "suppressions",
    subject: "lint/complexity/noUselessReturn",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the explicit fallthrough return satisfies TypeScript noImplicitReturns because sibling branches return values (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/complexity/noUselessReturn` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-complexity-no-useless-undefined",
    policyId: "suppressions",
    subject: "lint/complexity/noUselessUndefined",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the explicit undefined fallthrough satisfies TypeScript noImplicitReturns because sibling branches return values (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 4 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/complexity/noUselessUndefined` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-complexity-use-max-params",
    policyId: "suppressions",
    subject: "lint/complexity/useMaxParams",
    operation: "source",
    why: "RULING — the signature MIRRORS an injected cross-feature contract (a positional delegate); narrowing it forks the contract (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 2 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/complexity/useMaxParams` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-correctness-use-exhaustive-dependencies",
    policyId: "suppressions",
    subject: "lint/correctness/useExhaustiveDependencies",
    operation: "source",
    why: "TOOL FALSE POSITIVE — value-keyed deps — inline array literals are fresh refs each render and would re-arm every render (the measured keystroke regression) (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 3 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/correctness/useExhaustiveDependencies` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-correctness-use-yield",
    policyId: "suppressions",
    subject: "lint/correctness/useYield",
    operation: "source",
    why: "RULING — an empty async generator IS the held-open no-turn prompt (the agent-sdk catalog's designed shape) (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 2 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/correctness/useYield` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-nursery-no-component-hook-factories",
    policyId: "suppressions",
    subject: "lint/nursery/noComponentHookFactories",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the factories run at MODULE scope, so the returned hook has a stable identity — the re-mount hazard the rule guards cannot occur (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 5 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/nursery/noComponentHookFactories` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-nursery-no-conditional-expect",
    policyId: "suppressions",
    subject: "lint/nursery/noConditionalExpect",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the call is the codemod kit's guard-clause assert helper, not a test-runner expectation (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 3 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/nursery/noConditionalExpect` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-nursery-no-playwright-networkidle",
    policyId: "suppressions",
    subject: "lint/nursery/noPlaywrightNetworkidle",
    operation: "source",
    why: "RULING — an explicit probe/golden-harness observation mode asks for bounded network quiet; it is not a test readiness guess (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 2 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/nursery/noPlaywrightNetworkidle` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-nursery-no-playwright-wait-for-selector",
    policyId: "suppressions",
    subject: "lint/nursery/noPlaywrightWaitForSelector",
    operation: "source",
    why: "RULING — the foreign ST golden harness has no owned semantic locator contract, so its dynamic DOM selector is the integration boundary (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 3 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/nursery/noPlaywrightWaitForSelector` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-nursery-no-playwright-wait-for-timeout",
    policyId: "suppressions",
    subject: "lint/nursery/noPlaywrightWaitForTimeout",
    operation: "source",
    why: "RULING — probe/golden harnesses deliberately observe a bounded time window; they are instruments, not polling test assertions (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 4 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/nursery/noPlaywrightWaitForTimeout` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-nursery-use-explicit-return-type",
    policyId: "suppressions",
    subject: "lint/nursery/useExplicitReturnType",
    operation: "source",
    why: "RULING — inference-carried by design (the form factory's whole point is that its result type is derived, not spelled) (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/nursery/useExplicitReturnType` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-nursery-use-nullish-coalescing",
    policyId: "suppressions",
    subject: "lint/nursery/useNullishCoalescing",
    operation: "source",
    why: "TOOL FALSE POSITIVE — a real boolean OR on defaulted `boolean` operands — `??` only falls through on null/undefined and would silently ignore an explicit false (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 7 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/nursery/useNullishCoalescing` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-performance-no-namespace-import",
    policyId: "suppressions",
    subject: "lint/performance/noNamespaceImport",
    operation: "source",
    why: "RULING — drizzle needs the whole schema module both as a value and as `typeof schema` — the canonical vendor pattern (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 2 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/performance/noNamespaceImport` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-style-no-magic-numbers",
    policyId: "suppressions",
    subject: "lint/style/noMagicNumbers",
    operation: "source",
    why: "RULING — spec constants (the PNG file signature, the WCAG sRGB linearization threshold) — a named alias would obscure the standard it quotes (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 7 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/style/noMagicNumbers` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-style-no-non-null-assertion",
    policyId: "suppressions",
    subject: "lint/style/noNonNullAssertion",
    operation: "source",
    why: "RULING — the index is bound-proved one line above; the assertion states what the loop guarantees (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 13 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/style/noNonNullAssertion` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-style-no-process-env",
    policyId: "suppressions",
    subject: "lint/style/noProcessEnv",
    operation: "source",
    why: "RULING — tool and probe launch boundaries own ambient harness knobs and child-process inheritance; they are outside the app configuration perimeter (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 50 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/style/noProcessEnv` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-style-use-error-cause",
    policyId: "suppressions",
    subject: "lint/style/useErrorCause",
    operation: "source",
    why: "TOOL FALSE POSITIVE — the cause IS forwarded — biome inspects only the 2nd constructor argument and misses a 3rd-arg ErrorOptions passed to super() (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 12 live site(s) under governed source at conversion.)",
    endsWhen:
      "the analyzer stops mis-reading this shape — an upgrade whose `lint/style/useErrorCause` understands it — or the last governed source site under the rule disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-style-use-naming-convention",
    policyId: "suppressions",
    subject: "lint/style/useNamingConvention",
    operation: "source",
    why: "RULING — wire vocabulary — the snake_case key IS the protocol/format (ST cards, OpenAI-compatible bodies, the mode literals); renaming forks the wire (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 52 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/style/useNamingConvention` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-style-use-numeric-separators",
    policyId: "suppressions",
    subject: "lint/style/useNumericSeparators",
    operation: "source",
    why: "RULING — a standard constant quoted verbatim — separators would obscure the value the spec names (Carried VERBATIM from the legacy RATIFIED_RULES table at 02382639e; 1 live site(s) under governed source at conversion.)",
    endsWhen:
      "the ruling itself is reversed, or the last governed source site under `lint/style/useNumericSeparators` disappears; either way this row is consumed zero times and reds as a stale reviewed grant.",
  },
  {
    id: "suppressions:source-lint-performance-no-barrel-file",
    policyId: "suppressions",
    subject: "lint/performance/noBarrelFile",
    operation: "source",
    why: "RULING — a re-export at the ORIGINAL module's own path preserves that module's public API after a slice of it was extracted to a sibling leaf (tooling-size splits); it is a compatibility seam for the module's existing importers, not the fan-out barrel the rule polices.",
    endsWhen:
      "the last governed source site under `lint/performance/noBarrelFile` disappears, or a split module's re-export is dropped in favor of repointing every importer directly.",
  },
];
