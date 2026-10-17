import type { ConfigSectionContribution } from "@orb/client/state";
// @ts-expect-error feature callers cannot obtain a raw anchor formatter from the public state door
import { configAnchorId } from "@orb/client/state";
import type { ReactNode } from "react";
import { expectTypeOf, test } from "vitest";

declare const state: typeof import("@orb/client/state");
declare const contribution: ConfigSectionContribution;
test("public contributions receive an anchor without exposing its formatter", () => {
  expectTypeOf(contribution.body).parameter(0).toEqualTypeOf<string>();
  expectTypeOf(contribution.body("config-anchor-example-section")).toEqualTypeOf<ReactNode>();
  // @ts-expect-error the namespace door cannot expose the raw formatter either
  state.configAnchorId("appearance", "unregistered");
  void configAnchorId;
});
