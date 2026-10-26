import type { PluginView } from "@orb/contracts/plugin";
import { expectTypeOf, test } from "vitest";
import type { OrbPluginUiCommand, OrbPluginUiEntry, OrbPluginUiSurface } from "#client/lib/agent-plugin-bridge.ts";

test("the audit contract excludes private render payloads and command argument schemas", () => {
  expectTypeOf<Extract<keyof OrbPluginUiSurface, "spec" | "state" | "values" | "grants">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof OrbPluginUiCommand, "args" | "values" | "onRun">>().toEqualTypeOf<never>();
  expectTypeOf<OrbPluginUiEntry["status"]>().toEqualTypeOf<PluginView["status"]>();
});
