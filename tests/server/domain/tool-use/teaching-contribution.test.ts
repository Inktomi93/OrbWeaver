// domain/tool-use/teaching-contribution — the PER-TURN ATTACH of a turn host's own plugin tools (D146, the
// second door #648 opened; the first is automation's `run_tool` arm).
//
// THE ATTACH MATRIX is driven through chat's REAL collector (`collectTeaching`) over a REAL tool registry, not
// through the contribution's `collect` in isolation, because the properties that matter are properties of the
// UNION a turn actually attaches:
//   • no contributions            ⇒ `[]`, byte-identical to a turn built before this seam existed
//   • the plugin contributor      ⇒ exactly ITS names, and only for the installer whose turn it is
//   • a DEACTIVATED plugin        ⇒ its names ABSENT, and NO THROW
// That last row is the one with teeth. `resolveTools` THROWS on an unknown name at attach — its documented
// "at attach time an unknown name is OUR wiring bug" posture — so a contribution that returned a stale name
// would turn "I switched my plugin off" into a failed turn. The row below proves the union stays resolvable.

import type { Can, ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { TeachingContext } from "../../../../packages/server/src/domain/chat/contract/context.ts";
import { collectTeaching } from "../../../../packages/server/src/domain/chat/substrate/teaching.ts";
import { createChatTeachingContributions } from "../../../../packages/server/src/domain/chat/teaching-contribution.ts";
import type { PluginToolSpec } from "../../../../packages/server/src/domain/tool-use/index.ts";
import { createToolUseService, createToolUseTeachingContributions } from "../../../../packages/server/src/domain/tool-use/index.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";

type Service = ReturnType<typeof createToolUseService>;

const ALICE = makePrincipal(castId<UserId>("user_alice"), { handle: castId("alice") });
const BOB = makePrincipal(castId<UserId>("user_bob"), { handle: castId("bob") });

const allowAll: Can = (() => undefined) as Can;

/** This suite drives ONLY the tool-attach axis; chat's attribution contributor (the one db reader) stays
 *  off the db via the tctx's plane-off knob, so the registry takes an inert handle (the chat unit suite's
 *  own `UNIT_DB` spelling). */
// @orb-waive no-test-fabrication(Db): a deliberately INERT Db stand-in — nothing here may touch a database, and any collect that did would throw loudly on it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const UNIT_DB = {} as Db;

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

/** The turn's teaching input. `runAsUserId` is the turn's frozen host (D19) — the identity the attach set is
 *  resolved FOR, and the only field this contribution reads. */
function tctxFor(runAsUserId: UserId): TeachingContext {
  // knobs/prose/identity are inert for this suite — it drives ONLY the tool-attach axis (toolNames),
  // never the offer-choices teach — so the empty/off shape B1's contribution test uses is the minimal
  // valid TeachingContext here. `prose` + `identity` became REQUIRED at B1 (byte-identity of the teach text).
  // `reactionsEnabled` is OFF here BY NECESSITY, not preference (B7): this unit tier's registry closes over
  // the inert {@link UNIT_DB}, and chat's attribution contributor is the one collector that would READ it —
  // the plane knob off is what keeps every collect below db-free while the union still folds the real
  // registry. The knob steers nothing this suite asserts (the plugin attach axis is tool-use's own).
  return {
    chatId: castId<ChatId>("chat_x"),
    runAsUserId,
    knobs: { offerChoices: false, charactersCanReact: false, reactionsEnabled: false },
    prose: {},
    identity: { user: "User", char: "Aria" },
    rpgGather: null,
  };
}

/** The registry a composition root assembles: chat's own contribution (the rpg-gather projection) PLUS
 *  tool-use's — the shape `entry/compose/services.ts` builds, so the fold order is the real one. */
function registryOver(service: Service): ReturnType<typeof createChatTeachingContributions> {
  return [...createChatTeachingContributions({ db: UNIT_DB }), ...createToolUseTeachingContributions({ listDrivableToolNames: service.listDrivableToolNames })];
}

describe("the per-turn plugin-tool attach matrix", () => {
  test("NO plugin installed ⇒ the union is EMPTY — a turn is byte-identical to one built before this seam", async () => {
    const service = serviceOf();

    const collected = await collectTeaching(registryOver(service), tctxFor(ALICE.userId));

    expect(collected).toEqual({ injections: [], toolNames: [] });
  });

  test("the installer's turn attaches EXACTLY their plugin's tools", async () => {
    const service = serviceOf();
    service.registerPluginTool(pluginSpec("plugin_alice_one", ALICE));
    service.registerPluginTool(pluginSpec("plugin_alice_two", ALICE));

    const collected = await collectTeaching(registryOver(service), tctxFor(ALICE.userId));

    expect([...collected.toolNames].sort()).toEqual(["plugin_alice_one", "plugin_alice_two"]);
    // NO INJECTIONS, and that is the design rather than an omission: an attached tool ships its own
    // `description` in the request's `tools` array, which is the model's native channel for this. A prose
    // injection restating it would spend the prompt budget twice and put contributor-authored text into the
    // prompt BODY, which the wire channel does not do.
    expect(collected.injections).toEqual([]);
  });

  test("a ROOM-MATE's plugin never reaches your turn (the attach-side cross-installer refusal)", async () => {
    // Bob opening a chat must not be handed Alice's tools: he never consented to that plugin, and a call the
    // model then made would run on ALICE's grant, credentials and budget.
    const service = serviceOf();
    service.registerPluginTool(pluginSpec("plugin_alice_one", ALICE));
    service.registerPluginTool(pluginSpec("plugin_bob_one", BOB));

    expect((await collectTeaching(registryOver(service), tctxFor(BOB.userId))).toolNames).toEqual(["plugin_bob_one"]);
    expect((await collectTeaching(registryOver(service), tctxFor(ALICE.userId))).toolNames).toEqual(["plugin_alice_one"]);
  });

  test("a DEACTIVATED plugin's names are ABSENT and the union still RESOLVES — no throw, no failed turn", async () => {
    const service = serviceOf();
    service.registerPluginTool(pluginSpec("plugin_alice_one", ALICE));
    const two = service.registerPluginTool(pluginSpec("plugin_alice_two", ALICE));

    two.unregister(); // the owner switched that plugin off between turns

    const collected = await collectTeaching(registryOver(service), tctxFor(ALICE.userId));
    expect(collected.toolNames).toEqual(["plugin_alice_one"]);
    // The property the whole read-through shape exists for: what the turn attaches is still resolvable.
    // Resolved as the SAME driver the union was collected for (`tctx.runAsUserId`) — #677 keys both halves.
    expect(() => service.resolveTools(ALICE.userId, [...collected.toolNames])).not.toThrow();
    // ...and the CONTROL, so that is not vacuous: the dropped name really would have thrown at attach.
    expect(() => service.resolveTools(ALICE.userId, ["plugin_alice_two"])).toThrow();
  });

  test("the contribution folds AFTER chat's own (order), so a game's state block still leads", () => {
    const service = serviceOf();
    service.registerPluginTool(pluginSpec("plugin_alice_one", ALICE));
    const [chatOwn] = createChatTeachingContributions({ db: UNIT_DB });
    const [toolUseOwn] = createToolUseTeachingContributions({ listDrivableToolNames: service.listDrivableToolNames });

    expect(chatOwn?.order).toBe(0);
    expect(toolUseOwn?.order).toBeGreaterThan(0);
    expect(toolUseOwn?.id).toBe("tool-use.plugin-tools");
  });
});
