# Audits-and-Debt

> **How to read this file.** The one LIVE section is the **[Promotion / Relocation Debt Registry](#promotion--relocation-debt-registry)**
> — the active `PD-XX` flags to burn down. Everything else is **archaeology**: resolved audit records
> kept for reference, each already banner-tagged with its resolution date. Do not treat the archaeology
> sections as open work.
>
> - **LIVE** → `## Promotion / Relocation Debt Registry` (active flags) + `## Cleared` (done flags).
> - **ARCHAEOLOGY (resolved — reference only):** `## Orbweaver — boundary / build-order scan` (a re-runnable
>   AST method + its findings); `## Doc-review findings — full punch-list (2026-06-28)` (✅ resolved);
>   `## Orbweaver architecture-docs inconsistency audit (2026-06-26)` (✅ remediated).
>
> _Restructure note (2026-07-01): the archaeology sections physically wrap the live registry for now; the
> live registry is the middle of the file. A later pass may relocate the archaeology to a bottom appendix._

---

<!-- Source: Core-Audits-and-Debt.md -->

## Orbweaver — boundary / build-order scan

> **Status: analysis (re-runnable).** A ts-morph pass over the **steady clone** (`/tmp/neo-tavern-steady`,
> commit `da9af861`) that resolves every internal import, collapses each file to its orbweaver
> destination bucket, and computes the bucket-level DAG, upward (illegal-direction) edges, sideways
> domain↔domain edges, fan-in hubs, dir SCCs, and the topological build order. It answers two questions:
> _how interwoven is the code, and in what order do we build?_ The instrument is a standalone script
> (`orb-scan.ts`) that reuses the neo-tavern ts-morph install; re-run it against any snapshot to refresh.

## AST Auditing & Exploration Manual (AST Scout CLI)

For ad-hoc AST queries and domain audits, agents MUST use the **`scratch/find_interfaces.ts` AST Scout CLI** rather than hand-rolling ts-morph scripts or `grep` loops.
The script is a powerful wrapper over `codemod-kit` and supports wildcard searches, reference finding, call-site location, and importer discovery.

**Commands:**
- `npx tsx scratch/find_interfaces.ts find-symbol "<query>"` (Supports regex/wildcard, e.g. `"Chat*"`)
- `npx tsx scratch/find_interfaces.ts find-refs <file> <symbolName>`
- `npx tsx scratch/find_interfaces.ts find-calls <functionName>`
- `npx tsx scratch/find_interfaces.ts importers <moduleSpecifier>`
- `npx tsx scratch/find_interfaces.ts exports <file>`

**Flags:**
- `--neo`: Include the `neo-tavern` legacy codebase in the scan (essential for mapping old logic to new domains).
- `--json`: Output a machine-readable JSON array. **Use this to bypass the 50-result console limit** when performing large wildcard sweeps.

<!-- Source: Core-Audits-and-Debt.md -->

## Inputs

1,101 src files · 4,738 resolved internal edges · 1 unresolved-internal · file graph **fully acyclic**
(0 file cycles). Each file is bucketed to its orbweaver home (`kit` / `contracts` / `db` / a server tier
/ a domain / `client` / `_shared`).

<!-- Source: Core-Audits-and-Debt.md -->

## Result 1 — the 5-package cake is already clean

```
cross-package edges: 1099
UPWARD (illegal):    0          ← zero
cycles (SCC>1):      0          ← zero
build order:         kit → contracts → db → server → client
```

Every cross-package edge already flows **down** the cake:

| edge                | count  | type-only              |
| ------------------- | ------ | ---------------------- |
| server → kit        | 354    | 194                    |
| server → db         | 306    | 135                    |
| client → kit        | 153    | 110                    |
| server → contracts  | 129    | 81                     |
| client → contracts  | 71     | 41                     |
| **client → server** | **54** | **54 (all type-only)** |
| db → kit            | 16     | 16                     |
| contracts → kit     | 12     | 5                      |
| db → contracts      | 4      | 3                      |

`client → server` is 100% type-only — the cake's `client deps server(type-only)` rule already holds in
the real code. **The package boundaries are not aspirational; the existing graph obeys them with zero
violations.** Scaffolding the five packages is low-risk.

<!-- Source: Core-Audits-and-Debt.md -->

## Result 2 — finer granularity (tiers/domains as packages) buys ~nothing

Splitting the server tiers + each domain into their own packages surfaces only:

```
cross-bucket edges: 1676
UPWARD (illegal):   10 total / 6 runtime
SIDEWAYS dom↔dom:    7 total / 0 runtime (all type-only)
```

The 6 runtime upward edges are all already-known: `infra → _shared` ×5 (vanishes when `_shared`
dissolves) + `foundation → infra` ×1 (the `DEFAULT_*_MODEL_ID` constant, relocated to
`contracts/connection`). The 7 sideways domain↔domain edges are all type-only, all from `workloads`
(the `runner-env` composition hub working as designed).

**Verdict: keep the 5-package cake.** Don't make tiers into packages — enforce the server-internal tier
order (entry→transport→domain→infra→foundation→kit) with dependency-cruiser as the tier-3 backstop. The
finer split would catch ~6 edges you already know about, at the cost of 11 `package.json` files.

<!-- Source: Core-Audits-and-Debt.md -->

## Result 3 — the one real entanglement is `_shared`

```
_shared drawer reaches: 245
  chat 47 · world-info 25 · credentials 20 · admin 20 · character 16 · discovery 12 · tag 12 ·
  persona 11 · buddy 10 · import 9 · workloads 9 · transport 7 · preset 7 · entry 6 · stats 6 ...
fan-in hubs:  shared/_kit/ids.ts 446 · _shared/audit.ts 60 · _shared/ids.ts 42 · _shared/errors.ts 40
```

The single directory-level **cycle** runs entirely _through_ `_shared` (every domain + infra + transport

- foundation are in it only because they reach into the drawer and it reaches back). The file graph
  itself is acyclic. So the "interwoven" feeling is **one drawer**, not tangled features — dissolving
  `_shared` into real homes (see `core/Core-Core-Legacy-Migration-and-Gaps.md`) breaks the cycle and removes essentially
  all the cross-cutting coupling in one move. Feature-to-feature coupling is otherwise near-zero.

<!-- Source: Core-Audits-and-Debt.md -->

## Implication

You do not need finer-than-5 packages or heavier modularization to make pivots cheap. The two levers
that matter — **dissolve `_shared`** and **keep domain↔domain on injected ops** — are both already in the
plan. **Confirmed build/scaffold order** (leaves-first, clean once `_shared` is gone):

```
kit → contracts → db → server (foundation → infra → domain[leaf-first] → transport → entry) → client
```

> The full per-edge / per-bucket data + the `orb-scan.ts` script are the re-runnable artifacts (kept in
> the working scratchpad during planning). Re-run against a fresh snapshot to verify the cake stays clean
> as scaffolding proceeds.

<!-- Source: Core-Audits-and-Debt.md -->

## ARCHAEOLOGY — Doc-review findings punch-list (2026-06-28, RESOLVED — reference only)

> **✅ RESOLVED 2026-06-28.** All HIGH/MED findings + both systemic clusters (C1 D34 tuple-homes, C2 D32
> bimap-homes, C3 D45 fallout) + the LOW nits were fixed in a verify-then-edit pass (~60 doc edits). The
> scripting proposal was graduated to **ledger D46**; the 7 ST features to **D47**. **Remaining (low/none):**
> (a) db.md's full per-row movement-table D37 reconciliation — a D37 callout note was added listing the
> restored set (canonical per the baseline + code), full per-row rewrite deferred; (b) the broader
> `resolveRoleConnection`→`resolveRole` rename across the ~10 non-credentials docs (credentials.md done;
> `resolveRole` is canonical per connection.md); (c) the `CredProvider`/`CredentialProvider` name pick (verify
> against the code symbol first); (d) C4 "13 gates" shorthand left as-is (it's a correct count — 13 structural
> gates per Core-Laws-and-Precedents.md). This file is retained as the historical record.

> **Source:** a 6-agent full-read rigor/adherence review of every architecture `.md` doc (Phase 0 → pre-chat;
> `chat.md`/memory excluded as the Phase-5 frontier). Each agent read its slice IN FULL and checked against
> the canonical sources (`core/Core-Laws-and-Precedents.md` wins on conflict; `Core-0-Architecture-and-Structure.md` = constitution).
> **This is a work punch-list for the doc-fix agent** — every finding, severity-tagged, grouped by file.
> Nothing here is a code change; these are doc corrections (the docs lagged decisions/edits).
>
> **Verdict overall:** no structural rot. The spine, the ownership model (D18→D20/D23), and the big
> decisions (D16/D17/D28/D31/D33) are clean and consistent. Findings are **staleness + propagation gaps**.

<!-- Source: Core-Audits-and-Debt.md -->

## Severity key

`HIGH` = a builder works from this doc and builds the wrong thing · `MED` = real defect, lower blast radius
· `MINOR`/`LOW` = staleness/naming/consistency nit · `INFO` = optional polish.

<!-- Source: Core-Audits-and-Debt.md -->

## Systemic clusters (fix these together — same root cause across docs)

- **C1 — D34 not propagated** (HIGH): db-enum-column tuples still homed in `domain/*/contract/` instead of
  `@orb/contracts/*`. Affects `Spine-TypeScript-and-Patterns.md`, `workloads.md`, `embeddings.md`, `search.md`,
  `db.md`. `@orb/db` cannot import a server-tier domain, so these get built wrong. D34 was written for exactly this.
- **C2 — D32 bimap home not swept** (MINOR): the ST role bimap / entry-injection role still shown at
  `kit/world-info` instead of `kit/message-role` (+ `{depth,role}` → `kit/injection`). Affects
  `domains.md`, `Core-Legacy-Migration-and-Gaps.md §9`, `world-info.md`, `Spine-TypeScript-and-Patterns.md`, `Spine-TypeScript-and-Patterns.md`.
  (serialization-core.md was already fixed — D40c.)
- **C3 — D45 fallout from the just-made vision edits** (HIGH/MED): `connection.md` Part II shape block,
  `providers.md` warning-code, `Core-Legacy-Migration-and-Gaps.md` vision rows, ledger D44 `MessageImage`.
- **C4 — "13 gates" shorthand is stale** (LOW): `core/Core-0-Architecture-and-Structure.md §7` no longer states a count; `Core-Laws-and-Precedents.md`
  is the real catalog. Cited stale in proposal §0, `PRE-SCAFFOLD-CHECKLIST §A1`, `COUNCIL-REVIEW §13`,
  `INCONSISTENCY-AUDIT`, ledger R10. Retire the phrase or repoint to Core-Laws-and-Precedents.md.
- **C5 — settled decisions still framed "Open"** (MINOR): ledger §2 already DECIDED items shown as open
  "leans" in `settings.md`, `foundation.md`, `Spine-Identity-and-Auth.md`, `db.md` (Groundhog-Day hazard).

---

<!-- Source: Core-Audits-and-Debt.md -->

## `Core-STATUS.md` (read-first handoff doc — high impact)

- **MAJOR** — NEXT ACTION wave list (L100–101) is **pre-D38/D16**: omits `character` (W1), `connection`
  (W1.5), `notifications` (W1). Fix: replace with the D38 wave order, or point to `BUILD-PLAN §4c` without re-listing.
- **MAJOR** — "Latest decision" contradiction: header (L8) says **D44**, footer (L96) says **D40**; both
  stale → now **D45 + PD-11**. Fix: reconcile both to D45/PD-11.
- **MINOR** — (L99) "domain dirs hold 1-line stubs" — 4c W1 (sessions/admin) is committed, persona/preset/
  settings/notifications in progress. Fix: "Phase 4c NEXT" → "4c W1 in progress."

<!-- Source: Core-Audits-and-Debt.md -->

## `Core-0-Architecture-and-Structure.md`

- **MINOR** — §6 (L232) "(corpus)" → **(discovery)** (rename).
- **MINOR** — "Open decisions" (L278–282): UI engine framed "DEFERRED (recommended Base UI)" + version pins
  "deferred to scaffold" — **D42** DECIDED Base UI + the `@orb/ui` package; pins landed in **Phase 0**
  (BUILD-PLAN L22). Fix: mark UI-engine DECIDED, note pins done.
- **MINOR** — status header "Status: planning" — build is at 4c. Fix: "authoritative (build in progress)."

<!-- Source: Core-Audits-and-Debt.md -->

## `Core-BUILD-PLAN.md`

- **MINOR** — Phase 2 / Phase 5 (L41–50, L81–88) don't capture **D44/D45** "born-compliant before Phase 5"
  contracts obligations (`MessageContentBlock`, `ModelCapability.vision`, `ChatHistoryMessage.content`
  string→content-part reshape). Fix: add a contracts-amendment note before Phase 5.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains.md`

- **MAJOR** — "serialization core RESOLVED" (L257) homes the ST role bimap at `@orb/kit/world-info` →
  should be **`@orb/kit/message-role`** (D32/D40c). [C2]

<!-- Source: Core-Audits-and-Debt.md -->

## `AGENTS.md` (self-declared non-authoritative digest)

- **MINOR** — §7.1 (L295–306)/§7.5 (L398): "agents are FIRST-CLASS PRINCIPALS — LOCKED" framed as the v1
  model + `users.role` as `admin/user`. Council DEFERRED the agent-principal mint to v2 (v1 = borrowed-owner,
  ledger §5/§3); role axis is `owner|admin|user` (D17). Fix: annotate with the council deferral + D17.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-TypeScript-and-Patterns.md`

- **MAJOR** — §2 (L80)/§5 (L189–190)/§1 (L48): homes `WorkloadKind`/`WorkloadStatus` at
  `domain/workloads/contract` and `SourceLens`/lenses at `domain/embeddings/contract`; these constrain **db
  enum columns** so they must be in `@orb/contracts/*` (**D34**, reaffirmed D38). Self-contradicts the doc's
  own §1 db-enum rule (L49). Fix: move the tuples to contracts; fix the gold-standard path (L97
  `contract/workload-kind.ts`). [C1]
- **MINOR** — §1 (L47)/§2 table (L64)/§5 (L195): lists `EntryInjectionRole` under `kit/world-info` and
  `messageRole` target home "@orb/contracts (chat/preset)" — D32 collapsed these into `MESSAGE_ROLES` at
  `kit/message-role` (the doc self-corrects in §2 L83–86 / §5 L183 / §8 L261; these cells are leftovers). [C2]
- **MINOR** — §1 (L42): cites the cake as `core/Core-0-Architecture-and-Structure.md §6` (it's **§2**) and writes the arrow direction
  reversed (canonical is `kit ← contracts ← db ← server ← client`). Fix: cite §2, use `←`.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-TypeScript-and-Patterns.md`

- **MINOR** — §1 (L47): cites `ENTRY_INJECTION_ROLES` as a live kit↔contracts example — stale (D32 collapsed
  it into `MESSAGE_ROLES`). The rule is fine; swap the example. [C2]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-TypeScript-and-Patterns.md`

- **MINOR** — "Gate candidates" (L110) frames `no-decorators` as future ("add to Phase 0b") while the grit
  section (L136) lists it active now. Fix: reword the candidate framing to "active." (Doc otherwise CLEAN.)

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-Identity-and-Auth.md`

- **MINOR** — §6 (L376–378): "does `Principal` carry `groups`?" listed as an open decision (Lean: drop) —
  ledger §2 DECIDED **no groups**. The interface body is already correct; only the open-decisions list is
  stale. Fix: demote to resolved, cite §2. [C5]
- **MINOR** — §5 invariant 14 (L334–337): "exactly one owner" specced **only** as a test; the structural
  enforcer is unnamed. **D40** tracks this as still-open (a partial-unique index on `role='owner'`, or
  seed-only-mint discipline). Fix: add the structural enforcer, or flag it as the open 4c item per D40.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-Config-and-Serialization.md`

- **MINOR (low)** — "Open decisions" (L266–269) + §(b) (L99–104): stranded toggles framed "lean PROMOTE /
  decide per-knob" — ledger §2 DECIDED promote `VLLM_*_CONCURRENCY`, `RATE_LIMIT_*` stays boot-env; D40
  defers `IMPORT_DEFAULT_SOURCE`'s AppSettings half to the import slice. `VLLM_*_CONCURRENCY` is flatly
  decided and should not read as open. Fix: align language to §2 + D40. [C5]

<!-- Source: Core-Audits-and-Debt.md -->

## `participants-agents-identity.md`

- **MINOR** — §6 (L149–150): agent-sdk session home written `infra/providers/agent-sdk/session/` — missing
  the `backends/` segment (**D8**; identity §1 L100 has it right). Fix: → `infra/providers/backends/agent-sdk/session/`.
- **MINOR (low)** — §6 (L151) vs identity §6 (L382–385): "agent = pattern vs domain" — participants says
  RESOLVED, identity says open/"Lean: pattern". Same conclusion; reconcile the status.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-1-DB.md`

- **MED** — Movement table + schema layout **predate D37** and omit its restorations: `chats.variableValues`,
  `chats.importedFrom`/`importHash` (note: L141's are the _characters_ flat-row keys — different),
  `message_variants.apiErrorStatus`/`toolCalls`, `sessions.lastSeenAt`/`userAgent`, `unique(characterId,
model)` on `character_embeddings`, `unique(ownerId, handle)` on `characters`, `audit_logs` FK+indexes. Fix:
  reconcile to D37. [C1-adjacent]
- **LOW** — Invariant 5 (L291)+L136: `hub_score` "advisory, never nulled" but the `integer→real` correction
  (D37, all 4 vector tables) isn't stated. Fix: note `hub_score` is `real`.
- **LOW** — "Still open (deferred)" (L344): the `runtime.ts`/`sdk-session.ts` item sits under "Still open"
  but its body says "RESOLVED (D35)." Fix: move to "Resolved decisions." [C5]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-2-Foundation.md`

- **LOW** — "Open decisions" (L448–454): "drop the DbInspector port" + the `HOST_SECRET_ENV_KEYS` denylist
  split are DECIDED in ledger §2. Fix: demote both to DECIDED, cite §2. [C5]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-3-Infra.md`

- CLEAN. (The D40 infra/auth-never-yields-userId treatment is the cleanest in the set.)

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-3b-Providers.md`

- **HIGH** — §7.5 (L325): the `credential.source` dispatch union is `max-pro-sub | openrouter | vllm |
custom_openai` — **4 members, missing `local-light`** (D39/D31). The runner union (L321) correctly stays 4
  (`local-light` has no chat surface). Fix: add `local-light` to L325 only.
- **HIGH** — "internal layout" (L127–147, `backends/`): `backends/local-light/` is **absent** (D39; council
  §5 prereq). Fix: add `backends/local-light/` (embed/rerank/image-embed surfaces; keyless/loopback, no chat surface).
- **MED** — the D45 bullet (L513–514) cites a `warning` ChatEvent for image-part drop, but **D41 froze
  `WARNING_CODES` at exactly 4** (no image code) and sites emits at resolve-chat/the runners, not "at
  assembly." Fix: add a 5th `WARNING_CODE` (e.g. `image_dropped`/`vision_unsupported`) and update D41's
  "exactly 4" framing, OR specify the assembly-side warning rides a different ChatEvent. [C3]
- **LOW** — §7.1/Esoteric §1: `ROLE_SOURCE_POLICY` (the firewall map D39 amends to add `local-light` to
  embed/rerank/imageEmbed) is never named. Fix: add a line noting `local-light` joins those arms (NOT
  summarize/generateImage).

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-4-Transport.md`

- **INFO** — layout (L136) still shows `corpus.ts`; the Resolved decision (L430–434) renamed it to
  `routers/discovery.ts`. Cosmetic lag. Fix (optional): update the layout snippet. (Otherwise CLEAN.)

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-5-Entry.md`

- **INFO** — `compose/role-clients.ts` (L56) doesn't name D39's `mint-local-light` boot helper (covered by
  the general `resolveRole` rebind). Fix (optional): mention `mint-local-light` alongside `mint-vllm`. (Otherwise CLEAN.)

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/connection.md`

- **HIGH** — Part II §2 "capability descriptor" (L587–604): the **authoritative** `ModelCapability` shape
  block has **no `vision`/input-modality axis** (only Part I prose L36–39 mentions it). §4 axis table
  (639–646), §6 invariant 3 (L664), §7.4 list (L322) likewise omit it. Fix: add the axis to the Part II
  shape block (`input: { vision: boolean }` or `inputModality`) + the §4/§6/§7.4 enumerations (**D45**). [C3]
- **MED** — catalog layout (L109) vs cross-boundary tables (L211, L333) + front door (L154):
  `ChatModelId` + `DEFAULT_CHAT_MODEL_ID` listed both in domain `catalog/chat-models.ts` and
  `@orb/contracts/connection/catalog.ts`, with a backwards server→contracts re-export (L236). Since the
  client consumes both, canonical = `@orb/contracts/connection/catalog.ts`; domain imports DOWN. Fix: state
  the canonical, remove the "re-exported from contracts" framing.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/credentials.md`

- **LOW** — storable-provider union named both `CredProvider` (L71/238/265/360) and `CredentialProvider`
  (L382/394). Fix: pick one (§7.5 uses `CredentialProvider`).
- **LOW** — (L49/293) refers to connection's verb as `resolveRoleConnection`; canonical is `resolveRole`. Fix: align.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/tag.md`

- **MED** — §"write side BUILT" (L110) introduces `tag.attachCardTagByName({ownerId, characterId, tagName,
source?, status?})`, but the `TagService` interface + verb list (L131/170) still enumerate only 11 verbs
  (`attachTag`/`detachTag`/`bulkAttachTag`, no `source`/`status`, no `attachCardTagByName`). Fix: add it to
  `contract/service.ts` + the verb list, or state it's the by-name card path of `attachTag` with the signature there.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/persona.md`

- **MAJOR** — §Movement (L125): `AssemblePersona` double-homed vs preset.md (L141) — same source symbol
  (`shared/prompt/prompt-assemble-types.ts`) routed to `@orb/contracts/persona/assemble-persona.ts` here and
  `@orb/contracts/chat/assemble.ts` there. Fix: defer to **`@orb/contracts/chat/assemble.ts`** (the
  assemble-types cluster home); persona.md imports the shape from there. [one-home]
- **LOW** — §contract (L56) "interface PersonaService (9 verbs)" but §Verbs (L85–87) enumerates **10**. Fix: count → 10.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/preset.md`

- (No own findings; it is the recommended home for `AssemblePersona` — see persona.md MAJOR.)

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/world-info.md`

- **LOW** — §owns (L27)/§Movement (L118, L125): never references **D32**; `resolveEntryInjection` homed in
  `kit/world-info` and entry role/placement treated as world-info-local. D32 moved `{depth,role}` to
  `kit/injection` and the role axis to `kit/message-role` (world-info is a _consumer_ passing its own
  `role:user` default). Fix: note the derivation from `kit/message-role` + `kit/injection`. [C2]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/character.md`

- **MED** — §Cross-feature (L261): says `bulkAddCardTag` goes through `tag.attachToCharacter` — **no such op**
  (it's `attachTag` / `attachCardTagByName`; `attachToCharacter` is a world-info-shaped name). Fix: reference
  the real tag op (align with the tag.md fix).

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/admin.md`

- **MINOR** — 8-slot layout (L105–137) omits `guard.ts`, but Movement (L173) + Resolved Q1 (L370–377) name it
  as a real root file (home of `can()`/`requireAdmin`/`requireOwner`). Fix: add `guard.ts` to the layout tree.
- **MINOR** — Resolved Q1 (L370): "`guard.ts` … imported DOWN by any domain" contradicts the injection model
  (settings receives `requireAdmin` via composition-root injection; `domain-no-cross-feature`). A domain
  importing `domain/admin/guard.ts` _is_ a cross-feature import. Fix: strike "imported DOWN by any domain";
  the gate travels by injection (or relocate guard to the identity spine if a truly importable home is intended).

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/settings.md`

- **MINOR** — "Open decisions" (L497–507): "promote stranded (b) toggles?" + "split `envDefaults()`" presented
  as open but ledger §2 DECIDED both. Fix: convert to DECIDED, cite §2. [C5]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/stats.md`

- CLEAN.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/workloads.md`

- **NEEDS-FIX (HIGH)** — §"WorkloadKind mapped-type Record" (L94–105) / §7.4 (L391–401) / layout (L187–192):
  homes `WORKLOAD_KINDS` + `WORKLOAD_STATUSES` + `ACTIVE_WORKLOAD_STATUSES` in `domain/workloads/contract/`,
  but the `workloads.kind`/`status` db columns + the `workloads_kind_active` partial-index WHERE must
  derive/mirror them and `@orb/db` can't import a domain (the movement row L335 requires the index predicate
  to mirror `ACTIVE_WORKLOAD_STATUSES` — impossible from a domain home). **D34** names this doc explicitly.
  Fix: move the three tuples (+ their `z.enum` + a `.contract.test.ts`) to `@orb/contracts/workloads`; db
  derives + CHECKs. Keep `ParamsByKind`/`ResultByKind`/`Runner`/`WorkloadError`/`WorkloadEvent`/
  `WorkloadProgress` domain-internal. [C1]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/embeddings.md`

- **NEEDS-FIX (HIGH)** — §7.5 (L332–340) / `contract/params.ts` layout (L121–122) / store params: homes the
  entire `SourceLens` union (incl. `image-raw`/`image-captioned`) only in `domain/embeddings/contract/params.ts`;
  the `image_embeddings.lens` db column needs a contracts tuple to derive (same db-can't-import-domain problem),
  and the doc never documents the `lens` schema column even though embeddings **owns** the schema. **D34**. Fix:
  add `IMAGE_LENSES` to `@orb/contracts/embeddings` (column derives + CHECK); keep the full `SourceLens`
  domain-side as the non-duplicated superset; add the `lens` column + `unique(assetId, model, lens)` to
  embeddings' movement/schema (it's the producer/owner, not search). [C1]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/search.md`

- **MINOR** — movement (L241) / §7.5 (L309): adds `image_embeddings.lens` + says "lens owned by embeddings
  (`embeddings/contract/params.ts`)" without acknowledging D34's `@orb/contracts/embeddings.IMAGE_LENSES`
  home / column-derivation. Fix: note the column derives from contracts; search imports the image subset. [C1]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/discovery.md` · `domains/assets.md` · `domains/sessions.md` · `domains/notifications.md` · `domains/memory.md`

- CLEAN.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/import.md`

- **NEEDS-FIX (HIGH)** — movement table (`env.IMPORT_DEFAULT_SOURCE → AppSettings`), §"Still open"
  (L443–454), §7.2/§7.5 (L306): treats `IMPORT_DEFAULT_SOURCE → AppSettings` as a live deferred decision and
  stamps imported chats' `source` from `env.IMPORT_DEFAULT_SOURCE`. **PROMOTION-DEBT PD-15** dropped this
  (2026-06-28, "neo-jank"): no chat-level default source — each ST message maps per-message provenance → its
  `message_variant` (D26); the env comment was pulled from `foundation/env`. (D40's "deferred to import slice"
  note is also superseded by PD-15.) Fix: remove the deferral + the env-stamp; replace with per-message
  provenance→variant mapping.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/export.md`

- **MED** — §owns / movement (L209) / Esoteric "basePng" / §"Still open": says the `sharp` transcode stays
  **inline** in `export-character.ts`, extract to `infra/image` only "iff a 2nd domain needs it." **D6** +
  the built code already inject `imageTransform` from `infra/image` (`domain/export/contract/service.ts`
  `FLAG[image-inject]` self-flags the doc as outdated since infra/image exists + assets consumes it). Fix:
  update to the injected `imageTransform` model.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/buddy.md`

- CLEAN. (Absorbed the prior B2/B3 audit hits: `resolveChatHost` not `chats.ownerId`; owner-delegated
  `credentials.resolve`; agent-as-pattern.)

<!-- Source: Core-Audits-and-Debt.md -->

## `UI-Architecture-and-Layout.md`

- **LOW (no change needed)** — §1 cake diagram is correct (parallel arms); the _linear shorthand_
  `kit ← contracts ← ui ← client` used elsewhere wrongly implies `ui → contracts`. D42/client.md §1.1/§8 say
  `@orb/ui` has no contracts dep. Fix: annotate the linear shorthand _elsewhere_ (not in client.md). Otherwise CLEAN.

<!-- Source: Core-Audits-and-Debt.md -->

## `proposals/scripting-automation-extensibility.md`

- **MED** — §0/§7/§10: pervasive "DECIDED/COMMITTED/LOCKED/BUILD" vocabulary commits new cake homes
  (`@orb/contracts/plugin`, `domain/plugin`, `infra/plugin-host`, `@orb/contracts/automation`,
  `domain/automation`, a globals KV table, a `message_variants` variable-delta column) — but **no ledger
  D-entry exists** and the doc's own header says "nothing here is law" until it graduates to the ledger. Fix:
  EITHER add a ledger D-entry (Nate decision) OR soften body vocabulary to "proposed/recommended (pending
  ledger promotion)." **(Requires a Nate decision — see "Open decision" below.)**
- **LOW** — §5.3 homes table: "Predicate engine — `kit/macro` (+ optional CEL)" contradicts §0/§5.1/§8/§10
  where CEL is ADOPTED/committed. Fix: drop "optional."
- NOTE (clean): §6 security framing is commendably honest — it states producer-scoping enforcement is unbuilt
  and `can()` capability gating is `FLAG[PD-1]`/aspirational. Do NOT "fix" this into an over-claim.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Core-Legacy-Migration-and-Gaps.md`

- **HIGH** — §5 ("Vision / image INPUT" row) + §7 ("big lifts" + item 1): lists vision input
  `ABSENT`/`PAINFUL→ARCHITECTURAL` and "a _separate, OPTIONAL_ capability — NOT being built… a reservation."
  Contradicts **D45** (in scope, committed, born-compliant) + client.md §12.4. Fix: re-status to
  COMMITTED/born-compliant; delete the optional/reservation framing. [C3]
- **LOW** — cold-read orientation (L18): "no extension/scripting runtime" stated as a present design fact
  while §3 marks STscript/extensions "committed." Fix: add "(today; scripting runtime is proposed — see Tier 2)."

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Core-Legacy-Migration-and-Gaps.md`

- **LOW** — §9 (L196): "ST role bimap … now ONE in `kit/world-info`" contradicts its own §1 (L62) + **D32**
  (`kit/message-role`). Fix: change L196 to `kit/message-role`. [C2]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Core-Audits-and-Debt.md` (historical record)

- **LOW** — header (L6–7): "Q2 (ChatSource vs CredentialSource) is the only item left open" — **D31** resolved
  Q2, **D36** resolved Q3, export.md resolved Q7. Fix: note Q2 closed by D31 (and Q3/Q7 resolved).

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Core-Planning-and-Checklists.md`

- **LOW** — §A1 (+ shared across docs): the "13 gates (core/Core-0-Architecture-and-Structure.md §7)" shorthand is stale. Fix: retire or
  repoint to Core-Laws-and-Precedents.md. [C4]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Laws-and-Precedents.md` · `core/Core-Core-Audits-and-Debt.md` · `core/Core-Core-Planning-and-Checklists.md` · `core/Core-Core-Audits-and-Debt.md`

- CLEAN.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Laws-and-Precedents.md` (canonical — handle carefully)

- **LOW** — D44 "Homes" list names the primitive `MessageImage`; D44's own prose + all of client.md use
  `MessageMedia`. Fix: the stray `MessageImage` in D44 → `MessageMedia`. [C3]
- (If the "13 gates" shorthand is retired per C4, R10's "grown to 13" phrasing may need a pointer to Core-Laws-and-Precedents.md.)

---

<!-- Source: Core-Audits-and-Debt.md -->

## The one OPEN DECISION (not a doc-fix — needs Nate)

**Graduate the scripting proposal + the 7 greenlit ST features to ledger D-entries?** The proposal (and the
ST features Nate greenlit) use committed language but have no ledger entry; the proposal's header says it
isn't law until ledgered. Resolve by either (a) writing the D-entries (makes the cake homes real), or
(b) softening the proposal vocabulary to "proposed." Until decided, the `proposals/` MED finding above and
the `sillytavern-feature-gap` "committed" statuses sit in limbo.

<!-- Source: Core-Audits-and-Debt.md -->

## Confirmed CLEAN (do not manufacture findings here)

The spine docs (identity/settings/serde/testing), `infra.md`, `transport.md`, `entry.md`, `buddy.md`,
`discovery.md`, `assets.md`, `sessions.md`, `stats.md`, `notifications.md`, `domains/memory.md`,
`Core-Laws-and-Precedents.md`, `Core-Audits-and-Debt.md`, `Core-Planning-and-Checklists.md`, `Core-Audits-and-Debt.md`, and `UI-Architecture-and-Layout.md` (internally).
The ownership model (D18→D20/D23), D28 de-pin/flat-card, D16 notifications, D17 roles, D31 CredentialSource,
D33 guided-actions, D24 per-type-FK are all correct and consistent across docs.

<!-- Source: Core-Audits-and-Debt.md -->

## Promotion / Relocation Debt Registry

**The ONE place that lists every type/symbol/file deliberately homed in a TEMPORARY location with a
commitment to move (promote/relocate/replace) it later.** Born 2026-06-27 because these deferrals were
scattered across code `FLAG` comments + per-`D`-entry ledger notes + agent reports — collectively
invisible, individually forgettable. This file makes the set greppable in one place.

<!-- Source: Core-Audits-and-Debt.md -->

## The Flagging System

The codebase uses two distinct types of `FLAG` comments. It is critical to distinguish between them:

<!-- Source: Core-Audits-and-Debt.md -->

### 1. Promotion Debt (`FLAG[PD-XX]`)

Denotes **temporary debt**, missing features, stubs, and items deliberately homed in a temporary location with a commitment to move/build them later.

- Every temporary deferral lives here as a `PD-<n>` row: **item · current home · target home · TRIGGER · status**.
- Every in-code debt flag MUST cite its id: `// FLAG[PD-7]: …`. A grep of `PD-` reconciles code ↔ this registry. A flag with no row, or a row with no flag, is a drift.
- When a trigger slice is built, its agent **clears every `PD-` row whose trigger is that slice** (or flips it `done` with the resolving commit).

<!-- Source: Core-Audits-and-Debt.md -->

### 2. Architectural Markers (`FLAG[name]`)

Denotes **permanent architectural boundaries**, design invariants, and structural decisions.

- These flags (e.g., `FLAG[scope]`, `FLAG[bus-not-on-ctx]`, `FLAG[neo-quirk]`) do **NOT** have a `PD-XX` ID.
- They exist to explicitly document _why_ a design is the way it is, preventing future developers or agents from mistakenly "fixing" or refactoring them.
- **DO NOT** remove or "resolve" these markers. They are load-bearing documentation.

Status: `ready` = trigger has landed, do it now · `blocked:<slice>` = waiting on that slice · `done`.

<!-- Source: Core-Audits-and-Debt.md -->

## Registry

| id    | item                                                                                                               | current home                                                                      | → target home                                                              | trigger                                                                                                                                                | status                         |
| ----- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| PD-2  | `AdminUserView`                                                                                                    | `domain/admin/contract/views.ts` (admin owns its read-model — correct home today) | `@orb/contracts/identity`                                                  | DECIDED: stays in admin/contract; relocate ONLY if the Phase-6 admin client imports the view type directly (a concrete P6-build check, not "iff ever") | blocked:client(P6)             |
| PD-7  | agent-sdk reseed-from-canon                                                                                        | `infra/providers/backends/agent-sdk/session/` (seam exists; unfed)                | wire the durable `sessionStore` / canon feed                               | chat/canon (P5)                                                                                                                                        | blocked:sdk-session               |
| PD-12 | credentials `CustomModelProfile` (BYO model profile)                                                               | deferred (credentials.md)                                                         | `@orb/contracts/credentials` (NOT importing `ModelCapability` — D31 cycle) | BYO custom-endpoint form                                                                                                                               | blocked:connection/credentials |
| PD-13 | custom-byo `CustomOpenAiResponseMap` + `includeBody`/`excludeBody`                                                 | engine built; config type deferred                                                | `@orb/contracts` + the credential metadata                                 | custom-endpoint form                                                                                                                                   | blocked:connection/client      |
| PD-16 | providers diagnostic `signal?` threading                                                                           | carried on the request shapes, unthreaded                                         | thread through once reachable                                              | SDK ports gain request options                                                                                                                         | blocked:upstream-sdk           |
| PD-17 | chat `agent` participant kind / agent-as-first-class-principal (`provisionAgentPrincipal`, `users.isAgent`/`kind`) | v1 borrowed-owner posture                                                         | `chat` + `users` + identity                                                | agent split (P5+)                                                                                                                                      | blocked:v2               |
| PD-18 | `reconcile-world-state` WorkloadKind + the P5 workload/presence/buddy seams (D38)                                  | reserved tuple member / type stubs                                                | activate in chat/workloads                                                 | v2 / P5                                                                                                                                                | blocked:v2                     |

| PD-21 | stats canon OWNER-ATTRIBUTION for the group-chat edge — `reconcileStats` attributes assistant economics by `characters.ownerId` + user turns by chat membership; the multi-owner group-chat case is unsettled (`applyStatsDelta` itself is attribution-agnostic, so chat retains control) | `domain/stats/write/rebuild-from-canon.ts` (`FLAG[PD-21]`) | confirm against chat's D18 membership model; the stats-drift test is the enforcer | chat lands (P5) | ready |
| PD-22 | stats→discovery per-message economics read seam — NOT built. DECIDED (Nate 2026-06-28): build it **D26-aware** (read economics from `message_variants`, NEVER neo's `messages`-columns premise). The stats domain itself (`applyStatsDelta`/`reconcileStats`) is ALREADY D26-aware (built post-D26) — there is no existing jank to rewrite; this is the consumer-side READ. Build it WITH the discovery corpus-economics consumer (PD-40), not as a consumer-less seam now. | `domain/stats/persistence/` (D26-aware) + the discovery consumer | the discovery corpus-economics surface lands (PD-40) | blocked:discovery-corpus(PD-40) |
| PD-23 | notifications `emit` → transport bus FAN-OUT — the durable `record` is built; the after-commit per-user bus subscription/stream is built in transport, but the domain producers (chat) are not wired to it | `domain/notifications` provides `record` + the `EmitNotification` type | chat domain wires the subscription producer emit | chat lands (P5) | ready |
| PD-24 | notifications `record` TX-ATOMICITY — runs durable-first on `ctx.db`; the doc wants the INSERT inside the producer's membership-transition tx (a tx-executor seam no domain threads yet) | `domain/notifications/verbs/record.ts` (durable-first today) | widen `record`/context to accept the producer's tx executor | chat lands (P5 — chat is the producer) | ready |
| PD-25 | credentials DRAFT (pre-save) endpoint inspect — `providers.inspect` takes a `ResolvedCredential` (non-null `credentialId`), so an unsaved custom_openai draft can't be inspected without a raw-args inspect op or a contract change | `domain/credentials/verbs/inspect-endpoint.ts` (saved-credential-only) | a draft-inspect path (raw args) on the providers front door, or a contract widening | custom-endpoint form (connection/client) | blocked:connection/client |
| PD-26 | assets maintenance verbs (`backfillAvatars`/`collectGarbage`/`reapIfOrphan`/`fsck`/`rebuildFromTree`) + the avatar-ref registry | not built (deliberate v1-defer) | `domain/assets` + injection into character.remove / the workloads runner | DECIDED (Nate 2026-06-28): a NAMED v2 maintenance/ops pass, not "someday" — the orphan-blob leak is slow + benign (avatars are small, hard-deletes rare), so there is no v1 driver; build when blob-store growth is a real concern OR an ops/maintenance admin surface lands. The workloads runner-env already holds the inert seams. | deferred:v2-maintenance |
| PD-29 | assets `sniffMime` → `@orb/kit/assets` | `domain/assets/substrate/mime.ts` | `@orb/kit` | iff the client ever pre-sniffs | blocked:client(P6) |
| PD-30 | world-info chat-scope attach/detach/list + `WiBusEvent` emit (hard block: `chats` has no `ownerId` D18; admin `ResourceRef = GlobalResource` only) | `domain/world-info` (`chatBooks` table + `WiBusEvent` type declared, unwired) | wire when the `can({kind:'chat',roster})` arm + the chat bus exist | chat lands (P5) | ready |
| PD-34 | embeddings memory lenses — the `chat-block` SourceKind + `segment`/`digest` lenses + `newChatDigestId`/`newChatSegmentId` (the `satisfies Record<SourceLens,VectorTable>` belt + the store `assertNever` go red until added) | `domain/embeddings` (W2 = card/image only) | `domain/embeddings` store arms + indexer | chat/memory built whole (P5, D16) | blocked:audit |
| PD-35 | search memory-retrieval verbs — `discover` (note: `digests`/`segments`/`corpus` are BUILT) + the `MemoryQueryOptions` consumers + mix modes + membership-derived chat scope (D18) | `domain/search` (W2 = card knn/findCharacters only); the `@orb/contracts/search` seam exists | `domain/search` verbs | chat/memory (P5) | blocked:audit |
| PD-36 | search cross-modal `images` verb (text→image) + the cross-modal CSLS-skip exception | `domain/search` | `domain/search` | imageEmbed space + a later wave | blocked:later |
| PD-37 | search lexical BM25 `fields`/`suggest` engine (`minisearch` not in the workspace) | `domain/search` | `domain/search` + the minisearch dep | a later lexical-search wave | blocked:later |
| PD-38 | search unified `search(UnifiedSearchParams)` dispatch + `SearchScope` (premature with a partial verb set) | `domain/search` | `domain/search` | after the memory + lexical verbs land | blocked:search-verbs |
| PD-39 | discovery `digest_theme_assignments.msgMidAt` backfill (themeDrift) — assignments write without it (column nullable) | `domain/discovery/themes` | `domain/discovery` | the themeDrift wave | blocked:later |
| PD-40 | discovery rest-of-corpus surface (distill/browse/archetype/projection/similarity/catalog/insights/tag-suggest/cooccurrence + the chat near-dup arm `duplicate_chat_pairs`/`relation`) | not built (W3 = character dup + themes/hub only) | `domain/discovery` | later corpus waves + chat (P5) | blocked:later |
| PD-41 | workloads P5 backfill stubs — `WorkloadMemoryEnv` (generateDigests/segments) + `WorkloadCharacterEnv` (mintSyntheticGroupCharacter) typed seams + the INERT memory/group-character runners + the v2 `reconcile-world-state` no-op (D38) | `domain/workloads` (declared seams + inert runners) | wire the bodies | chat/memory (P5) | ready |
| PD-42 | export chat transcript — `exportChat` + `ExportChatFormat` + `ExportedText` + JSONL/TXT builders | not built (export = character card only) | `domain/export` | chat built whole (P5, D16) | ready |
| PD-45 | buddy `observer/` reaction engine + `bus.ts` — reacts to chat/workload event sources that don't exist pre-chat (buddy builds first to expose the agent seam, D38); the pure mood machine it drives IS built | not built (deferred) | `domain/buddy/observer` | chat event sources (P5) | blocked:buddy |
| PD-53 | embeddings BULK embed-pass workload — the `content_hash` catch-up sweep. The on-write indexer subscription (PD-48) is wired, but the `embedCorpus`/`embedAssets` workload runner-env ops have no backing bulk-pass verb on `EmbeddingsService` (only the single-row `store`); the resumable bulk corpus/asset re-index sweep is a separate, larger piece. | `entry/compose/runner-env.ts` (`FLAG[PD-53]`, inert bulk seams that reject loudly) | a bulk embed-pass verb on `EmbeddingsService` (resumable, content_hash-gated) → wire `embedCorpus`/`embedAssets` into the workloads runner | the `content_hash` catch-up sweep needed (entry.md open decision) / a re-index workload wave | ready |
| PD-54 | tool/function-calling OpenAI-wire shape + the domain-owned recurse loop (D48) — the capability GATES (`tools`/`output.structured`) landed; the wire seams are deferred-blessed: `tool` history role on the WIRE axis (`HISTORY_ROLES` in `infra/providers/contract/chat.ts`, NOT kit `MESSAGE_ROLES`), tool-call/tool-result `ChatContentPart` members, `tools`/`toolChoice`/`responseFormat` request fields, `WARNING_CODES` += `tools_unsupported`/`structured_output_unsupported` (with emit sites), a `ToolCallRecord[]` DTO + the `message_variants.toolCalls` retype | `@orb/contracts/connection` gates only (built); shape in `domains/proposed/tool-use/tool-use.md` | `infra/providers/contract/chat.ts` + `@orb/contracts/chat` + `domain/tool-use` registry + `domain/chat` loop | chat lands (P5) — the recurse loop is domain-owned | ready |
| PD-55 | gallery v2 — curated per-character media (gallery v1 is a free `assets.listOwned` read view, no debt) | not built (deferred); `domains/proposed/media-surfaces/media-surfaces.md` | a `"gallery"` `ASSET_KIND` + a single-owned `gallery_items` table (per-type `subjectCharacterId` FK, D24) + a `domain/assets` write verb | only if curated per-character galleries are wanted (a ledger call) | deferred:product-call |
| PD-56 | expressions/sprites (D49) — emotion-classify → sprite swap | not built (deferred); `domains/proposed/expression-stage/expression-stage.md` | a `classify` provider role (v1 = `chat`-role shaper; v2 = `local-light classify`, D39) + a `character_sprites` model (`(characterId FK, label, assetId FK)`, owner DERIVED D23) + an `EXPRESSION_LABELS` tuple + a per-turn chat hook + a client render slot | chat lands (P5) for the per-turn hook | deferred:P7 |
| PD-57 | databank (Data Bank / document-RAG, D49) — DECIDED build-as-additive-graft | not built (deferred Phase 6/7); `domains/proposed/databank/databank.md` | a `documents` single-owned producer + `global/character/chat_documents` junctions + a derived `document_chunks` vector table + `@orb/kit/chunk` + a db-free `infra/extraction` loader + `embeddings.store` 5th arm + a `search.documents` lens + a chat `{{databank}}` slot | post-chat (P6/7) additive graft; nothing born-compliant-now | deferred:P6/7 |
| PD-58 | client observability — the browser has NO pino (Node-only); needs the client side built. Port neo's format-parity helpers (`client/lib/log-clock.ts` HH:MM:SS.mmm console tag + `[channel]` tags + the tRPC `loggerLink` + `long-task-tracer`) so browser console reads like server pino, PLUS an error boundary + a client→server error-report sink so client errors land in the same `/api/_debug` ring/log (the real "unify pino + console"). The server pino/pino-pretty side is DONE (string levels · isoTime · err serializer · `scripts/dev/pino-pretty.json`). | not built (Phase-6 client) | `@orb/client` log helper + tRPC loggerLink + error boundary + a `clientError` report verb feeding the foundation log/ring | client build (P6) | blocked:client(P6) |

<!-- Source: Core-Audits-and-Debt.md -->

## Bucket B — chat-landed re-verification (2026-07-01)

**Context:** a large share of the Registry was `blocked:chat(P5)`. `domain/chat` is now BUILT (roster,
arbitration engine, assembly, memory, bus, invites, auth seam). So every `blocked:chat(P5)` row was
re-checked against the actual code to see whether its trigger has landed. Verdicts below are
code-verified; **flip these statuses in the Registry as each is picked up.**

**→ PROMOTE to `ready` (trigger verified present; small-to-medium wiring, not a feature):**

- **PD-8** — `PARTICIPANT_KINDS` + `PARTICIPANT_ROLES` unions exist in `@orb/contracts/{chat,identity}`; `inspect-chat.ts` just imports them instead of `string`. Trivial.
- **PD-21** — `domain/stats` rebuild-from-canon is fully built; only the group-chat multi-owner **attribution edge** is open — confirm against chat's D18 membership (now exists). Small.
- **PD-23** — `notifications.record` (durable half) is built; chat (the producer) now exists → wire the after-commit per-user bus fan-out from the chat producer.
- **PD-24** — Same producer seam: run `record`'s INSERT inside the chat producer's membership-transition tx (chat is the tx owner, now built).
- **PD-30** — world-info chat-scope: `chatBooks`/`WiBusEvent` declared, and the two hard deps now exist — the `can({kind:'chat',roster})` arm (PD-1 DONE) + `domain/chat/bus.ts`. Wire attach/detach/list + emit.
- **PD-42** — Chat canon (`messages`/`message_variants`) exists; `domain/export` still only does character cards → build `exportChat` + JSONL/TXT.

**→ SEAM READY but FEATURE-SIZED (trigger landed; real build, not a quick burn):**

- **PD-41** — Workloads memory/group-char runners are **confirmed inert stubs** (`group-character-backfill.ts` = "INERT P5 stub. FLAG[PD-41]"); chat+memory now exist → wire the runner bodies.
- **PD-54** — Tool-calling: the capability GATES landed, but the domain-owned recurse loop is ~absent in `engine/` → genuine feature (wire seams + `domain/tool-use` registry + the loop).
- **PD-34 / PD-35** — Embeddings memory lenses + search memory-retrieval verbs — `domain/chat/memory` is built, but the embeddings/search **consumer arms** need a focused audit of what's stub vs done before promoting.

**→ STAYS BLOCKED (verified genuinely not built — do NOT promote):**

- **PD-70** — `entry/compose/chat.ts` carries `FLAG[PD-70]: presence is not built` — presence architecture doesn't exist yet.
- **PD-45 / PD-64** — buddy `observer/` reaction engine not built (buddy's own build; needs the chat/workload event sources, which now exist — so it becomes buddy's call, not chat's).
- **PD-7** — agent-sdk reseed-from-canon needs a durable `sessionStore` canon feed (seam exists, unfed).
- **PD-17** — agent-as-first-class-principal — bigger identity-spine work (P5+), not a wiring flip.
- **PD-71 / PD-72** — search-corpus owner-id + memory-log sink — context-resolution / observability seams, still stubbed in `entry/compose/chat.ts`.

<!-- Source: Core-Audits-and-Debt.md -->

## Cleared

| id | item | resolved by |
| --- | --- | --- |
| PD-67 | decline invite by ID → `persistence/invites.ts` | DONE: the inline `chatInvites` UPDATE in `verbs/invites.ts` extracted to `persistence/invites.declineInviteById(db, inviteId, invitedUserId) → boolean` (atomic on `status='pending'` + caller-as-target scoped — leak-free, idempotent; the token-hash `declineInvite` twin keeps the link path). Verb delegates; persistence int test pins foreign-caller no-op / flip-once / idempotence. (The stray PD-67 cite in Parity-Audit-Protocol.md is a known mis-cite of the assets `maxBytes` note — this row is canonical.) |
| PD-83 | password verify injection → domain identity resolution | DONE (homed in `domain/sessions` — the identity-resolution domain; the row's `domain/identity` names a domain that doesn't exist): `sessions.authenticate(handle, password) → UserId \| null` (10th verb) — trims the handle, ALWAYS burns the scrypt KDF (`DUMMY_PASSWORD_HASH` floor — no user-enumeration timing oracle), collapses unknown-handle / SSO-only-null-hash / wrong-password / DISABLED into one leak-free null (the disabled gate is NEW, mirroring `provisionIdentity`'s posture; the old entry impl let a disabled row mint a next-request-dead cookie). `SessionsContext.verifyPassword` bound in `context.ts` from the same pepper as `hashToken` (infra/auth's sealed hasher, imported DOWN — the token-hasher precedent); admin keeps the hash MINT. `entry/lifecycle.ts` local mode now wires the verb (its inline `users` read + KDF deleted); auth-routes FLAG reconciled. 5 int tests. |
| PD-91 | IP allowlist middleware → `infra/network` | DONE: `infra/network/ingress.ts` (the Tier-3-Infra.md home) — `ipAllowlistMiddleware(cidrs)` + `clientIp(c)` (with the pure testable cores `isIngressAllowed` / `resolveClientIp` + the shared `parseAllowlist`), extracted VERBATIM-in-behavior from the inline `entry/app.ts` belt (`@hono/node-server/conninfo` has been in the workspace since 4e). The PD-52 anti-spoof precedence (XFF only behind loopback/private or `FORWARD_AUTH_TRUSTED_PROXIES`) is preserved + now pinned by unit tests; app.ts mounts the exported middleware and the tRPC seam reuses `clientIp`. |
| PD-90 | admin `embed` router | DONE (the PD-3 injected-port precedent): `admin.embedCharacterCard` — `adminProcedure` router proc (Tier-4 esoteric #10: only admins drive the GPU embed inline; bulk = the `embed-corpus` workload) → the new `AdminService.embedCharacterCard` verb (`requireAdmin` + audit + leak-free not-found) → the injected `EmbedProducerPort`, composed at `entry/compose/services.ts` from `character.getCard` (the OWNER-SCOPED read = the cross-domain producer-ownership check; D20 — the vector row carries no owner to spoof) + `character.loadCardText` (the same projection the indexer embeds) + `embeddings.store(kind:'card')` (hash-gated, idempotent). Verb int tests (gate / not-found / happy+audit) added; FLAG comments in router.ts/context.ts reconciled. |
| PD-92 | db-structure gate producer-schema mirror | DONE: the deferred arm-2 activated in `scripts/check/gates/db-structure.ts` — every `schema/<feature>.ts` must mirror a `domain/<feature>/` producer, with the Tier-1-DB.md reserved cross-cutting set (`users`/`audit`/`custom-types`/`relations`) plus the two documented non-domain producers (`rate-limit` → `transport/rate-limit.ts` D35; `sdk-session` → the agent-sdk backend session store D8/D25) mapped to their real paths and existence-checked. Arm skipped when `domain/` is absent (pre-Phase-4 snapshots). Gate self-test green; live tree clean. |
| PD-8 | `inspect-chat` `InspectedParticipant.{kind,role}: string` → canonical unions | DONE: `kind: ParticipantKind` (`@orb/contracts/chat` `PARTICIPANT_KINDS`) + `role: ParticipantRole` (`@orb/contracts/identity` `PARTICIPANT_ROLES`) — foundation imports contracts DOWN; the db rows are already branded so the mapping is direct. (`InspectedMessage.role` untouched — a message-role axis, not this flag's roster unions.) |
| PD-61 | invite verb dependencies → `ChatContext` | DONE (split per the load-bearing markers): `hashToken` + `newInviteId` moved ONTO `ChatContext` (crypto/minter siblings; entry root wires `createTokenHasher(sessionSecret)` + the `chat_invite` minter) and OFF `ChatServiceDeps`; invite verbs read `ctx.*`. `emit` deliberately STAYS a deps arg (`FLAG[bus-not-on-ctx]` — the bus is chat's own collaborator, the pattern every emitting bundle follows); `loadParticipantViews` STAYS deps (built inside chat's own composition root — chat-internal, not entry-wired, so it can't live on the entry-assembled ctx). Test ctx factory + invite/service int tests updated. |
| PD-74 | sharp image extraction → extracted module | DONE (doc-reconciliation — the CODE was already right): the transcode has always been the injected `infra/image` `imageTransform` op (D6; sharp sealed in infra, `assets` + `export` both consume). The flag existed only because `export.md`'s literal text still said "sharp stays inline / extract iff a 2nd domain needs it" — that criterion was met at build time. export.md's Movement row, `basePng` esoteric, and "Still open" entry updated to the injected model; the FLAG comments in `domain/export/contract/service.ts` converted to a plain architectural note. |
| PD-73 | host principal home → domain-level extraction | DONE (the flag's own D1-clean design): `sessions.loadUserById(userId) → {role,handle,externalId} \| null` (9th verb; sessions is the sanctioned `users` reader — no-direct-users-read chokepoint) + `createHostPrincipalResolver(sessions)` on the auth seam (`entry/auth/seam.ts` — the Principal construction site). `entry/compose/chat.ts`'s entry-local `users` read for `realHostPrincipal` replaced by the injected `resolveHostPrincipal` (wired in `compose/services.ts`). Unknown id degrades to `role:"user"` (fail-closed for the D17 owner-gates). Verb int test + seam resolver tests added. |
| PD-88 | `chat_events` writer → `persistence/events.ts` | DONE: the durable INSERT extracted from `bus.ts` into `domain/chat/persistence/events.ts` (`appendChatEvent(db,{id,chatId,event,createdAt}) → seq` — the correlated per-chat seq, caller-stamped id/clock); bus.ts awaits it before the ring push (durable-first unchanged). Readers stay in `queries.ts`. Mirror int test added (monotonic seq, per-chat independence, replay round-trip). |
| PD-86 | `messageHidden` bus event → `@orb/contracts/chat` | DONE: dedicated `messageHidden` member added to `ChatBusEvent` + `CHAT_BUS_EVENT_TYPES` (`@orb/contracts/chat`); `setMessageHidden` emits it instead of the `messageEdited` fallback. `reattributeMessages` deliberately KEEPS per-slot `messageEdited` (an attribution re-stamp IS a slot edit — `FLAG[reattribute-carrier]`, no `messageReattributed` member). `chat_events.type` CHECK re-derived → `0000_baseline` squash-regenerated (PD-60 precedent; stale meta snapshot refreshed); contract + int tests updated. |
| PD-87 | `participant_not_found` error → `CHAT_OP_CODES` | DONE: `participantNotFound: "participant_not_found"` added to `CHAT_OP_CODES` (`domain/chat/contract/errors.ts`); `updateCharacterParticipant` (the disable/talkativeness shared write) throws the coded `ChatOperationError` instead of collapsing to `ChatNotFoundError` (host-only surface — no leak). The handoff-nominee path deliberately KEEPS the leak-free `ChatNotFoundError` (user-id target; FLAG[handoff-nominee] reworded). Int test added for the coded refusal. |
| PD-5 | sessions `oidc-store` (`persistence/oidc-store.ts`) | DONE: built `createOidcStore` in `domain/sessions/persistence/oidc-store.ts` (using `oidcTransactions` DB table) + wired OIDC client discovery/routes into `entry/lifecycle.ts` using `openid-client` v6. |
| PD-43 | character provenance-create + `findByImportHash` | DONE: `character.create` handles `importedFrom` and `importHash` arguments natively, mapped at the import composition root (`run-profile-import.ts`). |
| PD-31 | character `getRosterCardView` (membership-gated, level-clamped `MemberCardView` — character.md §"member card view", D22) | DONE: implemented in `domain/character/verbs/get-roster-card.ts`. Injected `requireParticipant` and `getChatMemberCardVisibility` closures from chat domain into `CharacterContext` at `entry/compose/services.ts`. |
| PD-46 | transport `chat` router (`send`/`swipe`/`start`/`streamMessages`) + the chat service on the `Context` | DONE: `chatRouter` created with basic operations (`startChat`, `listChats`, `getChat`, `send`, `swipe`) + wired to `appRouter`. |
| PD-19 | tag `RequireParticipant` chat-tag membership gate (D30) — the port TYPE is declared in `domain/tag/contract/service.ts`; the RUNTIME guard is unwired (chat is built last, D16) | DONE: wired in `entry/compose/services.ts` using `requireParticipant` from chat guards. |
| PD-60 | host-handoff verbs (`nominateHostHandoff`/`acceptHostHandoff`) — no nomination storage, so `accept` couldn't securely verify the nominee (a self-promotion hole) | DONE. Schema seam `chats.pendingHostUserId` (nullable FK → `users.id`, `ON DELETE SET NULL`, `.$type<UserId>()`) added + the single `0000_baseline` SQUASH-regenerated (born-compliant; `schema-baseline-parity` green). Persistence: `loadPendingHostUserId` reader (`queries.ts`) + `setPendingHost` + the ATOMIC `acceptHostHandoffSwap` (ONE `db.batch`: demote present host → member [WHERE-`role='host'`, robust to a host who left after nominating], promote nominee → host by userId, clear `pendingHostUserId`) in `participant.ts`. The 2 verbs wired into the `createRoster` bundle: **nominate** = `requireHost` + nominee must be a PRESENT non-host member (`loadRoster`) → sets the nomination + emits `chatUpdated` + notifies the nominee (`handoff-nominated`); **accept** = `requireParticipant` + the un-spoofable verb-level self-action check (`principal.userId === pendingHostUserId`) → atomic swap + emits `chatUpdated` + notifies the old host (`handoff-accepted`, `newHostHandle`). Error codes (doc §2 silent → security-conservative + FLAGGED, no new code since `contract/errors.ts` is out of chunk scope): a non-member/self-nominate → leak-free `ChatNotFoundError` (the file's `participant-not-found` precedent); a non-nominee/no-pending accept → `not_turn_owner` (the closest "you don't own this pending action" code — the belt that keeps the self-promotion hole closed). 15 roster int tests (incl. the non-nominee refusal) + schema/parity green; tsc(server/db) + check:structure clean. |
| PD-59 | one home for the `host\|member` axis | DONE (no alias, per Nate — "no aliases before launch; ts-morph to standardize"). The tuple + type are RENAMED in `@orb/contracts/identity` to the canonical `PARTICIPANT_ROLES`/`ParticipantRole` (was `CHAT_RESOURCE_ROLES`/`ChatResourceRole`); the DAG-root home `can()` reads. Every consumer imports them FROM identity directly — `chat`'s contract (local use for `participantRoleSchema` + its wire shapes), `@orb/db` schema (`chat_participants.role`), `decide.ts`, `clamp.ts`, persistence, tests. `@orb/contracts/chat` does NOT re-export them (no second name, no barrel alias). The earlier `PARTICIPANT_ROLES = CHAT_RESOURCE_ROLES` alias was deleted. depcruise clean (chat→identity edge legal); check green. |
| PD-1 | `ResourceRef` / `Can` guard types → `@orb/contracts/identity` | DONE (P5 chunk 4 — the `can()` unification). The seam types PROMOTED to `@orb/contracts/identity` (the DAG root both admin and chat import DOWN): `Can` (overloaded — couples each action set to its resource kind), `ResourceRef = GlobalResource \| ChatResource`, the `GLOBAL_ACTIONS`/`CHAT_ACTIONS` vocab, and `CHAT_RESOURCE_ROLES`/`ChatRoster` (the `{kind:'chat', roster}` arm). `admin/guard.ts`'s `can()` extended with a PURE `decideChat(action, roster)` arm (admin reads NO chat db — the roster is fed in; `role === 'host'` lives HERE). `RequireAdmin`/`RequireOwner` stayed in `admin/contract/guard.ts` (admin's global wrappers); `admin/index.ts` re-exports the promoted types from identity for ergonomics. Chat rewired through the seam: `ChatContext.can` (injected — chat NEVER imports admin), and `guard.ts`/`substrate/auth/decide.ts` route `requireParticipant`/`requireHost`/`assertAuthorOrHost` through `ctx.can(principal, 'read'\|'host', {kind:'chat', roster})` (chat keeps only the leak-free presence answer + the coded-error re-expression; `isHost` deleted). Added `not_author`/`not_turn_owner` to `CHAT_OP_CODES` (un-collapsed from `not_host`). `decide.ts` SWAP-POINT de-flagged. Follow-up `PD-59` (tuple derivation) registered. Admin + chat auth tests green; tsc(contracts/server) clean. |

| PD-32 | character default-card `seeder/` subsystem (`createDefaultCharacterSeeder` + `DEFAULT_CHARACTER_CARDS`) + the welcome-assistant stamp | DONE (Nate-decided pack carried VERBATIM: Assistant + Rev/Niko/Mara/JFC; only the Assistant copy renamed neo-tavern→orbweaver; neo's `proposedTags` dropped — orbweaver tags are the `character_tags` junction). `domain/character/seeder/{cards,seed,index}.ts` + `contract/seeder.ts` (the §7.4 type home — the biome `no-inline-types` plugin forbids the seeder types living in `seeder/`); idempotent via the persisted `onboarding.defaultCharactersSeeded` latch + an in-process memo + per-card `handle_conflict` tolerance (resolves via the NEW `character.findByHandle` verb — mirrors `findByImportHash`/PD-43). Seeds through the REAL `character.create`. `ensureSeeded(principal)` (NOT `userId` — orbweaver's `create`/settings verbs require the acting `Principal`; both call sites hold a real one, so no fabricated principal). Compose constructs the ONE instance + the injected settings `isSeeded`/`markSeeded` latch ops (never clobbers an explicit welcome-assistant pick) on `ServicesResult.characterSeeder`; boot (`entry/boot/seed-default-characters.ts` → `ensureSeeded(owner)`) + the `entry/app.ts` first-authed-request hook (`seedUserCharacters(principal)`, fire-and-forget) share it. FLAG removed; boot-proven (5 cards seeded, welcomeAssistant set). |
| PD-48 | embeddings on-write indexer subscription (the high-value path)                                                                        | `domain/character.loadCardText(characterId)` + `domain/assets.loadAssetBytes(assetId)` un-principal SYSTEM by-id reads (D20 — no ownerId on vectors; never `can()`-gated) land; `entry/compose/services.ts` wires them into the indexer ctx (`?? undefined` bridges the `\| null` absent convention) + subscribes the indexer to the event bus (`character.updated` → re-embed card-text, `asset.created` → embed both image lenses). The card-text projection homes once in `domain/character/substrate/embed-text.ts`. The SEPARATE bulk embed-pass workload split out to PD-53.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| PD-0  | `infra/crypto/token-hash.ts` dead duplicate (sessions relocated it, D38)                                                              | removed at the 4c sessions/admin integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| PD-49 | character `attachCardTag` inert (no tag by-name op)                                                                                   | `domain/tag` gains `attachCardTagByName({ownerId,characterId,tagName})→Promise<boolean>` (race-safe resolve-or-create via `INSERT…ON CONFLICT (ownerId,name)`, idempotent accepted-junction attach, owner-scoped); compose wires `character.attachCardTag` to it (direct method ref, no adapter). FLAG removed. 119 tests green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| PD-4  | `infra/auth` `validateCookie` port (dead post-D40)                                                                                    | removed from `ResolveDeps` (+ the now-dead `onSessionSlide`); `resolveCookieSession`/local/oidc resolvers reduced to `null` (infra no longer reads cookies — the seam calls `sessions.validate`). MODE_RESOLVERS stays exhaustive; seam + auth suites green (81 tests).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PD-33 | character `cardContentHash` → `@orb/server/kit/serde/card`                                                                            | character's 5 verbs import the kit hash; `domain/character/substrate/content-hash.ts` deleted. Character-local hash matched the kit hash byte-for-byte (clean dedup).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PD-44 | export `buildCardV3`/`exportBookEntry` OUT-emitter → `@orb/server/kit/serde/card`                                                     | moved next to the `cardFromJson` IN half (one serde core: IN+OUT+hash); `domain/export/substrate/card-serde.ts` deleted; no UP-stack coupling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PD-47 | transport `stats.leaderboard.sort` + `stats.latency`                                                                                  | stats front door exports the `LEADERBOARD_SORTS` tuple + `latencyScopeSchema` (one home; types derive); the thin router wires `leaderboard.sort` + the `latency` verb. FLAG removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PD-3  | admin vLLM engine-status view + `VllmSupervisorPort`                                                                                  | DONE + open-decision RESOLVED (Nate 2026-06-28): **admin owns** the engine-status surface (`AdminEngineStatus` view + `vllmEngines`/`restartVllmEngine` verbs, admin-gated + audited), fed by the injected supervisor port (`VllmEngineHandle.status`/`restart`) the compose root adapts from the registry. No separate ops-admin/providers-front-door surface — the "may move to ops-admin" framing is dropped. Verb header comment de-flagged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| PD-10 | `DEFAULT_CHAT_MODEL_ID`/`DEFAULT_OR_CHAT_MODEL_ID` + `ChatModelId` brand                                                              | DONE at the connection slice (W1.5): the constants live in `@orb/contracts/connection`; foundation `/_debug/info` reads them DOWN (the killed foundation→infra edge).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PD-6  | admin `SessionAdminView` ↔ sessions `SessionView`                                                                                     | RESOLVED (Nate 2026-06-28): NOT a dup to unify — they are deliberately distinct read-models for different audiences (`SessionView` = user-facing, NO userId/role; `SessionAdminView` = the admin device-list, +userId/role). The compose root reconciles by mapping `sessions.listForUser` → the admin view (the userId the user-facing view omits is added at the seam). Both stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PD-27 | assets `asset.created` at-least-once delivery                                                                                         | RESOLVED (Nate 2026-06-28): **in-process fire-and-forget for v1** (the entry event-bus, ASSUMES single-replica) is the decided mechanism; the `content_hash` catch-up sweep (PRE-SCAFFOLD) is the reliability backstop. The durable-outbox upgrade is the multi-replica seam (entry.md open-decisions), not v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| PD-11 | openrouter `rerank` typed not-supported throw                                                                                         | DONE (Nate 2026-06-28): real `client.rerank.rerank` wired (text-only; OR index → caller-doc-id map; score-desc); the stale "no rerank endpoint" premise corrected in `core/Tier-3b-Providers.md` + a ledger note. Local vLLM/ONNX cross-encoder stays the keyless default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PD-15 | `IMPORT_DEFAULT_SOURCE` env + AppSettings — DROPPED (Nate 2026-06-28, neo-jank)                                                       | there is no chat-level default source: ST messages carry per-message provenance (`extra.model`/`api`), chat-import maps each → its `message_variant` (D26), and the live connection for new turns resolves via `connection.resolveChat` → user roleDefaults. Env comment pulled from `foundation/env`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PD-9  | role-default binder honors `routing.roleDefaults.<role>` per role (D39 local-light arm incl.)                                         | the async `bindRoleClientsForUser` IS the binder — resolves each derive-role via `connection.resolveRole` at bind, eager `*Model` provenance; the unconditional-vllm-mint floor deleted (PD-50 collapse)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| PD-50 | binder → async + collapse + light up the workloads worker                                                                             | `BindRoleClients` now `(ownerId) => Promise<RoleClients>`; two binders collapsed into the single `bindRoleClientsForUser` (floor `createVllmFloorRoleClients` DELETED, −81 LOC); compose exposes the bound `bindRoleClients` thunk on `ServicesResult`; `entry/lifecycle.ts` starts the worker — boot-proven end-to-end (worker claimed + ran the scheduler's refresh-model-catalog row)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| PD-20 | persona `setActivePersona` verb                                                                                                       | DONE: implemented in `domain/persona/verbs/set-active.ts` and wired via injected closures from chat (`requireChatAuthorOrHost` and `setChatActivePersona`) to avoid tier collapse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| PD-28 | assets roster-avatar membership exception — a chat participant may fetch the avatar of another participant in the same chat           | DONE: `assets.getMetadata` gains a roster-avatar fallback via optional injected `loadCoParticipantOwner` op on `AssetsContext`. Two-query check: (1) find candidate hash owner, (2) confirm both users share a present-member chat. `AssetMetadata` gains optional `ownerId`; blob route reads from the correct per-user CAS partition via `meta.ownerId`. `BlobAssetsPort` updated to carry the wider result type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PD-51 | healthz `credentialsKeyOk` self-canary probe (could not detect key rotation vs existing ciphertext)                                   | DONE: `probeKeyDecrypt` verb added to `CredentialsService`. Reads the first stored credential row and attempts to decrypt it with the current `CREDENTIALS_KEY`. Returns `false` (→ `credentials_key_mismatch` in healthz) if decryption fails (rotated/lost key). Lifecycle.boot now calls `credentials.probeKeyDecrypt()` instead of the synthetic canary. The `SecretBox` type import and `probeCredentialsKey` local fn removed from `lifecycle.ts`. Integration test covers: no-credentials → true, valid credential → true, rotated key → false.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PD-52 | `deriveClientIp` took the leftmost XFF hop unconditionally (spoofable by any client behind any proxy)                                 | DONE: `deriveClientIp` now only honours `X-Forwarded-For` when the connection peer is loopback/private OR explicitly listed in `FORWARD_AUTH_TRUSTED_PROXIES`. A client behind an untrusted proxy can no longer spoof its IP via XFF. `TRUSTED_PROXIES` constant built once at module-init from `parseAllowlist(env.FORWARD_AUTH_TRUSTED_PROXIES)` (zero per-request cost). FLAG comment and constant removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

<!-- Source: Core-Audits-and-Debt.md -->

## Registry — ACTIVE flags recovered from the broken "Cleared" table

> ⚠ The `PD-XX` rows BELOW carry LIVE `ready`/`blocked:*` statuses but were misfiled under `## Cleared`
> above (a 6-column Registry block pasted beneath the 3-column Cleared header, so active burn-down work was
> hidden as "done"). They are **ACTIVE debt**. `ready` = burnable now (trigger landed); `blocked:<slice>` =
> waiting on that slice. Fold these into the main Registry in a later pass. (Recovered 2026-07-01.)

| id | item | current home | → target home | trigger | status |
| --- | --- | --- | --- | --- | --- |
| PD-62 | chat lock primitive                                                                                                                   | `domain/chat/persistence/lock.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `infra/`                                        | infra primitives split                        | ready                 |
| PD-63 | guided steer routing                                                                                                                  | unrouted parameter in read/turn verbs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | routed to generation pipeline                   | guided chunk wave                             | ready                 |
| PD-64 | buddy observer / reaction engine                                                                                                      | unwired in `domain/buddy`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | wired to chat/workload buses                    | chat lands (P5)                               | blocked:buddy      |
| PD-65 | `reapTemporaryChats` implementation                                                                                                   | no-op in `domain/chat/verbs/chat-lifecycle.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | schema-backed query                             | DB adds `chats.temporary` column              | ready                 |
| PD-66 | targeted invites                                                                                                                      | hard error in `invites.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | fully wired verb                                | `resolveHandle` op built                      | ready                 |
| PD-70 | read presence stub                                                                                                                    | `entry/compose/chat.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | real presence service                           | presence architecture lands                   | blocked:presence      |
| PD-71 | search corpus owner ID                                                                                                                | `entry/compose/chat.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | properly resolved from context                  | context resolution enhancement                | blocked:context      |
| PD-72 | memory log sink                                                                                                                       | thin structured log in `entry/compose/chat.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `foundation/observability`                      | dedicated MemoryLog sink                      | blocked:observability |
| PD-75 | `UserSettings.workloads.themes.k`                                                                                                     | `domain/workloads/runners/compute-themes.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `contracts/user-settings`                       | user-settings tier slots in                   | blocked:user-settings |
| PD-77 | import loader subsystem                                                                                                               | `entry/import/run-profile-import.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | extracted importer                              | `collectBundlesFromDir` / `importChats` lands | blocked:later         |
| PD-78 | import stats rollup                                                                                                                   | `entry/import/run-profile-import.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `domain/stats/`                                 | `reconcileStats` / `enqueueBackfill` wired    | blocked:later         |
| PD-80 | OpenRouter account activity                                                                                                           | `infra/providers/backends/openrouter/account.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | management key logic                            | management key in scope                       | blocked:later         |
| PD-84 | orphan-blob edge rebuild                                                                                                              | `domain/assets/verbs/store.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | DR rebuild subsystem                            | DR tools built                                | blocked:later         |
| PD-89 | `WiBusEvent` entry-level variants (`wiEntryAttached`/`wiEntryDetached`/`wiEntryScopeChanged`)                                         | `@orb/contracts/world-info` (declared, never emitted — only `wiBookAttached`/`wiBookDetached` fire, per `world-info.md` §Movement table)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | emit from `domain/world-info/verbs/entries/*`   | a per-entry keyword/scope edit that must invalidate a chat's WI pool | blocked:later         |
| PD-93 | `imagery` / `image-studio`                                                                                                            | not built (deferred); `domains/proposed/image-studio/image-studio.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | generative image cluster (img2img/prompt modes) | only if hosted image-gen is requested         | deferred:product-call |

<!-- Source: Core-Audits-and-Debt.md -->

## ARCHAEOLOGY — architecture-docs inconsistency audit (2026-06-26, REMEDIATED — reference only)

> **STATUS: REMEDIATED (2026-06-26).** All blockers, majors, and minors below were fixed in a two-phase
> pass (authority docs locked first, then domain/core docs aligned by 6 agents). Questions Q1 and Q3–Q9
> were resolved into the docs. **Q2 (ChatSource vs CredentialSource consolidation) was since RESOLVED by
> D31** (CredentialSource canonical in `contracts/credentials`; `contracts/connection` re-exports it as
> `ChatSource`). Q3 was resolved by D36, Q7 in export.md. This file is kept as the audit record; the
> findings text below is historical (it quotes the pre-fix state).

Method: 5 auditor agents read **every** `.md` in `docs/architecture/` **in full** (no grep-skimming).
The 21 `domains/` docs were sliced one-per-auditor; all 26 non-domain "core" docs (roots + `spine/` +
`tiers/` + `reports/`) were read in full by **all five**. Authorities: `core/Core-Laws-and-Precedents.md` §7
(D0–D30) and `core/Tier-1-DB.md`. Coverage: 47/47 docs (domains ×1, core ×5 = 134 full reads).

Severity: **blocker** = a load-bearing contradiction that would mis-build; **major** = a real
contradiction of a decision/schema; **minor** = drift/stale-ref/mechanical; **question** = needs a call.

Rollup (de-duplicated): **3 blocker · 13 major · ~26 minor · ~9 question.**

---

<!-- Source: Core-Audits-and-Debt.md -->

## BLOCKERS

<!-- Source: Core-Audits-and-Debt.md -->

### B1 — The agent-sdk SESSION home points both ways (D8)

The authority side (ledger **D8**, `chat.md:64-66,185-186`, `providers.md:207`,
`participants-agents-identity.md:149`, `db.md:147`, `BUILD-PLAN 4b`) homes the SDK session substrate in
`infra/providers/backends/agent-sdk/session/` and makes the chat domain **stateless-first**. Three docs
still say it lives in the **chat domain**:

- `domains.md:11, 229-231` — "session-seeding logic … lives in the chat domain and must NOT move into providers" (the strongest contradiction).
- `domains/sessions.md:50-53, 86, 220` — ownership table + movement row keep it "in `chat`".
- `core/Spine-Identity-and-Auth.md:83` — `session_entries` "owned by `domain/chat`".
  Fix: reconcile all three to D8 (substrate → agent-sdk backend; only `session_entries` table → `@orb/db/schema/sdk-session.ts`).

<!-- Source: Core-Audits-and-Debt.md -->

### B2 — `max-pro-sub` gated on "admin" instead of "owner" (D17) — 3 docs

D17 makes the box credential **owner-only** (`requireOwner`); `providers.md` + `Spine-Identity-and-Auth.md`
were reconciled, but the credential/connection/buddy docs were not:

- `credentials.md:82-84, 95-96, 326` — "unconstructable except after `role === 'admin'`"; also references `principal.isOwner`, which is **not a field** on the canonical `Principal` (`identity` spine: `role: UserRole` + `via` only).
- `connection.md:291` — "credentials.resolve gated behind `principal.role === 'admin'`" (also violates identity-spine inv #6: the only `role==='admin'` site is inside `can()`).
- `buddy.md:75, 369, 488` — "max-pro-sub is admin-only"; buddy is the **owner's** agent inheriting the owner's sub (ledger §3).
  Fix: `requireOwner` / owner-delegated inheritance throughout.

<!-- Source: Core-Audits-and-Debt.md -->

### B3 — `buddy.md` resolves a dropped column (D18)

`buddy.md:343, 381` — `createBuddyObserverReads` does "narrow chats `ownerId` reads" and exposes
`resolveChatOwner`, but **D18 dropped `chats.ownerId`** (chats are membership-scoped; owner = the
`chat_participants(role='host')`). Fix: resolve the chat host via the roster, not a dropped column.

---

<!-- Source: Core-Audits-and-Debt.md -->

## MAJORS

<!-- Source: Core-Audits-and-Debt.md -->

### M1 — `db.md:138` lists `duplicate_pairs` in the KEEP-`ownerId` set (D23/D24) — _canonical-doc self-contradiction_ (found by 2 auditors)

Contradicts ledger **D23** ("DERIVE once modernized to per-type FK") + **D24** + `db.md:161`'s own row
("`ownerId` dropped per D23 — DERIVE"). Fix the KEEP list in db.md §D23 audit.

<!-- Source: Core-Audits-and-Debt.md -->

### M2 — `core/Core-0-Architecture-and-Structure.md:234` "versions = restorable history" — pre-D28 (found by 3 auditors)

§6 partitioning row still describes the de-pin model. **D28** deleted the version table (flat `characters`

- `character_snapshots`, gating nothing). `Core-0-Architecture-and-Structure.md` is a top authority doc; `domains.md:12` and
  `core/AGENTS.md:114` were updated, this was not.

<!-- Source: Core-Audits-and-Debt.md -->

### M3 — `persona.md:220-221` "`character_books` keys on cv by design" (D28)

"Do not normalize these to the same key" actively mis-states the schema — D28 re-keys `character_books`→
`characters.id` (db.md:164; participants-agents-identity:124-127). Both junctions key on `characters.id`.

<!-- Source: Core-Audits-and-Debt.md -->

### M4 — `search.md:97-98, 107-108` "owner-scoped digest scan" (D18/D20) — _leak-relevant_

`digests`/`segments` verbs + `scope.ts` framed as "owner-scoped". Under D18 (`chats.ownerId` dropped) +
D20 (chat digest/segment scope DERIVES from membership, host-only v1), an "owner-scoped digest scan" is
no longer expressible. Re-frame as membership-derived (the `vector-scope-derived` gate). The D20
"scope BEFORE cosine rank AND before `content_hash` collapse" rule is also not stated as a search invariant.

<!-- Source: Core-Audits-and-Debt.md -->

### M5 — `settings.md` omits the D17 owner-box AppSettings toggles

`settings.md` (§(b):85-94, "owns":21-47) lacks `allowNonOwnerLocalCompute` (default ON), the per-member
local-compute COUNT budget, and `allowNonOwnerMaxProSub` (default OFF) — which `settings-and-config.md:104-112`

- D17 mandate. New settings fields with no home in the owning domain doc.

<!-- Source: Core-Audits-and-Debt.md -->

### M6 — `admin.md:20` sweeps `setRole` into `requireAdmin`

"Every one is admin-gated (`requireAdmin`)" captures `setRole`, but `admin.md:35-39` + D17 + identity-spine §3
say admin grant/revoke is **owner-only** (`requireOwner`). Carve `setRole` out of the blanket.

<!-- Source: Core-Audits-and-Debt.md -->

### M7 — `assets.md` `characters.importHash` not in db.md's D28 column list

`assets.md:50, 273-276, 417` treats `characters.importHash` (sha-256 of whole file) as a live column +
integrity guard, but db.md's flat-`characters` enumeration names `contentHash` (and serialization-core:98
says `cardContentHash` is over semantic fields, not PNG bytes). Two distinct hashes; one isn't in db.md.
Add `importHash` to db.md's `characters` columns or reconcile the guard.

<!-- Source: Core-Audits-and-Debt.md -->

### M8 — `preset.md:44` puts the UserIntent snapshot on `messages.params` (D26)

D26 makes `messages` a pure SLOT with **no** `params`; the snapshot lives on `message_variants.params`.

<!-- Source: Core-Audits-and-Debt.md -->

### M9 — `connection.md` internal + cross-doc home drift (cluster)

- `:141` re-exports `ResolvedConnection` from `./contract/params` while `:156` says it lives in `@orb/contracts/connection` and is "NOT re-exported from this front door" — a symbol can't be both. (`ResolvedConnection` is claimed in **three** homes: `:83 results.ts`, `:141 params`, `:205/322 routing.ts`.)
- `:240` homes `RoleClients` at `@orb/contracts/connection/roles.ts`, but `buddy.md:354`, `providers.md:210`, `Core-Legacy-Migration-and-Gaps.md:121`, and the boot DAG all use `@orb/contracts/role-clients`.

<!-- Source: Core-Audits-and-Debt.md -->

### M10 — provider-result contract home drift

`embeddings.md:221, 319` home `EmbedRequest`/`EmbedResult` in `@orb/contracts/embeddings`, but
`providers.md:188` + `Core-Legacy-Migration-and-Gaps.md:121,180` + BUILD-PLAN + ledger contracts-DAG home the four
provider-result contracts in `@orb/contracts/providers` (the group `role-clients` depends on first).
`EmbedResult` double-homed.

<!-- Source: Core-Audits-and-Debt.md -->

### M11 — custom-BYO `modelProfile` two homes

`connection.md:239,518,680` + `providers.md:197,591` put it on `UserSettings.customEndpoint.modelProfile`;
ledger §2 + `credentials.md:466` home it on `providerMetadataSchema.modelProfile`. Ledger wins.

<!-- Source: Core-Audits-and-Debt.md -->

### M12 — §7.5 union name drift (`no-inline-union-redecl` needs one name)

- `preset.md:116,172` `GuidedAction` vs `string-union-dispatch.md:46,122,183` `GuidedActionKind`.
- `search.md:304` and `embeddings.md:330-332` each claim to be the single home of the lens union (`image-raw|image-captioned|segment|digest|card-text`) — producer (embeddings) should own it.

<!-- Source: Core-Audits-and-Debt.md -->

### M13 — `stats.md:225` `personaUsage` keys on dropped/renamed columns

"a chat's active OR pinned persona" — `chats.personaId` is **dropped** (D18; active persona is per-participant
`chat_participants.activePersonaId`) and "pinned" was renamed `anchorPersonaId`.

---

<!-- Source: Core-Audits-and-Debt.md -->

## MINORS (drift / stale-ref / mechanical)

- **Stray markup committed:** `core/Tier-2-Foundation.md:457-458` ends with literal `</content>` / `</invoke>` lines (found by 4 auditors). Delete them.
- **Gate-count drift (found by 4 auditors):** canonical is **13** gates (`core/Core-0-Architecture-and-Structure.md §7`, `_STATUS:88`, `BUILD-PLAN:20`), but stale counts persist: `string-union-dispatch.md:275-277` ("six … eight"), `core/Core-Core-Planning-and-Checklists.md:13` ("8/11"), ledger §7 R10 ("6→11"), and cross-refs in `db.md:13`, `infra.md:12`, `transport.md:16` ("the six gates").
- **D28 residue:** `Core-STATUS.md:57` ("versions = restorable history"); `core/Tier-2-Foundation.md:140` ("version-collapsed character"); `assets.md:41-42,139` ("current versions"); ledger §2:63-64 + D23:152 ("current-version card" / "character_summaries via cv").
- **D17 "last-admin" residue:** `core/Spine-Testing.md:163`, `Core-Planning-and-Checklists.md:102` (renamed last-owner / owner-immutability guard; PRE-SCAFFOLD is internally inconsistent with its own §C3:120-121).
- **vector-math path:** `embeddings.md:239,240,429` uses `@orb/kit/math/vector`; everyone else uses `@orb/kit/vector-math` (ledger D10). Also `embeddings.md:429` inv #8 names a kit module as owner of the lens→table map (that's `embeddings/store.ts`, §7.5).
- **CAS sharding:** `assets.md:85,187` shows `ab/cd/<hash>` (no owner prefix); D21 + `infra.md:86` require `<owner>/ab/cd/<hash>` (assets.md:27,256 correct).
- **neo domain count:** `domains.md:7` + `_STATUS:108` say "18"; `_FANOUT-BRIEF:215` lists 20.
- **notifications verb naming:** producer op is `notifications.emit` (chat.md:227, domains.md:31) but the defined verb is `record` — the `emit`↔`record` relationship is unstated (`notifications.md`).
- **admin.md numbering:** `:20,135` say "11 verbs" but enumerate 10 (7 files); `:106` re-exports `ActorRole` though `:175` collapses it into `UserRole`.
- **Stale-open vs ledger §5:** `admin.md:169,363-368` + `identity-auth-permission.md §6:328-331` list the `can()` seam shape as OPEN though ledger §5:99 decided it (DomainForbiddenError, ResourceRef union, lives in `admin/guard.ts`).
- **Broken §-refs:** `import.md:436` → character.md "§Version history mutations" (no such section); `chat.md:153-156,379-380` flags `knowledge-cluster §3/§8` as stale though it's already amended (kc:101-102).
- **Schema homes unnamed in db.md:** `chat_locks` (chat.md:390-394) and `oidc_transactions` (sessions.md) are load-bearing but not enumerated in any schema-file listing.
- **Misc naming:** `refreshCatalog`(connection.md:180) vs `refreshCatalogSnapshot`(transport/providers); `resolveRole` vs `resolveRole`; catalog-entry type spelled 4 ways (connection.md); `WorkloadModelsEnv` keeps "Models" though models→connection merged (workloads.md:278).
- **WI contract home:** `world-info.md:123-124` targets `WiBusEvent`/`WorldInfoScope` to `@orb/contracts/chat-bus`; canonical is `@orb/contracts/world-info` (shared-dissolution:112). `world-info.md:58 vs 114` internal contradiction on `WorldBookRole` home.
- **preset.md:44** cites neo "migration 0002" as live (orbweaver starts from a fresh `0000_baseline`).
- **discovery.md:341,601-602** shows the segmenter re-home as OPEN though ledger §2:64 committed `→ memory/substrate`.
- **caption home:** `embeddings.md:95` "caption from memory's summarizer or discovery" vs ledger §2 + embeddings open-decision:444-448 ("caption inline in `embeddings/indexer`").
- **summarizer:** `domains/memory.md:247` "summarizer (local-first GGUF → hosted fallback)" vs `providers.md §2b:639` ("summarize is NOT a model — a `chat` turn shaped").
- **embeddings indexer events:** `embeddings.md:140` declares `onDigestCreated`/`onSegmentCreated` handlers but `:273-280` + `domains.md:183-189` disagree on whether digests/segments fire events or are written by direct `store` calls.

---

<!-- Source: Core-Audits-and-Debt.md -->

## QUESTIONS (need a decision/confirmation)

- **Q1 — can()/`requireParticipant`/`requireHost` home.** Ledger §5 + identity §4 say the `can()` wrappers live in `domain/admin/guard.ts`; but identity §2/§2a + admin.md:81-82 + the ENFORCEMENT membership-enforcer frame `requireParticipant`/`requireHost` as **chat's** build (reads `chat_participants`). How does chat reach the one seam without a cross-feature import? Pin one home + document the seam.
- **Q2 — `ChatSource` vs `CredentialSource`** (connection vs credentials) have byte-identical members but are two separately-homed unions (both registered as distinct axes). Intentional, or a drift/dedup risk?
- **Q3 — `chats.memoryEnabled`** (settings.md:312 / settings-and-config esoteric #5) referenced as live; not in db.md `chat.ts`. Confirm or add.
- **Q4 — `oidc_transactions`** needs a db.md schema home (likely `schema/sessions.ts`).
- **Q5 — `reconcile-world-state`** workload kind is in `WORKLOAD_KINDS` (workloads.md:104) but no stub runner is listed; RUNNERS must be exhaustive — confirm the stub.
- **Q6 — `search.corpus`** injected op (chat.md:88,195,224) uses the retired `corpus` name — confirm it's the intended search method, not the dissolved corpus domain.
- **Q7 — `export.md:277-279`** insists a 2-member `ExportChatFormat` union be gated by `no-inline-union-redecl`, but ledger §5 + ENFORCEMENT only fire that gate on ≥3-member unions — overclaim?
- **Q8 — `tag.md:14,17`** "five polymorphic junction tables" wording reads against D24 ("NO polymorphic association tables") — they're per-type FK; only the _dispatch_ is polymorphic. Reword?
- **Q9 — `string-union-dispatch.md:64-67`** shows `users.role` as 2-member `admin|user` (legit neo-source "shape of the rot") — confirm a reader won't mistake it for the live `owner|admin|user` axis.

---

<!-- Source: Core-Audits-and-Debt.md -->

## What is clean

The two authorities (ledger §7 D1–D30, db.md) are mutually consistent on every D-decision cross-checked,
**except M1** (db.md's own `duplicate_pairs` KEEP/DERIVE self-contradiction). The D26/D27/D28/D29/D30
re-architecture landed consistently in the owned domain slices (`character`/`tag`/`import`/`export` verified);
the surviving D28 defects are in _summary/authority_ docs (`Core-0-Architecture-and-Structure.md`, `persona.md`, `Core-STATUS.md`,
`foundation.md`, `assets.md`) not updated in the last sweep. `chat.md`, `providers.md`,
`Spine-Identity-and-Auth.md` are the correctly-reconciled models for the B1/B2 clusters — the lagging docs
should be aligned **to them**, not vice-versa.
