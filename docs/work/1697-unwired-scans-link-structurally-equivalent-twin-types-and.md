---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tooling
plan: unwired-code
---

# Unwired scans link structurally equivalent twin types and whole-object handoffs so they stop reporting them as unwired

## What

Engine one follows a value across a compiler-checked hand-off. `tooling/src/unwired/handoffs.ts` pairs the type of each handed expression with its slot's contextual type: arguments, returns, annotated initializers, key values, array elements and JSX values, production files only. Same-named members of each pair flow from source to sink. The walk crosses nested members, generics of one library target and call signatures, where parameters flow against the hand-off. A sink's reads reach its sources and a source's writes reach its sinks, along whole chains. A spread into a typed literal also carries its source's writes down. An uncontextual literal's key is credited to its own declaration so a later hand-off carries it. `nestedValue` and `c.json` join the reflective calls.

## Why

The rows in [1715](1715-unwired-engine-one-judges-and-find-references-audits.md) classes B2, A2 and G are false until these forms are followed. Under the one-way audit they would report as findings.

## Done when

- The forms below report no false row, each with a found case beside it.
- A member a hand-off does not name stays a finding, and a read of the source does not count for the sink.
- The full before and after shows the class B2, A2 and G rows gone.

## Evidence

Restated twins and whole-object hand-offs are the same shape as the spread link, and find-references cannot see them for the same reason. Treat them as new `Link` sources in engine one, not as engine two work (engine rules: item 1715). The forms are covered; the landed state is below.

Landing evidence: the cases are in `tests/tooling/unwired/flows.int.test.ts`, each form with a found case and a control:

| Form | Site | State |
| - | - | - |
| Conditional spread into a literal | `packages/client/src/features/chat/hooks/use-guided-actions.ts:299` | Engine one already held it on a plain function; the real row is a `…Vars` twin |
| Helper's returned object spread into a literal | `packages/client/src/features/credentials/components/draft-models-check.tsx:80` | followed |
| Client `…Vars` twin of a router input | `packages/client/src/features/chat/hooks/use-membership-mutations.ts:76` | followed through the mutation options' signature |
| Whole object to a narrower parameter | `packages/ui/src/art/web-weave/web-weave-render.ts:307` | followed |
| Uncontextual local literal | `packages/server/src/domain/imagery/persistence/portability-read.ts:42` | followed |
| `as const` writer object spread | judgement lanes | followed |
| `ReturnType` hop | judgement lanes | followed |
| Dotted-path read | `packages/client/src/lib/agent-bridge-appearance.ts:54` | top level followed; a nested member stays a finding |
| Whole value sent with `c.json` | `packages/server/src/foundation/observability/debug/routes.ts` | followed |

Not followed:

- Hono `c.set` and `c.get`: a string key into a `Variables` type, so a new lookup kind.
- `.values(...)` and `.set(...)` of a whole value or a spread: a value handed to a library slot reads nothing, and no same-named tree member stands behind the slot unless the table declares one.
- A whole value handed to a library parameter: the spread rule that credits a library-declared member covers spreads only.
- zustand `persist` reads ([1555](1555-judge-the-client-state-fields-the-unwired-fields.md)).
- The conditional that builds a union member (`packages/ui/src/lib/clipboard.ts:23`, [1645](1645-judge-the-ui-union-members-the-unwired-unions.md)): that is the unions scan.

Owed by the owner: the full before and after, peak memory and wall time. The hand-off pass was not measured on this tree.

The class B1 rows are real `never-written` findings and belong to their judgement items.
