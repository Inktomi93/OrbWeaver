// domain/plugin/contract/results — the output parsers of the plugin procedures. Two carry logic beyond key
// strictness: the surface view extends a REFINED registration meta, so the per-anchor rules must survive the
// extension; and the update-check union must pin `newVersion` to the arm that owns it.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { pluginSurfaceViewSchema, pluginUpdateCheckSchema } from "@orb/server/domain/plugin";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const pluginId = mintTypeId(ID_PREFIX.plugin);

describe("pluginSurfaceViewSchema", () => {
  const surface = { id: "board", anchor: "chat-flank", title: "Board", tier: "frame", pluginId } as const;

  test("control: a frame surface without a spec parses", () => {
    expect(pluginSurfaceViewSchema.safeParse(surface).success).toBe(true);
  });

  test("the frame-tier refinement still refuses a spec beside a frame document", () => {
    const spec = { kind: "text", text: "smuggled" };
    expect(pluginSurfaceViewSchema.safeParse({ ...surface, spec }).success).toBe(false);
  });

  test("an explicit undefined toolWireName is refused, not read as absent", () => {
    expect(pluginSurfaceViewSchema.safeParse({ ...surface, toolWireName: undefined }).success).toBe(false);
  });
});

describe("pluginUpdateCheckSchema", () => {
  test("newVersion rides only the update-available arms", () => {
    expect(pluginUpdateCheckSchema.safeParse({ pluginId, status: "update-available", source: "showcase", newVersion: "2.0.0" }).success).toBe(true);
    expect(pluginUpdateCheckSchema.safeParse({ pluginId, status: "up-to-date", newVersion: "2.0.0" }).success).toBe(false);
  });

  test("a url update without its bundle hash is refused", () => {
    expect(pluginUpdateCheckSchema.safeParse({ pluginId, status: "update-available", source: "url", newVersion: "2.0.0" }).success).toBe(false);
  });
});
