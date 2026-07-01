# Orbweaver — Spine: TypeScript & Patterns (Types, Schemas, Dispatch)

> **Status: planning (authoritative detail).** This is a cross-cutting Spine document.

The problem: a shape's "home" is ambiguous — drizzle schema in `db`, re-declared/re-exported in `shared`,
each domain has its own `contract/`, and the client needs some shapes for client-side validation. So
shapes get duplicated and inline types/schemas sprout everywhere. The target rule (**one home per shape,
derived by who needs it; flows DOWN only**):

| Shape kind                                                | Home                                                    | Consumers (down only)         |
| --------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- |
| **DB row**                                                | `db` (drizzle table → inferred `$inferSelect`/`Insert`) | server persistence            |
| **cross-boundary wire** (server↔client, or domain↔domain) | `contracts` (zod + inferred TS)                         | server, client, other domains |
| **domain-internal**                                       | that domain's `contract/` (params/results/views/errors) | only that domain              |
| **client-only view**                                      | client                                                  | client                        |
| **pure primitive shape**                                  | `kit`                                                   | anyone (it's the bottom)      |

**The gate — `no-inline-types`:** no exported `type`/`interface`/`z.object` (and no structural cast)
declared OUTSIDE `db` schema / `contracts` / a domain's `contract/` / `kit`. Inline shapes in `verbs/`,
`persistence/`, `service.ts`, transport, or client components are RED. This is the enforced version of
"no schemas or types outside their proper places." Readers flag every leak (§6B `inlineTypes`); the
spine doc defines the exact gate.
