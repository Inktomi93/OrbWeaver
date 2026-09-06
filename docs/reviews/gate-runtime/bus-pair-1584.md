---
kind: review
status: active
updated: 2026-09-06
---

# The bus pair conversion for #1584

`user-bus-coverage` and `bus-definition-belts` were the two legacy modules the bus producer wave left
behind. Both are now final `defineGate` policies, and neither ported a table: the four name tables they
carried between them are derived, and the one owner decision they encoded is a typed warning-debt policy.

The precondition was the CONDITIONAL PUBLISHER. `bus-family-1584.md` recorded the blocker verbatim: the
shared producer fact "misses the live `chatsChanged` relay through a conditional local event,
`publishUserEvent`, and `defineBusChannel.publish`". That is closed first, in the fact, with the checker's
own flow types; §1 records the model and its receipts.

## 1. The conditional publisher, modeled in the fact

### What was actually broken

The brief's hypothesis was three separate blindnesses. The tree says it was ONE door and two consequences:

- `defineBusChannel` is an **overloaded export** (three declarations: two signatures plus the
  implementation). `resolveModuleMemberOrigin` refuses an overloaded export as `ambiguous`
  (`reference-fact-module.ts:207`), so `busChannelReceiver` — which proved the receiver by resolving the
  MINTING CALL — answered false for every real channel, and `emitterSink` classified every
  `bus.publish(...)` on the tree as a non-door.
- With the door shut, `publishUserEvent`'s parameter forward was never a relay, so the two hops above it
  were unreachable: `publishChatChanged`'s `const event: UserBusEvent = chatId === undefined ? … : …`
  and, through it, `entry/compose/emit-chat-changed.ts`'s member fan.
- The syntax reader already handled a ConditionalExpression initializer (`discriminatorValues` recurses
  through both arms). It was never reached. A brief's MECHANISM is a hypothesis; this one was half right.

### The model

The door is the METHOD, not the mint and not the handle. `publish` is declared once — by `BusChannel` in
`packages/server/src/transport/trpc/bus-channel.ts` — and every channel, firehose or not, inherits that
one declaration. `busChannelPublisher` reads the property symbol off the RECEIVER'S TYPE and requires
every declaration to be that delivered file, which is the same shape `drizzle-client-call.ts` uses for the
Drizzle client. A handle rename, a namespace hop and a re-export are all the same fact; a same-named
`publish` on a locally declared interface is not.

Above the door, one ladder owns an argument delivered to a proven sink
(`bus-fact.ts#argumentEmission`), in this order:

| Rung | Reads | Answer |
| - | - | - |
| authored syntax | `discriminatorValues` (object literals, conditional arms, stable const bindings) | emissions anchored at the authored token |
| parameter relay | `parameterProjection` | a `Relay` propagated to the wrapper's callers |
| republish relay | `TABLE[<projection of the relayed parameter>]` plus the table's key→member translation | a `Relay` carrying that translation |
| checker flow type | `argument.getType()`, union constituents, `getProperty("type")` literal | emissions anchored at the call |
| refusal | — | `BusUnresolvedIdentity` at that call |

Three rulings inside that ladder are load-bearing:

**The totality tripwire.** An argument whose flow type is the WHOLE declared union proves no member. That
set is what `COARSE_USER_BUS_EVENT[event.type]` types as when the key is an unnarrowed parameter, and it
is also what a subscriber forward (`handler(entry.event)`) types as. Harvesting it would mark every member
emitted — the exact false green the `UserBusEvent` header records as MEASURED ("a totality table parked in
transport would have made every member, including the DEFERRED `connectionsChanged`, read as emitted,
turning the dead-wire belt permanently green"). The fact calls it a FORWARD: no emission, and no
fact-health failure.

**The republish translation is READ, never assumed.** A relayed key indexed into a totality table emits
`TABLE[k]`, whose own discriminator is a fact about the table. The fact reads it
(`discriminatorTranslation`) and maps the caller's proven members through it. A skewed table that maps
`chatsChanged → {type:"settingsChanged"}` credits `settingsChanged`, and the spec pins exactly that.

**Fail-closed is scoped to a PROVEN door.** An argument the checker cannot read — `any`/`unknown`/`never`,
a constituent with no literal discriminator — is an unresolved identity at that call, surfaced by
`bus-fact-health`. A candidate call whose door does not resolve is simply not a subject.

### The ruling fork this opened, and how it was resolved

`bus-family-1584.md` records: "Dynamic emitter arguments are not fact-health failures. They contribute no
producer proof; a member with no statically provable producer remains an ordinary missing-emitter
finding." The brief for this lane requires the opposite for an unreadable argument: "a
`BusUnresolvedIdentity` refusal at that call (fail closed…), never a silent skip."

Both survive, because the INPUT changed. The first implementation refused the totality read as
`ambiguous`, and the real tree immediately produced one: `entry/compose/automation-watcher.ts:136`
(`onChatEvent: (handler) => subscribeAllChatEvents((entry) => handler(entry.event))`) — a CONSUMER
forwarding the whole `ChatBusEvent` union into an injected handler. Refusing there withheld all five bus
policies. The resolution splits the two meanings a refusal had been carrying:

- **the checker resolved it to EVERYTHING** ⇒ a forward. No proof, no refusal — the standing ruling,
  preserved, with its condition restated in checker terms;
- **the checker could not read it at all** ⇒ a refusal. The new requirement, on a strictly smaller set.

### Receipts

Fact-level spec: `tests/tooling/verify/lib/bus-fact-relay.test.ts` (9 rows) reads the fact's own census
through a probe policy rather than any coverage verdict. It reproduces the live shape hermetically: the
overloaded channel mint, the coarse republish, the conditional local, the two-hop caller, and a
`connectionsChanged`-style member that must not be counted.

RED-FIRST at `f6078a884` (sources restored from HEAD, working copies moved back, `git status --short`
clean afterwards): **4 of 9 rows fail** — the conditional publisher's members, its anchor, the fail-closed
refusal, and the translation read. The other five pass in BOTH states by design: the fixture-specifier
resolution control, the no-harvest guard, the two door counterfactuals, and the forward arm. A guard that
only passes after the change is not a guard.

Real tree, same checkout, `f6078a884` sources vs the model (7,207 loaded sources, 1,593-file provider
population):

| | before | after |
| - | -: | -: |
| declared members | 66 | 66 |
| proven emitters | 269 | **273** |
| unresolved identities | 0 | 0 |
| `UserBusEvent.chatsChanged` | declared-never-emitted | proven at `transport/trpc/user-events-bus.ts:43` |
| `UserBusEvent.connectionsChanged` | unproduced | unproduced (the #1822 debt) |
| policy findings | 0/0/0/0/0 | 0/0/0/0/0 |

The one emitter anchor for `chatsChanged` is the `publishUserEvent(userId, event)` call inside
`publishChatChanged` — the conditional local's own source call, not the union, not the coarse table, and
not the `.publish` sink two lines below it. The brief's expectation of "\~10 source-call anchors" was
wrong in a benign direction: the relay resolves the member at the point where it becomes provable and
stops, so the domain call sites of `publishChatChanged` are not re-anchored.

## 2. The conversions

| Legacy id | Final ids | Authority/severity | Family | Identity mechanism |
| - | - | - | - | - |
| `user-bus-coverage` | `user-bus-coverage` | ordinary/error | `bus-fact` | shared producer fact; deferred members imported from the sibling |
| | `user-bus-deferred-member` (new) | hard/warning, `workItem: 1822` | `bus-fact` | the same fact; the member is named once, here |
| `bus-definition-belts` | `bus-definition-belts` | hard/error | `bus-definition` | belted-root containment read from the resolved TYPE |
| | `bus-belt-total` (new) | hard/error | `bus-definition` | authored belt members vs the union's discriminators |
| | `bus-consumer-belt` (new) | hard/error | `bus-definition` | client map by resolved type identity; server exhaustiveness by a `never` argument at a `never`-parameter guard |
| | `bus-coverage-owner` (new) | hard/error | `bus-definition` | `defineGate` descriptors resolved to the contract's own declaration |

Every new id is `hard` because none of these findings has a legitimate occurrence-level door: a belt
either exists or the bus is invisible. The one exception is the debt policy's severity, below.

### The retired tables

| Retired row/table | Disposition | Receipt |
| - | - | - |
| `BELT_EXEMPT.DurableChatBusEvent` | DERIVED | `Exclude<ChatBusEvent, …>` resolves to a discriminator set contained by `CHAT_BUS_EVENT_TYPES`; `bus-definition-belts` `mustPass[2]` |
| `BELT_EXEMPT.LiveOnlyChatBusEvent` | DERIVED | the `Extract<>` half of the same row, same proof |
| `BELT_EXEMPT.WiBusEvent` | DERIVED | a spliced sub-union's members are contained by the root's; `mustPass[1]`, and `mustFlag[2]` proves the two-sidedness — the same alias, no longer spliced, is RED |
| `SERVER_INTERNAL_REACH.DomainEvent` | DERIVED | a `never`-typed argument at a `never`-parameter guard is the checker's exhaustiveness proof, and the argument's declared type names the union; `bus-consumer-belt` `mustPass[2]`, with `mustFlag[1]` proving a PARTIAL dispatch is not one |
| the coverage-gate FILE-NAMING table (`hasCoverageGate`) | DERIVED | `bus-coverage-owner` reads `defineGate` descriptors by declaration identity plus their authored `{path, exportName}` subject; `mustFlag[0]` keeps the comment-posture control (a prose mention owns nothing) and `mustPass[1]` proves an import alias still counts |
| `user-bus-coverage`'s `DEFERRED.connectionsChanged` | RE-HOMED as warning debt | `user-bus-deferred-member`, `workItem: 1822` |

No reviewed grant was needed, and none was taken: every row was either a fact about a type or a fact about
a declaration. A grant is for something correct and permanent; none of these was either.

### The debt policy's shape, and the fork behind it

The design requires that unresolved debt be a warning tied to a positive `workItem`, and that an error
policy cannot carry that owner — hence the split. The remaining choice was WHICH state of the deferral is
the finding, and the descriptor contract decided it: `mustPass` must contain at least one example
(`policy-validation.ts#assertProofArm`), and a policy that reports its own standing state has no
zero-finding state to exhibit — the subject is either deferred (report), retired (report), or gone
(refuse). A descriptor with an unsatisfiable `mustPass` is not a policy the runtime accepts.

So the debt is DECLARED where the design puts it — `severity: "warning"` plus `workItem: 1822`, which no
descriptor may fake and the roster derives — and the FINDING is the retirement:

- the member gains a producer ⇒ report (warning, `hard`: no waiver door), with the deletion instruction;
- the member stops being DECLARED ⇒ REFUSE the run. A standing exception over a vanished subject is a
  loaded gun, and a refusal cannot be written as a proof row, so it is pinned through `runPolicyPass` in
  `tests/tooling/verify/gates/bus-pair.test.ts`;
- the member is declared and unproduced ⇒ silent, and `user-bus-coverage` is silent too because it
  imports `USER_BUS_DEFERRED_MEMBERS` from this module. That import is the retirement mechanism: deleting
  the debt module when #1822 lands makes the sibling own the member in the same edit, and `tsc` refuses
  any half of it.

## 3. Verification

- **Conformance** — `tests/tooling/verify/gates/bus-pair.test.ts`: 6 policies, 25 proof rows, plus four
  `runPolicyPass` pins (the deferral refusal, the deferred member's exclusive ownership in both states,
  the definition-fact and coverage-owner blindness refusals, and the derived-vs-name-table control that
  REDs a same-named alias which stopped being a subset). A fixture-specifier resolution control covers
  every proof row in the family; it caught three of this lane's own fixtures whose `../` count reached
  above the virtual root — the wave-3 lesson, paid again.
- **Fact spec** — `tests/tooling/verify/lib/bus-fact-relay.test.ts`, 9 rows, red-first as above.
- **Scoped suites** — 122 tests across 7 files green (`bus-pair`, `bus-fact-relay`, `bus-fact-health`,
  `bus-payload-allowlist`, `bus-coverage`, `reviewed-grants`, `policy-pass`).
- **Real tree, both families** (12 policies, 3 providers, 7,213 loaded sources): 12/12 owners success,
  nothing withheld, zero fact/tool/authority errors, zero alarms, **0 raw / 0 waived / 0 granted / 0
  effective**. The definition fact reports 8 unions, 5 belts, 0 unresolved; the coverage-owner fact parses
  267 gate modules with 0 unresolved.

### Cost

Measured with `/usr/bin/time -v` under the workspace heap floor, on a box that was NOT quiesced (this
lane's own suites and type programs ran between measurements). Per-fact wall times moved by more than
2x across runs of IDENTICAL code, so the table below is a range, not a verdict:

| Run | bus-producers | bus-definitions | bus-coverage-owners | process wall | peak RSS |
| - | -: | -: | -: | -: | -: |
| `f6078a884` producer family | 16.0 s | — | — | 29.0 s | 3.13 GB |
| producer family, after (4 samples) | 12.9–26.6 s | — | — | 35–51 s | 3.00–3.11 GB |
| both families, first cut | 3.4 s | 46.2 s | 35.6 s | 1:54 | 4.18 GB |
| both families, after the prefilters | 4.6 s | 24.4 s | 9.0 s | 1:11 | 3.55 GB |
| **both families, QUIET tree (final)** | **3.4 s** | **11.8 s** | **7.3 s** | **37.6 s** | **3.58 GB** |

The final row is the one to carry forward: 11 policies over 7,213 loaded sources, 11/11 owners success,
nothing withheld, zero fact/tool/authority errors, zero alarms, 0 raw / 0 waived / 0 granted / 0 effective,
7.4 s workspace + 22.4 s providers + 0.12 s policy evaluation, 0 swaps and 0 major page faults. Every
earlier row was taken while this lane's own suites and type programs were running.

Two things are load-bearing in that table and neither is the algorithm:

- **the per-fact number is checker warm-up attribution.** `bus-producers` costs 13–27 s when it runs
  ALONE and 3.4–5.8 s when a definition fact runs first: the lazy checker is built by whichever provider
  touches it first, and that provider is charged for it. Composed-command measurement at cutover must read
  the whole-pass number, never a per-fact one.
- **the two prefilters are receipted lossless, not asserted.** Reading the TYPE of every one-argument
  server call cost 46 s; deriving candidate names from the guard DECLARATIONS (plus their local import
  aliases) and proving each candidate by declaration identity costs single digits. Resolving the callable
  origin of every call in the gate corpus cost 35 s; a `defineGate` call in a LOADABLE policy module is
  always bound to a variable with one object-literal argument — the loader refuses anything else — so that
  candidate set is lossless. Both were verified by real-tree census equality (identical unions, belts,
  members, emitters, unresolved) before and after.

## 4. Follow-ups

1. **The generic-producer consolidation is UNBLOCKED.** `bus-family-1584.md` blocked it on exactly this
   relay ("typed callable-declaration/call-edge indexing must prove that relay before any retirement");
   the fact now proves it, and the five per-union coverage policies differ only in their `UNION` constant.
   Consolidating them into one policy quantified over every belted union in the fact would also make
   `bus-coverage-owner` structurally unnecessary. Not taken in this lane: it would rewrite four policies
   the wave just credited, and their conversion manifest, mid-train.
2. `canonicalTypeAlias` now follows an import alias one hop. It refused with ZERO declarations when the
   type was read at a node in a CONSUMING module (every client mapped type), which is the difference
   between locating a union and silently not finding it. The producer census is unchanged by the repair;
   any other reader that resolves a type read outside its declaring module wants the same hop.
3. The composed 78-policy baseline must be re-measured with these six policies and two providers added,
   on a quiesced tree, before cutover acceptance.
