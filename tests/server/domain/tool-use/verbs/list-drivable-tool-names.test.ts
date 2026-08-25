// listDrivableToolNames — the ENUMERATION half of direct-drive reachability (D146). Its one consumer is the
// per-turn attach contribution (`domain/tool-use/teaching-contribution.ts`), which asks "what does THIS turn's
// host have?" and therefore cannot use the test half.
//
// The load-bearing property is that it is a LIVE READ. `resolveTools` THROWS on an unknown name at attach —
// its documented "at attach time this is OUR wiring bug" posture — so if this list could ever name a tool the
// registry no longer holds, an ordinary "I switched my plugin off" would become a FAILED TURN. These pins are
// what say it cannot.

import type { Can, ParticipantRole } from "@orb/contracts/identity";
import { castId } from "@orb/kit/ids";
import { z } from "zod";
import type { PluginToolSpec } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { createToolUseService } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { defOf } from "../_support.ts";

type Service = ReturnType<typeof createToolUseService>;

const ALICE = makePrincipal(castId("user_alice"), { handle: castId("alice") });
const BOB = makePrincipal(castId("user_bob"), { handle: castId("bob") });

const allowAll: Can = (() => undefined) as Can;

function serviceOf(): Service {
  return createToolUseService({ can: allowAll, clock: (): number => FROZEN_AT_MS });
}

function pluginSpec(name: string, installer: typeof ALICE): PluginToolSpec {
  return {
    name,
    description: "a guest tool",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    installer,
    invoke: (): Promise<string> => Promise.resolve("ok"),
    resolveInstallerRole: (): Promise<ParticipantRole | null> => Promise.resolve("host"),
  };
}

test("an empty registry lists NOTHING for anyone — the byte-identical no-attach case", () => {
  const service = serviceOf();
  expect(service.listDrivableToolNames(ALICE.userId)).toEqual([]);
});

test("builtins are never listed — only contributor tools ride this seam", () => {
  // A builtin reaches a turn through its OWN domain's teaching contribution, which is the seam that knows what
  // it needs (rpg's tools need a turn id; this seam has no turn). Listing it here would attach it to every
  // turn of every user, which is neither its owner's decision nor this file's to make.
  const service = serviceOf();
  service.register(defOf({ name: "tick_clock", schema: z.object({}), handler: () => Promise.resolve({ ok: true, value: 1 }) }));
  expect(service.listDrivableToolNames(ALICE.userId)).toEqual([]);
});

test("each installer sees exactly their OWN plugin's tools — never a room-mate's", () => {
  // The attach-side twin of the cross-installer refusal. Without it, Bob opening a chat would put Alice's
  // plugin tools in front of HIS model, teaching him a capability he never installed and offering the model a
  // call that would then run on Alice's grant.
  const service = serviceOf();
  service.registerPluginTool(pluginSpec("plugin_alice_one", ALICE));
  service.registerPluginTool(pluginSpec("plugin_alice_two", ALICE));
  service.registerPluginTool(pluginSpec("plugin_bob_one", BOB));

  expect([...service.listDrivableToolNames(ALICE.userId)].sort()).toEqual(["plugin_alice_one", "plugin_alice_two"]);
  expect(service.listDrivableToolNames(BOB.userId)).toEqual(["plugin_bob_one"]);
});

test("a DEACTIVATED plugin's tools drop out of the list, and every listed name still RESOLVES", () => {
  // The two halves of "attach can never hand `resolveTools` a ghost", proven together: the name disappears on
  // unregister, and everything the list DOES return survives the attach-time resolve that throws on a miss.
  const service = serviceOf();
  service.registerPluginTool(pluginSpec("plugin_alice_one", ALICE));
  const two = service.registerPluginTool(pluginSpec("plugin_alice_two", ALICE));

  expect(() => service.resolveTools(ALICE.userId, [...service.listDrivableToolNames(ALICE.userId)])).not.toThrow();

  two.unregister();
  expect(service.listDrivableToolNames(ALICE.userId)).toEqual(["plugin_alice_one"]);
  // The whole point: the list is a live read, so what it returns is still resolvable AFTER the deactivation.
  expect(() => service.resolveTools(ALICE.userId, [...service.listDrivableToolNames(ALICE.userId)])).not.toThrow();
  // ...and the CONTROL, so the assertion above is not passing vacuously: the dropped name really would throw.
  expect(() => service.resolveTools(ALICE.userId, ["plugin_alice_two"])).toThrow();
});

test("the enumerate→resolve pair agrees on the DRIVER — Bob cannot resolve a name only Alice's list carries", () => {
  // #677 completes the round trip. `listDrivableToolNames` was already per-user; `resolveTools` was not, so a
  // name enumerated for Alice used to resolve for anybody who could utter it. Now the two halves are keyed the
  // same way, which is what makes "the attach union is the HOST's" true at the resolve step and not just at the
  // enumerate step.
  const service = serviceOf();
  service.registerPluginTool(pluginSpec("plugin_alice_one", ALICE));
  expect(() => service.resolveTools(ALICE.userId, ["plugin_alice_one"])).not.toThrow();
  expect(() => service.resolveTools(BOB.userId, ["plugin_alice_one"])).toThrow();
});
