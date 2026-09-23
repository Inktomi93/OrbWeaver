---
kind: design
status: draft
updated: 2026-08-30
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
> **REVISED 2026-08-24 (same day) — the FULL-PARITY ruling (steer 5, verbatim intent): "we would
> want all the optional stuff — we need full extension capabilities and features."** This revision
> folds it throughout: every deferred-with-shape parity row is COMMITTED and phase-slotted (§5/§8),
> the `ui.frame` hatch is a SCHEDULED phase rather than woken-by-demand (§6.2/U7, still
> security-executor-gated), the §6.1 arbitrary-pixels rows resolve to the hatch, and the former §10
> open questions are resolved against the ruling — the residual owner-ask list is §10 and it is one
> item. **Follow-up steer (6), same day: "some of those features I could be convinced to enable if
> it means more flexibility"** — so the five structural refusals are refused-BY-DEFAULT with an
> ENABLEMENT PRICE SHEET (§5a): each names its safest enablement shape, who its risk falls on, and
> a recommendation; the owner purchases flexibility knowingly, and the walls that protect OTHER
> users stay marked as such. **Addendum steer (7), same day:** extensions with "lots of bits and
> bobs" (motivating example: a hub browser) need a full-page home — the `ui.page` surface kind +
> ONE house "Extensions" rail entry (§4.5b, slotted U5), and a `character.ingest` capability
> joins the U8 funnel as `databank.ingest`'s sibling; the hub browser is the ui.page + ingest
> showcase (§8-U8).
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

**The sandboxed-iframe arm is DEMOTED to an escape hatch — and, under the full-parity ruling,
SCHEDULED** (`ui.frame`, §6.2 / phase U7): it rides the proven card-frame substrate, exists for
exactly the arbitrary-pixels rows the declarative arm cannot reach (canvas games, live2d/VRM, card
art — §6.1), carries its own capability + consent line + threat model, and its merge is
security-executor-gated. It is the LAST-RESORT arm, never the first: an ability expressible in the
vocabulary ships in the vocabulary.

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
| **HISTORICAL (closed 2026-08-28 by U3, `03480da00` / `21ebaf174`).** As-was: a plugin CANNOT register a client ToolRenderer — the registry was first-party, door-assembled EMPTY; unknown names fell back to the generic block. The `pluginToolRenderer` now claims `plugin_*` wire names through a closed match axis (exact-before-prefix). The row is kept, not deleted: it is the premise §4.5's `tool-card` row and §5.18 were written against | the 2026-08-24 plugin-automation-juice stickler review, :197-203 (A2-F5) · `packages/client/src/compose/authed-app.tsx:187-190` · `packages/client/src/lib/contribution-contracts.ts:244-254` |
| The contribution architecture (D70) gives the mount seams for free: chat surface anchors (`thread-flank`/`above-composer`/`message-footer`, `contribution-contracts.ts:29`), the "This chat" section family (already carrying `pluginSnippetConsoleSection`, `authed-app.tsx:146-149`), tool renderers, slash commands, settings panes/sections — all door-assembled, zero registrants ⇒ byte-identical | `docs/law/client-architecture-lockdown.md` §5-§6c |
| The flank/band law: a silent contributor renders null and the anchor collapses (`empty:hidden`); data-gated widgets mount-and-render-null; no `useSuspenseQuery` at the flank (no boundary) | `packages/client/src/features/chat/surfaces/chat-room-surface.tsx:151,171` · the needle-meter precedent `authed-app.tsx:181-184` |
| The client plugin feature EXISTS: the Plugins config GROUP (ungated since D147; a `sections` skimmer since #866 S1 — Installed · Add-a-plugin · the admin-gated Distribute section), install/grant/log/row surfaces, snippet console section | `packages/client/src/features/plugin/lib/plugins-group.tsx` · `lib/plugins-installed-section.tsx` · `lib/plugins-install-section.tsx` · `components/plugins-installed-section.tsx` |
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

> **The injected SLICE was widened at #799, and the CLAMP was not.** It used to be two colors plus the
> sans family, which the card-atlas review named "a two-color costume" — a frame could match the app's
> surface and its text and nothing else. It is now the curated house slice: `--sandbox-bg`/`-fg`,
> `-muted`/`-muted-fg`, `-accent`/`-accent-fg`, `-border` (all through the UNCHANGED `isSafeColor`
> clamp), plus `--sandbox-radius` and `--sandbox-font-mono`, which ride a SECOND slot
> (`CardFrameContent.styleTokens` → `clampCardFrameStyleTokens`) because `isSafeColor` is colour-only
> and rejects a length and a family list by construction — the `fontFamily` slot's own precedent. The
> two grammars are disjoint and both reject every CSS-escape / `url()` / `calc()` shape; nothing but
> `--*` values crosses, and every clamp still runs server-side on OUR side of the boundary.

**ARM C — hybrid.** The committed shape (as revised by the full-parity ruling): a FULL hybrid with
a hard priority order — the declarative plane is primary and covers everything it can express; the
`ui.frame` hatch is a scheduled phase (U7) covering exactly the arbitrary-pixels remainder. The
platform honesty rule (*"only ever means UNWIRED-but-typed, never unshaped"* —
`interaction-direction-spec.md:211`) is satisfied the strong way: every arm is both shaped AND
scheduled.

## §4 The design

### 4.1 Capability + consent

**One new member: `ui.surface`** — appended to `PLUGIN_CAPABILITIES` (`manifest.ts:13-28`; order is
the confirm-dialog display order, so placement is a UX decision — recommend after `notify`, before
the SPEND block). Consent copy (the grant screen line): *"Show its own panels and controls — drawn
by the app, always labeled with the plugin's name."* The hatch's `ui.frame` member (§6.2) lands
WITH its own phase (U7), not at U0 — a tuple member visible in consent dialogs before its surface
exists would be a lie (the root-slot-lands-with-occupant discipline); its consent line is §6.2's.

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
| `button` | house `Button` | `variant` ∈ {neutral, outline, primary}. **`primary` is PER-ANCHOR and one-per-anchor (#818, owner ruling 2026-08-30).** `PLUGIN_ANCHOR_PRIMARY_ALLOWED` admits it at `page`/`dialog` only; the renderer's `resolvePluginPrimaryButton` grants the FIRST claimant in document order and DEMOTES every other one to the neutral weight, telling the plugin's author on the browser console. Refused at RENDER, never at parse (a spec is registered once and mounted anywhere), so an over-claiming spec is weighted, never dead. `actionId` names the round-trip |
| `confirmButton` | tier-2 `ConfirmDialog` | destructive confirms ride the HOUSE dialog, plugin-attributed title — a plugin cannot draw its own confirm |
| `icon` (#799) | the sealed `@orb/ui` `Icon` | `name` from a CURATED closed tuple (`PLUGIN_ICON_NAMES`) that deliberately EXCLUDES chrome-identity (`Blocks`, the orb-web mark), consent/trust (lock/key/shield/ban) and identity/host-anatomy glyphs — a plugin must not be able to dress a fake consent row in the house's trust iconography. `label` absent ⇒ decorative (`aria-hidden`), the house default |
| `tabs` (#799) | the house one-of-N strip (`ToggleGroup`/`Toggle` on their `radio` arm) | the page's own AXIS, every option visible at once — the `select`'s grammar (exactly one of `options`/`optionsFrom`, a live `actionId`) with a much smaller cap (`PLUGIN_TABS_OPTIONS_MAX` = 8: a strip that outgrows one row is a `select`). NOT house `Tabs`: this node owns no panels — what a pick changes is whatever the plugin republishes — and a `tablist` pointing at no `tabpanel` is dangling ARIA |

**The one-primary law, and why it survived its input changing (#818).** The S1 card law
(`interaction-direction-spec.md:140-143`) was minted for the chat CONTROL BAND, whose attention budget the
host owns and a plugin borrows. On a `page`/`dialog` anchor the plugin's surface IS the whole region and owns
its own budget — so the ruling is not repealed, its CONDITION is: the band (and `settings`, `tool-card`,
`message-footer`) keeps the clamp; a page gets exactly one. The mechanism is deliberately RENDER-side and
carries no security surface: the button still sits inside the no-opt-out attribution band
(`plugin-surface-shell.tsx`), and a primary weight cannot draw host chrome, steal focus, or open anything the
vocabulary could not already open. The defect it closed is stickler 2026-08-29 F3 — card-atlas's "Add to
library" rendered at the same visual weight as "Back to results" on the surface where the whole page exists
to make one decision.

**The three-states law inside `grid` (#799):** a `grid` names `empty` (the teaching EMPTY) and `loading`
(a bound boolean → the shelf's shape- and aspect-matched `MediaTileGridSkeleton`). The renderer orders them
`loading → empty → tiles`: a grid mid-fetch is neither showing last query's results nor empty. `loading` is
reachable at BOTH tiers — a `scripted` guest flips it before it awaits; a `static` guest reaches it through
the settlement-wall shape its handlers already use (publish `true`, FLOAT the wire work, republish `false`;
the second `setState`'s bus poke repaints). `card-atlas`'s search/page handlers are the worked example.

Global bounds (all zod, all host-side at registration AND client-side before mount — the server's
call is the trust boundary, the client's is depth-in-depth, the `buildCardFrameDocument` clamp
posture at `card-frame/index.ts:400-403`): spec ≤ 32 KiB, ≤ 256 nodes, depth ≤ 8, every string
length-capped. **What the vocabulary deliberately cannot express** (the impersonation walls, each
a refusal by unspellability — compile-tier): raw HTML/CSS/className, host-chrome anatomy
(rail/topbar/composer), a consent dialog, focus stealing, and any write channel (a node is data;
only `actionId` round-trips). Toasts and dialogs are NOT nodes either — they are HOST-MEDIATED
affordances (`host.ui.toast` + the `dialog` surface kind, §4.5a): first-party chrome,
plugin-attributed, rate-floored, so the ability exists at full function while impersonation stays
unspellable.

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

`PLUGIN_SURFACE_ANCHORS = ["settings", "chat-flank", "chat-settings-section", "tool-card", "page"]
as const` (closed tuple in `@orb/contracts/plugin/ui.ts`; `page` added by steer 7 — §4.5b, lands
at U5). Every anchor lands through an EXISTING
door-assembled family via ONE first-party contribution owned by `features/plugin` — the door grows
by fixed first-party members, never per-plugin (the one-assembly law, G8):

| Anchor | Rides | Mount shape | Enforcer |
| - | - | - | - |
| `settings` | the Plugins GROUP's Installed section (per-plugin detail) | spec rendered inside the plugin's row/detail — ST's per-extension settings drawer, in the screen users already grant from | the group (`plugins-group.tsx`, a skimmer since #866 S1) + its Installed contribution (`plugins-installed-section.tsx`); #675 flipped its `when` per-user |
| `chat-flank` | `chatSurfaceContributors` `thread-flank` | ONE `pluginFlankSurface` contribution fanning per-plugin by `listSurfaces` data; mount-and-null when none (the flank activates on a sync `when` that cannot see query data — render null, `empty:hidden` collapses; NEVER `useSuspenseQuery` here) | `chat-room-surface.tsx:151` + a CT pinning null-render width-identity |
| `chat-settings-section` | `chatSettingsSections` (host-controls band) | one first-party contribution per the `pluginSnippetConsoleSection` precedent (`authed-app.tsx:146-149`); host-gated by MOUNT (`contribution-contracts.ts:78-83`) | the family's own walls |
| `tool-card` | the `toolRenderers` registry (`authed-app.tsx:187-190`) | ONE first-party `pluginToolRenderer` claiming `plugin_*`-prefixed wire names, rendering the owning plugin's registered card spec; unclaimed/unregistered names keep the generic `ToolCallBlock` fallback. **Closes the A2-F5 renderer gap.** Key scoping follows whatever #677 lands | `contribution-contracts.ts:244-254` |
| `page` (U5) | the house **Extensions** rail SECTION (§4.5b) | full-page DSL surface (Tier S/C; frame-eligible at U7) behind the section's page switcher — ONE rail item for the platform, never per-plugin | the §6a SECTION_IDS playbook + the page-scale shell (§4.5b) |

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
  palette rows (a dynamic palette source) are COMMITTED at U8 (full-parity ruling; §5 row 9).

### 4.5a Dialogs + toasts (host-mediated affordances — BUILT at U5)

> **AS-BUILT (2026-08-28), and the three places the build is more specific than the design was.** Every clause
> below stands; these are the mechanisms the build had to decide and this section did not name.
>
> 1. **`dialog` is a MEMBER of `PLUGIN_SURFACE_ANCHORS`, not a separate axis.** The design calls it "a fifth
>    surface KIND (not an anchor)"; the tuple had four members, so "fifth kind" and "sixth tuple member"
>    (`page` joined at the same time) name the same edit. It shares the tuple because it shares the
>    REGISTRATION vocabulary — registered, titled, tiered and spec'd exactly like every other surface — and a
>    second axis for one member would be the parallel map the house kills. What "not an anchor" means as built:
>    it mounts nowhere by itself.
> 2. **THE DELIVERY CHANNEL IS THE ROUND-TRIP OUTCOME.** A guest calls `host.ui.toast`/`host.ui.openDialog`
>    during an invocation; the domain stashes the item in a bounded per-plugin UI OUTBOX
>    (`domain/plugin/substrate/ui-outbox.ts`), and the outbox DRAINS onto the result of the action/command the
>    person just ran. That is what makes "opened ONLY by an explicit user act" structural: a spontaneous open
>    has no channel to travel on. It also names the honest cost — a toast raised with no viewer present (an
>    event handler, a resident tool) waits for that person's next round-trip with the plugin, or is evicted;
>    the durable channel stays `notifications.post`. The user bus was REJECTED as the channel: it is the
>    invalidation router (`bus-on-data-no-store-write`), and a toast has nothing to invalidate.
> 3. **A THIRD host fn was required: `host.ui.openDialog`.** §4.8 rules that no vocabulary node opens a modal,
>    so with only `registerCommand` + `toast` a registered dialog would have been unreachable. It rides the
>    same `ui.surface` grant, and the DOMAIN resolves the id against the plugin's own `dialog`-anchored
>    registrations when the outbox drains — so a plugin cannot open another plugin's dialog, cannot smuggle a
>    `page` into the modal shell, and a stale id costs the ask and nothing else (§4.9's soft-refusal posture).

- **`dialog`** — a fifth surface KIND (not an anchor): a house modal shell, plugin-attributed
  title, DSL body (Tier S or C), opened only by an explicit user act on one of the plugin's own
  surfaces/commands (never spontaneously — focus theft stays unspellable). Covers ST's custom
  `Popup` class at full function; consent/grant dialogs remain host-only forever.
- **`host.ui.toast(level, msg)`** — the house toast, prefixed with the plugin name, length-capped,
  rate-floored per plugin (constant named at build, the `AUTOMATION_NOTICE_COOLDOWN_SECONDS`
  posture). Transient viewer-local feedback; the durable channel stays `notify`.

### 4.5b The Extensions section + `ui.page` (steer 7 — BUILT at U5)

> **AS-BUILT (2026-08-28).** `extensions` is the tenth `SECTION_IDS` member, placed directly after `config` per
> this section's own recommendation, and the §6a playbook was walked in full (the ten sites are enumerated in
> the build's report). Two build decisions this section left open:
>
> - **The browse-genre nodes landed as `grid` · `masterDetail` · `searchBar` (with `filters` as a SLOT on
>   `searchBar`, not a fourth kind)**, plus an `aspect` field on `image`. The house media-tile composite this
>   section anticipated is `@orb/ui/media-tile-grid` (`MediaTileGrid` + a shape-matched `MediaTileGridSkeleton`)
>   — a shelf member, per the §4.3 shelf-exposure rule, so the whole app gets it. `searchBar` is capped at ONE
>   PER SPEC by the schema: "prominent" is a claim two of them refute.
> - **A HAZARD the vocabulary growth introduced, closed at the source.** `masterDetail` (stage bodies) and
>   `searchBar` (filters) carry children under fields NOT called `children`, so every existing tree walk — the
>   spec's own node/depth CAPS, the renderer's depth belt, the image-id sweep, the form-default collector — was
>   about to go silently blind to a whole subtree while still reporting a passing node count. The fix is ONE
>   exported seam, `pluginChildNodes` in `@orb/contracts/plugin/ui.ts`, that every walk recurses through; a
>   sixth recursive kind is one edit. The caps' blindness is pinned by a contract test that nests past the
>   depth cap THROUGH the new fields.

**The need:** an extension with "lots of bits and bobs" — the motivating example is a HUB BROWSER
(search → results → preview → import) — has no home in panel-scale anchors. `ui.page` is a
full-page surface kind; its host is **ONE house rail entry, "Extensions"**, never a rail item per
plugin (rail bloat + the largest impersonation surface; ST's own extensions-drawer mental model).
Per-plugin rail promotion is RECORDED as a later owner knob, not built.

**Provenance, corrected (owner, 2026-08-24): the prior hub was THIS repo's own** — a full house-UI
rail section (`features/hub`: `hub-browse-section.tsx` + capability-driven controls + a
`createCollectionSurface` result feed + a detail/preview/import drawer, built through the wave-4/5
closes `cc6b7db38`/`8d95cad08`), purged in the 2026-07-22 hub drop (`f6c5c588e`, "purge
crew/rpg/expressions/comfyui/hub/venice/anthropic domain wiring"; the gap register's "returns with
the hub wave", `Core-ST-Feature-Gap-Register.md:108` — a `ui.page` plugin IS that vehicle). It was
sanctioned house-primitive UI and the owner's verdict is verbatim: it still *"looked and functioned
like fucking ass."* That verdict is this section's design input — the FLOW is carried as semantics,
the UI is designed fresh, and the mined failure list below is what the page grammar must make HARD
TO GET WRONG (the vocabulary alone does not guarantee a good surface).

**The mined failure list (read from the purged surface at `8d95cad08`):**

1. **Results as management rows, not a browse grid.** `hub-card-tile.tsx` rendered a VISUAL medium
   (character cards) as `ListRow`s — small avatar, title, one compressed "by X · N downloads · N
   tokens" meta string, ~76 px virtual rows. The genre's primary signal (card art) was absent
   because the shelf's path of least resistance is entity-management furniture (G6 pushes
   `ListRow`).
2. **The decision surface got the least design.** The preview — the moment a person decides to
   import — was stacked labeled text blocks inside a cramped drawer
   (`hub-card-detail-drawer.tsx`): no art hero, no reading layout for prose-heavy fields.
3. **Flat, equal-weight controls.** Search, sort, rating, creator, token-range rendered as uniform
   stacked rows (`hub-search-controls.tsx`) — no hierarchy between the ONE primary affordance (the
   query) and long-tail filters.
4. **Browse session context evaporated** — controls deliberately reset per hub-tab switch (only
   NSFW persisted), and loading states were line-shape `SkeletonRows` under a media feed.

**What the page grammar therefore provides (U5 vocabulary additions, priced in seam 16) — the
constraint being: make the row-list browse surface the HARD thing to build and the media-forward
one the default:**

- a **`grid`** node — media-forward tile grid (cover-image slot + title + badge slots,
  aspect-ratio'd `image` variant, shape-matched tile skeletons), so results-as-rows stops being the
  default browse shape;
- a **`masterDetail`** page arrangement — a page declares stages (list/grid stage + a detail stage
  with a hero slot and reading-width prose fields), so previews stop being drawer-crammed;
- a **`searchBar`** page slot (prominent, one per page) with `filters` as a collapsed disclosure —
  the hierarchy failure 3 names, encoded structurally;
- page STATE persists across the switcher and in-page stage navigation for free in this model (it
  lives in the guest/server, not the mount — an improvement the purged surface never had).

Where a node needs a house composite that does not exist yet (the media-tile grid is the likely
case), the composite lands in `@orb/ui`/`components/` benefiting the whole app — the §4.3
shelf-exposure rule; a browse-genre gap in the shelf is exactly what failure 1 was.

- **The section (D70 mechanics, the §6a SECTION_IDS playbook walked in full — seam 16):** a tenth
  `SECTION_IDS` member `extensions` (tuple ORDER IS RAIL ORDER — placement is a build-time UX
  decision, recommend beside `config`), owned by `features/plugin`
  (`lib/extensions-section.tsx`, exported on the front door, one door row —
  `authed-app.tsx:247-266`'s total Record carries it by tsc). LIST pane = the PAGE SWITCHER: one
  house row per registered `page` surface across the caller's granted-and-enabled plugins
  (plugin name + page title, plugin-labeled rows); selection = a `createDrillSelectionStore` mint
  (playbook site 4). CONTENT = the selected page inside the page-scale shell.
- **Empty state — VISIBLE with a teaching empty, argued against the hide-by-default reading.** The
  byte-identical-when-off law governs CONTRIBUTIONS (zero registrants ⇒ the host renders its own
  default); a rail SECTION is house chrome, and the house ships visible sections in honest empty
  states by law (the three-states law, `client-architecture-lockdown.md` §11 — EMPTY teaches with
  an action; refinery ships rail-visible as `planned`). A hidden Extensions entry makes the
  platform undiscoverable — the empty state IS the advertisement: *"No extension pages yet —
  install a plugin with page surfaces"* + the action opening Settings → Plugins
  (`empty-state-has-action`, LIVE). The hide-when-empty variant is PRICED as the same later owner
  knob as per-plugin promotion (a data-gated rail-visibility arm touching `assembleChrome`
  derivation + `__orb.nav` vocabulary + the CT mirror — a new chrome mechanism, not a `when` that
  exists today), decided if the owner prefers a quieter rail.
- **Mobile (the one-shell law):** the page renders in the CONTENT region; `rail.mobile` fate =
  `"sheet"` (not a thumb-reach primary tab — playbook site 7); no new viewport `@media`.
- **A11y/nav:** the switcher is a standard list-pane nav; each page is a labeled region whose
  accessible name is "«plugin name» — «page title»"; focus and landmarks are the house
  primitives'; `setActiveSection("extensions")` + drill-seed is the cross-feature nav channel, and
  `__orb.nav` gains the id (playbook site 5).
- **The page-scale shell:** the `PluginSurfaceShell` at page scale keeps a PERSISTENT header band —
  plugin name + glyph + an "Extension" kicker — pinned above the scrollable page body, no opt-out.
  A full page is the biggest impersonation canvas in this design; the threat-model line (§9)
  carries the weight accordingly.

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
    Size: the wasm artifact ~1 MiB, loaded LAZILY (dynamic import
    behind "a scripted surface is on screen"), never in the boot chunk (the #43/#433 boot-split law —
    `client-architecture-lockdown.md` §7). Escape posture: WASM linear memory — a guest cannot alias
    host JS heap; interpreter CVEs are contained to the instance; the marshalling discipline
    (primitives + validated JSON only, `infra/plugin-host/marshal.ts` inert-both-ways) is REUSED as
    law. Vendor-vs-depend: DEPEND (catalog-pinned, same as the server) — vendoring a wasm interpreter
    forfeits upstream security fixes for zero control gain.
- **Recommendation: ADOPT — this is the load-bearing dep class the owner named, and it is zero-to-one
  NEW packages** (worst case one sibling variant package from the already-trusted family).

> **BUILT 2026-08-28 (U4) — the dep row resolves to ZERO new packages, and the wasm-loading mechanism is
> pinned.** `@jitl/quickjs-ng-wasmfile-release-sync@0.32.0` — already installed, already catalog-pinned,
> already a `packages/server` dependency — declares `"browser": "./dist/index.mjs"` and an
> `./emscripten-module` export with a `browser` condition, plus a `"./wasm"` subpath. No sibling variant
> package exists or is needed; the client half is the catalog entry added to `packages/client/package.json`
> and nothing more. Receipts: that package's own `package.json` exports map; `newVariant` +
> `CustomizeVariantOptions.wasmLocation` at `quickjs-emscripten-core` `dist/index.d.ts:1910`/`:1870`.
>
> **The wasm must be an EXPLICIT asset URL** (`import wasmUrl from "…/wasm?url"` → `newVariant(base,
> { wasmLocation: wasmUrl })`). Without it the variant's loader derives its path from `import.meta.url` at
> runtime, which resolves inside `node_modules` in dev and 404s from a hashed production chunk — a scripted
> surface that works for every developer and for no user. Two alternatives were probed and both lost:
> `assetsInclude: ["**/*.wasm"]` with a plain specifier does not win (vite still applies its `?init`
> transform; the worker bundle fails to build), and dependency-cruiser cannot be taught the `?url` suffix
> through `enhancedResolveOptions.alias` (schema-refused) or `options.exclude` (does not reach an
> unresolvable node) — so its `not-to-unresolvable` carries a narrowed override for `wasm?url` alone.
>
> **Boot-split receipt** (`pnpm --filter @orb/client build`): `assets/emscripten-module-*.wasm` emitted as
> a hashed asset (528 kB), `plugin-ui-guest-host-*.js` its own 1.9 kB chunk, `ui-guest.worker-*.js` its own
> bundle, and **zero** occurrences of `quickjs` in the boot chunk. `playwright-ct.config.ts` needs
> `worker: { format: "es" }`: an iife worker bundle cannot code-split, and the variant dynamically imports
> its own FFI module.

**The shape:**

- The bundle gains an optional second entry: `manifest.uiEntry: "ui.js"` (additive-optional field;
  the two-entry zip allowlist in `domain/plugin/substrate/manifest.ts` widens to three, same
  header/size belts). Served to the client via an owner-gated route as INERT BYTES —
  `Content-Type: application/octet-stream` + `nosniff`, so a `<script src>` at it is MIME-refused;
  it is fetched as text and `evalCode`'d into the interpreter ONLY, never a script tag.
- The interpreter lives in a **Web Worker** owned by `features/plugin` (one worker per enabled
  scripted plugin, created lazily when one of its surfaces is on screen, `terminate()`d on
  disable/unmount): main-thread jank isolation, and — the D46-review P1-A lesson inherited
  (the 2026-08-24 d46-membrane security review, :51-103) — a WALL-CLOCK deadline the
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

  > **BUILT 2026-08-28 — the tuple is NINE members, and `net.fetch` is out on a STRUCTURAL receipt rather
  > than a judgment call.** In: `chat.listMessages`, `chat.getVariables`, `variables.{get,set,delete}`,
  > `storage.{get,set,delete,list}`. The design's "already-safe effect fns" reads as including `net.fetch`,
  > and it cannot be: **the fetch is not on `PluginBridge` at all.** `safeFetch` is the audited SSRF guard
  > and lives in `infra/network`, which a domain may not import, so INFRA performs every plugin fetch and
  > the bridge carries only the hourly admission (`PluginBridge.admitEgress`, whose own header states this
  > division). Proxying it would need a NEW injected egress op wired at compose — a SECOND egress path
  > beside the membrane's, with its own copy of the allow-list plumbing. This lane refused to improvise
  > that; the sanctioned shape, if it is ever wanted, is to widen `PluginBridge` so infra's ONE guarded
  > fetch is reachable by both callers. The AUTHORITY-WRITE class (`chat.applyVariableOps`,
  > `chat.surfaceQuickReply`, `chat.requestTurn`, `worldInfo.upsertEntry`, `imagery.generatePicture`,
  > `llm.quiet`) and `notifications.post` are also out, each with its priced enablement shape recorded at
  > the tuple in `@orb/contracts/plugin/host-v1.ts`. Nothing loses ABILITY — the plugin's SERVER guest
  > reaches every excluded function under the same grant; Tier C gives up only their LATENCY, which is not
  > what §4.6 bought.
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
named) · **REF** = refused (structural wall named — §5a) · **CMT** = committed by the 2026-08-24
full-parity ruling, phase-slotted (this revision retired the deferred class: every former DEF row
below is CMT with a phase, except the one substrate-blocked row, marked SUB).

| # | ST ability | Verdict | How / fidelity / wall |
| - | - | - | - |
| 1 | Per-extension settings panel (drawer in the settings screen) | **PD** | `settings` anchor, Tier S spec + form nodes (§4.5); full function, house look. Arbitrary-HTML settings look: §6.1 |
| 2 | Persistent extension settings (`extensionSettings` + save) | **PT** | `storage.kv` (`host-v1.ts:113-120`) — per-plugin-private, so one plugin cannot read another's settings |
| 3 | Top-bar / wand-menu buttons | **PD** | the first-party "Plugins" chrome menu + `/plugin` dispatch (§4.5); fidelity: inside one labeled menu, not arbitrary top-bar DOM — the chrome registry stays door-owned |
| 4 | Message decorations (badges/annotations on rows) | **PD (v2)** | `message-footer` DSL badges, phase U6; per-row caps; fidelity: adjacent decoration, not in-bubble markup |
| 5 | Message TEXT display-transform (formatting hooks / furigana class) | **BUILT (U6, 2026-08-28)** | not a canon write (display-only), so no wall; a display-transform seam registered like D50, executed server-side (the guest lives there) under a per-message budget and APPLIED at the CLIENT render path via a round-trip — see the dated seam-14 repair for why the doc's original "applied at the render path" server-side reading was refuted |
| 6 | Popups / confirm / input dialogs (`Popup.show`) | **PD** | `confirmButton` (house ConfirmDialog) + inline card nodes + the `dialog` surface kind (§4.5a, U5) — full function; the shell stays house-drawn, plugin-attributed (impersonation wall §4.8) |
| 7 | Custom side panels / drawers | **PD** | `chat-flank` + `chat-settings-section` + `settings` anchors, Tier S/C |
| 8 | Whole custom screens (chess, retro games, VN extras, hub browsers) | **CMT (U5/U7)** | house-vocabulary pages: `ui.page` in the Extensions section (§4.5b, U5); arbitrary-pixels screens: the `ui.frame` hatch (§6.2, U7) — the same page slot, frame-bodied |
| 9 | Slash-command registration (with help/autocomplete) | **PD → full at U8** | `/plugin <slug> <cmd>` via one static contribution from U5 (§4.5); the dynamic palette source giving per-command first-class rows is COMMITTED at U8 |
| 10 | Event hooks (message/chat/character/persona/settings lifecycle) | **PT** | `events.subscribe` over the closed trigger taxonomy (`host-v1.ts:159-164`); fidelity: the closed union is narrower than ST's ~40 event types — widenings ride the S7 batched merge-window discipline (`interaction-direction-spec.md:397-408`), by demand |
| 11 | Per-token streaming hook (`STREAM_TOKEN_RECEIVED`) | **REF** | structural: a guest invoke per token violates the per-invocation budget architecture + FIFO-16 delivery (`03:59-75`); per-message facts are the floor |
| 12 | Prompt interceptors — inject/steer before generation | **PT** | `chat.transform` at D50 points (`host-v1.ts:178-191`) + `worldInfo.upsertEntry`; the 250 ms transform deadline vs 5 s fetch incompatibility stands (juice §4.6) |
| 13 | Prompt interceptors — MUTATE chat history (ST's mutable `chat` array) | **REF** | the class-1 wall: an unattributed edit of prose canon by non-human code (`interaction-direction-spec.md:43-49`); the sanctioned routes are transforms (attributed to the drafting human) + the S4 propose/confirm inbox |
| 14 | Abort generation from an interceptor | **CMT (U6)** | not a prose write; a typed abort outcome on the transform return (a D50-seam widening, small) |
| 15 | Custom macro registration | **CMT (U6)** | `macros.register` host fn whose handler is a guest invoke under the assembly deadline (the D50 transform precedent proves mid-pipeline guest calls); kit/macro stays the ONE engine, plugin macros are data into it |
| 16 | Quiet/raw generation (`generateQuietPrompt`/`generateRaw`) | **PT + CMT (U6)** | `llm.quiet` today (`host-v1.ts:138-157`); the structured-output variant (a `schema` param on the same op — the xgrammar lever) is committed at U6 |
| 17 | Function-tool registration | **PT** | `tools.register` (D48 source (b)); the render half is closed by this design (`tool-card`, §4.5) |
| 18 | Tool-result rich cards (oracle-deck class) | **PD** | `tool-card` anchor — the A2-F5 gap closed; Tier S card spec; arbitrary card ART is §6.1 |
| 19 | Chat metadata (per-chat extension state) | **PT** | chat variables (`applyVariableOps`, member-visible plane) + `storage.kv` keyed by chat (private plane); fidelity note: two planes where ST has one, deliberately (visibility is a choice) |
| 20 | Character-card extension fields (`writeExtensionField`) | **CMT (U8)** | portable card data; committed with the stated default namespace `data.extensions.plugin_<slug>` (mirrors the ST V2 card `extensions` object → import/export interop for free); the D-entry ratifying the namespace lands with the build |
| 21 | Toast notifications | **CMT (U5)** | `host.ui.toast` (§4.5a) — house toast, plugin-prefixed, rate-floored (the earlier attention-budget refusal was a taste wall by the capability-first test, so the ruling flips it); durable notifications still ride `notify` |
| 22 | i18n registration | **N/A** | the app is en-only today; nothing to hook |
| 23 | Third-party script loading at runtime (import-from-URL) | **REF** | structural: the bundle is the consent unit — upgrade re-consent triggers on widened reach (#615); runtime-fetched code is reach nobody confirmed. CSP + no-module-loader make it unspellable (`02:54-60`) |
| 24 | Emitting custom/app events (`eventSource.emit`) | **REF** | closed unions — a plugin-emitted domain event is a forged fact (`01:191-193`); plugin-internal eventing is its own code + storage |
| 25 | Direct DOM access to the host document | **REF** | structural: the sealed UI layer + one-mount architecture + the exfil class; the ENTIRE design above is the replacement |
| 26 | Install for self vs whole server | **PT (in flight)** | #675 — self-scoped management + admin server-wide variant with per-user consent junctions; owned there |
| 27 | Extension auto-update / URL install | **CMT (U8)** | URL install = fetch the zip at INSTALL time through the same funnel + consent screen (an install act under the user's eyes — distinct from row 23's runtime loading, which stays refused); updates = a check + ONE-CLICK upgrade through the existing `upgradePlugin` verb with #615's re-consent gates — NEVER silent (silent auto-update would launder widened reach past the consent the upgrade verb exists to protect) |
| 28 | Idle prompting (timer-driven) | **PT (reshaped)** | no guest timers, permanently (`03:70-71` — a sleeping guest is a held instance); time-based behavior rides automation cadence predicates + `events.subscribe`, or a rule the plugin's user mints. Fidelity: schedule lives in the rules plane, not the plugin |
| 29 | Module class: translation | **PD → full at U6** | `llm.quiet` + `net.fetch` + transforms cover input-side today; MESSAGE display translation rides row 5's committed seam |
| 30 | Module class: expressions/sprites | **PD → full at U7; seam 11 LANDED 2026-08-30 (#820)** | `chat-flank` Tier C surface + `image` nodes over bundle-shipped assets (the `ui/assets/` bundle dir → installer CAS, seam 11 below — BUILT) + `events.subscribe` = classify-and-swap sprites; live2d/VRM ANIMATED models ride the U7 hatch. Residual after #820: the sprite ROUTE exists (four raster formats, 64 entries, 2 MiB each / 8 MiB total); an animated model is still frame-tier work |
| 31 | Module class: TTS/STT | **SUB** | blocked on the audio transport + inference role the ENGINE lacks (gap register §2 — ARCHITECTURAL, an engine-level decision, not a plugin-plane wall); the ONE residual owner ask (§10) |
| 32 | Module class: image captioning | **CMT (U6)** | a vision-input arm on the quiet op (rides the same U6 `llm.quiet` widening as the schema param) |
| 33 | Module class: vector storage / Data Bank scrapers | **CMT (U8)** | a `databank.ingest` capability + host fn over the D107 ingest op (`domain/databank`), grant-gated like every write; its own consent line |
| 34 | Module class: web-search / RSS feeds into context | **PT** | `net.fetch` (allowlisted) + `worldInfo.upsertEntry`/`notify` — the research-familiar shape (juice §1.11) |
| 35 | Shared libs (`SillyTavern.libs`) | **N/A→PT** | guests bundle their own (`esbuild --bundle`, `02:54-56`); the 1 MiB main.js cap is the budget; no shared-lib surface wanted |

Completeness: every ST-doc ability surfaced in the fetched extension-authoring doc + extensions
overview is classified above. After the full-parity fold the classes are: parity-today,
parity-by-design, COMMITTED-with-phase, one substrate-blocked row (§5.31), and the five structural
refusals of §5a. No deferred class remains.

### §5a The ENABLEMENT PRICE SHEET (refused BY DEFAULT; each row is an owner decision)

Steer (6): *"some of those features I could be convinced to enable if it means more flexibility."*
Each row below stays REFUSED until the owner buys it — but the refusal is priced, not flat: the
safest enablement shape that exists, whose risk it is (SYSTEM / OTHER USERS / the INSTALLER), and
this design's recommendation. Rows whose risk falls on OTHER USERS are marked ⚠ — those are the
walls the capability-first ruling itself said stay.

| Ability (default: refused) | Safest enablement shape | Risk, and for WHOM | Recommendation |
| - | - | - | - |
| Per-token streaming hook (§5.11) | a THROTTLED READ-ONLY digest: the host coalesces the stream (every N ms / K tokens, drop-on-backpressure — never a queue), delivers a read-only `streamDigest` fact under a hard per-turn invoke cap; opt-in per plugin | SYSTEM (guest-invoke CPU during every streaming turn; bounded by the throttle constants) — no new data exposure beyond `chat.read` | buildable if wanted; recommend AGAINST until a concrete plugin needs sub-message granularity — per-message facts cover the known uses |
| Mutating chat history (§5.13) | an ATTRIBUTED edit-op limited to messages the INSTALLER authored, riding the EXISTING edit verb (variant-tracked, edit-marked, principal-attributed) — never free mutation of others' rows; broader edits keep the S4 propose/confirm route | ⚠ OTHER USERS (room members cannot distinguish a code edit from a human edit under the same name — transcript-trust erosion even when attributed); the narrow own-messages arm confines it to self-representation | recommend the narrow own-messages arm ONLY if a real plugin demands it; the class-1 wall for others' rows and unattributed writes is not purchasable |
| Runtime code loading (§5.23) | HASH-PINNED remote code: the manifest names a URL whose content hash is pinned at grant; any changed hash lands the plugin `disabled` pending re-consent (#615's mechanism, extended) — install-time semantics with remote convenience | the INSTALLER (consent fatigue: re-consent per upstream change; availability coupling to a remote host). No system/other-user exposure beyond what the granted capabilities already reach | near-equivalent to U8's URL-install + one-click-update — recommend folding into U8's update-check instead of a separate loader; enable only if the update cadence makes per-change re-consent tolerable |
| Custom events (§5.24) | a NAMESPACED plugin-event plane: `plugin:<slug>:<name>`, installer-scoped pub-sub on the resident host — never entering the domain/chat buses, never a `TriggerFact`, subscribable by the same installer's plugins; automation reach only via an explicit future `pluginEvent` trigger member (its own merge-window decision) | SYSTEM, small (delivery machinery under the existing FIFO budgets); zero other-user exposure while installer-scoped — the FORGERY wall stays absolute (domain vocabulary never widens) | genuinely useful for multi-plugin composition and LOW risk in this shape — recommend ENABLE at U8 if the owner wants it; the priced part is the pub-sub + its caps |
| Host DOM access (§5.25) | **no safe shape exists** — any DOM handle is a live object across the membrane (breaks the inert-marshal law), reaches session/storage/sibling surfaces, and dissolves the sealed-UI + impersonation walls in one move | ⚠ OTHER USERS + SYSTEM, unboundable | permanent refusal; the declarative plane (§4) + the U7 frame are the replacement at equal-or-better ability |

Plus one SUBSTRATE exclusion that is not a wall and not purchasable here: TTS/STT (§5.31) waits on
an engine-level audio transport + inference role no plugin plane can conjure — reopening it is a
gap-register/ledger act (§10).

## §6 Full-parity resolution: the residual rows + the COMMITTED hatch

### 6.1 The arbitrary-pixels rows — resolved per the full-parity ruling

| Row | Integrated fidelity (ships first, U1-U6) | Resolution (ruling-folded) |
| - | - | - |
| Canvas minigames (chess board, retro games — §5.8) | game LOGIC yes (Tier C), board PIXELS no | **HATCH (U7)** — was park-on-demand |
| live2d / VRM animated models (§5.30) | static sprite swap via `image` nodes | **HATCH (U7)** — sprite-swap ships earlier via the declarative arm; animated models ride the frame |
| Arbitrary card ART on tool cards (§5.18) | structured house cards (the "provably fair draw" value survives there) | **HATCH-ELIGIBLE (U7)** — a plugin may register a frame card renderer; lazy-mounted, never per-row-eager |
| Arbitrary-HTML settings look (§5.1) | full FUNCTION via form nodes | **HATCH-ELIGIBLE (U7)** — was refuse; the ruling reaches it (the installer's own screen, their consent); the integrated form remains the recommended authoring path |
| Embedded exotic renderers (mermaid/LaTeX class) | `markdown`/`code` nodes | **BOTH** — the hatch serves immediately at U7; a house mermaid/LaTeX primitive remains the better long-term home (an `@orb/ui` decision benefiting everyone) and supersedes frame usage where it lands |

### 6.2 The `ui.frame` hatch — COMMITTED (phase U7; security-executor-gated)

Its own capability `ui.frame`, landing WITH U7 (§4.1's tuple-timing rule), its own consent line
naming the risk honestly (*"runs its own interface code in an isolated frame — it can draw
anything inside its box, and an isolated frame can beacon out through browser channels no policy
closes"* — the #124 class), riding the card-frame substrate wholesale: routed document with its
own response CSP (`buildCardFrameCsp`-family, `sandbox allow-scripts`, `default-src 'none'`, NO
`connect-src`), per-user in-process handles (`entry/http/card-frame.ts:41-45`), window-identity
postMessage (`sandbox-frame.tsx:92-117`), token injection (`use-sandbox-theme.ts`), height clamps.
All frame I/O through a postMessage bridge relayed to the SAME `plugin.uiHostCall` proc — the
frame gets no network of its own. Anchors: `chat-flank`, the `dialog` surface, `tool-card` (lazy),
and `page` (a frame-bodied Extensions page under the page-scale shell, §4.5b); NEVER
`message-footer`-eager. The merge is `security-executor`-gated (§9), and the
priority law stands: a surface expressible in the vocabulary ships in the vocabulary — the frame
is the arbitrary-pixels arm, not a parallel UI system.

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
| 11 | Bundle UI assets (`ui/assets/` → installer CAS, `image` node source) — **BUILT 2026-08-30 (#820)** | `@orb/contracts/plugin/manifest.ts` (the `ui/assets/<name>` pattern + the count/per-entry/aggregate caps, ONE home) · `substrate/manifest.ts` (the fourth entry class: path wall, bomb caps, magic-byte format wall — png/jpeg/gif/webp only, SVG refused by name) · `substrate/bundle-assets.ts` (the shared CAS writer install + upgrade both use) · `plugin_assets.bundle_path` **in the PK** (a bundle shipping one image at two paths dedups to ONE assetId — the path is what tells the rows apart) + its CHECK · install/upgrade/uninstall lifecycle (replace-the-set on upgrade; the existing reap path covers the new provenance unchanged) · `plugin.listBundleAssets` (owner-scoped; sweep-PROBED) · the `bundleAsset` arm on `image`/hero/tile + the renderer's cover-key resolve | zod (no URL arm exists; the spec's path pattern IS the funnel's) + the magic sniff (`@orb/kit/image-sniff`, the same primitive `assets.store`'s `enforceMagic` runs) + the CAS ownership reads (`assets.resolveBlobRefs`, session-owner-scoped) + the db CHECK + the cross-tenant sweep |
| 12 | Consent copy + grant screen | `features/plugin/components/plugin-grant-list.tsx` + the capability-order decision | review + side-eye (copy is a consent artifact) |
| 13 | U7 — the `ui.frame` hatch | `ui.frame` tuple member (+ both vitest pins move) · consent line (§6.2) · the plugin-frame routed doorway (`entry/http`, the card-frame shape: per-user handles, own response CSP, floor on every arm) · **the `security-headers.ts` document-path exemption — its own commit, see §7a 2026-08-28** · the `PluginFrame` client component (window-identity listener, `sandbox-frame` posture) · the postMessage→`uiHostCall` bridge | the card-frame belt set (kit CSP builder + route tests + CT) + security-executor gate |
| 14 | U6 — the display-transform seam — **BUILT 2026-08-28; see the dated repair below** | `host.transforms.registerDisplay` (capability `chat.transform`, no new member) · the resident-read `plugin.listDisplayTransforms` (the byte-identity gate) + `plugin.transformForDisplay` (the per-row round-trip) · `PLUGIN_DISPLAY_TRANSFORM_DEADLINE_MS` per transform, `PLUGIN_DISPLAY_TEXT_MAX_CHARS` at the transport boundary · timeout/throw ⇒ SKIP (D53) · the client's `usePluginDisplayText` gate + result cache | the verb's own int suite (`tests/server/domain/plugin/verbs/transform-for-display.int.test.ts`) + the membrane capability pins |
| 15 | U8 — ecosystem verbs | URL install (fetch→same funnel+consent; egress-guarded) · update check + one-click `upgradePlugin` (#615 re-consent, never silent) · `databank.ingest` capability + host fn (D107 op) · card extension fields (`data.extensions.plugin_<slug>`, D-entry with the build) · the dynamic palette source for per-command rows | each verb's own sweep-class int tests + the capability pins + the egress wall |
| 16 | U5 — `ui.page` + the Extensions section | `PLUGIN_SURFACE_ANCHORS` gains `page` · the tenth `SECTION_IDS` member `extensions` walking the FULL §6a playbook (`client-architecture-lockdown.md`): tuple + rail order · persisted-state sanitizers (`isSectionId`, `panelOverrides`) · the co-located `SectionDefinition` + front-door export + door row · the drill selection store (G27 mint) · `__orb.nav` vocabulary · the `ct-data-providers` door mirror · the mobile fate (`sheet`) · chrome self-derivation verified-not-edited · DISTINCT placeholder copy · the rail prose in `UI-Architecture-and-Layout.md` §4.1 — PLUS the page switcher + the page-scale shell + the teaching empty state + the BROWSE-GENRE vocabulary nodes (`grid` · `masterDetail` · `searchBar`/`filters`, §4.5b — incl. any new house media-tile composite they require) | tsc (total Record) + G1/G2/G8 + the placeholder-copy gate + `empty-state-has-action` + a CT on the switcher/empty + the exhaustive node-renderer Record |
| 17 | U8 — `character.ingest` | capability member (sibling of `databank.ingest`, same consent grammar) + host fn over the character-create/import op (a canon write under the installer, riding the import domain's ContentChanged-emitting path so the indexer auto-runs — `Constitution.md` §6 import row) + `HOST_FUNCTION_CAPABILITY` row + both vitest pins + its consent line | the capability pins + sweep-class int tests (installer-owned rows only) + the existing import-domain belts |

### §7a DATED REPAIRS — premises this doc asserted that the tree refuted (never a silent rewrite)

**2026-08-30 · seam 11's own row named a `§7.11` that does not exist, and its shape needed one correction on
contact.** Row 30 pointed at "§7.11" for the `ui/assets/` route; this document has no §7.11 — the seam is row
11 of the §7 table, and both rows now say so. The SHAPE correction is the one worth carrying: the row assumed
the bundle→CAS link could ride `plugin_assets` as-is. It cannot. The CAS is content-addressed, so a bundle
shipping the SAME image at two paths gets back ONE `assetId`, and under #802's `(plugin_id, asset_id)` primary
key the second path collides and is silently lost — a node naming it paints a placeholder forever. `bundle_path`
therefore joins the PRIMARY KEY (`NOT NULL DEFAULT ''`; SQLite does not enforce NOT NULL on a rowid table's PK
columns, so NULL would compare distinct and break #802's own re-fetch upsert). One table still, one
`ASSET_REFS` row still — the key got wider, not the design.

**2026-08-28 · §8-U7's "CSP untouched" was true of the POLICY and false of the FILE.** The ruling survives; its
input changed. Every app-CSP *directive* is byte-identical after U7 — nothing added, removed or widened, and the
frames are same-origin so the existing `frame-src 'self'` already admitted them. What the row did not account
for is *where the mechanism lives*: a routed document only carries its own policy because
`entry/http/security-headers.ts` SKIPS its path. `hono/secure-headers` writes its headers AFTER the handler with
`.set()` (`security-headers.ts:60-67`), so without that exemption the app policy silently overwrites the frame's.
`servesOwnPolicy` was hardcoded to the single card-frame prefix, so U7 had to add the plugin-frame document
prefix as a second member of that existing class.

*Measured, not argued* (control planted by removing the prefix, then restored): the document then serves under
`default-src 'self'; script-src 'self'; …; frame-ancestors 'none'`. Two distinct consequences, and the honest
statement distinguishes them — **embedded**, `frame-ancestors 'none'` refuses our own iframe, so the surface
visibly fails to load; **directly navigated**, there is no `sandbox` directive at all, so plugin-authored markup
lands in the app's OWN origin. Today's `script-src 'self'` refuses its inline scripts, which makes that half
LATENT rather than immediate — and latent is the dangerous kind, since it converts any future `script-src`
widening into an XSS in our origin instead of a contained one inside an opaque frame.

Both members are now pinned by the served response header rather than by the constant
(`tests/server/entry/http/{plugin,card}-frame.test.ts` — the card-frame arm never had that pin either and gained
it in the same commit), plus the near-miss prefix arm in `security-headers.test.ts`. Owner-side ruling:
orchestrator, 2026-08-28, arm A approved with the exemption landing as its own reviewed commit.

**2026-08-28 · "a resident instance outlives a re-grant" is FALSE on this tree** — a premise an earlier draft of
U7's `getFrameBody` header asserted, refuted by the verb's own int test. `setGrant` DEACTIVATES before the write
and re-activates only if the row was enabled (`verbs/set-grant.ts`, "THE RUNNING-INSTANCE INVARIANT"), so a
narrowed grant rebuilds the guest and a now-ungranted registration is never collected again. The membrane's
registration-time capability check is therefore the PRIMARY control for `ui.frame`, and the per-call grant
re-reads in `getFrameBody`/`listSurfaces` are a second belt — kept for the reason `entry/http/card-frame.ts`
re-applies a ceiling `resolveRenderPolicy` already folded in (the boundary must hold if the layer above is
weakened), and documented as a belt rather than sold as the wall.

**2026-08-28 · seam 14's "applied at the render path" was a SERVER-side reading, and there is no server-side
render path.** The house display pipeline is CLIENT-side and SYNCHRONOUS — `renderMessageForDisplay` at
`packages/client/src/lib/message-render.ts:91` runs macros → DISPLAY regex → markdown-fix on the way to the
DOM — and the server serves canon `MessageView.content` (`packages/contracts/src/chat/messages.ts:201`) with
no rendering stage of its own. A plugin display transform is a GUEST INVOKE: async, and resident server-side.
So it can be hooked into neither that sync function nor the D50 `PromptTransform` registry (which is
prompt-side, two fixed points, and never touches served message text).

**The ruling SURVIVES; its INPUT changed** (owner ruling 2026-08-28, ARM 2 approved). The seam is still a
D50-shaped registration with a per-message budget and D53's timeout ⇒ SKIP posture. What moved is WHERE the
text comes from: the viewer's client submits the row it has ALREADY rendered, the server runs that caller's own
plugins' display transforms over it, and the answer goes straight to the markdown renderer.

*Why that arm and not "the server re-reads canon and the client re-renders the result":* (a) laws 6/7 are
satisfied BY CONSTRUCTION — the plugin's output never re-enters a macro plane, so no `neutralizeMacros` is
needed and the row's own legitimate `{{char}}` is not collateral (the other arm would have had to neutralize
the whole row); (b) it is strictly leak-free — a guest can only ever see text the installer's client already
had on screen, which is NARROWER than the `chat.read` grant the plugin holds, and it needs no new cross-domain
read op; (c) "applied at the render path" then becomes literally true.

**THE ORDERING IS LAW, recorded here:** member macros → member DISPLAY regex → plugin display transforms →
markdown. Stated consequence: **a member's own DISPLAY regex scripts cannot post-process a plugin annotation.**
That is the recorded ordering, not an accident — a viewer's regex is about the canon they were shown, and a
plugin's annotation is decoration layered on top of it.

**The accepted costs, stated:** the submitted text is client-supplied (reflected ONLY to the same caller; no
authority, no persistence and no other viewer's render derives from it, and it is byte-capped at the transport
boundary), and a row paints untransformed for one round-trip before the annotation swaps in — the flank law's
posture, content first and decoration when ready, which is also the failure posture. Byte-identity when off is
kept by `plugin.listDisplayTransforms`: zero registrants means zero per-row calls. Result caching is the query
key `(chatId, messageId, text)` — the TEXT is the content identity, so an edit/swipe gets a fresh transform and
a virtual-scroll repaint of the same bytes does not.

**2026-08-28 · §5.15's "a `macros.register` host fn whose handler is a guest invoke" needs one mechanical
correction.** `MacroHandler` in `@orb/kit/macro` is SYNCHRONOUS by contract and a guest invoke is not, so the
guest is invoked ONCE PER TURN before the render and its (neutralized) answer becomes the macro's BODY — which
is exactly what "kit/macro stays the ONE engine; plugin macros are DATA registered into it" means once it is
mechanised. The consequence, named rather than hidden: **a plugin macro takes no ARGUMENTS** (an arg-taking
macro would need the engine to call back into the guest at substitution time — the async call it cannot make).
That is ST's own `registerMacro(key, value)` shape, and an arg-taking variant is a separate design about making
the engine async, not a widening of this row.

## §8 The phase plan (stop-anywhere; every row owner-testable)

| Step | Contents | Owner's test | Merge class |
| - | - | - | - |
| U0 | contracts: `ui.surface` member + `host.ui` types + spec vocabulary + pins (seams 1-3) | pins green; grant dialog shows the new line | ordinary |
| U1 | Tier S end-to-end at `settings`: activation collection + `listSurfaces`/`getSurfaceState`/`invokeUiAction` + the bus member + the pane render (seams 4-6) | an example plugin ships a settings panel whose button round-trips and whose state updates live | ordinary |
| U2 | chat anchors: flank fan-out + settings-section contribution + the shell (seam 7) | a plugin renders a labeled flank widget updating on room events; disabled ⇒ byte-identical room | ordinary |
| U3 | `tool-card`: `pluginToolRenderer` + card specs — **closes A2-F5** | the oracle-deck example's draw renders a house card; an unregistered tool still gets the generic block | ordinary |
| U4 | Tier C: `uiEntry` + bytes route + worker host + `uiHostCall` + CSP delta (seams 8-10) — **security-executor review gates the merge** | a scripted surface filters a list with zero network on keystroke; a hung `ui.js` collapses to null within the deadline | ordinary (CSP edit deliberate) |
| U5 **(BUILT)** | `/plugin` slash dispatch + the Plugins chrome menu + the `dialog` surface kind + `host.ui.toast` (§4.5a) + **`ui.page` + the Extensions section** (§4.5b, seam 16) | `/plugin oracle-deck draw` runs; the wand menu lists plugin commands; a plugin action opens a plugin-attributed house dialog and raises a prefixed toast; a plugin registers a page and it appears behind the Extensions rail entry's switcher; zero pages ⇒ the teaching empty | ordinary (the SECTION_IDS tuple edit is the §6a playbook, not a merge window) |
| U6 | the committed parity tail (all CMT rows): `message-footer` DSL badges (§5.4) · the display-transform seam (§5.5/§5.29, seam 14) · `llm.quiet` schema + vision params (§5.16/§5.32) · the typed transform-abort outcome (§5.14) · `macros.register` (§5.15) | per row: a badge renders under a message; a display transform annotates rendered text; a structured quiet call returns schema-valid JSON; a transform aborts a generation typed; a plugin macro substitutes | ordinary |
| U7 | the `ui.frame` hatch whole (seam 13; §6.2) — **security-executor review gates the merge** | a frame surface draws a chess board at `chat-flank`; a hostile frame reaches nothing off-box except the #124 channel its consent line names; every §6.1 row is servable | ordinary (the app CSP's DIRECTIVES are untouched — the frame carries its own response policy; `security-headers.ts` gains the document-path exemption its mechanism requires, see §7a 2026-08-28) |
| U8 | ecosystem (seams 15+17): URL install + update check (one-click, re-consented) · `databank.ingest` · **`character.ingest`** · card extension fields · dynamic palette rows | install a plugin from a URL with the same consent screen; an update lands disabled-pending-reconsent when reach widened; a scraper plugin ingests into the databank; plugin commands appear as first-class palette rows; **the HUB-BROWSER showcase becomes buildable** — a `ui.page` Extensions page (search → results grid → preview → import; the flow of THIS repo's own 2026-07-22-purged `features/hub` carried as semantics, its UI designed fresh against the §4.5b failure list, `f6c5c588e` the dated drop) importing via `character.ingest`; it joins the example-plugin candidates (#673's seeded set) as the ui.page + ingest showcase | ordinary |

No row renames or migrates anything an earlier row shipped; U1 alone already delivers the
highest-demand ST parity row (per-extension settings UI). Any §5a enablement the owner buys is
scheduled as its own additional row at purchase time, never folded silently into these.

## §9 Threat model (honest; what routes to security-executor)

- **Exfiltration.** Tier S/C add NO new egress channel: the vocabulary's only media source is the
  installer's own CAS; all guest I/O rides the existing membrane fns behind the existing egress
  wall (`net.fetch` allowlist + SSRF guard + hourly floor). The client guest has no fetch — its
  only wire is the re-gated `uiHostCall`. The #124 WebRTC class attaches ONLY to the U7 frame
  hatch (named in its consent line, §6.2). Residual: a `ui.js` could encode observed data into
  ARGUMENTS of granted calls (e.g. a `storage.kv` write later read by the server half and egressed
  via granted `net.fetch`) — that is the plugin exfiltrating data the INSTALLER already granted it
  both halves of; consent covers it (capability-first ruling), and the grant screen showing
  `net.fetch`+hosts is the honest disclosure.
- **Host-chrome impersonation / consent spoofing.** Walled at the vocabulary (no modal/anatomy
  nodes — compile), the shell (every surface labeled — code + CT), and the rule that consent
  dialogs are host modals only. A DSL surface can render text claiming anything; it does so inside
  a container that names its author — the same trust story as a chat message. **`ui.page` raises
  the stakes and the shell carries them (§4.5b):** a full page is the biggest impersonation canvas
  in this design — a page could draw a fake "settings screen" out of house primitives — so the
  page-scale shell's pinned header band (plugin name + glyph + "Extension" kicker, no opt-out) and
  the no-host-chrome vocabulary walls are load-bearing there, not decoration; a frame-bodied page
  (U7) sits under the same band. The CT floor for U5 pins the band's presence on every page.
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
  re-gate + the `'wasm-unsafe-eval'` widening), U7 whole (the frame doorway + bridge + consent
  copy), U8's URL-install funnel (server-side fetch of attacker-named zips — through the egress
  guard, never a bare fetch), any PURCHASED §5a row, and the #675-item-4 interlock when it
  arrives. U0–U3 are standard-review (no plugin code executes client-side; every new surface is
  data rendered by first-party code) — `verifier` + `side-eye` lenses suffice there.

## §10 Owner questions — RESOLVED by the full-parity ruling, plus the residual ask

The five questions this design originally posed are all answered by steer (5) (capability-maximal;
consent is the line), recorded here so nobody re-opens them: (1) Tier C — COMMITTED, U4. (2) the
hatch — COMMITTED as scheduled phase U7, not woken-by-demand. (3) `message-footer` badges —
COMMITTED, U6, DSL-only with hard caps. (4) per-command palette rows — COMMITTED, U8 (the dynamic
palette source). (5) the display-transform seam — COMMITTED, U6 (seam 14).

**The residual owner-ask list (what the blanket ruling genuinely does not answer):**

1. **TTS/STT (§5.31)** — a SUBSTRATE decision, not a capability appetite: the engine has no audio
   transport or speech inference role (gap register §2, ARCHITECTURAL, recorded by-design-out for
   the engine). If the owner wants plugin-built voice, the ask is an ENGINE program (transport +
   role) that this plane would then consume — a gap-register/ledger reopening, not a phase here.

**Standing decision rows, no action needed until purchased:** the five §5a enablement rows — each
refused by default with its price stated; buying one schedules its own phase row + security review.

## §11 Interlocks

- **#675** (user-scoped plugins): the pane `when` flip and self-scoped procs land there; this
  design's viewer==installer invariant is the premise of §4.4/§9 — the server-wide variant
  re-opens both (hard re-review gate).
- **#677** (tool-registry owner collision): `pluginToolRenderer` keys must follow the landed key
  shape (owner-scoped or per-install) — U3 consumes, never decides.
- **#627** (runtime plugin log): §4.9's diagnosability leans on it; until then, activation-log only.
- **#124** (WebRTC watch): attaches to the U7 frame hatch only; its wake condition is independent.
- **The interaction spec §7-C7** (plugin client wave): U1–U3 here ARE C7's "plugin client" surface
  work; the `llm.quiet` pins and attach-seam rows in C7 are siblings, not duplicates — C7's
  vitest-pin pricing note (two exact pins move with any capability member) applies to `ui.surface`.

*Provenance: commissioned by #679; built against the full reading set (the membrane design docs 01-04,
the D46 security review, D70, the interaction spec §1/§3/§7-C7a, the juice review, contribution
contracts, the card-frame substrate, the ST parity corpus + live ST extension docs fetched raw
2026-08-24). Seven owner steers folded verbatim in §0 (four at first delivery; the full-parity
ruling, the enablement-sheet follow-up, and the ui.page/Extensions addendum folded the same day as
dated revisions).*
