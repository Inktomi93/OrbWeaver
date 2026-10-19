---
kind: tooling
status: open
updated: 2026-10-19
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

Filled at landing: what ran and where its output is.
