// resolveTools — the per-turn read surface: unknown name THROWS (attach-time = OUR wiring bug — the
// deliberate contrast with execute's errors-as-data unknown), and order = caller order (byte-stable
// request bodies).
//
// #677 made it DRIVER-SCOPED: a name resolves on the driver's own contributor shelf, falling back to the
// first-party one. The pins below are what say a name alone no longer identifies an entry — two users
// legitimately hold the same namespaced plugin tool name, and each must get THEIR copy.

import type { ParticipantRole } from "@orb/contracts/identity";
import { castId } from "@orb/kit/ids";
import { z } from "zod";
import type { PluginToolSpec } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { createToolUseService, ToolNotFoundError } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { ANY_DRIVER, defOf, execOf, makeHarness } from "../_support.ts";

const okHandler = (): Promise<{ ok: true; value: unknown }> => Promise.resolve({ ok: true, value: null });

const ALICE = makePrincipal(castId("user_alice"), { handle: castId("alice") });
const BOB = makePrincipal(castId("user_bob"), { handle: castId("bob") });

/** Two installers' copies of the SAME plugin: identical namespaced name, distinct planted behavior. */
function sharedSpec(installer: typeof ALICE, echo: string): PluginToolSpec {
  return {
    name: "plugin_shared_report",
    description: "report",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    installer,
    invoke: (): Promise<string> => Promise.resolve(echo),
    resolveInstallerRole: (): Promise<ParticipantRole | null> => Promise.resolve("host"),
  };
}

test("an unknown name THROWS ToolNotFoundError (attach-time wiring bug, not model data)", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "known", schema: z.object({}), handler: okHandler }));
  expect(() => svc.resolveTools(ANY_DRIVER, ["known", "ghost"])).toThrow(ToolNotFoundError);
});

test("set order = caller order, independent of registration order", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "b_tool", schema: z.object({}), handler: okHandler }));
  svc.register(defOf({ name: "a_tool", schema: z.object({}), handler: okHandler }));
  const set = svc.resolveTools(ANY_DRIVER, ["a_tool", "b_tool"]);
  expect(set.entries.map((entry) => entry.name)).toEqual(["a_tool", "b_tool"]);
});

test("a builtin resolves for EVERY driver — first-party tools live on the shelf everyone falls back to", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "tick_clock", schema: z.object({}), handler: okHandler }));
  expect(svc.resolveTools(ALICE.userId, ["tick_clock"]).entries).toHaveLength(1);
  expect(svc.resolveTools(BOB.userId, ["tick_clock"]).entries).toHaveLength(1);
});

test("#677: each driver resolves to THEIR OWN copy of a shared plugin tool name, not the first registered", async () => {
  // THE DEFECT PIN, at the seam that decides which code runs. Alice enables first; pre-fix Bob's activation
  // could not even register (name squatted), and the shape this replaces it with must not merely let Bob
  // register — it must route Bob's invocation to BOB's plugin. The behaviors are planted distinctly precisely
  // so a resolution that picked "whichever registered first" would be visible in the RESULT, not just the count.
  const svc = createToolUseService(makeHarness().ctx);
  svc.registerPluginTool(sharedSpec(ALICE, "alices-copy"));
  svc.registerPluginTool(sharedSpec(BOB, "bobs-copy"));

  const call = { toolCallId: "c1", name: "plugin_shared_report", arguments: "{}" };
  const forAlice = await svc.executeToolCalls(svc.resolveTools(ALICE.userId, ["plugin_shared_report"]), [call], execOf());
  const forBob = await svc.executeToolCalls(svc.resolveTools(BOB.userId, ["plugin_shared_report"]), [call], execOf());

  expect(forAlice[0]?.result).toBe("alices-copy");
  expect(forBob[0]?.result).toBe("bobs-copy");
});

test("#677: a name only ANOTHER user installed is ABSENT — never resolvable by a driver who did not install it", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.registerPluginTool(sharedSpec(ALICE, "alices-copy"));
  expect(() => svc.resolveTools(BOB.userId, ["plugin_shared_report"])).toThrow(ToolNotFoundError);
});
