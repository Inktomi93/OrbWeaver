// The PUBLISHED-SDK conformance pin (#774): `@orb/showcase-plugins`'s `bundles/host-v1.d.ts` is the copyable, script-kind
// mirror of the plugin contract a plugin author drops next to their `main.js` — and a mirror is only safe
// while something makes drift RED. This file is that something.
//
// MECHANISM. The triple-slash reference pulls the script-kind globals into THIS program; the contract types
// import normally; and the two are held MUTUALLY ASSIGNABLE through `DeepUnbrand`, a targeted erasure of the
// three branded id types that cross the guest surface (`ChatHandle`, `AssetId`, `CharacterId` → `string` —
// the published file's one documented simplification: a guest never constructs a brand, only passes it back).
// Mutual assignability catches every drift class: a member the contract GAINS that the mirror lacks fails
// contract→mirror; one the contract REMOVES that the mirror still carries fails contract→mirror too (the
// erased contract value no longer supplies what the mirror requires) while a RESHAPED one fails whichever
// direction the change narrows. The closed unions (capabilities, node kinds, anchors, triggers, toast
// levels, arg types) are additionally pinned EXACTLY, because for a vocabulary "assignable" is weaker than
// "equal".
//
// IF A NEW BRAND ever enters the guest surface, `DeepUnbrand` does not know it, the assignability breaks,
// and THIS comment is the instruction: add the brand to `GuestBrand` below AND spell it `string` (documented)
// in the published file — never widen the mirror to carry a brand an author cannot construct.

/// <reference path="../../../packages/showcase-plugins/bundles/host-v1.d.ts" />

import type {
  PluginSurfaceAnchor as ContractAnchor,
  PluginCapability as ContractCapability,
  ChatHandle as ContractChatHandle,
  PluginCommandArgSpec as ContractCommandArgSpec,
  PluginHostV1 as ContractHost,
  PluginSurfaceNode as ContractNode,
  PluginSurfaceTier as ContractTier,
  PluginToastLevel as ContractToastLevel,
} from "@orb/contracts/plugin";
import type { AssetId, CharacterId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

/** The branded ids that cross the guest surface — the ONLY types the mirror flattens. */
type GuestBrand = ContractChatHandle | AssetId | CharacterId;

/** Erase guest brands to `string`, recursively, preserving everything else (literal unions survive because a
 *  literal is not assignable to a brand). Functions recurse through params + return; tuples/arrays/objects
 *  map member-wise; conditional distribution walks unions arm by arm. */
type DeepUnbrand<T> = T extends GuestBrand
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: DeepUnbrandTuple<A>) => DeepUnbrand<R>
    : T extends Promise<infer U>
      ? Promise<DeepUnbrand<U>>
      : T extends readonly (infer U)[]
        ? readonly DeepUnbrand<U>[]
        : T extends object
          ? { [K in keyof T]: DeepUnbrand<T[K]> }
          : T;
type DeepUnbrandTuple<A extends readonly unknown[]> = { [K in keyof A]: DeepUnbrand<A[K]> };

// The published GLOBALS (script-kind — no import possible; the reference above is what brings them in).
type PublishedHost = PluginHostV1;
type PublishedUi = PluginUiV1;
type PublishedOrb = typeof orb;

test("the namespace SET is exact — a namespace added to or removed from the contract goes red by NAME", () => {
  expectTypeOf<keyof PublishedHost>().toEqualTypeOf<keyof ContractHost>();
  expectTypeOf<keyof PublishedUi>().toEqualTypeOf<"version" | "grants" | "clock" | "random" | "log" | "tokens" | "render" | "onEvent" | "host">();
});

/** THE PIN MECHANISM, hardened by its own planted controls (2026-08-28). Two instruments were tried and
 *  REFUTED before this one:
 *   1. one whole-host `toMatchTypeOf` — TS hits its instantiation depth on `DeepUnbrand<ContractHost>` (the
 *      recursive surface-spec union appears at many positions), silently bails arms to `any`, and the marker
 *      lands on an unrelated member;
 *   2. whole-host DECLARED VALUES fed to per-namespace `toMatchTypeOf` — greener, but a PLANTED wrong return
 *      type in the mirror stayed green: the shared whole-host evaluation still `any`-bails, and `any`
 *      swallows every plant. A pin whose subject is any-contaminated is a pin that cannot fail.
 *  So: PER-NAMESPACE evaluation (the mapped `erased` value instantiates one namespace per property access —
 *  each stays inside the depth limit) + PLAIN ASSIGNABILITY through typed accept-functions (a mismatch is an
 *  ordinary tsc error naming the member, not a marker artifact). Two directions per namespace:
 *  contract→mirror catches what the contract gained/changed and the mirror missed; mirror→contract catches
 *  what the contract removed and the mirror still promises. */
declare const erased: { [K in keyof ContractHost]: DeepUnbrand<ContractHost[K]> };
declare const mirrorHost: PublishedHost;

function acceptMirror<K extends keyof PublishedHost>(_value: PublishedHost[K]): void {
  void _value;
}
function acceptErased<K extends keyof ContractHost>(_value: DeepUnbrand<ContractHost[K]>): void {
  void _value;
}

test("every namespace of the published mirror is mutually assignable with the contract (brands erased)", () => {
  // The accept-calls below ARE the assertions (plain tsc assignability — see the mechanism note); this one
  // line keeps the runtime-shaped lint honest about the callback carrying an expectation.
  expectTypeOf(erased).toHaveProperty("ui");
  acceptMirror<"version">(erased.version);
  acceptErased<"version">(mirrorHost.version);
  acceptMirror<"grants">(erased.grants);
  acceptErased<"grants">(mirrorHost.grants);
  acceptMirror<"clock">(erased.clock);
  acceptErased<"clock">(mirrorHost.clock);
  acceptMirror<"random">(erased.random);
  acceptErased<"random">(mirrorHost.random);
  acceptMirror<"ids">(erased.ids);
  acceptErased<"ids">(mirrorHost.ids);
  acceptMirror<"log">(erased.log);
  acceptErased<"log">(mirrorHost.log);
  acceptMirror<"tokens">(erased.tokens);
  acceptErased<"tokens">(mirrorHost.tokens);
  acceptMirror<"chat">(erased.chat);
  acceptErased<"chat">(mirrorHost.chat);
  acceptMirror<"worldInfo">(erased.worldInfo);
  acceptErased<"worldInfo">(mirrorHost.worldInfo);
  acceptMirror<"assets">(erased.assets);
  acceptErased<"assets">(mirrorHost.assets);
  acceptMirror<"search">(erased.search);
  acceptErased<"search">(mirrorHost.search);
  acceptMirror<"variables">(erased.variables);
  acceptErased<"variables">(mirrorHost.variables);
  acceptMirror<"storage">(erased.storage);
  acceptErased<"storage">(mirrorHost.storage);
  acceptMirror<"notifications">(erased.notifications);
  acceptErased<"notifications">(mirrorHost.notifications);
  acceptMirror<"imagery">(erased.imagery);
  acceptErased<"imagery">(mirrorHost.imagery);
  acceptMirror<"llm">(erased.llm);
  acceptErased<"llm">(mirrorHost.llm);
  acceptMirror<"databank">(erased.databank);
  acceptErased<"databank">(mirrorHost.databank);
  acceptMirror<"character">(erased.character);
  acceptErased<"character">(mirrorHost.character);
  acceptMirror<"events">(erased.events);
  acceptErased<"events">(mirrorHost.events);
  acceptMirror<"pubsub">(erased.pubsub);
  acceptErased<"pubsub">(mirrorHost.pubsub);
  acceptMirror<"tools">(erased.tools);
  acceptErased<"tools">(mirrorHost.tools);
  acceptMirror<"transforms">(erased.transforms);
  acceptErased<"transforms">(mirrorHost.transforms);
  acceptMirror<"macros">(erased.macros);
  acceptErased<"macros">(mirrorHost.macros);
  acceptMirror<"net">(erased.net);
  acceptErased<"net">(mirrorHost.net);
  acceptMirror<"ui">(erased.ui);
  acceptErased<"ui">(mirrorHost.ui);
});

test("the closed vocabularies are EXACT, not merely assignable", () => {
  expectTypeOf<PluginCapability>().toEqualTypeOf<ContractCapability>();
  expectTypeOf<PluginSurfaceAnchor>().toEqualTypeOf<ContractAnchor>();
  expectTypeOf<PluginSurfaceTier>().toEqualTypeOf<ContractTier>();
  expectTypeOf<PluginToastLevel>().toEqualTypeOf<ContractToastLevel>();
  expectTypeOf<PluginSurfaceNode["kind"]>().toEqualTypeOf<ContractNode["kind"]>();
  expectTypeOf<PluginCommandArgSpec["type"]>().toEqualTypeOf<ContractCommandArgSpec["type"]>();
});

/** One node kind's own slot type, brand-erased and `undefined`-stripped — the shape a per-leaf vocabulary pin
 *  compares. Optional (`?`) slots carry `| undefined` on both sides, which would equate two DIFFERENT unions
 *  as long as both were optional. */
type NodeSlot<N, K extends string, S extends string> = NonNullable<Extract<N, { kind: K }>[Extract<S, keyof Extract<N, { kind: K }>>]>;

test("the LEAF vocabularies inside the node union are EXACT too — completing the exact-pin list above", () => {
  // #818 completed the exact-pin list. The test above pins six vocabularies BY NAME because "for a vocabulary
  // assignable is weaker than equal" — but the slot vocabularies a node LEAF carries (a button's weight, a
  // badge's intent, a text's voice…) were never on that list, and they are the ones a vocabulary change
  // actually touches. The assignability pins DO catch a drift here (proven by planted control 2026-08-30:
  // reverting the mirror's `PluginButtonVariant` to two members reds three tests in this file) — but they
  // report it as a multi-megabyte structural diff of the whole `ui.register` signature, in which the one
  // changed word is unfindable. These rows name the vocabulary that moved, in one line.
  //
  // PLANTED-CONTROL HAZARD, paid here: **vitest's typecheck run is cached against the TEST file only.**
  // Editing a `/// <reference`d `.d.ts` and re-running this spec unchanged returns a STALE GREEN — two control
  // runs reported "no errors" over a mirror that was provably neutered. Touch the spec (or run the whole
  // `contract`/`types` project cold) or the control is not a control.
  expectTypeOf<NodeSlot<PluginSurfaceNode, "button", "variant">>().toEqualTypeOf<NodeSlot<ContractNode, "button", "variant">>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "badge", "intent">>().toEqualTypeOf<NodeSlot<ContractNode, "badge", "intent">>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "text", "voice">>().toEqualTypeOf<NodeSlot<ContractNode, "text", "voice">>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "stack", "gap">>().toEqualTypeOf<NodeSlot<ContractNode, "stack", "gap">>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "icon", "name">>().toEqualTypeOf<NodeSlot<ContractNode, "icon", "name">>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "image", "aspect">>().toEqualTypeOf<NodeSlot<ContractNode, "image", "aspect">>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "grid", "aspect">>().toEqualTypeOf<NodeSlot<ContractNode, "grid", "aspect">>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "masterDetail", "stages">[number]["kind"]>().toEqualTypeOf<
    NodeSlot<ContractNode, "masterDetail", "stages">[number]["kind"]
  >();
});

test("the node vocabulary round-trips whole (brands erased) — the mirror's specs are the contract's specs", () => {
  expectTypeOf<DeepUnbrand<ContractNode>>().toExtend<PluginSurfaceNode>();
  expectTypeOf<PluginSurfaceNode>().toExtend<DeepUnbrand<ContractNode>>();
});

test("the global door serves exactly the two guest surfaces at version 1", () => {
  expectTypeOf<PublishedOrb["host"]>().toEqualTypeOf<(version: 1) => PublishedHost>();
  expectTypeOf<PublishedOrb["ui"]>().toEqualTypeOf<(version: 1) => PublishedUi>();
});
