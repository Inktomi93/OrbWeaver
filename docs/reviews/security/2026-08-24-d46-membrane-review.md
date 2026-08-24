---
kind: review
status: draft
updated: 2026-08-24
---

# D46 plugin-membrane security review (2026-08-24) — the exposure gate

Read-only review. No production code changed (one scratch belt-break, reverted — receipt below). Lane
`cb-d46-secreview`, board row #605. The question this answers is narrow and load-bearing: **the plugin
SERVER stack is built and live-wired, the client surface is not — may it be exposed to use?**

Scope read in full: `packages/server/src/infra/plugin-host/**` (sandbox · realm · membrane · marshal ·
budgets · module · port), `packages/server/src/domain/plugin/**` (7 verbs · activation · substrate ·
persistence · contract), `packages/contracts/src/plugin/**`, the delivery path
(`domain/automation/{contract,substrate}/plugin-subscribers.ts` + `entry/compose/automation-plugin.ts` +
`entry/compose/plugin-chat-reads.ts`), `domain/tool-use/verbs/register-plugin-tool.ts`,
`transport/trpc/routers/plugin.ts`, `infra/network/egress.ts`, `packages/db/src/schema/plugin.ts`, and the
7 plugin-host test suites. Judged against `docs/architecture/proposed/plugin-design/{README,01,02,03,04}.md`
and the D46 ledger entry (`Core-Path-Registry.md` D46, incl. the 2026-07-24 spend-tier amendment).

## EXPOSURE VERDICT — **NOT READY**, with a short, enumerable list of conditions

The isolation core is genuinely good: the capability gate is derived from one contract map, the opaque
handle is a per-invocation CSPRNG token, marshalling is inert both directions, the SSRF wall is the audited
`safeFetch` pinned to the manifest allowlist, event delivery is *stricter* than designed, and the hostile
corpus in `escape.suite.test.ts` is real adversarial payloads rather than fixtures. What is NOT ready is the
**availability** half and two **authority** seams that the client wave would light up.

Blocking conditions (each maps to a finding below):

1. **P1-A — bound the invocation in WALL TIME.** A guest promise that never settles hangs the invocation
   forever and leaks the sandbox; today any authenticated chat member can trigger it 600×/minute.
2. **P1-B — fix the plugin-tool PL-C ceiling** so it resolves the INSTALLER's membership instead of reading
   the CALLER's roster. It is latent only because nothing attaches plugin tools to a turn yet — which is
   exactly what "expose the plugin system" changes.
3. **P2-C — stub the ambient `performance` clock** in the guest realm and convert the "no ambient" test to
   an allow-list assertion. The determinism law (D46, `test-determinism`) is currently false on the tree.
4. **P2-D — neutralize macros on plugin lore writes**, and **P2-E — add the two gates the automation arm
   has** (book attached to the chat, per-plugin entry cap). Without them a `worldinfo.write` grant is a
   delayed `chat.variables.write` in rooms the plugin was never admitted to.
5. **P2-F — put a floor under `notify`** (the designed 60 s cooldown) and a stricter rate bucket / in-flight
   cap under `plugin.runSnippet`.

Non-blocking but should land with the exposure wave: P2-G (a deadline that does not cancel host work),
P3-H (upgrade silently re-arms a changed `netHosts`), P3-I (no runtime plugin log at all), P3-J (no inbound
arg cap), P3-K/P3-L (KV char-vs-byte cap, the `evalCode` args seam).

---

## P1-A — a never-settling guest promise hangs the invocation forever (unbounded sandbox leak)

**Severity: P1 (availability / resource exhaustion), reachable by any authenticated chat MEMBER.**

`Sandbox.runToSettlement` installs the QuickJS interrupt handler and then awaits the guest promise:

```ts
// packages/server/src/infra/plugin-host/sandbox.ts:236-248
this.ctx.runtime.setInterruptHandler(() => performance.now() - startMs > this.limits.cpuDeadlineMs);
…
const settled = await native;               // ← the ONLY thing that ends the invocation
```

The interrupt handler preempts **guest bytecode only** (its own header says so, `budgets.ts:12-14`). A guest
that stops executing bytecode — `new Promise(() => {})` — is never interrupted, so `await native` never
resolves. There is no wall-clock race anywhere above it: `port.runSnippet` (`port.ts:200-216`) awaits
`evalGuest` bare, and `SNIPPET_WALL_MS` is passed as `cpuDeadlineMs`, i.e. *into the interrupt handler that
cannot fire*. Design 03 §3 promises the opposite ("dangling unresolved guest promises at end-of-invocation
are rejected with `PluginInvocationEnded` … the bridge tracks every outstanding handle and disposes them") —
that clause is unimplemented, and no test covers it.

**Measured (probe run in this worktree, positive control included):**

| payload | outcome |
| - | - |
| `while(true){}` (CONTROL) | dies at **5.018 s** with `error: "interrupted"` — the DoS bound works |
| `new Promise(() => {})` via `runSnippet` | **never settled** (raced out at 20 s), sandbox never disposed |
| resident tool handler returning `new Promise(() => {})` | `invoke` **never settled**; a *following* invoke of a healthy handler on the same instance also never ran |

Consequences, in order of severity:

- **Snippet path (member-reachable).** `plugin.runSnippet` is a plain `authedProcedure`
  (`transport/trpc/routers/plugin.ts:63-65`); the only throttle is the loose `general` bucket
  (`entry/rate-limit-gate.ts:46-60` — `runSnippet` is not in `AI_TURN_PATHS`), whose default cap is **600
  requests/minute per user** (`foundation/env/index.ts:124`). `runSnippet` uses `using sandbox` for
  teardown (`port.ts:208`), and a scope that never exits never disposes — so every hung call permanently
  strands a `QuickJSContext` (32 MiB ceiling each, `budgets.ts:22`) plus its tRPC request. One line of JS,
  repeated, is an unbounded memory leak inside the ONE shared `QuickJSWASMModule` (`module.ts:29-32`).
- **Resident path.** A hung handler wedges `port.invoke`'s per-instance FIFO tail forever
  (`port.ts:176-196`): `queueDepth` never decrements, so after `EVENT_QUEUE_DEPTH` (16) pending invokes the
  instance refuses everything, permanently — the plugin's tools, transforms and event handlers are dead but
  the row still says `enabled`.
- **The crash policy is bypassed.** `recordCrash` fires only when `ctx.host.invoke` REJECTS
  (`domain/plugin/activation/activate.ts:86-95`). A hang never rejects, so `consecutive_crashes` never
  increments and the 3-strike auto-disable (`activation/crash-policy.ts:18-32`) never triggers. A hostile
  plugin's most effective move is the one the auto-disable posture cannot see.

**Minimal fix:** race the whole `runToSettlement` body against a real-time deadline (the same
`limits.cpuDeadlineMs` clock the interrupt uses), and on expiry drain `state.pending`, dispose the context,
and return `{ok:false, error:"invocation ended"}` — the `PluginInvocationEnded` posture 03 §3 already
specifies. `port.invoke` must decrement `queueDepth` / advance the tail on that path too (its `.finally`
already handles rejection, so the timeout only needs to reject). Add both probes above to
`escape.suite.test.ts` as permanent pins.

## P1-B — the plugin-tool invocation ceiling reads the CALLER's roster, not the installer's

**Severity: P1 (cross-room authority), LATENT today — no turn attaches plugin tools yet.**

`register-plugin-tool.ts` claims the PL-C ceiling: "the installer must be a participant of the chat this
tool runs in". What it executes is:

```ts
// packages/server/src/domain/tool-use/verbs/register-plugin-tool.ts:41-52
try { can(installer, CHAT_READ, { kind: "chat", roster: exec.roster }); } catch { return "denied"; }
let canWrite = false;
try { can(installer, CHAT_HOST, { kind: "chat", roster: exec.roster }); canWrite = true; } catch { … }
```

`exec.roster` is documented as **"The caller's loaded membership"** (`domain/tool-use/contract/params.ts:41`)
— the TURN caller's, not the installer's. And `can()` is a pure verdict over the roster handed in
(`domain/admin/guard.ts:28-38`): `decideChat("read")` **returns unconditionally** (membership is presumed
established by the roster's loader), and `decideChat("host")` tests `roster.role !== "host"`. So:

- the read admission is a **no-op** — it can never deny;
- `canWrite` is derived from **the caller's** host role, i.e. a plugin installed by admin A is handed
  `canWrite:true` inside user B's room whenever B's own turn calls the tool.

With the chat scope thus admitted, the guest's `chat.getVariables`, `applyVariableOps`, `requestTurn`
(funded by A), `worldInfo.upsertEntry`, `imagery.generatePicture` (A's credential), `notifications.post`
and `surfaceQuickReply` all operate on B's chat. Only canon READS survive, because the bridge separately
resolves the installer's own visibility (`domain/plugin/substrate/bridge.ts:51-65`) — that choke is what
keeps this from already being a canon leak.

**Why it is not exploitable today:** the per-turn wire attach set is the union of *teaching contributions'*
`toolNames` (`domain/chat/verbs/turn.ts:637` ← `domain/chat/substrate/teaching.ts:73`), and the only
contributor supplying names is rpg (`domain/chat/teaching-contribution.ts:35`). Nothing routes a
`plugin_<slug>_<name>` into a turn. The moment the exposure wave adds that attachment, this is live.

**Minimal fix:** resolve the INSTALLER's own present role for `exec.chatId` and derive both the admission
and `canWrite` from it — the pattern the other two registrars already use correctly:
`isInstallerHost: async (chatId) => (await loadPresentRole(db, chatId, scope.installer.userId)) === "host"`
(`entry/compose/automation-plugin.ts:334`) and the event fan-out's per-delivery
`loadPresentRole(db, factChatId, scope.installer.userId)` (`:365`). Inject that op into
`createRegisterPluginTool` and delete the two `can(installer, …, exec.roster)` calls, which cannot express
the check they are named for.

## P2-C — the guest realm has an ambient, live, high-resolution clock (`performance`)

**Severity: P2 (a stated + gate-claimed control is absent; determinism law false).**

`installRealm` overwrites exactly two ambient sources (`realm.ts:62-71`): `Date` and `Math.random`. The file
header asserts they are "the only time/entropy sources" and that a bare QuickJS-ng context has no ambient
authority. Probed against the real realm in this worktree:

```
GLOBALS: …, orb, parseFloat, parseInt, performance, queueMicrotask, …
PROBE typeof performance      => object        PROBE performance.now()     => 13.469463999999789
PROBE Object.getOwnPropertyNames(performance) => now,timeOrigin
PROBE (a=performance.now(); …2M-iteration loop…; performance.now() - a) > 0  => true
```

So a guest reads a real, monotonic, sub-microsecond clock without any capability. That breaks D46's
"clock/PRNG/ids reach the guest ONLY via injected host functions" and the `test-determinism` claim (two runs
under identical injected seams are not byte-identical), gives an entropy source that defeats the injected
PRNG, and hands a hostile guest a precise timer for measuring the DoS deadline and for timing side-channels
inside a WASM module whose linear memory is shared by every plugin context. `timeOrigin` is
process-relative (10950 ms observed), so no wall-clock epoch leaks — that part is fine.

**Why the suites miss it:** the realm pin is a fixed six-name probe
(`tests/server/infra/plugin-host/realm.test.ts:81-82` — setTimeout/setInterval/fetch/process/require/
XMLHttpRequest), the test named "the only non-standard global is orb" asserts only `typeof orb`
(`realm.test.ts:88-96` — the body does not check the claim in its own title), and the escape suite's
set-diff is taken against a **bare** context (`escape.suite.test.ts:105-124`), which also has `performance`,
so an ambient source that ships with the runtime is invisible to all three.

**Minimal fix:** add `performance` to `AMBIENT_STUBS` as a throwing stub pointing at `host.clock`
(`realm.ts:62`), and replace the diff-vs-bare / fixed-probe pins with an **allow-list** assertion over
`Object.getOwnPropertyNames(globalThis)` so any future quickjs-ng bump that adds `crypto`, `Temporal` or
`Atomics` goes red on arrival. (`WeakRef`/`FinalizationRegistry` are also present and are GC-observability
side channels; they are ES intrinsics, so allow-listing them is a deliberate decision to record, not a bug.)

## P2-D — plugin lore writes store RAW guest text that is macro-EXPANDED later (ungranted variable writes)

**Severity: P2 (capability-gate bypass by delayed execution + cross-chat reach).** This is the tracked C7
line item ("`neutralizeMacros` absent on plugin lore writes") — **worse than tracked**, because the expansion
site is a mutating one.

The plugin bridge stores the guest string verbatim:

```ts
// packages/server/src/domain/plugin/substrate/bridge.ts:82-88
await ops.worldInfo.upsertEntries({ authorUserId: installerUserId, bookId: entry.bookId as WorldBookId,
  entries: [{ title: entry.entryKey, keys: entry.keys, content: entry.contentTemplate }] });
```

`upsertEntries` writes `input.content` unmodified (`domain/world-info/verbs/entries/upsert-entries.ts:58,69`).
At assembly, world-info entry content is macro-rendered with the **full** registry against the assembling
chat's context (`domain/chat/assembly/context.ts:225` — `renderMacros(entry.content, env.ctx, persona, …)`),
whose options share the chat's live variable map by reference and thread the op-log
(`domain/chat/assembly/macros.ts:110-127`). `{{setvar}}` pushes a `VarOp` onto that op-log
(`packages/kit/src/macro/registry.ts:354-362`, registered at `:702`), and the op-log is REPLAYED via
`foldVarOps` along the selected-variant chain (`packages/kit/src/macro/types.ts:204`) — i.e. it becomes
durable chat state.

**Exploit:** a plugin granted `worldinfo.write` (but NOT `chat.variables.write`) upserts an entry whose
content is `{{setvar::tension::99}}`. Nothing happens at write time. On the next turn of **any chat the
installer's book is attached to** — including one where the installer is a member, not host — the entry is
rendered and the variable write lands. The membrane's host-authority ceiling
(`membrane.ts:216-226`) and the capability gate are both side-stepped by deferral.

The automation arm is the contrast that proves the fix: `runInsertWorldInfo` renders the template at write
time (`domain/automation/engine/arm-executors.ts:112`), so the stored row holds no live macro.

**Minimal fix:** `neutralizeMacros(entry.contentTemplate)` (`packages/kit/src/macro/content.ts:19`) in the
plugin bridge before it reaches the shared writer — the plugin realm is untrusted input, and the
`user-macros.ts:17` precedent already says untrusted values are neutralized before templating.

## P2-E — the plugin world-info write has no attachment gate and no entry cap

**Severity: P2 (design deviation; unbounded write into installer-owned books).**

Design 02 §2 specifies `worldinfo.write` = "grant + host + **book-attached-to-chat** … + the **64-entry
cap**". The membrane enforces the grant + host authority (`membrane.ts:307-315`); the two remaining gates do
not exist on the plugin path. The `bookId` is **guest-supplied** and is bounded only by the shared writer's
ownership check (`upsert-entries.ts:98-101` — `loadOwnedBook(db, ownerId, bookId)`), so a plugin invoked in
chat X can write into any book its installer owns, including books attached only to chat Y, and can create
unboundedly many entries. The automation arm gates both (`arm-executors.ts:109-121` —
`isBookAttachedToChat` + `RULE_MAX_ENTRIES_PER_BOOK`).

**Minimal fix:** thread an `isBookAttachedToChat(chatId, bookId)` op into `PluginHostOps.worldInfo` and
refuse when false (the admitted chat is already in `InvocationChat`), plus a per-plugin entry ceiling keyed
the way the rule path keys its title namespace.

## P2-F — `notify` has no cooldown floor, and `runSnippet` has no meaningful throttle

**Severity: P2 (durable-row flood / resource abuse).**

- Design 02 §2 requires `notify` = "grant + host + participants-only recipients + **the 60 s floor**". The
  rule path enforces exactly that floor, twice (`domain/automation/substrate/validate.ts:16-18,45-46` at
  authoring; `engine/budget-gate.ts:26-27` at fire time). The plugin path has **no cooldown**: the compose
  op resolves the recipient set and writes one durable notification row per present member per call, with no
  rate state at all (`entry/compose/automation-plugin.ts:261-271`). Participants-only is honoured (the
  roster is resolved domain-side), and the missing host gate is a *documented, argued* deviation
  (`membrane.ts:428-435`) — the missing floor is not.
- `plugin.runSnippet` debits only the `general` bucket (600/min default). Each call mints a fresh
  `QuickJSContext` with a 32 MiB ceiling on the one shared WASM module and may hold it for the 5 s wall
  (forever, with P1-A). There is no per-user in-flight cap.

**Minimal fix:** a per-`(pluginId, chatId)` cooldown in the `notifications.post` compose op (reuse the
automation floor constant), and either add `plugin.runSnippet` to a stricter rate bucket or gate it on a
small per-user concurrent-snippet counter.

## P2-G — a host-fn deadline does not CANCEL the host work it bounds

**Severity: P2 (the ≤32 in-flight cap does not bound real work; spend amplifier).**

`attachAsync` races the impl against a 5 s timer and decrements `inFlight` in the `.finally` of that RACE
(`membrane.ts:636-641, 672-677`). The losing impl keeps running host-side — nothing is aborted. So the "≤32
concurrent host calls" back-pressure admits **32 fresh calls every 5 seconds** while the previous ones are
still executing. For `imagery.generatePicture` (installer-funded GPU/$, and the path the ledger's spend-tier
amendment deliberately left with no ceiling) and `chat.requestTurn`, that is a real amplifier; `net.fetch`
is self-limiting because `safeFetch` carries its own deadline (`membrane.ts:591-598`).

**Minimal fix:** thread an `AbortSignal` from the race into the bridge ops that accept one (`safeFetch`
already does), or count *started-and-unsettled* impls rather than *not-yet-timed-out* promises.

## P3 findings

- **P3-H — `upgrade` silently re-arms a changed `netHosts` allowlist.** The re-grant trigger compares
  capability sets only (`verbs/upgrade.ts:36-38` → `substrate/grants.ts:26-29`), and activation forwards the
  NEW manifest's `netHosts` (`activation/activate.ts:58-60,75`). An upgrade that keeps `net.fetch` but swaps
  `api.vendor.example` for `collector.attacker.example` stays `enabled` and re-activates with the new wall,
  with no confirmation. Fix: treat any host not in the prior manifest's `netHosts` as a new-capability event
  (land `disabled`).
- **P3-I — there is no runtime plugin log.** `Resident.log` is captured once at activation
  (`port.ts:156`) and `readLog` returns that snapshot (`port.ts:218`); the per-invocation ring is reset at
  the start of every invocation (`sandbox.ts:230`) and its drained lines are discarded by `invoke`
  (`port.ts:176-185`). So `getPluginLog` can never show what a plugin did after activation — the audit
  surface 01 §2 promises ("surfaces in the plugin's log view") does not exist for runtime behaviour. Fix:
  append drained lines into a bounded per-instance ring in `invoke`.
- **P3-J — no inbound argument cap at the membrane.** Every guest arg is `ctx.dump`ed with no byte bound
  (`membrane.ts:618`), while results are capped at 1 MiB (`membrane.ts:651-656`). The guest heap (32 MiB)
  bounds a single call; ×32 in flight is \~1 GB of host-side JSON. The resident-handler INBOUND direction is
  capped (`sandbox.ts:282-284`) — this is the missing mirror. Fix: cap the dumped-args JSON the same way.
- **P3-K — `plugin_kv` byte caps are character caps.** SQLite `length()` on TEXT counts characters, so
  `KV_VALUE_MAX_BYTES = 65_536` (`packages/db/src/schema/plugin.ts`) admits up to \~256 KiB of UTF-8 per
  value (×256 keys/plugin). Fix (if it matters): `length(cast(value as blob))`.
- **P3-L — `runSnippet` args reach the guest through `evalCode`.** `parseJsonToHandle` evaluates
  `` `(${json})` `` inside the realm (`sandbox.ts:293-300`). Every caller passes `JSON.stringify` output, so
  this is safe today, but it is an eval-shaped seam one non-JSON caller away from injecting guest code into
  another plugin's invocation. Fix (cheap): marshal via `jsToHandle` instead, or assert JSON-ness.

---

## The nine judged questions — verdicts

1. **Capability → enforcement honesty.** Mostly TRUE, with the deviations above. The map itself is exemplary:
   `HOST_FUNCTION_CAPABILITY` (`contracts/plugin/host-v1.ts:198-219`) is `satisfies Record<HostFunctionRef,
   PluginCapability>` over a union DERIVED from the surface, so a gated method with no capability fails
   `tsc`; the membrane reads that one map at runtime (`membrane.ts:108-113`). Per row: `chat.read` ✅
   (and stricter — see Q7); `chat.variables.write` / `chat.quick_reply` / `turn.trigger` / `imagery.generate`
   ✅ grant + host authority via `InvocationChat.canWrite`; `worldinfo.write` ⚠️ grant + host but no
   attach/cap (P2-E) and no macro neutralization (P2-D); `global_vars` ✅ fetchOwned under the installer
   (`bridge.ts:96-100` + `automation-plugin.ts:311-317`); `storage.kv` ✅ (Q5); `notify` ⚠️ no floor (P2-F);
   `events.subscribe` ✅ (Q7); `tools.register` ❌ the ceiling is the wrong principal (P1-B);
   `net.fetch` ✅ (Q4). No capability is a boolean the guest trusts — every one resolves to a host-side
   mechanism. The installing-principal model holds: infra never sees a `Principal` or a roster, the funder is
   closed over domain-side (`bridge.ts:72-79`) and `initiator:"plugin"` is hardcoded at compose
   (`automation-plugin.ts:242-251`); the escape suite pins that a guest cannot name a funder
   (`escape.suite.test.ts:398-445`). No ambient FS/network/DB (Q2).
2. **Membrane escape surface.** SOUND, except the ambient clock (P2-C). Handles are per-invocation
   `randomUUID` tokens minted from `node:crypto`, deliberately not the guest id seam
   (`sandbox.ts:206-214`), and every chat fn resolves its arg against the single admitted token
   (`membrane.ts:161-171`); a stale token from a prior invocation is refused before the bridge
   (`escape.suite.test.ts:237-291`). Marshalling is inert both ways — host→guest collapses
   functions/symbols/bigint to `null` (`marshal.ts:26-34`), guest→host crosses via `ctx.dump` (JSON only),
   and the corpus proves a smuggled callable and a throwing getter are both contained
   (`escape.suite.test.ts:182-229`). The constructor/`Function`/`eval` walks resolve to the guest global
   (`escape.suite.test.ts:72-103`). `Date`/`Math.random` are throwing stubs; `setTimeout`/`fetch`/`process`/
   `require` are absent from the runtime.
3. **DoS bounds.** BROKEN at the top (P1-A); everything below it is real. Interrupt kill ✅ (5.018 s measured,
   and it survives a guest hammering its own frozen clock — `escape.suite.test.ts:447-460`); 32 MiB memory
   cap ✅; the explicit `setMaxStackSize` ✅ and load-bearing (`budgets.ts:24-32` records that the default
   made deep recursion a HOST crash + un-disposable runtime); log ring ✅; ≤32 in-flight ✅ as a promise
   count but not as a work count (P2-G); per-instance invoke serialization + bounded FIFO ✅ with a REPRO
   GUARD test proving the race was real (`port.test.ts:1057-1123`); teardown drains unsettled deferreds so a
   fire-and-forget host call cannot abort the shared WASM module (`sandbox.ts:304-321`,
   `escape.suite.test.ts:313-356`). The crash counter / auto-disable is real
   (`crash-policy.ts:18-40`, `plugins.ts:151-158`) but blind to hangs (P1-A).
4. **`net.fetch` SSRF posture.** SOUND — the strongest surface here. The manifest allowlist is
   `z.hostname()` (`contracts/plugin/manifest.ts:63`), threaded as plain data from the RE-VALIDATED manifest
   at activation (`activate.ts:58-60`), never guest-supplied, empty ⇒ fail-closed (`port.ts:136`). Probed
   the schema's acceptance set myself: `.com` / `.example.com` / `*.example.com` / `-example.com` /
   `example..com` / a 70-char label are all REJECTED — so `hostAllowed`'s leading-dot suffix-wildcard arm
   (`infra/network/egress.ts:447-459`) is genuinely unreachable from a bundle, as its coupled-site comment
   claims; `EXAMPLE.com` and `example.com.` and `169.254.169.254` and `localhost` are accepted at install and
   all fail closed at call time. Per-hop enforcement is real: `validateUrl` re-runs scheme + IP-literal +
   allowlist on **every** redirect hop (`egress.ts:583-609`), DNS-rebinding is closed by resolve→validate→pin
   into a single-use dispatcher (`egress.ts:490-533`), credential headers are stripped cross-origin
   (`egress.ts:423-427`), body is byte-capped and the whole request deadline-bounded. The escape suite
   exercises a link-local IP literal, an undeclared host and an http downgrade
   (`escape.suite.test.ts:358-396`). Note the one remaining gap is a RATE belt, not a target belt (§8).
5. **Storage + KV.** SOUND. Every query filters `plugin_id` AND `owner_id`
   (`persistence/plugin-kv.ts:20-64`), including the upsert's `onConflictDoUpdate({ setWhere:
   eq(pluginKv.ownerId, …) })` so a foreign-owner collision moves 0 rows; the guest names only a key/prefix
   because the bridge closes both scope ids over the op (`bridge.ts:103-108`); the 256-key ceiling is
   enforced host-side off a count (`substrate/storage.ts:34-43`) and the key/value caps are DDL CHECKs
   (modulo P3-K). Honest caveat: `plugin_id` already determines the owner, so the denormalized `owner_id`
   belt is redundant *by construction* — breaking it in a scratch run would show nothing, so I did not
   manufacture a receipt for it.
6. **Lifecycle authority.** SOUND. Install/upgrade/setEnabled/uninstall all gate
   `can(caller,"admin",{kind:"global"})` (owner ∪ admin — `guard.ts:14-24`) and then load the row
   owner-scoped (`persistence/plugins.ts:84-91`), so an admin can only operate their own rows and a foreign
   id is indistinguishable from a missing one. Install lands `disabled`; grant ⊆ declared is enforced
   (`verbs/install.ts:21-24`); upgrade requires a slug match, refuses a downgrade, recomputes
   `granted = declared ∩ prior grant`, and lands `disabled` whenever the manifest declares anything the prior
   grant never confirmed (`verbs/upgrade.ts:28-59`) — except for `netHosts` (P3-H). Uninstall is
   deactivate → delete row → reap asset, with the FK RESTRICT + `reapIfOrphan` re-check making a dangling
   asset structurally hard (`verbs/uninstall.ts:21-23`). Activation is atomic — a registrar refusal
   unregisters its own partial set and lands `errored` (`activation/activate.ts:21-42,98-106`). The bundle
   funnel is properly hardened: a two-entry allow-list (so traversal is impossible by construction), a
   compressed-input cap, per-entry header caps checked BEFORE fflate allocates, and a post-decompress belt
   against a lying header (`substrate/manifest.ts:54-100`). `runSnippet`'s profile is right: chat authority
   resolved leak-free, `chat.variables.write` only for a host caller, and `tools`/`events`/`transforms`
   refused through the same uniform capability gate rather than a snippet-special path
   (`verbs/run-snippet.ts:22-35`, `port.test.ts:808-846`).
7. **Event delivery.** RE-VERIFIED from the code, not inherited — and it is indeed stricter than designed.
   Three fail-closed gates (`domain/automation/substrate/plugin-subscribers.ts`): the hard cascade cap
   before anything else (`:157-160`), declared-match + cascade opt-in (`:140-148`), and per-installer
   visibility (`:83-105`) resolved through chat's ONE `resolveViewerVisibility` op — membership AND the D16
   history floor as one answer, with a message-bearing fact refused below the floor (`:91-93`) and hidden
   `<lie>`/`<ofilter>` spans stripped for a non-host member before delivery (`:110-116`). The canon read is
   clamped in SQL, not post-filtered (`entry/compose/plugin-chat-reads.ts:57`), with the same hidden strip
   (`:64`). **Proven load-bearing:** deleting the `gte(messages.seq, opts.floorSeq)` predicate in a scratch
   edit turned `plugin-chat-reads.int.test.ts` red (2 of 4 tests, pre-join seqs 5-7 appearing in the page);
   the file was restored from its `.bak` and `git status --short` is empty. Both suites green as shipped
   (18/18). One residual: the fan-out re-reads visibility per delivery, but `getVariables` is deliberately
   NOT floor-clamped (documented as the activity plane, `contract/ops.ts:86`) — which is what makes P1-B's
   wrong-principal admission reach chat state.
8. **Known-open items** — see the split below.
9. **Test honesty.** GOOD, with one blind spot and one tautology. `escape.suite.test.ts` runs real
   adversarial payloads against the live membrane (constructor-chain walk, `__proto__` payload across the
   boundary, a smuggled callable, a throwing getter, a hoarded stale handle, 40 concurrent host calls, a
   forged funder + spoofed depth, a frozen-clock busy loop); `port.test.ts` carries a genuine REPRO GUARD
   that demonstrates the un-serialized path clobbering `automationDepth` before asserting the fix. The
   determinism gate is real (same seams ⇒ byte-identical, different seed ⇒ different — `sandbox.test.ts:135`)
   but is scoped to the injected seams and therefore blind to P2-C. The blind spots: no test asserts an
   invocation TERMINATES (P1-A), the "no ambient" pin is a fixed six-name probe, the test titled "the only
   non-standard global is orb" does not assert its own claim, and the set-diff is taken against a bare
   context that shares the ambient source.

## §8 — tracked vs new

**Confirmed as TRACKED (report as known, not new):**

- **No hourly egress RATE belt on `net.fetch`.** Confirmed: `safeFetch` bounds each request (deadline, byte
  cap, redirect budget) and the manifest bounds the target set, but there is no per-plugin fetch counter
  anywhere in `infra/network/egress.ts` or the membrane. Accurate as tracked; unchanged in severity.
- **`neutralizeMacros` absent on plugin lore writes (C7).** Confirmed absent — and **WORSE than tracked**:
  the expansion site is a *mutating* one (`{{setvar}}` → op-log → `foldVarOps`), so it is a capability
  bypass, not a hygiene gap, and it reaches chats outside the invocation scope. Promoted to P2-D, and it
  travels with P2-E (the missing attach gate is what gives it cross-chat reach).
- **The `membrane.ts` recipient silent-downgrade ternary (C6).** Confirmed at `membrane.ts:445` —
  `args[1] === "all_members" ? "all_members" : "host"`. Direction is fail-SAFE (anything unrecognized
  narrows to the single-recipient arm), so it stays a correctness/DX wart, not a leak. Accurate as tracked.

**NEW (not on any tracked list I could find):** P1-A (invocation hang / sandbox leak), P1-B (PL-C wrong
principal), P2-C (ambient `performance`), P2-E (no attach gate / entry cap on plugin lore writes), P2-F
(no `notify` floor; `runSnippet` throttle), P2-G (deadline without cancellation), P3-H (netHosts re-arm),
P3-I (no runtime log), P3-J (no inbound arg cap), P3-K (char-vs-byte KV cap), P3-L (`evalCode` args seam).

**Doc-vs-tree deviations worth recording:** design 02 §2 still credits `turn.trigger`/`imagery.generate`
with "`automation_budgets` spend ceilings" — the D46 amendment of 2026-07-24 retired the plugin spend tier
whole, and the code is honest about it (`membrane.ts:320-327`, `substrate/bridge.ts:16-19`). The ledger
wins; the design doc's §2 row is stale. Design 03 §3's `PluginInvocationEnded` clause is a promise the code
does not keep (P1-A).

## Receipts (this review)

- Probe suites (written to `tests/server/infra/plugin-host/cbd46-*.test.ts`, run, then deleted — the tree is
  clean): `cbd46-hangprobe` (control + PROBE A + PROBE B), `cbd46-globals`, `cbd46-perf`.
- Shipped suites run green: `tests/server/entry/compose/plugin-chat-reads.int.test.ts` +
  `tests/server/domain/automation/substrate/plugin-subscribers.int.test.ts` → 18/18.
- Belt-break: `gte(messages.seq, opts.floorSeq)` removed from `entry/compose/plugin-chat-reads.ts` →
  2 tests red (pre-join seqs delivered); restored via `mv f.bak f`, `git status --short` empty.
- Schema probe: `z.hostname()` acceptance set (11 cases) run against the workspace zod.

## Issue summary (for #605)

D46 membrane security review is complete: **NOT READY to expose**, with five enumerable blocking conditions
and no re-architecture required. The isolation core is sound — capability gate derived from one
`tsc`-checked contract map, per-invocation CSPRNG handles, inert marshalling both directions, an audited
per-hop SSRF wall pinned to the manifest allowlist, and event delivery that is stricter than designed (D16
floor + hidden-span strip, re-verified and proven load-bearing by breaking the belt). Blockers: (1) **P1** a
guest promise that never settles hangs the invocation forever — probed with a positive control, the
`while(true)` control dies at 5.018 s while `new Promise(()=>{})` never returns, leaking a 32 MiB-ceiling
QuickJS context per call, reachable by any authenticated member at 600 req/min via `plugin.runSnippet`, and
it silently bypasses the 3-strike auto-disable because a hang never rejects; (2) **P1** the plugin-tool PL-C
ceiling calls `can(installer, …, exec.roster)` with the CALLER's roster, so the read admission is a no-op
and `canWrite` is taken from the caller's host role — latent only because nothing attaches plugin tools to
a turn yet, which the exposure wave changes; (3) **P2** the guest realm exposes a live
`performance.now()` (probed), so the D46 determinism law and the realm's own "only time source" comment are
false, and all three "no ambient" tests are structurally blind to it; (4) **P2** plugin lore writes store raw
guest text that is macro-expanded at assembly, turning a `worldinfo.write` grant into a delayed `{{setvar}}`
in any chat the book is attached to — and that path has neither the attach gate nor the entry cap the
automation arm enforces; (5) **P2** `notify` ships without the designed 60 s cooldown and `runSnippet` has no
stricter bucket. Full report with `file:line` receipts, exploit paths and minimal fixes:
`docs/reviews/security/2026-08-24-d46-membrane-review.md`. Tracked items re-confirmed: no hourly egress
rate belt (accurate), the C6 recipient ternary (accurate, fail-safe), C7 `neutralizeMacros` (worse than
tracked — promoted to a capability bypass).
