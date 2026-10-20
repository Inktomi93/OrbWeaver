---
kind: tooling
status: open
updated: 2026-10-20
priority: P2
---

# Clear the standing native lint backlog outside the server factory rule

## What

Native lint over packages, tooling and tests is red outside orb/server-factory-tier-reference (item 1099): vitest/no-standalone-expect across tests/tooling, tests/server and tests/legacy where expects sit inside custom test wrappers such as cellTest that the vitest plugin does not know; max-lines in tooling/src and tests/tooling; orb/no-prototype-mutation and no-extend-native in tests; vitest/valid-title and valid-expect; no-restricted-syntax in packages/client; and a tail of typed-rule findings.

## Why

A lint stage that is red everywhere hides every new finding, so CI cannot judge a change by its lint result.

## Done when

Each rule's findings are fixed at the site, or, for a verified false positive such as an unregistered test wrapper, the rule is configured to know it with the reason in eslint.config.js; native lint over packages, tooling and tests reports only item 1099's population.

## Evidence

Reviewed source is integrated at `212974e4a9`. The complete native lint run exits with violations beyond item 1099, including SkeletonRows restrictions, max-lines and typed rules. Completed output and resource measurements: `reports/review/handoff-native-lint/`. Keep the remaining population open without suppressions.
