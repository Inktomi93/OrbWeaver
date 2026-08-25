---
kind: design
status: draft
updated: 2026-08-24
---

# The Plugin UI Plane — full-featured add-ons over the sealed membrane (#679)

> **Commission.** Owner ruling 2026-08-24: *"we do need to set up plugins to be able to show UI etc
> and be a full-featured add-on"* — SillyTavern-extension-class: settings panels, buttons/controls,
> message decorations, custom surfaces. Three owner steers folded mid-design, each ruling-class:
> (1) **capability-first** — "things are sandboxed; at a certain point shit is up to the user"; walls
> protect the SYSTEM and OTHER users, never the installing user from themselves; consent is the line.
> (2) **ST extension ability PARITY** is the bar — §5 is the completeness proof. (3) **"iframe is
> kinda ghetto and defeats the purpose of an integrated system"** — the integrated declarative arm is
> PRIMARY; the iframe is at most a parked escape hatch (§6). (4) The dependency budget is OPEN for a
> load-bearing dep — the client-side sandbox row is §4.6.
>
> Today plugins are HEADLESS by design: the membrane's own refusal list says *"DOM/UI beyond
> quick-reply chips (the client extension story is a separate, undesigned surface — NOT this
> membrane)"* (`docs/architecture/proposed/plugin-design/01-runtime-and-membrane.md:194-195`). This
> document IS that separate surface, designed. It supersedes that refusal row deliberately, on the
> owner's ruling. Every build-state claim below was tree-verified 2026-08-24; receipts are
> `path:line`.

## §1 The recommendation (one screen)

**Plugin UI is a DECLARATIVE CONTRIBUTION TREE over the sealed `@orb/ui` vocabulary, rendered by
first-party code at the existing contribution anchors, in two tiers sharing ONE spec vocabulary:**

- **Tier S (static)** — the plugin's server-side `main.js` registers surfaces at activation
  (`host.ui.registerSurface`); the spec is server-validated JSON; actions round-trip to the SERVER
  guest (`invoke` under the existing budgets). No new runtime anywhere. Covers settings panels, tool
  cards, chat widgets, badges.
- **Tier C (scripted)** — an optional `ui.js` bundle entry runs in a CLIENT-side QuickJS-WASM
  context (the SAME dep family the server membrane already pins — §4.6: likely zero new packages),
  inside a Web Worker. It produces the same declarative tree and handles events at native latency;
  every host-data call relays through ONE re-gated tRPC proc to the SAME server membrane. Plugin
  code never touches the real DOM in either tier.

**One new capability: `ui.surface`** (its own consent line, §4.1). Every plugin surface renders
inside a first-party plugin-labeled shell (§4.8) — a plugin composes house components; it cannot
fake host chrome, and it inherits tokens/theme/a11y/density/focus/positioning for free.

**The sandboxed-iframe arm is DEMOTED to a PARKED escape hatch** (`ui.frame`, §6): fully shaped here
(it rides the proven card-frame substrate), NOT in the build phases, wake criterion = a real plugin
demanding an arbitrary-pixels row of the parity register (canvas games, live2d/VRM). The residual
list the integrated arm cannot reach at full fidelity is §6.1 — it is short, and nothing on it is a
committed product need today.

**Every existing wall holds:** class-1 (no prose write — the vocabulary cannot express one), the
grant/consent model (#675's per-user scoping; the surface renders only for its INSTALLER in v1), the
CSP/exfil posture (Tier S/C add no new egress channel at all — the one named CSP delta is
`'wasm-unsafe-eval'`, §4.6/§9), the one-mount contribution architecture (all mounts ride existing
door-assembled families), and the sealed `@orb/ui` layer (plugins consume it as data; they never
import, style, or subclass it).

## §2 Ground truth (as-built, verified 2026-08-24)

| Fact | Receipt |
| - | - |
| The plugin SERVER stack is BUILT and exposure-cleared: D46 review #605 and all seven findings CLOSED, security-verified; #24 out of Parked; remaining P3s #627 (runtime log) / #628 (residuals) non-blocking | `docs/design/interaction-direction-spec.md:518` (C7 row) |
| The membrane surface is 14 capabilities / 21 gated host functions, completeness `tsc`-pinned both directions + vitest exact pins (ordered `toEqual`; `toHaveLength(21)`) | `packages/contracts/src/plugin/manifest.ts:13-28` · `packages/contracts/src/plugin/host-v1.ts:221-243` · `tests/contracts/plugin/manifest.contract.test.ts:26` · `tests/contracts/plugin/index.contract.test.ts:15` |
| Plugins already reach the screen ONLY as data through host chrome: quick-reply chips (`chat.surfaceQuickReply`, `host-v1.ts:91-92`), S4 asks (posture 2, `02-manifest-capabilities-lifecycle.md:85-120`), notifications (`host-v1.ts:122-127`), tool calls in the generic `ToolCallBlock` | as cited |
| A plugin CANNOT register a client ToolRenderer — the registry is first-party, door-assembled EMPTY; unknown names fall back to the generic block. The recorded gap this design closes | `docs/reviews/stickler/2026-08-24-plugin-automation-juice.md:197-203` (A2-F5) · `packages/client/src/compose/authed-app.tsx:187-190` · `packages/client/src/lib/contribution-contracts.ts:244-254` |
| The contribution architecture (D70) gives the mount seams for free: chat surface anchors (`thread-flank`/`above-composer`/`message-footer`, `contribution-contracts.ts:29`), the "This chat" section family (already carrying `pluginSnippetConsoleSection`, `authed-app.tsx:146-149`), tool renderers, slash commands, settings panes/sections — all door-assembled, zero registrants ⇒ byte-identical | `docs/architecture/core/client-architecture-lockdown.md` §5-§6c |
| The flank/band law: a silent contributor renders null and the anchor collapses (`empty:hidden`); data-gated widgets mount-and-render-null; no `useSuspenseQuery` at the flank (no boundary) | `packages/client/src/features/chat/surfaces/chat-room-surface.tsx:151,171` · the needle-meter precedent `authed-app.tsx:181-184` |
| The client plugin feature EXISTS: Plugins settings pane (admin-`when`-gated today), install/grant/log/row surfaces, snippet console section | `packages/client/src/features/plugin/lib/plugins-pane.tsx:21-48` (`when: viewer.isAdmin` :27) · `surfaces/plugins-settings-surface.tsx` |
| #675 (in flight) widens management to user-scoped self-install; the runtime already executes under the INSTALLING principal's ceiling (#610); admin-global gates on the verbs are the v1 narrowing (`domain/plugin/verbs/install.ts:17` as of 2026-08-24) | issue #675 |
| The house already OWNS a sandboxed-iframe substrate with its own CSP doorway, trust rungs, measured navigation/exfil census, and the #124 WebRTC standing watch | `packages/kit/src/card-frame/index.ts:28-99` · `packages/server/src/entry/http/card-frame.ts` · `packages/ui/src/content/sandbox-frame/sandbox-frame.tsx` |
| The app CSP is strict: prod `script-src 'self'`, `frame-src 'self'` named explicitly, `connect-src 'self'` | `packages/server/src/entry/http/security-headers.ts:99,106,113` |
| The server sandbox dep is pinned and spike-proven: `quickjs-emscripten-core@0.32.0` + `@jitl/quickjs-ng-wasmfile-release-sync@0.32.0`, WASM, in-process | `packages/server/src/infra/plugin-host/README.md:7-27` |
| No timers exist in the guest (a sleeping guest is a held instance); per-instance FIFO depth 16; per-invocation budgets | `docs/architecture/proposed/plugin-design/03-execution-model.md:59-75` · `infra/plugin-host/README.md:79-93` |
| Plugin tool names are namespaced `plugin_<slug'>_<name>`; the registry key currently has NO owner — same-slug multi-user installs collide at enable (#677, open) | `03-execution-model.md:94-106` · issue #677 |

## §3 The arms, weighed

**ARM A — declarative contribution DSL (first-party rendered).** Strengths, all by construction:
tokens/theme (the surface IS house components under the live cascade — no token injection, no
re-resolve channel), a11y (house primitives carry the accnames/focus/roles work already paid for),
density and popup positioning (Base UI), transcript/virtualization participation, and
IMPERSONATION-RESISTANCE (§4.8 — the vocabulary cannot express host chrome, a consent dialog, or an
unlabeled container). Weakness as classically stated: expressiveness ceiling (no arbitrary pixels)
and per-interaction server latency. **The ceiling is priced honestly in §5/§6.1 — it is the
arbitrary-pixels niche only. The latency weakness is DELETED by Tier C (§4.6).**

**ARM B — sandboxed-iframe surfaces.** Killed as the primary by the owner's ruling, and the ruling
is architecturally right on this tree's evidence: an iframe surface pays token/theme injection per
frame (`use-sandbox-theme.ts:1-12` — concrete-value injection because a null-origin realm cannot
resolve the cascade), gets NO a11y floor the host can enforce, cannot participate in layout/density
(monotonic height clamps — `card-frame/index.ts:246-267`), multiplies per-row (a per-message iframe
is a perf non-starter), and reopens the #124 exfil class wherever `allow-scripts` is granted
(`card-frame/index.ts:80-90` — WebRTC/STUN beacon, no closing CSP directive). Its ONE honest
advantage is arbitrary pixels. Verdict: DEMOTED to the parked hatch (§6).

**ARM C — hybrid.** The committed shape is a DEGENERATE hybrid: the DSL is the plane; the hatch is
shaped-and-parked rather than built. "Not in v1" here follows the platform ruling's honesty rule
(*"only ever means UNWIRED-but-typed, never unshaped"* — `interaction-direction-spec.md:211`): §6.2
is the full shape, capability name reserved, wake criterion stated.

## §4 The design

### 4.1 Capability + consent

**One new member: `ui.surface`** — appended to `PLUGIN_CAPABILITIES` (`manifest.ts:13-28`; order is
the confirm-dialog display order, so placement is a UX decision — recommend after `notify`, before
the SPEND block). Consent copy (the grant screen line): *"Show its own panels and controls — drawn
by the app, always labeled with the plugin's name."* The parked hatch reserves `ui.frame` (§6.2) —
NOT added to the tuple until woken (an unshipped tuple member would be a lie in every consent
dialog).

Coupled sites (the §7 seam list carries enforcers): the tuple + the ordered vitest `toEqual`
(`manifest.contract.test.ts:26`) + `HOST_FUNCTION_CAPABILITY` rows for each new host function + the
`toHaveLength` pin (`index.contract.test.ts:15`) + the `.test-d.ts` reverse-completeness pin
(`host-v1.ts:211-214`).

Per the capability-first ruling: `ui.surface` is NOT admin-gated, NOT deployment-ceilinged, and
carries no spend class — it renders only for the installer (v1 invariant, §4.5), so past the grant
the risk is the installing user's own. The structural walls it keeps are the system's: no prose
write is expressible, no host-chrome impersonation is expressible, cross-user isolation is the row
scoping.

### 4.2 Registration — the `host.ui` namespace (server membrane, V1-additive)

Additive-optional within host V1 (the 01 §3 evolution law — guests feature-detect via
`"ui" in host` / `host.grants`). All host-side, all under the existing per-invocation budgets:

```ts
readonly ui: {
  /** Register a surface at activation (resident state, like tools/transforms — rebuilt on
   *  re-activation, deregistered on disable). capability: ui.surface */
  register(def: {
    id: string;                      // /^[a-z][a-z0-9_]{0,40}$/, unique per plugin
    anchor: PluginSurfaceAnchor;     // §4.5 — closed tuple
    title: string;                   // the shell label line (≤ 80 chars)
    tier: "static" | "scripted";     // scripted requires the bundle's ui.js (§4.6)
    spec?: PluginSurfaceSpec;        // REQUIRED for static; validated host-side (zod, §4.3)
    onAction?: (a: { actionId: string; values: Record<string, string>; chat: ChatHandle | null }) =>
      void | Promise<void>;          // static tier's server-side event round-trip
  }): void;
  /** Publish surface STATE (the data the spec binds). ≤ 16 KiB JSON; replaces whole.
   *  capability: ui.surface */
  setState(surfaceId: string, state: Record<string, unknown>): Promise<void>;
}
```

- Registration is ACTIVATION-collected exactly like `tools.register`/`transforms.register`
  (`02-manifest-capabilities-lifecycle.md:223-226` — the activation subsystem collects and hands to
  registries; deactivate/uninstall deregisters atomically). An invalid spec is a REGISTRATION
  refusal (logged, surface absent), never activation-fatal — a plugin's chips/tools must not die
  because its panel spec is stale.
- `setState` writes a per-`(pluginId, surfaceId[, chatId])` state row (in-memory on the resident,
  the S4-suggestion-store precedent — respawn wipes accepted; durable state is the plugin's own
  `storage.kv` job) and emits the freshness poke (§4.4).

### 4.3 The spec vocabulary (`@orb/contracts/plugin/ui.ts`)

A closed, zod-validated node union rendered by ONE first-party renderer
(`features/plugin/components/plugin-surface-renderer.tsx`) that maps every node to sealed `@orb/ui`
primitives. The house pattern: closed `as const` kind tuple + discriminated union + an exhaustive
`Record<NodeKind, Renderer>` — a new kind fails `tsc` until it has a renderer
(`contribution-contracts.ts:14-17`'s anchor-family pattern applied to nodes).

| Kind | Renders as | Notes / clamps |
| - | - | - |
| `stack` / `row` | `Stack`/`row` layout | `gap` from a closed token-name subset |
| `section` | `Section kicker` | the host grammar — a plugin never draws its own grouping chrome |
| `text` | `Text` | `voice` ∈ {body, gloss, label}; ≤ 2 KiB |
| `badge` / `meter` | house badge / progress | numeric clamps |
| `keyValue` / `list` | house list rows | row count ≤ 64 rendered (overflow count line) |
| `image` | house media primitive | **source = an `assetId` in the installer's CAS ONLY** — never a URL. No exfil pixel is expressible; external media stays behind the existing ceilings |
| `markdown` | the sealed Streamdown renderer | the model-content class renderer, already hardened for untrusted text |
| `textField` / `numberField` / `toggle` / `select` / `slider` | house form primitives | labels required (a11y floor); values are CLIENT-transient until an action submits them |
| `button` | house `Button` | `variant` clamped to neutral/outline — `primary` stays CONTENT's one primary (the S1 card law, `interaction-direction-spec.md:140-143`); `actionId` names the round-trip |
| `confirmButton` | tier-2 `ConfirmDialog` | destructive confirms ride the HOUSE dialog, plugin-attributed title — a plugin cannot draw its own confirm |

Global bounds (all zod, all host-side at registration AND client-side before mount — the server's
call is the trust boundary, the client's is depth-in-depth, the `buildCardFrameDocument` clamp
posture at `card-frame/index.ts:400-403`): spec ≤ 32 KiB, ≤ 256 nodes, depth ≤ 8, every string
length-capped. **What the vocabulary deliberately cannot express** (the impersonation/attention
walls, each a refusal by unspellability — compile-tier): raw HTML/CSS/className, modals/popovers it
owns, toasts, host-chrome anatomy (rail/topbar/composer), a consent dialog, focus stealing, and any
write channel (a node is data; only `actionId` round-trips).

**Bindings:** any `text`/`meter`/`badge`/`keyValue` value may be `{ $state: "path.in.state" }` —
resolved by the renderer against the surface's published state. Missing path renders the node's
`fallback` or nothing. Chat-anchored surfaces may also bind `{ $chatVar: "name" }` once the vars
read proc lands (priced at the interaction spec §3-S5.4; B9/C1 build it — the needle precedent).
Conditional visibility (`when: "<CEL predicate over state>"`) is a natural ADDITIVE via the kit CEL
engine (`@marcbachmann/cel-js`) — the one predicate dialect plugin/automation authors already
learn; optional, priced with the node that first needs it.

**Vocabulary growth and the composition shelf:** the sealed `@orb/ui` shelf already carries charts
(echarts, D52-sealed), code-editor (codemirror), diff, markdown/math, command — future node kinds
may EXPOSE shelf members, and any exposure inherits the member's seal wholesale (e.g. sortable is
the modern `@dnd-kit/react` ONLY — the legacy core/sortable/utilities family is biome-BANNED, D43).
A vocabulary node only ever names a house primitive, never a package.

### 4.4 State + the event round-trip

**Reads (client ← plugin):** `plugin.listSurfaces` (tRPC query — enabled plugins' registered
surfaces for the CALLER's own rows; `fetchOwned`, the #675 sweep class) and
`plugin.getSurfaceState({pluginId, surfaceId, chatId?})`. Freshness: ONE new user-bus member
`pluginSurfaceStateChanged { pluginId, surfaceId, chatId? }` — the per-person freshness bus is
exactly right because the only viewer is the installer (v1 invariant). Priced with its FULL belt
set (the bus-coverage discipline, `client-architecture-lockdown.md` §0.8/G11): union member +
types-const + producer emit + `USER_BUS_FILTERS` row in `data/invalidation.ts` + the exhaustive
client apply + coverage gates.

**Actions (client → plugin):**

- Tier S: `plugin.invokeUiAction({pluginId, surfaceId, actionId, values, chatId?})` (tRPC mutation)
  → resolves the caller's OWN row (owner-scoped — a foreign id is indistinguishable from missing,
  the lifecycle-verb posture at D46-review Q6) → `invoke(resident, onActionRef, …)` under the
  standard per-invocation budget + the per-instance FIFO (`infra/plugin-host/README.md:79-93`).
  Handler failures ride the EXISTING crash policy (throw → `consecutive_crashes` → 3-strike
  auto-disable); the mutation surfaces a typed refusal → house toast.
- Tier C: the action is delivered INTO the client guest (no network); the guest re-renders locally
  and calls proxied host fns only when it needs host data/effects (§4.6).

**Identity:** the action executes under the INSTALLING principal — which IS the caller in v1
(viewer == installer by row scoping). No confused deputy is constructible: the server derives the
plugin from the caller's own rows, never from a client-claimed identity. When #675's server-wide
install variant lands (admin-gated, per-user consent junctions — its item 4), viewer ≠ installer
becomes possible and this proc's authority model MUST be re-reviewed before plugin surfaces render
for non-installers — recorded as a hard interlock (§11).

### 4.5 Anchors — where a plugin surface may mount

`PLUGIN_SURFACE_ANCHORS = ["settings", "chat-flank", "chat-settings-section", "tool-card"] as const`
(v1; closed tuple in `@orb/contracts/plugin/ui.ts`). Every anchor lands through an EXISTING
door-assembled family via ONE first-party contribution owned by `features/plugin` — the door grows
by fixed first-party members, never per-plugin (the one-assembly law, G8):

| Anchor | Rides | Mount shape | Enforcer |
| - | - | - | - |
| `settings` | the Plugins pane (per-plugin detail) | spec rendered inside the plugin's row/detail — ST's per-extension settings drawer, in the screen users already grant from | the pane (`plugins-pane.tsx`); #675 flips its `when` per-user |
| `chat-flank` | `chatSurfaceContributors` `thread-flank` | ONE `pluginFlankSurface` contribution fanning per-plugin by `listSurfaces` data; mount-and-null when none (the flank activates on a sync `when` that cannot see query data — render null, `empty:hidden` collapses; NEVER `useSuspenseQuery` here) | `chat-room-surface.tsx:151` + a CT pinning null-render width-identity |
| `chat-settings-section` | `chatSettingsSections` (host-controls band) | one first-party contribution per the `pluginSnippetConsoleSection` precedent (`authed-app.tsx:146-149`); host-gated by MOUNT (`contribution-contracts.ts:78-83`) | the family's own walls |
| `tool-card` | the `toolRenderers` registry (`authed-app.tsx:187-190`) | ONE first-party `pluginToolRenderer` claiming `plugin_*`-prefixed wire names, rendering the owning plugin's registered card spec; unclaimed/unregistered names keep the generic `ToolCallBlock` fallback. **Closes the A2-F5 renderer gap.** Key scoping follows whatever #677 lands | `contribution-contracts.ts:244-254` |

- **`message-footer` is v2** (priced, phase U6): per-ROW mounts multiply by transcript length — DSL
  badges only, hard node caps, and never a scripted tier per row. The frame arm is banned there
  permanently.
- **The S1 control band is REFUSED as a plugin MOUNT — argued, not assumed.** The band is the
  room's attention budget and host-tier trust (one visible card, capped chips —
  `interaction-direction-spec.md:103-106,140-144`). Plugins already reach it as DATA through host
  chrome: chips via `surfaceQuickReply` (`host-v1.ts:91-92`) and asks via the S4 suggestion inbox
  (posture 2 — `02:85-120`, ONE inbox keyed `{kind:"plugin"}`). A plugin ChatControlSource would
  put untrusted rendering inside the one surface whose whole design is that the HOST owns its
  grammar. The wall protects the room's members (attention + attribution), not the installer —
  structural, per the capability-first test.
- **Slash commands + chrome:** `host.ui.registerCommand({name, describe, onRun})` → the
  first-party `/plugin` dispatcher (`SlashCommandContribution`, one static registry row —
  `contribution-contracts.ts:319-338`) routes `/plugin <slug> <name> …` to the guest handler; a
  first-party "Plugins" chrome menu (the wand shape) lists registered commands. Full per-command
  palette rows need a dynamic palette source — deferred, priced (§5 row 9).

### 4.6 Tier C — the client-side guest, and THE DEPENDENCY ROW

**The problem it deletes:** Tier S pays a network round-trip per click and cannot express
local-immediate interaction (a filter box, a hover detail, a game of chess *logic*). ST extensions
have native latency because they run in the page. The owner opened the dep budget for exactly this.

**The dep row (named, vetted against the membrane-dep precedent):**

- **Candidate: the SAME engine already live on the tree** — `quickjs-emscripten-core` +
  `@jitl/quickjs-ng-wasmfile-release-sync` are imported at `infra/plugin-host/module.ts:12-14`; the
  library is isomorphic by design, so the client reuses the exact family (at most adding the
  browser wasm-release variant package from the same `@jitl` line — same engine, zero genuinely-new
  interpreter deps). **The one-engine consequence is itself load-bearing:** one dialect for plugin
  authors on both sides of the wire, ONE budget model (the client mirrors `budgets.ts`'s constants
  AND its recorded rationale — contained guest OOM is why this engine won and isolated-vm lost: V8
  cannot unwind OOM; explicit memory + stack ceilings are mandatory, `infra/plugin-host/budgets.ts`
  - `README.md:44-61`), and the server membrane's containment story CARRIES OVER instead of being
    re-derived. The rejected list — isolated-vm, SES — is PERMANENT (`plugin-design/README.md:50-60`).
    Size: the wasm artifact \~1 MiB, loaded LAZILY (dynamic import
    behind "a scripted surface is on screen"), never in the boot chunk (the #43/#433 boot-split law —
    `client-architecture-lockdown.md` §7). Escape posture: WASM linear memory — a guest cannot alias
    host JS heap; interpreter CVEs are contained to the instance; the marshalling discipline
    (primitives + validated JSON only, `infra/plugin-host/marshal.ts` inert-both-ways) is REUSED as
    law. Vendor-vs-depend: DEPEND (catalog-pinned, same as the server) — vendoring a wasm interpreter
    forfeits upstream security fixes for zero control gain.
- **Recommendation: ADOPT — this is the load-bearing dep class the owner named, and it is zero-to-one
  NEW packages** (worst case one sibling variant package from the already-trusted family).

**The shape:**

- The bundle gains an optional second entry: `manifest.uiEntry: "ui.js"` (additive-optional field;
  the two-entry zip allowlist in `domain/plugin/substrate/manifest.ts` widens to three, same
  header/size belts). Served to the client via an owner-gated route as INERT BYTES —
  `Content-Type: application/octet-stream` + `nosniff`, so a `<script src>` at it is MIME-refused;
  it is fetched as text and `evalCode`'d into the interpreter ONLY, never a script tag.
- The interpreter lives in a **Web Worker** owned by `features/plugin` (one worker per enabled
  scripted plugin, created lazily when one of its surfaces is on screen, `terminate()`d on
  disable/unmount): main-thread jank isolation, and — the D46-review P1-A lesson inherited
  (`docs/reviews/security/2026-08-24-d46-membrane-review.md:51-103`) — a WALL-CLOCK deadline the
  host enforces from OUTSIDE the guest: a hung guest is `terminate()`d and the surface collapses to
  null. Budgets mirror the server constants (`infra/plugin-host/budgets.ts`): interrupt deadline
  per event, memory cap per context, bounded pending calls.
- The guest global is realm-stripped exactly like the server (`orb.ui(1)` the only door; injected
  clock/random; no ambient — the realm allow-list assertion posture from the D46 review's P2-C fix
  applies from birth). The surface it receives:
  `render(surfaceId, tree)` (zod-validated client-side before mount, same vocabulary as Tier S) ·
  `onEvent(handler)` (actions + field changes delivered in) · `state` (local) · **proxied host
  calls**: a fixed subset `UI_PROXYABLE_HOST_FUNCTIONS ⊆ HostFunctionRef` (reads + the already-safe
  effect fns; NO `tools.register`/`transforms.register`/`events.on` — resident registrations belong
  to the server guest) relayed through ONE tRPC proc `plugin.uiHostCall({pluginId, fn, args})`,
  server-side re-gated per call: `fn ∈ UI_PROXYABLE ∩ grants`, executed through the SAME
  `PluginHostOps` bridge under the installer. The client's claim is never trusted — the server
  resolves the caller's own row and the grant, per call (the membrane's own per-call posture,
  `01:36-40`).
- Rendering is retained-mode: the guest publishes a whole tree; the host renderer applies it behind
  a content-equality publish guard (the `ChatControlSourceMountProps` guard shape,
  `contribution-contracts.ts:179-191`) so a re-render loop cannot form.
- **The one app-CSP delta:** instantiating WASM in the app/worker realm requires
  `script-src 'wasm-unsafe-eval'` (prod is `'self'`-only today, `security-headers.ts:99` — and its
  header comment forbids `'unsafe-inline'`, which this is NOT). This permits wasm compilation only,
  no JS eval; it is the named price of an in-realm interpreter and is flagged for
  `security-executor` sign-off (§9). *(Rejected alternative: hosting the interpreter in a sandboxed
  iframe to dodge the directive — that re-imports the frame arm the owner killed, for a directive
  whose scope is narrow and auditable.)*

**Trust honesty (stated because it is the design's one real trade):** Tier C's boundary is the
interpreter + marshal discipline, not an origin. An interpreter escape lands in the app realm —
categorically worse than an iframe escape landing in a null origin. The mitigations: the dep is the
same one the server already trusts with the same guest code class; the worker adds a kill switch
and no DOM; the proxied surface is the narrow re-gated subset; and the guest's OUTPUT is data
(zod-validated tree), never markup. This trade is exactly what "integrated, not ghetto" buys, and
it is the owner's stated preference — priced here so it is chosen, not slid into.

### 4.7 Theming, a11y, density — free by construction (the point of the arm)

Tier S/C surfaces are house components under the live token cascade: theme flips, custom themes,
and the resolver-root law (#504) apply with ZERO plugin-side machinery — contrast with the frame
arm's concrete-value injection channel (`use-sandbox-theme.ts:1-12`). A11y floor: every input node
requires a label (zod), every surface shell is a labeled region, focus order is document order of
house primitives, touch targets are the primitives' own. Density/positioning: Base UI + the shell's
own layout; a plugin cannot spell a raw pixel.

### 4.8 The plugin-labeled shell (the impersonation wall)

Every plugin surface renders inside `PluginSurfaceShell` — first-party chrome carrying the plugin's
name + an identifying glyph, at every anchor, no opt-out. The walls, each named with its tier:
the vocabulary cannot express host anatomy or modals (compile: the node union); consent/grant
dialogs are HOST modals only (the grant flow lives in first-party surfaces —
`features/plugin/components/plugin-grant-list.tsx` et al. — and no vocabulary node opens a modal);
`confirmButton` renders the house `ConfirmDialog` with a plugin-attributed title (tier-2 composite,
G7). A plugin composing house components INSIDE a labeled container can imitate nothing the label
does not immediately contradict.

### 4.9 Failure postures (the flank law, generalized)

A crashed, slow, refused, or state-less plugin surface renders NOTHING — never a broken frame,
never a spinner: registration refusal ⇒ surface absent + plugin log line; state fetch error inside
the mount ⇒ null (the mount is not a `QueryBoundary` surface — it is a contributor, and a silent
contributor collapses, `chat-room-surface.tsx:151`); Tier C worker hang ⇒ wall-clock terminate ⇒
null + log + the crash counter (client-side crashes report through a `plugin.reportUiCrash`
mutation into the SAME `consecutive_crashes` policy — a UI-half that dies every mount auto-disables
like a server-half that throws, `activation/crash-policy.ts` posture). The Plugins pane is where a
person finds out WHY (the runtime log — #627 is the interlock; until it lands, activation-log lines
are the only trace, stated honestly).

## §5 THE ST EXTENSION-ABILITY PARITY REGISTER

Source of truth: the house feature map + gap register
(`Core-SillyTavern-Feature-Map.md`, `Core-ST-Feature-Gap-Register.md` §3 — the ST *mechanism*
(`getContext()` god-object, main-realm DOM, dynamic import) is PERMANENTLY OUT, `:133`; parity is
over ABILITIES) and the live ST extension docs (fetched raw 2026-08-24 per web-fetching law:
`docs.sillytavern.app/for-contributors/writing-extensions/` + `/extensions/`). Verdicts:
**PT** = parity today (membrane already covers) · **PD** = parity by this design (arm + fidelity
named) · **REF** = refused (structural wall named) · **DEF** = deferred (real, priced, phased).

| # | ST ability | Verdict | How / fidelity / wall |
| - | - | - | - |
| 1 | Per-extension settings panel (drawer in the settings screen) | **PD** | `settings` anchor, Tier S spec + form nodes (§4.5); full function, house look. Arbitrary-HTML settings look: §6.1 |
| 2 | Persistent extension settings (`extensionSettings` + save) | **PT** | `storage.kv` (`host-v1.ts:113-120`) — and BETTER: per-plugin-private, unlike ST's world-readable settings blob (ST's own docs warn plugins can read each other's) |
| 3 | Top-bar / wand-menu buttons | **PD** | the first-party "Plugins" chrome menu + `/plugin` dispatch (§4.5); fidelity: inside one labeled menu, not arbitrary top-bar DOM — the chrome registry stays door-owned |
| 4 | Message decorations (badges/annotations on rows) | **PD (v2)** | `message-footer` DSL badges, phase U6; per-row caps; fidelity: adjacent decoration, not in-bubble markup |
| 5 | Message TEXT display-transform (formatting hooks / furigana class) | **DEF** | not a canon write (display-only), so no wall — but it needs a render-pipeline seam with a per-message budget the client pipeline does not have; shape: a server-side display-transform registered like D50, applied at the render cache. Interim: row 4 decorations |
| 6 | Popups / confirm / input dialogs (`Popup.show`) | **PD** | `confirmButton` (house ConfirmDialog, plugin-attributed) + inline card nodes; fidelity: no free-form plugin-owned modal — deliberate (impersonation wall §4.8) |
| 7 | Custom side panels / drawers | **PD** | `chat-flank` + `chat-settings-section` + `settings` anchors, Tier S/C |
| 8 | Whole custom screens (chess, retro games, VN extras) | **DEF→§6** | the arbitrary-pixels residual — the parked `ui.frame` hatch's reason to exist |
| 9 | Slash-command registration (with help/autocomplete) | **PD (partial)** | `/plugin <slug> <cmd>` via one static contribution (§4.5); full first-class palette rows per command need a dynamic palette source — priced, deferred |
| 10 | Event hooks (message/chat/character/persona/settings lifecycle) | **PT** | `events.subscribe` over the closed trigger taxonomy (`host-v1.ts:159-164`); fidelity: the closed union is narrower than ST's \~40 event types — widenings ride the S7 batched merge-window discipline (`interaction-direction-spec.md:397-408`), by demand |
| 11 | Per-token streaming hook (`STREAM_TOKEN_RECEIVED`) | **REF** | structural: a guest invoke per token violates the per-invocation budget architecture + FIFO-16 delivery (`03:59-75`); per-message facts are the floor |
| 12 | Prompt interceptors — inject/steer before generation | **PT** | `chat.transform` at D50 points (`host-v1.ts:178-191`) + `worldInfo.upsertEntry`; the 250 ms transform deadline vs 5 s fetch incompatibility stands (juice §4.6) |
| 13 | Prompt interceptors — MUTATE chat history (ST's mutable `chat` array) | **REF** | the class-1 wall: an unattributed edit of prose canon by non-human code (`interaction-direction-spec.md:43-49`); the sanctioned routes are transforms (attributed to the drafting human) + the S4 propose/confirm inbox |
| 14 | Abort generation from an interceptor | **DEF** | not a prose write; shape: a typed abort outcome on the transform return; small, needs a D50-seam decision |
| 15 | Custom macro registration | **DEF** | shape: `macros.register` host fn whose handler is a guest invoke under the assembly deadline (the D50 transform precedent proves mid-pipeline guest calls); kit/macro stays the ONE engine, plugin macros are data into it |
| 16 | Quiet/raw generation (`generateQuietPrompt`/`generateRaw`) | **PT** | `llm.quiet` (`host-v1.ts:138-157`); structured-output variant: **DEF**, a `schema` param on the same op (the xgrammar lever), priced small |
| 17 | Function-tool registration | **PT** | `tools.register` (D48 source (b)); the render half is closed by this design (`tool-card`, §4.5) |
| 18 | Tool-result rich cards (oracle-deck class) | **PD** | `tool-card` anchor — the A2-F5 gap closed; Tier S card spec; arbitrary card ART is §6.1 |
| 19 | Chat metadata (per-chat extension state) | **PT** | chat variables (`applyVariableOps`, member-visible plane) + `storage.kv` keyed by chat (private plane); fidelity note: two planes where ST has one, deliberately (visibility is a choice) |
| 20 | Character-card extension fields (`writeExtensionField`) | **DEF** | portable card data, not a wall; needs a card-extensions decision (D-entry: who owns the namespace on export/import); not this program |
| 21 | Toast notifications | **PD** | action outcomes ride house toasts (typed refusals/results, §4.4); free-form `toastr` at will is REFUSED as attention-budget chrome — notifications ride `notify` (durable inbox, cooldown floor) |
| 22 | i18n registration | **N/A** | the app is en-only today; nothing to hook |
| 23 | Third-party script loading at runtime (import-from-URL) | **REF** | structural: the bundle is the consent unit — upgrade re-consent triggers on widened reach (#615); runtime-fetched code is reach nobody confirmed. CSP + no-module-loader make it unspellable (`02:54-60`) |
| 24 | Emitting custom/app events (`eventSource.emit`) | **REF** | closed unions — a plugin-emitted domain event is a forged fact (`01:191-193`); plugin-internal eventing is its own code + storage |
| 25 | Direct DOM access to the host document | **REF** | structural: the sealed UI layer + one-mount architecture + the exfil class; the ENTIRE design above is the replacement |
| 26 | Install for self vs whole server | **PT (in flight)** | #675 — self-scoped management + admin server-wide variant with per-user consent junctions; owned there |
| 27 | Extension auto-update / git-URL install | **DEF** | bundle upload today; URL install rides the hub wave (gap register `:108`); #615's re-consent already governs upgrades |
| 28 | Idle prompting (timer-driven) | **PT (reshaped)** | no guest timers, permanently (`03:70-71` — a sleeping guest is a held instance); time-based behavior rides automation cadence predicates + `events.subscribe`, or a rule the plugin's user mints. Fidelity: schedule lives in the rules plane, not the plugin |
| 29 | Module class: translation | **PD (partial)** | `llm.quiet` + `net.fetch` + transforms cover input-side; MESSAGE display translation waits on row 5's seam |
| 30 | Module class: expressions/sprites | **PD (partial)** | `chat-flank` Tier C surface + `image` nodes over bundle-shipped assets (an `ui/assets/` bundle dir → installer CAS, priced §7) + `events.subscribe` = classify-and-swap sprites; live2d/VRM ANIMATED models are §6.1 |
| 31 | Module class: TTS/STT | **DEF (substrate)** | blocked on the audio transport + inference role the ENGINE lacks (gap register §2 — ARCHITECTURAL); no plugin plane can conjure it; not this program's wall |
| 32 | Module class: image captioning | **DEF** | needs a vision-input arm on a quiet op; priced small once wanted |
| 33 | Module class: vector storage / Data Bank scrapers | **DEF** | shape: a `databank.ingest` capability + host fn over the D107 ingest op; real, unpriced here |
| 34 | Module class: web-search / RSS feeds into context | **PT** | `net.fetch` (allowlisted) + `worldInfo.upsertEntry`/`notify` — the research-familiar shape (juice §1.11) |
| 35 | Shared libs (`SillyTavern.libs`) | **N/A→PT** | guests bundle their own (`esbuild --bundle`, `02:54-56`); the 1 MiB main.js cap is the budget; no shared-lib surface wanted |

Completeness: every ST-doc ability surfaced in the fetched extension-authoring doc + extensions
overview is classified above; the REFUSED set is exactly {per-token hook, canon mutation, runtime
code loading, event forgery, host DOM} — each a system/other-users wall, none a taste wall, per the
capability-first test.

## §6 The residual list + the parked hatch (the owner's decision surface)

### 6.1 What the integrated arm cannot reach at full fidelity

| Row | Integrated fidelity | What the hatch would add | Recommendation |
| - | - | - | - |
| Canvas minigames (chess board, retro games — §5.8) | game LOGIC yes (Tier C), board PIXELS no — a chess UI from house list/badge nodes is possible but ugly | full canvas | PARK — no committed product need; wake on a real plugin demand |
| live2d / VRM animated models (§5.30) | static sprite swap via `image` nodes — the classify-and-swap loop works | animation runtimes | PARK — sprite-swap fidelity first; measure demand |
| Arbitrary card ART on tool cards (§5.18) | structured house cards | pixel art | PARK — the "provably fair draw" value survives in house cards (juice §1.15) |
| Arbitrary-HTML settings look (§5.1) | full FUNCTION via form nodes | pixel freedom | REFUSE — function parity is parity; look-freedom is the ghetto the owner named |
| Embedded exotic renderers (mermaid/LaTeX class) | `markdown`/`code` nodes | arbitrary renderers | PREFER house primitives on demand (a mermaid/LaTeX primitive is an `@orb/ui` decision, benefiting everyone, not a plugin hole) |

### 6.2 The parked `ui.frame` hatch (shaped, not built)

If woken: its own capability `ui.frame`, its own consent line naming the risk honestly (*"runs its
own interface code in an isolated frame — it can draw anything inside its box, and an isolated
frame can beacon out through browser channels no policy closes"* — the #124 class), riding the
card-frame substrate wholesale: routed document with its own response CSP
(`buildCardFrameCsp`-family, `sandbox allow-scripts`, `default-src 'none'`, NO `connect-src`),
per-user in-process handles (`entry/http/card-frame.ts:41-45`), window-identity postMessage
(`sandbox-frame.tsx:92-117`), token injection (`use-sandbox-theme.ts`), height clamps. All frame
I/O through a postMessage bridge relayed to the SAME `plugin.uiHostCall` proc — the frame gets no
network of its own. Anchors: `chat-flank` and a modal-sized surface only; NEVER `message-footer`.
Wake criterion: an owner-accepted plugin need on a §6.1 row. Until then the capability name is
reserved and NOT in the tuple. A wake is `security-executor`-gated (§9).

## §7 The priced seam list (every coupled site, with its enforcer tier)

| # | Seam | Sites | Enforcer |
| - | - | - | - |
| 1 | `ui.surface` capability | `PLUGIN_CAPABILITIES` member (`manifest.ts:13-28`) · ordered `toEqual` (`manifest.contract.test.ts:26`) · confirm-dialog display order (a UX decision) | tsc (enum) + vitest exact pin (behavioral suite owed with the member — `pnpm check` is static) |
| 2 | `host.ui.register`/`setState` (+`registerCommand`) | `PluginHostV1` namespace · `HOST_FUNCTION_CAPABILITY` rows · `toHaveLength` (`index.contract.test.ts:15`) · `.test-d.ts` reverse pin · membrane impl + escape-suite pins for each new fn | tsc (`satisfies Record<HostFunctionRef, PluginCapability>`, `host-v1.ts:221-243`) + vitest + the escape suite |
| 3 | The spec vocabulary | `@orb/contracts/plugin/ui.ts` (node union + zod + caps) · the exhaustive `Record<NodeKind, Renderer>` in `features/plugin` | tsc (exhaustive Record — a new kind fails until rendered) + zod at BOTH boundaries |
| 4 | Surface registration in activation | `domain/plugin/activation/activate.ts` (collect + atomic deregister) · registration-refusal log line | the activation atomicity posture (D46-review Q6) + int tests |
| 5 | tRPC procs (`listSurfaces` · `getSurfaceState` · `invokeUiAction` · `uiHostCall`) | `transport/trpc/routers/plugin.ts` · owner-scoped row resolution · `UI_PROXYABLE_HOST_FUNCTIONS ∩ grants` re-gate | the #675 cross-tenant sweep class per proc (int tests: foreign id ≡ missing) |
| 6 | The user-bus member `pluginSurfaceStateChanged` | union + types-const + producer emit + `USER_BUS_FILTERS` row (`data/invalidation.ts`) + exhaustive client apply + coverage gates | G10/G11/G12 + `bus-coverage` (the full belt set — a bus member without it is RED) |
| 7 | Door contributions (flank fan-out · settings-section · `pluginToolRenderer` · `/plugin` slash · chrome menu) | fixed first-party array members in `compose/authed-app.tsx` — the door never grows per-plugin | G8 (one assembly) + `client-features-no-cross` + CTs: null-render width-identity at the flank; generic-fallback preserved at tool-card |
| 8 | Bundle: `uiEntry` manifest field + third zip entry + the bytes route | `manifest.ts` (additive-optional) · `substrate/manifest.ts` allowlist · `entry/http` route (`octet-stream` + `nosniff`, owner-gated). NOTE: the zip dep (`fflate`) is DUAL-PURPOSE — plugin bundles (client `plugin-bundle.ts:29` + server `substrate/manifest.ts:16`) AND the databank extraction loaders — a format widening here touches a shared dep, not a plugin-scoped one | zod + the bundle-funnel belts (header caps, decompress belt) + a route test pinning MIME |
| 9 | Tier C host (worker + interpreter + budgets + wall-clock terminate + crash report) | `features/plugin` worker module · budget constants mirroring `infra/plugin-host/budgets.ts` · `plugin.reportUiCrash` → `consecutive_crashes` | the P1-A lesson as a CT (a hung guest surface collapses within deadline) + the realm allow-list assertion from birth |
| 10 | CSP: `script-src` gains `'wasm-unsafe-eval'` | `security-headers.ts:99` + its prod-script-src pin test (`tests/server/entry/http/security-headers.test.ts` — the pin must be UPDATED deliberately, it currently proves no-escape) | the pin test (edited with intent) + security-executor sign-off |
| 11 | Bundle UI assets (`ui/assets/` → installer CAS, `image` node source) | bundle funnel + assets kind + the `image` node's assetId-only rule | zod (no URL arm exists) + the CAS ownership reads |
| 12 | Consent copy + grant screen | `features/plugin/components/plugin-grant-list.tsx` + the capability-order decision | review + side-eye (copy is a consent artifact) |

## §8 The phase plan (stop-anywhere; every row owner-testable)

| Step | Contents | Owner's test | Merge class |
| - | - | - | - |
| U0 | contracts: `ui.surface` member + `host.ui` types + spec vocabulary + pins (seams 1-3) | pins green; grant dialog shows the new line | ordinary |
| U1 | Tier S end-to-end at `settings`: activation collection + `listSurfaces`/`getSurfaceState`/`invokeUiAction` + the bus member + the pane render (seams 4-6) | an example plugin ships a settings panel whose button round-trips and whose state updates live | ordinary |
| U2 | chat anchors: flank fan-out + settings-section contribution + the shell (seam 7) | a plugin renders a labeled flank widget updating on room events; disabled ⇒ byte-identical room | ordinary |
| U3 | `tool-card`: `pluginToolRenderer` + card specs — **closes A2-F5** | the oracle-deck example's draw renders a house card; an unregistered tool still gets the generic block | ordinary |
| U4 | Tier C: `uiEntry` + bytes route + worker host + `uiHostCall` + CSP delta (seams 8-10) — **security-executor review gates the merge** | a scripted surface filters a list with zero network on keystroke; a hung `ui.js` collapses to null within the deadline | ordinary (CSP edit deliberate) |
| U5 | `/plugin` slash dispatch + the Plugins chrome menu + `ui.dialog`-class confirm affordances | `/plugin oracle draw` runs; the wand menu lists plugin commands | ordinary |
| U6 | parity long tail: `message-footer` DSL badges · the display-transform seam decision (§5.5) · `llm.quiet` schema param (§5.16) | per row | per row |

No row renames or migrates anything an earlier row shipped; U1 alone already delivers the
highest-demand ST parity row (per-extension settings UI).

## §9 Threat model (honest; what routes to security-executor)

- **Exfiltration.** Tier S/C add NO new egress channel: the vocabulary's only media source is the
  installer's own CAS; all guest I/O rides the existing membrane fns behind the existing egress
  wall (`net.fetch` allowlist + SSRF guard + hourly floor). The client guest has no fetch — its
  only wire is the re-gated `uiHostCall`. The #124 WebRTC class attaches ONLY to the parked frame
  hatch (named in its consent line, §6.2). Residual: a `ui.js` could encode observed data into
  ARGUMENTS of granted calls (e.g. a `storage.kv` write later read by the server half and egressed
  via granted `net.fetch`) — that is the plugin exfiltrating data the INSTALLER already granted it
  both halves of; consent covers it (capability-first ruling), and the grant screen showing
  `net.fetch`+hosts is the honest disclosure.
- **Host-chrome impersonation / consent spoofing.** Walled at the vocabulary (no modal/anatomy
  nodes — compile), the shell (every surface labeled — code + CT), and the rule that consent
  dialogs are host modals only. A DSL surface can render text claiming anything; it does so inside
  a container that names its author — the same trust story as a chat message.
- **The bridge as the new membrane (Tier C).** Threats: caller spoofing (server derives plugin from
  the caller's OWN rows — cross-tenant sweep per proc), capability escalation (per-call
  `fn ∈ UI_PROXYABLE ∩ grants` re-gate; the client's grant view is display-only), args abuse (zod
  per-fn at the server, the existing membrane validation reused), flood (the tRPC rate buckets + a
  per-plugin in-flight cap mirroring `HOST_CALLS_IN_FLIGHT_MAX`), hang (wall-clock worker
  terminate — the P1-A class, closed by design not by hope).
- **Interpreter escape (Tier C's real trade, stated in §4.6).** Same dep family the server membrane
  trusts; WASM containment; marshal discipline; worker isolation; lazily loaded. An escape is
  app-realm compromise for the INSTALLER's own session — self-harm class in v1 (viewer==installer),
  but it becomes cross-user the day server-wide installs render for non-installers: **hard
  interlock with #675 item 4** (re-review before any non-installer render).
- **DSL injection.** The spec is data rendered by React house components — no `innerHTML` anywhere
  in the renderer (review + the existing paint/lint walls); `markdown` nodes ride the sealed
  Streamdown renderer already hardened for model text; every string is length-capped.
- **DoS.** Spec/state size caps; node caps; publish guard against render loops; server invocation
  budgets unchanged; worker terminate. The `plugin.runSnippet` throttle lesson (D46 review P2-F)
  applies to `invokeUiAction`/`uiHostCall` from birth: name their rate bucket at build.
- **Routes to `security-executor` before merge:** U4 whole (bytes route + worker host + `uiHostCall`
  re-gate + the `'wasm-unsafe-eval'` widening), any wake of §6.2, and the #675-item-4 interlock
  when it arrives. U0–U3 are standard-review (no plugin code executes client-side; every new
  surface is data rendered by first-party code) — `verifier` + `side-eye` lenses suffice there.

## §10 Open owner questions (each with the stated default)

1. **Tier C in the committed phases, or Tier S first and C on demand?** Default: BUILD U4 (the
   owner's dep steer reads as appetite, and Tier C is what makes "full-featured" true); U1–U3 are
   independently shippable if the appetite changes.
2. **The parked hatch (§6.2): park or refuse outright?** Default: PARK with the wake criterion
   (capability-first says do not delete ability the register names; the residual list is real but
   niche).
3. **`message-footer` badges (U6): worth the per-row surface at all?** Default: yes as DSL-only
   with hard caps; it is the ST "message decorations" row's honest home.
4. **Per-command palette rows (§5.9 full fidelity)** need a dynamic palette source — widen the
   slash/palette seam, or keep `/plugin` dispatch? Default: keep dispatch; widen only on felt pain.
5. **The display-transform seam (§5.5/§5.29):** commit at U6 or park? Default: park with the shape
   recorded; it is the largest unpriced item and no committed preset needs it.

## §11 Interlocks

- **#675** (user-scoped plugins): the pane `when` flip and self-scoped procs land there; this
  design's viewer==installer invariant is the premise of §4.4/§9 — the server-wide variant
  re-opens both (hard re-review gate).
- **#677** (tool-registry owner collision): `pluginToolRenderer` keys must follow the landed key
  shape (owner-scoped or per-install) — U3 consumes, never decides.
- **#627** (runtime plugin log): §4.9's diagnosability leans on it; until then, activation-log only.
- **#124** (WebRTC watch): attaches to §6.2 only; its wake condition is independent.
- **The interaction spec §7-C7** (plugin client wave): U1–U3 here ARE C7's "plugin client" surface
  work; the `llm.quiet` pins and attach-seam rows in C7 are siblings, not duplicates — C7's
  vitest-pin pricing note (two exact pins move with any capability member) applies to `ui.surface`.

*Provenance: commissioned by #679; built against the full reading set (the membrane design docs 01-04,
the D46 security review, D70, the interaction spec §1/§3/§7-C7a, the juice review, contribution
contracts, the card-frame substrate, the ST parity corpus + live ST extension docs fetched raw
2026-08-24). Four owner steers folded verbatim in §0.*
