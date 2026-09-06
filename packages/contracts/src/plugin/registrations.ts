// @orb/contracts/plugin/registrations — the infra↔domain WIRE shapes for a resident guest instance's collected
// registrations. These cross the sealed `infra/plugin-host` → `domain/plugin` seam BOTH ways: the
// runtime PRODUCES them at activation (what `main.js` registered), the domain CONSUMES them (hands each to its
// registrar). A cross-tier shape has exactly ONE home BELOW server — contracts (the cake) — so infra can mint a
// real `PluginInstance` without importing a domain (plugin-no-ambient), and the domain reads the same shape.

import type { Branded } from "@orb/kit/ids";
import type { ChatTriggerType, DomainTriggerType } from "#automation";
import type { PromptTransformPoint } from "#chat";
import type { PluginCommandRegistrationMeta, PluginFrameBody, PluginSurfaceRegistrationMeta } from "./ui.ts";

/** An opaque ref to a guest-registered callback, minted host-side during activation and carried on a collected
 *  registration. The port's `invoke` resolves it back into the resident guest; the domain treats it as opaque
 *  (never forges or inspects it — the membrane principle). */
export type PluginHandlerRef = Branded<"PluginHandlerRef">;

/** The JSON payload one handler invocation carries into the guest — either a FIXED string, or a BUILDER the
 *  runtime calls with this invocation's opaque chat handle.
 *
 *  WHY THE BUILDER ARM EXISTS (row 777, and it is the only shape that works). A chat-scoped handler's argument
 *  object is supposed to carry `chat: ChatHandle | null` (`PluginHostV1["ui"]["register"]`'s `onAction`), and
 *  that handle is the per-invocation opaque token — which is MINTED INSIDE the runtime when the invocation's
 *  chat scope is set, i.e. strictly after the domain has finished building its arguments. A domain caller
 *  therefore cannot put the real handle in a string it hands down, and the two alternatives are both wrong: the
 *  token cannot be handed UP (it is a security token whose whole point is that only the guest and the membrane
 *  ever see it, and the membrane validates by identity), and passing `chat: null` into a room-scoped action
 *  would hand the guest a lie it has no way to detect.
 *
 *  So the caller passes a function of the handle and the runtime applies it at the one moment the handle
 *  exists. Every EXISTING caller keeps passing a plain string — the arm is additive, and a handler with no chat
 *  scope is called with `null`. */
export type PluginInvokeArgs = string | ((chatHandle: string | null) => string);

/** A tool the guest registered via `host.tools.register` — collected at activation. `parameters` is the
 *  guest-supplied raw JSON Schema (lifted host-side at registration); `name` is the guest-local name the
 *  host namespaces to `plugin_<slug'>_<name>` before registering into the ONE tool-use registry
 *  ({@link pluginToolWireName} — `slug'` doubles the slug's hyphens, and that is load-bearing). */
export interface PluginToolRegistration {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly handler: PluginHandlerRef;
}

/** THE ONE MINT of a plugin tool's MODEL-VISIBLE wire name, `plugin_<slug'>_<name>` (`slug'` = the install
 *  slug with `-` → `__`, because the OpenAI/MCP function-name charset has no hyphen; the DOUBLING is what
 *  makes the mint injective — the proof is on {@link pluginToolWireName} below).
 *
 *  WHY IT IS A FUNCTION AND NOT A TEMPLATE LITERAL AT THE REGISTRAR (U3): two call sites now need the same
 *  answer — `entry/compose` mints it when it registers the guest's tool, and `plugin.listSurfaces` derives it
 *  so a `tool-card` surface can be MATCHED to a persisted `ToolCallRecord.name` on the client. A second
 *  spelling of the rule would silently unmatch every card the day either changed. It lives in `contracts`
 *  because both callers are above it and the format is part of what a plugin author is promised.
 *
 *  The client never derives this: it consumes the projected name (the slug is not part of the surface wire
 *  shape, and a client-side re-spelling would be a third home). What the client DOES take from here is
 *  {@link PLUGIN_TOOL_NAME_PREFIX} — the namespace the first-party `pluginToolRenderer` claims — so the prefix
 *  it matches on and the prefix this mint emits are the same string by construction. */
export const PLUGIN_TOOL_NAME_PREFIX = "plugin_";

/** INJECTIVE, and the proof lives here because the whole app depends on it (#1391, owner ruling 2026-09-05).
 *
 *  IT USED NOT TO BE. The transliteration was `-` → `_`, so a slug's hyphen and a tool name's underscore were
 *  indistinguishable once flattened: `("foo-bar","baz")` and `("foo","bar_baz")` both spelled
 *  `plugin_foo_bar_baz` with both halves independently valid (`SLUG_RE`, `PLUGIN_TOOL_NAME_RE`). The wall was
 *  `domain/tool-use`'s per-installer uniqueness refusal, so the collision was loud rather than silent — but it
 *  cost the second plugin its whole activation, and two legitimately named plugins could not coexist. The
 *  owner ruled for the injective form plus a migration of the persisted spellings, over keeping the refusal.
 *
 *  THE PROOF. `SLUG_RE` (`manifest.ts`) is `^[a-z0-9][a-z0-9-]{1,N}$` and `PLUGIN_TOOL_NAME_RE` (`ui.ts`)
 *  is `^[a-z][a-z0-9_]{0,M}$` for whatever `N`/`M` the wire-mint budget (`manifest.ts` `PLUGIN_SLUG_MAX`/
 *  `PLUGIN_TOOL_NAME_LOCAL_MAX`, #1803) currently sets — the injectivity proof below depends only on the
 *  CHARSETS, never the lengths, so it survives either cap moving: a slug contains NO `_` and never begins
 *  with `-`; a name never begins with `_`. Doubling each hyphen
 *  gives a flattened slug in which every maximal `_` run has EVEN length (exactly 2 per hyphen) and which
 *  never begins with `_`. The single `_` separator therefore lands at the end of a run of length `2k+1`
 *  (`k` = the slug's trailing hyphens) — ODD — and every run before it is even.
 *
 *  DECODE RULE (the constructive half — strip {@link PLUGIN_TOOL_NAME_PREFIX}, scan maximal `_` runs left to
 *  right, take the FIRST odd-length run; its LAST byte is the separator; everything before it is the
 *  flattened slug, `__` → `-`, and everything after it is the name). Decode is total on the image, so the
 *  mint is injective. It is stated rather than shipped: nothing in the app decodes a wire name — the client
 *  consumes the server's projected `toolWireName` and the #1391 data migration keys off the installed
 *  plugins' own slugs — so a production decoder would be an unused second home for the rule. The rule is
 *  PINNED as an executable decoder in `tests/contracts/plugin/ui.contract.test.ts`, which is what keeps this
 *  proof falsifiable.
 *
 *  LENGTH WAS A SEPARATE WALL that this change's own doubling made worse, and #1803 closed it at the
 *  INPUT boundaries instead of leaving it as a downstream refusal: `domain/tool-use`'s `TOOL_NAME_RE` caps
 *  a registry name at 64 bytes (`manifest.ts` `PLUGIN_TOOL_WIRE_NAME_MAX`, pinned to that regex by a
 *  cross-package test), and `manifest.ts`'s `PLUGIN_SLUG_MAX`/`PLUGIN_TOOL_NAME_LOCAL_MAX` are sized so
 *  `PLUGIN_TOOL_NAME_PREFIX.length + 2*slug.length + 1 + name.length` can NEVER exceed it — a slug over
 *  budget is refused at the manifest parse (contracts), a name over budget is refused at the membrane's
 *  `tools.register` (`infra/plugin-host/membrane.ts`, the guest-input trust boundary), and BOTH refusals
 *  name the length, not "collision". `registerPluginTool`'s `TOOL_NAME_RE.test` is therefore a pure
 *  BACKSTOP from here on — unreachable by construction for a plugin-sourced name (kept loud in case a
 *  future caller bypasses either boundary), never the primary wall it used to be.
 *
 *  THE COLLISION REFUSAL AT `registerPluginTool` SURVIVES this change and is still reachable: one plugin
 *  registering the same tool twice, a second copy of the same slug on one shelf, and a name a first-party
 *  tool already holds. What it no longer has to catch is two DIFFERENT slugs flattening alike — that arm
 *  is now unreachable by construction, and the property pin above is what proves it. */
export function pluginToolWireName(slug: string, name: string): string {
  return `${PLUGIN_TOOL_NAME_PREFIX}${slug.replaceAll("-", "__")}_${name}`;
}

/** THE ONE MINT of a plugin's PER-CARD state key inside a character card's `data.extensions` object —
 *  `plugin_<slug>` (D148). The RESERVED residual-extensions namespace a plugin's `host.character.setCardData` /
 *  `getCardData` writes and reads (the write host-fn D148 clause b/d governs). It is a sibling of
 *  {@link pluginToolWireName}, and homed here for the SAME reason: the slug is host knowledge (the bridge stamps
 *  it from the re-validated manifest, never guest input), the format is part of what a plugin author is
 *  promised (a portable, ST-`writeExtensionField`-shaped per-card blob that survives import↔export), and both
 *  the persistence write op and any reader must derive the exact same key or silently target the wrong field.
 *
 *  UNLIKE `pluginToolWireName` it does NOT transliterate the slug's hyphens at all: a card extensions object
 *  key is a JSON string with
 *  no charset restriction (the OpenAI/MCP function-name charset that forces the tool-name substitution does not
 *  apply), so D148's `plugin_<slug>` uses the RAW slug verbatim. That is unambiguous because a slug can never
 *  contain `_` (`SLUG_RE` is `[a-z0-9][a-z0-9-]{1,63}`), so the ONE `_` in the key is always the separator — and
 *  the key can collide with no promoted-to-column field (`depth_prompt`/`regex_scripts`/`fav` do not start with
 *  `plugin_`), which is the structural half of D148's inertness wall. */
export function pluginCardStateKey(slug: string): string {
  return `${PLUGIN_TOOL_NAME_PREFIX}${slug}`;
}

/** A D50 prompt transform the guest registered via `host.transforms.register` — collected at
 *  activation. Occupies the plugin band (order 1000+, assigned by activation order). */
export interface PluginTransformRegistration {
  readonly name: string;
  readonly point: PromptTransformPoint;
  readonly handler: PluginHandlerRef;
}

/** A DISPLAY transform the guest registered via `host.transforms.registerDisplay` — collected at activation
 *  (plugin-ui-plane §5.5/§5.29, seam 14). Unlike its D50 sibling it needs NO external registrar: it is read
 *  directly off the resident instance by the display round-trip verb and re-entered through the port's
 *  `invoke`, exactly as a `PluginSurfaceRegistration`'s `onAction` is. Order among a plugin's own display
 *  transforms is REGISTRATION order (the collected array's order) — the same "the guest declared it first"
 *  rule the D50 plugin band uses, and the only ordering a per-viewer fold can honestly claim. */
export interface PluginDisplayTransformRegistration {
  readonly name: string;
  readonly handler: PluginHandlerRef;
}

/** A macro the guest registered via `host.macros.register` — collected at activation (plugin-ui-plane §5.15).
 *  `name` is the HOST-NAMESPACED spelling (`plugin_<slug'>_<name>`, assigned domain-side from the re-validated
 *  manifest slug — never guest-supplied, and minted through {@link pluginToolWireName} so the tool plane and
 *  the macro plane can never spell one namespace two ways), so a plugin macro can shadow neither a builtin
 *  nor another plugin's.
 *  `handler` is re-entered ONCE PER TURN by the assembly pre-pass, and its (neutralized) answer is registered
 *  as that turn's value for the macro — plugin macros are DATA into the ONE kit engine, never a second one. */
export interface PluginMacroRegistration {
  readonly name: string;
  readonly description: string;
  readonly handler: PluginHandlerRef;
}

/** An event subscription the guest registered via `host.events.on` — the type is the SAME closed
 *  Tier-1 trigger taxonomy the automation watcher reads (plugins get no private event vocabulary). */
export interface PluginEventSubscription {
  readonly type: ChatTriggerType | DomainTriggerType;
  readonly handler: PluginHandlerRef;
}

/** A PRIVATE plugin-event subscription the guest registered via `host.pubsub.on` (plugin-ui-plane §5a). This is
 *  a DIFFERENT plane from {@link PluginEventSubscription} and the difference is the whole forgery wall: the
 *  Tier-1 trigger taxonomy is the DOMAIN's closed vocabulary (a plugin-emitted one would be a forged fact,
 *  §5.24), whereas this plane is INSTALLER-PRIVATE and plugin-authored — `emitterSlug`/`name` are free-text
 *  channel coordinates, never a `TriggerFact`, never entering a domain/chat bus, and never crossing to another
 *  user. `emitterSlug` names WHICH of the installer's plugins to listen to (the emitter stamps its own slug
 *  host-side, so a subscriber can listen but never forge a publication). */
export interface PluginPubsubSubscription {
  readonly emitterSlug: string;
  readonly name: string;
  readonly handler: PluginHandlerRef;
}

/** A private-event channel NAME — the surface-id ident grammar (a bounded programmatic key, never arbitrary
 *  text): a channel coordinate keys the resident bus map, so an unbounded one is an unbounded-key DoS. */
export const PLUGIN_PUBSUB_NAME_RE = /^[a-z][a-z0-9_]{0,40}$/;
/** How many `host.pubsub.on` subscriptions ONE resident plugin may register. Each pins a guest handler handle for
 *  the instance lifetime + a resident bus map entry; bounding the count keeps the bus map bounded (the count is
 *  small because a plugin listens to a handful of sibling channels, not hundreds). Extra subscriptions past the
 *  cap are a REGISTRATION refusal (logged, the subscription absent), never activation-fatal. */
export const PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX = 32;
/** The per-emit `data` serialized-size ceiling — a private plugin event is a SIGNAL, not a document (the
 *  `ui.setState` 16 KiB posture). It bounds the fan-out cost: one emit is re-delivered to every subscriber, so a
 *  tight per-emit cap is what keeps a fan-out bounded. Over cap is a REFUSAL (a rejected guest promise). */
export const PLUGIN_PUBSUB_PAYLOAD_MAX_BYTES = 16_384;

/** A UI surface the guest registered via `host.ui.register` — collected at activation (plugin-ui-plane #679
 *  U1, seam 4). Unlike tools/transforms/events, a surface needs NO external registrar: it is READ directly off
 *  the resident instance by `plugin.listSurfaces`, and its `onAction` handler is re-entered by
 *  `plugin.invokeUiAction` through the port's `invoke`. `spec` is the guest-supplied declarative node tree
 *  (zod-validated host-side at collection — an invalid spec is a REGISTRATION refusal, the surface absent, never
 *  activation-fatal); `onAction` is the opaque handler ref the action round-trip re-invokes (absent = a
 *  display-only surface with no actions). `anchor`/`tier`/`spec` are the U0 vocabulary (`ui.ts`). */
export type PluginSurfaceRegistration = PluginSurfaceRegistrationMeta & {
  readonly onAction?: PluginHandlerRef;
  /** U7 (§6.2) — a `frame`-tier surface's DOCUMENT BODY, present exactly when `tier === "frame"` (minted only by
   *  `host.ui.registerFrame` under the `ui.frame` capability). It lives HERE and not on
   *  {@link PluginSurfaceRegistrationMeta} because `PluginSurfaceView extends` that meta: the projected wire shape
   *  would otherwise ship every frame document to the client. Only the plugin-frame doorway reads it, server-side,
   *  and only for the OWNER of the row. */
  readonly frame?: PluginFrameBody;
};

/** A COMMAND the guest registered via `host.ui.registerCommand` — collected at activation (plugin-ui-plane #679
 *  U5, §4.5). Like a surface it needs NO external registrar: it is read directly off the resident instance by
 *  `plugin.listCommands` (which the `/plugin` dispatcher and the Plugins chrome menu both fan off) and re-entered
 *  by `plugin.invokeUiCommand` through the port's `invoke`. `onRun` is REQUIRED — unlike a surface, a command
 *  with nothing to run is not a display-only affordance, it is a dead menu row. */
export type PluginCommandRegistration = PluginCommandRegistrationMeta & {
  readonly onRun: PluginHandlerRef;
};

/** A resident guest instance's collected registrations — what `main.js` registered at activation. The
 *  concrete runtime carries the guest handles + log ring internally (opaque to the domain, read via the port);
 *  the domain reads only these registration records to hand to the registrar ops (tools/transforms/events) or,
 *  for `surfaces`/`commands`, to project directly to the client + re-enter on an action. */
export interface PluginInstance {
  readonly tools: readonly PluginToolRegistration[];
  readonly transforms: readonly PluginTransformRegistration[];
  readonly events: readonly PluginEventSubscription[];
  readonly surfaces: readonly PluginSurfaceRegistration[];
  readonly commands: readonly PluginCommandRegistration[];
  /** U6 seam 14 — read directly off the instance by the display round-trip (no registrar), like `surfaces`. */
  readonly displayTransforms: readonly PluginDisplayTransformRegistration[];
  /** U6 §5.15 — handed to the macro registrar, which resolves each ONCE per turn into the turn's registry. */
  readonly macros: readonly PluginMacroRegistration[];
  /** U8 §5a — the private plugin-event subscriptions, handed to the pubsub registrar (the `events` pattern),
   *  which wires each onto the INSTALLER-scoped resident plugin-event bus. Never the domain fan-out. */
  readonly pubsub: readonly PluginPubsubSubscription[];
}
