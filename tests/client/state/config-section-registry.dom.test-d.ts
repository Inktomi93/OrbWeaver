import type { ConfigSectionContribution } from "@orb/client/state";
import type { ReactNode } from "react";
import { expectTypeOf, test } from "vitest";

declare const state: typeof import("@orb/client/state");
declare const contribution: ConfigSectionContribution;
test("public contributions receive an anchor without exposing its formatter", () => {
  expectTypeOf(contribution.body).parameter(0).toEqualTypeOf<string>();
  expectTypeOf(contribution.body("config-anchor-example-section")).toEqualTypeOf<ReactNode>();
  // Neither a named import nor the namespace door can reach the raw formatter.
  expectTypeOf(state).not.toHaveProperty("configAnchorId");
});
