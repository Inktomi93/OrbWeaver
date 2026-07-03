---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — the cross-cutting Spine (AGENTS-2)

> **Status: authoritative index.** Read after `AGENTS-1-Architecture.md`.

## 5. What the spine is

Some concerns aren't owned by one domain — they thread through many. A per-domain reader must check its
slice against them, never re-decide them. Each thread has ONE canonical `Spine-*` doc (below); the §7.x
numbers survive because older docs cite "AGENTS-2 §7.x" / "spine §7.x" — each section here is a pointer
only. **Read the Spine doc IN FULL before touching its thread.**

### 7.1 identity / auth / permission

**Canonical: [`Spine-Identity-and-Auth.md`](Spine-Identity-and-Auth.md).** Identity resolves ONCE at
the edge into one immutable `Principal`; permission = global-role × resource-role × capability; agents
are FIRST-CLASS PRINCIPALS (model locked; mint mechanics fully designed per D60 —
`../proposed/agent-principal-design/`); BFF sessions ≠ SDK chat sessions.

### 7.2 settings / config / the env FOUR natures

**Canonical: [`Spine-Config-and-Serialization.md`](Spine-Config-and-Serialization.md)** §"Settings /
config". Env has four natures — true env · AppSettings (env floor, DB override wins) · the agent-sdk
credential firewall (a backend-internal config, NOT a settings tier) · generation params
(`UserIntent`/preset).

### 7.3 serialization / serde core

**Canonical: [`Spine-Config-and-Serialization.md`](Spine-Config-and-Serialization.md)** §"Serialization
/ serde core". ONE fully-modeled canonical card in `contracts`; the PNG codec is ONE string-based
`kit/png-card-chunk` engine; mappers consolidated.

### 7.4 types & schemas — one home, one direction, no inline

**Canonical: [`Spine-TypeScript-and-Patterns.md`](Spine-TypeScript-and-Patterns.md).** One home per
shape, derived by who needs it, flows DOWN only; enforced by the `no-inline-types` gate. The home table +
the house TS style live there.

### 7.5 string-union dispatch discipline

**Canonical: [`Spine-TypeScript-and-Patterns.md`](Spine-TypeScript-and-Patterns.md)** §"String-union
dispatch discipline" (moved there 2026-07-03). Every axis: ONE importable union + a mapped-type Record
or `assertNever` dispatch — a new member fails `tsc` (`no-inline-union-redecl` + `exhaustive-dispatch`
gates). The measured neo touch-count table and the `RUNNERS` gold standard are in that section.

## 6/8. Grounded Intelligence — the AST-scan findings (moved)

The one-time neo-tavern whole-file/AST investigation record (formerly §6 + §8.1–§8.7 here, cited as
"AGENTS-2 §8.x": coupling census, type/schema fragmentation, chat-resolution confirmation, knowledge
cluster, first-class-principal blast radius, doc-claim verification, escape hatches, the codemod-kit
instrument) → [`../history/Grounded-Intelligence-AST-Scan.md`](../history/Grounded-Intelligence-AST-Scan.md).
Its findings are law only where they were promoted (the gates, the ledger, `Knowledge-Cluster.md`,
`proposed/agent-principal-design/` for §8.6).
