import type { ConfigSectionContribution } from "@orb/client/state";
// @ts-expect-error feature callers cannot obtain a raw anchor formatter from the public state door
import { configAnchorId } from "@orb/client/state";

declare const state: typeof import("@orb/client/state");
declare const contribution: ConfigSectionContribution;
const rendered = contribution.body("config-anchor-example-section");
void rendered;
// @ts-expect-error the namespace door cannot expose the raw formatter either
state.configAnchorId("appearance", "unregistered");
void configAnchorId;
