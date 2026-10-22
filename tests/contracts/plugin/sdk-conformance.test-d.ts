import "../../../packages/plugin-sdk/shared.d.ts";
import "../../../packages/plugin-sdk/frame.d.ts";

import type {
  PluginSurfaceAnchor as ContractAnchor,
  PluginBoundGridTile as ContractBoundGridTile,
  PluginCapability as ContractCapability,
  ChatHandle as ContractChatHandle,
  PluginCommandArgSpec as ContractCommandArgSpec,
  PluginCommandPlacement as ContractCommandPlacement,
  PluginHostV1 as ContractHost,
  PluginSurfaceNode as ContractNode,
  PluginSurfaceTier as ContractTier,
  PluginToastLevel as ContractToastLevel,
  PluginFrameCall,
  UiProxyableHostFunction,
} from "@orb/contracts/plugin";
import type { AssetId, CharacterId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type GuestBrand = ContractChatHandle | AssetId | CharacterId;
type DeepUnbrand<T> = T extends GuestBrand
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: { [K in keyof A]: DeepUnbrand<A[K]> }) => DeepUnbrand<R>
    : T extends Promise<infer U>
      ? Promise<DeepUnbrand<U>>
      : T extends readonly (infer U)[]
        ? readonly DeepUnbrand<U>[]
        : T extends object
          ? { [K in keyof T]: DeepUnbrand<T[K]> }
          : T;

declare const erased: { [K in keyof ContractHost]: DeepUnbrand<ContractHost[K]> };
declare const sdk: PluginHostV1;

declare function acceptSdk<K extends keyof PluginHostV1>(value: PluginHostV1[K]): void;
declare function acceptContract<K extends keyof ContractHost>(value: DeepUnbrand<ContractHost[K]>): void;

test("the SDK preserves host namespaces and their method keys", () => {
  expectTypeOf<keyof PluginHostV1>().toEqualTypeOf<keyof ContractHost>();
  expectTypeOf<{ [K in keyof PluginHostV1]: keyof PluginHostV1[K] }>().toEqualTypeOf<{ [K in keyof ContractHost]: keyof ContractHost[K] }>();
});

test("host namespaces conform in both directions after guest brand erasure", () => {
  // Per-namespace evaluation keeps recursive UI specs out of unrelated host comparisons.
  expectTypeOf(erased).toHaveProperty("chat");
  acceptSdk<"version">(erased.version);
  acceptContract<"version">(sdk.version);
  acceptSdk<"grants">(erased.grants);
  acceptContract<"grants">(sdk.grants);
  acceptSdk<"clock">(erased.clock);
  acceptContract<"clock">(sdk.clock);
  acceptSdk<"random">(erased.random);
  acceptContract<"random">(sdk.random);
  acceptSdk<"ids">(erased.ids);
  acceptContract<"ids">(sdk.ids);
  acceptSdk<"log">(erased.log);
  acceptContract<"log">(sdk.log);
  acceptSdk<"tokens">(erased.tokens);
  acceptContract<"tokens">(sdk.tokens);
  acceptSdk<"chat">(erased.chat);
  acceptContract<"chat">(sdk.chat);
  acceptSdk<"worldInfo">(erased.worldInfo);
  acceptContract<"worldInfo">(sdk.worldInfo);
  acceptSdk<"assets">(erased.assets);
  acceptContract<"assets">(sdk.assets);
  acceptSdk<"search">(erased.search);
  acceptContract<"search">(sdk.search);
  acceptSdk<"variables">(erased.variables);
  acceptContract<"variables">(sdk.variables);
  acceptSdk<"storage">(erased.storage);
  acceptContract<"storage">(sdk.storage);
  acceptSdk<"notifications">(erased.notifications);
  acceptContract<"notifications">(sdk.notifications);
  acceptSdk<"imagery">(erased.imagery);
  acceptContract<"imagery">(sdk.imagery);
  acceptSdk<"llm">(erased.llm);
  acceptContract<"llm">(sdk.llm);
  acceptSdk<"databank">(erased.databank);
  acceptContract<"databank">(sdk.databank);
  acceptSdk<"character">(erased.character);
  acceptContract<"character">(sdk.character);
  acceptSdk<"events">(erased.events);
  acceptContract<"events">(sdk.events);
  acceptSdk<"pubsub">(erased.pubsub);
  acceptContract<"pubsub">(sdk.pubsub);
  acceptSdk<"tools">(erased.tools);
  acceptContract<"tools">(sdk.tools);
  acceptSdk<"transforms">(erased.transforms);
  acceptContract<"transforms">(sdk.transforms);
  acceptSdk<"macros">(erased.macros);
  acceptContract<"macros">(sdk.macros);
  acceptSdk<"net">(erased.net);
  acceptContract<"net">(sdk.net);
});

type InferredRegistrar = "register" | "registerCommand";
type OrdinaryUi = Exclude<keyof ContractHost["ui"], InferredRegistrar>;
type SdkRegistration<K extends InferredRegistrar> = Parameters<PluginHostV1["ui"][K]>[0];
type ContractRegistration<K extends InferredRegistrar> = DeepUnbrand<Parameters<ContractHost["ui"][K]>[0]>;

test("UI registrars preserve the contract with deliberate author-time narrowing", () => {
  expectTypeOf<Pick<PluginHostV1["ui"], OrdinaryUi>>().toEqualTypeOf<DeepUnbrand<Pick<ContractHost["ui"], OrdinaryUi>>>();
  expectTypeOf<keyof SdkRegistration<"register">>().toEqualTypeOf<keyof ContractRegistration<"register">>();
  expectTypeOf<SdkRegistration<"register">>().toExtend<ContractRegistration<"register">>();
  expectTypeOf<ContractRegistration<"register">>().toExtend<SdkRegistration<"register">>();
  expectTypeOf<keyof SdkRegistration<"registerCommand">>().toEqualTypeOf<keyof ContractRegistration<"registerCommand">>();
  expectTypeOf<SdkRegistration<"registerCommand">>().toExtend<ContractRegistration<"registerCommand">>();
  expectTypeOf<PluginCommandArgSpec>().toExtend<ContractCommandArgSpec>();
  expectTypeOf<ContractCommandArgSpec>().not.toExtend<PluginCommandArgSpec>();
});

type ProxyNamespace = keyof PluginUiV1["host"];
type SdkProxyFunction = { [N in ProxyNamespace]: `${N}.${keyof PluginUiV1["host"][N] & string}` }[ProxyNamespace];
type ProxyMethod<N extends ProxyNamespace> = Extract<UiProxyableHostFunction, `${N}.${string}`> extends `${N}.${infer M}` ? M : never;
type ContractProxy<N extends ProxyNamespace> = DeepUnbrand<Pick<ContractHost[N], Extract<ProxyMethod<N>, keyof ContractHost[N]>>>;

test("the scripted UI SDK exposes exactly the admitted host proxy with matching signatures", () => {
  expectTypeOf<SdkProxyFunction>().toEqualTypeOf<UiProxyableHostFunction>();
  expectTypeOf<PluginUiV1["host"]["chat"]>().toEqualTypeOf<ContractProxy<"chat">>();
  expectTypeOf<PluginUiV1["host"]["variables"]>().toEqualTypeOf<ContractProxy<"variables">>();
  expectTypeOf<PluginUiV1["host"]["storage"]>().toEqualTypeOf<ContractProxy<"storage">>();
  expectTypeOf<PluginUiV1["version"]>().toEqualTypeOf<ContractHost["version"]>();
  expectTypeOf<Parameters<PluginUiV1["render"]>[1]>().toExtend<DeepUnbrand<ContractNode>>();
});

type NodeKeys<T extends { kind: string }> = { [K in T["kind"]]: keyof Extract<T, { kind: K }> };
type NodeSlot<T, K extends string, S extends string> = NonNullable<Extract<T, { kind: K }>[Extract<S, keyof Extract<T, { kind: K }>>]>;

test("closed vocabularies and node fields match the app contracts", () => {
  expectTypeOf<PluginCapability>().toEqualTypeOf<ContractCapability>();
  expectTypeOf<PluginSurfaceAnchor>().toEqualTypeOf<ContractAnchor>();
  expectTypeOf<PluginSurfaceTier>().toEqualTypeOf<ContractTier>();
  expectTypeOf<PluginToastLevel>().toEqualTypeOf<ContractToastLevel>();
  expectTypeOf<PluginCommandArgSpec["type"]>().toEqualTypeOf<ContractCommandArgSpec["type"]>();
  expectTypeOf<PluginCommandPlacement>().toEqualTypeOf<ContractCommandPlacement>();
  expectTypeOf<PluginSurfaceNode["kind"]>().toEqualTypeOf<ContractNode["kind"]>();
  expectTypeOf<NodeKeys<PluginSurfaceNode>>().toEqualTypeOf<NodeKeys<ContractNode>>();
  expectTypeOf<PluginSurfaceNode>().toExtend<DeepUnbrand<ContractNode>>();
  expectTypeOf<DeepUnbrand<ContractNode>>().toExtend<PluginSurfaceNode>();
  expectTypeOf<PluginBoundGridTile>().toEqualTypeOf<DeepUnbrand<ContractBoundGridTile>>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "button", "variant">>().toEqualTypeOf<NodeSlot<ContractNode, "button", "variant">>();
  expectTypeOf<NodeSlot<PluginSurfaceNode, "icon", "name">>().toEqualTypeOf<NodeSlot<ContractNode, "icon", "name">>();
});

test("literal registrations retain action ids and typed required and optional command values", () => {
  sdk.ui.register({
    id: "counter",
    anchor: "settings",
    title: "Counter",
    tier: "static",
    spec: { kind: "button", actionId: "refresh", label: "Refresh" },
    onAction: ({ actionId }) => {
      expectTypeOf(actionId).toEqualTypeOf<"refresh">();
      expectTypeOf<"erase">().not.toExtend<typeof actionId>();
    },
  });
  sdk.ui.registerCommand({
    name: "counter",
    describe: "Update the counter",
    args: [
      { name: "count", type: "number", required: true },
      { name: "mode", type: "enum", enumValues: ["add", "replace"] },
    ],
    onRun: ({ values }) => {
      expectTypeOf(values.count).toEqualTypeOf<number>();
      expectTypeOf(values.mode).toEqualTypeOf<"add" | "replace" | undefined>();
      // @ts-expect-error Undeclared argument names are absent from the literal values bag.
      void values.unlisted;
    },
  });
  // @ts-expect-error Author-time enum declarations require their admitted values.
  const invalidEnum: PluginCommandArgSpec = { name: "mode", type: "enum" };
  expectTypeOf(invalidEnum).toExtend<ContractCommandArgSpec>();
});

test("guest ids are unbranded and frame payloads retain opaque host-call input", () => {
  expectTypeOf<ReturnType<PluginHostV1["chat"]["current"]>>().toEqualTypeOf<string>();
  expectTypeOf<Parameters<PluginHostV1["assets"]["read"]>[0]>().toEqualTypeOf<string>();
  expectTypeOf<string>().not.toExtend<ContractChatHandle>();
  expectTypeOf<OrbPluginFrameCall["orbPluginFrameCall"]>().toEqualTypeOf<PluginFrameCall>();
  expectTypeOf(orbPluginAssetUrl).toEqualTypeOf<(bundlePath: string) => string>();
});
