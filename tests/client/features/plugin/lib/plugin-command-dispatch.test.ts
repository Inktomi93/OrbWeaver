// Unit tests for the #791 composer typed-arg grammar + completion (pure parsers, no React): the `name=value` /
// positional PARSE the composer dispatch feeds `coercePluginCommandArgs`, the `<slug> <cmd>` arg-context split,
// and the arg-name-hint / enum-value-completion offers the composer's arg strip renders.

import type { PluginCommandArgSpec } from "@orb/contracts/plugin";
import {
  parseCommandArgInputs,
  parsePluginArgContext,
  parsePluginCommand,
  pluginCommandArgOffers,
} from "../../../../../packages/client/src/features/plugin/lib/plugin-command-dispatch.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const SPECS: readonly PluginCommandArgSpec[] = [
  { name: "suit", type: "enum", required: true, enumValues: ["cups", "wands", "swords"] },
  { name: "count", type: "number" },
  { name: "reversed", type: "boolean" },
];

test("parsePluginCommand splits <slug> <name> <rest>, preserving the rest's internal spacing", () => {
  expect(parsePluginCommand("oracle-deck draw two of cups")).toEqual({ slug: "oracle-deck", name: "draw", args: "two of cups" });
  expect(parsePluginCommand("oracle-deck")).toEqual({ slug: "oracle-deck", name: "", args: "" });
  expect(parsePluginCommand("")).toEqual({ slug: "", name: "", args: "" });
});

test("parseCommandArgInputs binds name=value, honors quotes, and fills positionals in declaration order", () => {
  // Named binds by name; a quoted value keeps its spaces; an unknown name falls through to positional.
  expect(parseCommandArgInputs(SPECS, "count=3 suit=cups")).toEqual({ count: "3", suit: "cups" });
  // Positionals fill the declared args (suit, then count) not already named.
  expect(parseCommandArgInputs(SPECS, "cups 3")).toEqual({ suit: "cups", count: "3" });
  // A named arg + a positional: the positional skips the already-named arg.
  expect(parseCommandArgInputs(SPECS, "suit=wands 5")).toEqual({ suit: "wands", count: "5" });
  // Quoted value with spaces stays one value.
  expect(parseCommandArgInputs([{ name: "label", type: "string" }], 'label="two words"')).toEqual({ label: "two words" });
});

test("parsePluginArgContext returns the command context only once a command token is complete", () => {
  // Still typing the command token (no trailing space) — no arg context yet.
  expect(parsePluginArgContext("oracle draw")).toBeNull();
  // A trailing space after the command → args have begun.
  expect(parsePluginArgContext("oracle draw ")).toEqual({ slug: "oracle", name: "draw", prefix: "oracle draw", rest: " " });
  expect(parsePluginArgContext("oracle draw suit=cu")).toEqual({ slug: "oracle", name: "draw", prefix: "oracle draw", rest: " suit=cu" });
});

test("pluginCommandArgOffers hints the declared arg NAMES, filtered by the partial and by what's already named", () => {
  // Fresh args (trailing space) — every declared arg is offered, each inserting `<prefix> name=`.
  const fresh = pluginCommandArgOffers(SPECS, "oracle draw", " ");
  expect(fresh.map((o) => o.label)).toEqual(["suit", "count", "reversed"]);
  expect(fresh[0]?.insert).toBe("oracle draw suit=");
  // A partial arg name filters, and an already-named arg drops out.
  const filtered = pluginCommandArgOffers(SPECS, "oracle draw", " suit=cups co");
  expect(filtered.map((o) => o.label)).toEqual(["count"]);
  expect(filtered[0]?.insert).toBe("oracle draw suit=cups count=");
});

test("pluginCommandArgOffers completes ENUM VALUES when mid-typing argname=<partial>", () => {
  const offers = pluginCommandArgOffers(SPECS, "oracle draw", " suit=w");
  expect(offers.map((o) => o.label)).toEqual(["Wands"]);
  expect(offers[0]?.insert).toBe("oracle draw suit=wands");
  // A prior arg survives the completion of a later enum value.
  const withPrior = pluginCommandArgOffers(SPECS, "oracle draw", " count=3 suit=s");
  expect(withPrior[0]?.insert).toBe("oracle draw count=3 suit=swords");
  // A non-enum arg mid-`=` offers nothing (there is nothing to enumerate).
  expect(pluginCommandArgOffers(SPECS, "oracle draw", " count=1")).toEqual([]);
});
