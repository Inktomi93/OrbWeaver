// isToolDrivableBy — the DIRECT-DRIVE reachability predicate (D146). "May this USER point at this tool by
// name" is a different question from "may this CALL run", and these pins are what keep them different: the
// invocation ceiling (PL-C, pinned in `register-plugin-tool.test.ts`) asks whether the INSTALLER may act in the
// room a tool was called from, and would happily let user A's rule drive user B's plugin tool in any room they
// share. This predicate is what refuses that.
//
// Consumers: automation's `run_tool` MINT gate (false ⇒ the rule is never stored) and its per-fire PAUSE gate
// (false ⇒ the rule pauses, spending no error budget). Both meanings of `false` are proven here as one
// predicate so the two gates can never answer differently.

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

test("a plugin tool is drivable by its INSTALLER and by nobody else", () => {
  // THE CROSS-INSTALLER PIN, and the reason this predicate exists at all. Consent to install is PER-OWNER:
  // Alice granted `tools.register` to her plugin, on her credentials and her budget. If Bob could name
  // `plugin_alice_report` in a rule he authors, Bob would be spending Alice's grant on his own say-so — and
  // PL-C would not stop him, because PL-C only asks whether ALICE may act in the room, which she may whenever
  // she is a present member of it (a shared group chat is enough).
  const service = serviceOf();
  service.registerPluginTool(pluginSpec("plugin_alice_report", ALICE));

  expect(service.isToolDrivableBy("plugin_alice_report", ALICE.userId)).toBe(true);
  expect(service.isToolDrivableBy("plugin_alice_report", BOB.userId)).toBe(false);
});

test("#677: when BOTH users installed the same plugin, each drives their OWN copy and the answer stays per-user", () => {
  // The shared-name form of the pin above, and the case the `run_tool` mint/pause gate now meets routinely: the
  // seeded example plugins install for every user, so `plugin_<slug>_<name>` is held once per installer. The
  // predicate must key on the ASKING user's shelf — a name-only lookup would answer from whichever copy
  // registered first, which is `true` for its installer and, worse, a coin flip for everyone else.
  const service = serviceOf();
  service.registerPluginTool(pluginSpec("plugin_shared_report", ALICE));
  service.registerPluginTool(pluginSpec("plugin_shared_report", BOB));

  expect(service.isToolDrivableBy("plugin_shared_report", ALICE.userId)).toBe(true);
  expect(service.isToolDrivableBy("plugin_shared_report", BOB.userId)).toBe(true);
  // …and a third party who installed neither copy is still refused — the rule author's typed refusal
  // (`createRule` turns this `false` into one) does not soften just because the name is popular.
  expect(service.isToolDrivableBy("plugin_shared_report", castId("user_carol"))).toBe(false);
});

test("a BUILTIN tool is drivable by NOBODY — first-party tools reach a turn through their own domain's seam", () => {
  // The deliberate v1 narrowing (`substrate/reachability.ts` carries the two receipts: the rpg builtins refuse
  // off a turn already, and imagery's builtin IS the `generate_image` arm). A builtin's owner is `null` and no
  // UserId equals null, so the narrowing is structural rather than a list someone must remember to update.
  const service = serviceOf();
  service.register(defOf({ name: "tick_clock", schema: z.object({}), handler: () => Promise.resolve({ ok: true, value: 1 }) }));

  expect(service.isToolDrivableBy("tick_clock", ALICE.userId)).toBe(false);
  expect(service.isToolDrivableBy("tick_clock", BOB.userId)).toBe(false);
});

test("an unregistered name is never drivable — the MINT gate's typo answer", () => {
  // This is the `false` automation's `createRule` turns into a typed refusal. Note it is NOT distinguishable
  // here from the deactivated case below, and it does not need to be: the mint gate refuses the rule, so a
  // stored rule's later `false` can only ever mean "it went away".
  const service = serviceOf();
  expect(service.isToolDrivableBy("plugin_never_installed", ALICE.userId)).toBe(false);
});

test("deactivation makes it undrivable, and re-activation makes it drivable again — the PAUSE gate's two directions", () => {
  // D146-d's self-healing property, at the level it is actually implemented: the predicate reads the LIVE
  // registry, and a plugin's deactivation `unregister`s its tools. Nothing is cached and nothing is stored, so
  // "resumes when the plugin is re-enabled" is not a repair step — it is the absence of one.
  const service = serviceOf();
  const handle = service.registerPluginTool(pluginSpec("plugin_alice_report", ALICE));
  expect(service.isToolDrivableBy("plugin_alice_report", ALICE.userId)).toBe(true);

  handle.unregister();
  expect(service.isToolDrivableBy("plugin_alice_report", ALICE.userId)).toBe(false);

  service.registerPluginTool(pluginSpec("plugin_alice_report", ALICE));
  expect(service.isToolDrivableBy("plugin_alice_report", ALICE.userId)).toBe(true);
});
