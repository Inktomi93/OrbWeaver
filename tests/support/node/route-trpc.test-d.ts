import { DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { Page } from "@playwright/test";
import { expectTypeOf, test } from "vitest";
import type { TrpcFixtureOutput, TrpcProcedurePath, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "./route-trpc.ts";
import { defineTrpcRoutes, malformedOrForwardTrpcWire, routeTrpc, trpcError, trpcHold } from "./route-trpc.ts";

declare const page: Page;
declare const broadRecord: Record<string, unknown>;
declare const broadRoutes: TrpcRoutes;

type NeverWireOutputPaths<TPath extends TrpcProcedurePath = TrpcProcedurePath> = TPath extends TrpcProcedurePath
  ? [TrpcWireOutput<TPath>] extends [never]
    ? TPath
    : never
  : never;

type NeverFixtureOutputPaths<TPath extends TrpcProcedurePath = TrpcProcedurePath> = TPath extends TrpcProcedurePath
  ? [TrpcFixtureOutput<TPath>] extends [never]
    ? TPath
    : never
  : never;

const completeSettingsOutput = {
  userId: "user_complete_wire",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
  configUnreadable: null,
} satisfies TrpcWireOutput<"settings.getUserSettings">;

const focusedSettingsWithExactNestedValue = {
  config: DEFAULT_USER_SETTINGS,
} satisfies TrpcFixtureOutput<"settings.getUserSettings">;

const recursivePluginSurfaceOutput = [
  {
    id: "surface_recursive",
    anchor: "settings",
    title: "Recursive surface",
    tier: "static",
    pluginId: "plugin_recursive",
    spec: { kind: "stack", children: [{ kind: "text", value: "healthy child" }] },
  },
] satisfies TrpcWireOutput<"plugin.listSurfaces">;

type PluginSurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];
const pageSurfaceRow = (): PluginSurfaceRow => ({
  pluginId: "plugin_page",
  id: "surface_page",
  anchor: "page",
  title: "Page surface",
  tier: "static",
  spec: undefined,
});

test("ordinary direct fixtures derive keys, input, and output from AppRouter", async () => {
  expectTypeOf<NeverWireOutputPaths>().toEqualTypeOf<never>();
  expectTypeOf<NeverFixtureOutputPaths>().toEqualTypeOf<never>();
  expectTypeOf(routeTrpc(page, { health: { ok: true } })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { health: () => ({ ok: true }) })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { "assets.listOwned": [{ assetId: "asset_wire_id" }] })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { "settings.getUserSettings": completeSettingsOutput })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { "settings.getUserSettings": () => completeSettingsOutput })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { "settings.getUserSettings": focusedSettingsWithExactNestedValue })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { "chat.setRoomOverrides": DEFAULT_ROOM_OVERRIDES })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { "chat.setRoomOverrides": {} })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { "plugin.listSurfaces": recursivePluginSurfaceOutput })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(
    routeTrpc(page, {
      "plugin.list": () => [],
      "plugin.listSurfaces": () => [pageSurfaceRow()],
    }),
  ).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { health: trpcError() })).toEqualTypeOf<Promise<TrpcRecorder>>();
  expectTypeOf(routeTrpc(page, { health: trpcHold() })).toEqualTypeOf<Promise<TrpcRecorder>>();

  // @ts-expect-error — a deleted field cannot survive on a static output.
  await routeTrpc(page, { health: { ok: true, deletedField: "stale" } });
  // @ts-expect-error — function responders have the same output contract.
  await routeTrpc(page, { health: () => ({ ok: true, deletedField: "stale" }) });
  // @ts-expect-error — canonical property value types are enforced.
  await routeTrpc(page, { health: { ok: "not boolean" } });
  // @ts-expect-error — a wholly nonoverlapping object is not a partial canonical output.
  await routeTrpc(page, { health: { onlyPlaceholder: true } });
  // @ts-expect-error — an object fixture must contain at least one canonical field.
  await routeTrpc(page, { "databank.bankHealth": {} });
  // @ts-expect-error — object array elements must contain at least one canonical field.
  await routeTrpc(page, { "worldInfo.listBooks": [{}] });
  // @ts-expect-error — array element shapes are recursively checked.
  await routeTrpc(page, { "assets.listOwned": [{ deletedField: "stale" }] });
  await routeTrpc(page, {
    health: { ok: true },
    // @ts-expect-error — a bad sibling is rejected at its own responder instead of erasing the healthy route map.
    "assets.listOwned": [{ deletedField: "stale" }],
  });
  await routeTrpc(page, {
    // @ts-expect-error — the recursive cycle still checks the exact child value type.
    "plugin.listSurfaces": [
      {
        id: "surface_stale_child",
        anchor: "settings",
        title: "Stale child",
        tier: "static",
        pluginId: "plugin_stale_child",
        spec: {
          kind: "stack",
          children: [{ kind: "text", value: 42 }],
        },
      },
    ],
  });
  // @ts-expect-error — procedure keys come from AppRouter.
  await routeTrpc(page, { "missing.deletedProcedure": null });
  // @ts-expect-error — responder input comes from the selected procedure.
  await routeTrpc(page, { "databank.list": (_input: string) => ({ items: [], nextCursor: null, totalCount: 0 }) });
  // @ts-expect-error — routeTrpc does not await ordinary responders; trpcHold is the deferred mechanism.
  await routeTrpc(page, { health: async () => ({ ok: true }) });
});

test("broad maps cannot erase procedure-specific validation", async () => {
  expectTypeOf(broadRecord).toExtend<Record<string, unknown>>();
  // @ts-expect-error — a broad record loses the procedure edge and is rejected.
  await routeTrpc(page, broadRecord);
  // @ts-expect-error — the legacy broad helper map is not an unnamed escape.
  await routeTrpc(page, broadRoutes);
  // @ts-expect-error — defineTrpcRoutes cannot bless a broad record.
  defineTrpcRoutes(broadRecord);
  // @ts-expect-error — defineTrpcRoutes cannot bless the legacy broad map.
  defineTrpcRoutes(broadRoutes);
});

test("canonical dictionaries and the named malformed-wire escape remain supported", async () => {
  expectTypeOf(routeTrpc(page, { "chat.getRuntimeVariables": { scene: "harbor" } })).toEqualTypeOf<Promise<TrpcRecorder>>();
  // @ts-expect-error — dictionary values retain their canonical value type.
  await routeTrpc(page, { "chat.getRuntimeVariables": { scene: 42 } });
  expectTypeOf(routeTrpc(page, { health: malformedOrForwardTrpcWire({ ok: true, forwardField: 1 }) })).toEqualTypeOf<Promise<TrpcRecorder>>();
});
