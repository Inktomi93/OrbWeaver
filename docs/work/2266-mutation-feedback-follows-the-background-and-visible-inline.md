---
kind: work
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a47d381f0dc43d6ea
plan: cross-surface-consistency
---

# Mutation feedback follows the background and visible-inline rulings

## What

Owner ruling: background housekeeping the person did not start (husk reap, temp-chat sweep, plugin crash report) logs its failure and shows no toast; when the failing surface is on screen and already states the failure inline, no toast repeats it (restart refusal in its confirm dialog, the schema-plan ask, which also toasts once per typing pause). Amend client-architecture-state-and-gates §11 to never neither, and not both while the inline line is visible, with a typed background class in the mutation factory instead of an opt-out.

## Why

A red error for housekeeping the person never started, and a toast that repeats the line beside it, both read as noise.

## Done when

§11 states both rulings, the factory types the background and inline-visible classes so a site cannot omit feedback by accident, the named sites follow them, and CTs show one failure surface per case. Source: acceptance part 4 report B.

## Evidence

FailureFeedback in packages/client/src/data/create-entity-mutation.ts types three classes, and tests/client/data/mutation-failure-class.dom.test-d.ts refuses none and two, with a planted control that fails tsc. Husk reap, temp-chat sweep and plugin crash report log through BACKGROUND_FAILURE_LOGS and show no toast. The schema-plan ask states only its plan line. tests/client/data/husk-reaper-failure.ct.tsx, tests/client/features/chat/lib/temp-chat-sweep-failure.ct.tsx, the crash report case in tests/client/features/plugin/native-guest-protocol.ct.tsx and tests/client/features/refinery/components/schema-plan-failure.ct.tsx fail on the old source, with no log line and two stacked schema-plan toasts, and pass on the new. The restart refusal has no CT because routeOrbSocket closes every stream, so the control never holds a live server identity in a CT. Its inline class is proven by type and by the ui-facts mutation cohort. tests/tooling/ui-facts/composition.test.ts fails on the old census and passes on the new. Floor: full pnpm typecheck, depcruise, knip, eslint on touched files and tests, doc check.
