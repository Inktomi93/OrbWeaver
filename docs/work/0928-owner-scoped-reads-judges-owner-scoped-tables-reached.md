---
kind: bug
status: doing
updated: 2026-10-12
priority: P1
area: tooling
lane: wt/agent-afbebd7f416a475f1
plan: test-mirror
---

# owner-scoped-reads judges owner-scoped tables reached through a join

## What

tooling/src/verify/gates/owner-scoped-reads.ts collects only .from(ident) calls (lines 98-108) and reads only the WHERE (lines 81-95), so an owner-scoped table reached through innerJoin or leftJoin is never a candidate. A verifier proved it in memory: .from(chats).innerJoin(personas, eq(personas.id, personaId)).where(eq(chats.id, chatId)) returns any persona the caller names and raises zero findings, as does a join on the FK path filtered by the persona id. Neither tenancy-scope-family.suite.test.ts nor the gate's mustPass rows have a join case. Treat a joined owner-scoped table as a candidate whose join condition must chain from a scoped column (the FK path) or carry an owner predicate; add a mustFlag row for the caller-id join and a mustPass row for the FK-chain join; fix or waive with a reason any live site the stricter gate finds.

## Why

The gate exists to stop cross-tenant reads, and the join shape bypasses it entirely; the law claims owner scope on every read.

## Done when

The caller-id join and the persona-id-filtered join flag, the shipped chat-scoped pin read (persona/persistence/queries.ts loadPinnedPersonaView) passes, planted controls in the gate test, and the budget row matches the measured count.

## Evidence

Filled at landing: what ran and where its output is.
