// C5 — the OWNER-GLOBAL ADMISSION MATRIX: which rules `substrate/validate.ts` lets onto the chat-less lane.
// The schema was born for this (`automation_rules.chat_id`
// nullable since the D46 baseline); what landed with C5 is the verb wall coming down, and the matrix is the
// wall that replaced it — a rule that could only ever fail is never STORED (the D146-b posture applied to
// scope).
//
// WHAT THESE PINS ARE, honestly: NEW-CAPABILITY pins, not red-first defect proofs. A global mint cannot be
// EXPRESSED against the previous source — `CreateRuleParams.chatId` was `ChatId`, so a `null` here is a
// build error rather than a failing assertion, and a "red" that is a compile failure proves nothing about
// behaviour. The two claims in this lane that WERE red-firstable — the trigger tuple trailing its own bus,
// and the plugin fan-out silently dropping the two new domain facts — carry their receipts at their own
// tiers (`tests/contracts/automation/index.contract.test.ts`, `../substrate/plugin-subscribers.int.test.ts`).
//
// EVERY REFUSAL IS ASSERTED BY ITS CODE, never by its prose: `RuleValidationError.code` is the
// discriminator, and matching the message would pin copy while claiming to pin behaviour — a test that goes
// green when the right refusal is replaced by a differently-worded wrong one.
//
// The lane's DISPATCH half (a real fire with no room open, the belts, the unbound chat plane) lives at
// `../engine/dispatch.int.test.ts`, where its source does.

import type { AutomationActionInput } from "@orb/contracts/automation";
import { worldBooks } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { AutomationService } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { RuleFixture } from "../_support.ts";
import { principal, ruleFixture, seedUser } from "../_support.ts";

const DOMAIN_TRIGGER = { bus: "domain", type: "character.updated" } as const;

/** A quiet caption-mode image arm — the ONE image shape a chat-less rule may carry, and the living-library
 *  preset's own arm. */
const QUIET_PORTRAIT: AutomationActionInput = {
  type: "generate_image",
  mode: "character_multimodal",
  n: 1,
  useAvatarReference: false,
  reuse: "prefer",
  quiet: true,
};

/** The refusal CODE a rejected verb threw, or `null` when it resolved. Asserting the code rather than the
 *  message is what makes these pins about behaviour: the copy may be rewritten freely, and a DIFFERENT
 *  refusal firing in place of the intended one still reds. */
async function refusalCode(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return error instanceof DomainOperationError ? error.code : `unexpected:${error instanceof Error ? error.name : String(error)}`;
  }
}

/** Mint an owner-global rule with the given arms. `chatId: null` IS the scope. */
function mintGlobal(
  f: RuleFixture,
  actions: readonly AutomationActionInput[],
  predicateCel: string | null = null,
): ReturnType<AutomationService["createRule"]> {
  return f.svc.createRule({ principal: principal(f.host), chatId: null, name: "library rule", trigger: DOMAIN_TRIGGER, predicateCel, actions });
}

describe("C5 admission — which rules the owner-global lane accepts", () => {
  test("a chat-less rule MINTS under the author's own authority, born disabled, with no chat", async () => {
    const f = await ruleFixture();
    const view = await mintGlobal(f, [QUIET_PORTRAIT]);
    expect(view.chatId).toBeNull();
    expect(view.enabled).toBe(false); // enabling is the consent act — the same posture a room rule has.
    expect(view.trigger).toEqual(DOMAIN_TRIGGER);
    // The bus is per-CHAT, so a chat-less mint announces NOTHING. Emitting a fabricated chatId would deliver
    // one owner's private rule churn into an unrelated room (`substrate/rule-feed.ts`).
    expect(f.events).toEqual([]);
    // It reads back off the OWNER lane, not any chat's list.
    await expect(f.svc.listOwnerRules({ principal: principal(f.host) })).resolves.toHaveLength(1);
    await expect(f.svc.listRules({ principal: principal(f.host), chatId: f.chatId })).resolves.toEqual([]);
  });

  test("positions are PER-OWNER on the global lane — a second author's first rule starts at 0", async () => {
    const f = await ruleFixture();
    const other = await seedUser(f.db, "user_other");
    await expect(mintGlobal(f, [QUIET_PORTRAIT])).resolves.toMatchObject({ position: 0 });
    await expect(mintGlobal(f, [QUIET_PORTRAIT])).resolves.toMatchObject({ position: 1 });
    // `chat_id IS NULL` alone spans EVERY user's lane; without the owner predicate this would be 2, i.e. one
    // shared ever-climbing counter across a partition that is meant to be per-owner.
    const theirs = await f.svc.createRule({
      principal: principal(other),
      chatId: null,
      name: "their rule",
      trigger: DOMAIN_TRIGGER,
      actions: [QUIET_PORTRAIT],
    });
    expect(theirs.position).toBe(0);
  });

  test("the ADMISSION MATRIX refuses every chat-required arm — one row per member of the scope Record", async () => {
    const f = await ruleFixture();
    // The two the spec's §3-S3 list did NOT name — `post_notification` and `run_analysis` — are here because
    // the CODE requires a chat for both (the notice's wire `chatId`; every analysis read window is a
    // chat-scoped canon read), which is what the contracts Record now records.
    const chatRequired: readonly AutomationActionInput[] = [
      { type: "surface_quick_reply", choices: [{ label: "go", sendTemplate: "go", mode: "send" }] },
      { type: "trigger_turn", guidedTemplate: "nudge" },
      { type: "set_chat_background", instruction: "dusk" },
      { type: "run_analysis", brief: "watch the pacing", routes: { steer: { apply: "direct" } } },
    ];
    const codes = await Promise.all(chatRequired.map((action) => refusalCode(mintGlobal(f, [action]))));
    expect(codes).toEqual(chatRequired.map(() => "automation_rule_global_arm_scope"));
    // `post_notification` carries its own COOLDOWN FLOOR, which is a synchronous shape check and fires
    // first. Passing the floor is what makes this row prove the SCOPE gate rather than be shadowed by an
    // unrelated one — the refusal a test asserts must be the refusal it is about.
    const notify = await refusalCode(
      f.svc.createRule({
        principal: principal(f.host),
        chatId: null,
        name: "library rule",
        trigger: DOMAIN_TRIGGER,
        cooldownSeconds: 60,
        actions: [{ type: "post_notification", recipient: "host", messageTemplate: "hi" }],
      }),
    );
    expect(notify).toBe("automation_rule_global_arm_scope");
    // `transform_draft` is chat-required too and is refused EARLIER, by its own turnStarted-trigger shape
    // rule. The reason differs; the outcome does not — it is never stored on this lane.
    await expect(refusalCode(mintGlobal(f, [{ type: "transform_draft", target: "user_input", template: "x" }]))).resolves.toBe(
      "automation_rule_transform_trigger",
    );
  });

  test("the PLANE refinements refuse a chat-variable write the per-TYPE Record cannot express", async () => {
    const f = await ruleFixture();
    // `set_variable` and `run_tool` are chat-INDEPENDENT as arm TYPES — and both can still name the `chat`
    // variable plane, which is one room's own fold. The author's `global` plane is the chat-less one.
    await expect(refusalCode(mintGlobal(f, [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }]))).resolves.toBe(
      "automation_rule_global_arm_scope",
    );
    await expect(mintGlobal(f, [{ type: "set_variable", scope: "global", key: "k", op: "set", value: "v" }])).resolves.toMatchObject({ chatId: null });
  });

  test("a global `generate_image` is admitted ONLY quiet and ONLY in a caption mode", async () => {
    const f = await ruleFixture();
    // NON-QUIET: the default path POSTS the image into a chat as a message, and there is no chat.
    // AN EXTRACTION MODE: `character`/`scenario`/`background` build their prompt from a chat's recent
    // messages through the quiet shaper, so a chat-less rule on one would `arm_error` on every single fire —
    // the "an option that cannot work" class (#655). This is the correction to §4 row 20's own wording,
    // which named mode `character`.
    const refused = await Promise.all([
      refusalCode(mintGlobal(f, [{ ...QUIET_PORTRAIT, quiet: false }])),
      refusalCode(mintGlobal(f, [{ ...QUIET_PORTRAIT, mode: "character" }])),
      refusalCode(mintGlobal(f, [{ ...QUIET_PORTRAIT, mode: "scenario" }])),
    ]);
    expect(refused).toEqual(["automation_rule_global_arm_scope", "automation_rule_global_arm_scope", "automation_rule_global_arm_scope"]);
    // The caption modes read the subject's AVATAR and touch no chat at all.
    await expect(mintGlobal(f, [QUIET_PORTRAIT])).resolves.toMatchObject({ chatId: null });
    await expect(mintGlobal(f, [{ ...QUIET_PORTRAIT, mode: "face_multimodal" }])).resolves.toMatchObject({ chatId: null });
  });

  test("a confirm-first arm is refused — an ask with no room has no host to answer it", async () => {
    const f = await ruleFixture();
    const bookId = mintTypeId(ID_PREFIX.worldBook);
    await f.db.insert(worldBooks).values({ id: bookId, ownerId: f.host, name: "lore" });
    const lore: AutomationActionInput = { type: "insert_world_info_entry", bookId, entryKey: "k", keys: ["k"], contentTemplate: "x", confirmFirst: true };
    await expect(refusalCode(mintGlobal(f, [lore]))).resolves.toBe("automation_rule_global_arm_scope");
    // The same arm WITHOUT the flag is admissible — the refusal is about the ASK, not the act.
    await expect(mintGlobal(f, [{ ...lore, confirmFirst: false }])).resolves.toMatchObject({ chatId: null });
  });

  test("a chat-KEYED CEL root is refused at the mint, and a chat-shaped STRING LITERAL is not", async () => {
    const f = await ruleFixture();
    // The RULED chat-less env: `chat`/`vars`/`choice` stay REQUIRED on `AutomationCelEnv` — so every
    // existing preset predicate and the cel-goldens vector are untouched — and a global rule simply may not
    // NAME them. The walk is over the PARSED CEL, which is why the last case passes: a substring scan would
    // refuse a predicate whose only "chat" is inside a quoted string.
    const refused = await Promise.all([
      refusalCode(mintGlobal(f, [QUIET_PORTRAIT], "int(chat.messageCount) % 2 == 0")),
      refusalCode(mintGlobal(f, [QUIET_PORTRAIT], "has(vars.x)")),
      refusalCode(mintGlobal(f, [QUIET_PORTRAIT], 'choice["a"] == "b"')),
    ]);
    expect(refused).toEqual(["automation_rule_global_predicate_scope", "automation_rule_global_predicate_scope", "automation_rule_global_predicate_scope"]);
    await expect(mintGlobal(f, [QUIET_PORTRAIT], 'has(event.character) && event.type == "chat"')).resolves.toMatchObject({ chatId: null });
    // The SAME chat-keyed predicate is fine on a room's rule — the refusal is about scope, not about CEL.
    await expect(
      f.svc.createRule({
        principal: principal(f.host),
        chatId: f.chatId,
        name: "room rule",
        trigger: { bus: "chat", type: "messageCommitted" },
        predicateCel: "int(chat.messageCount) % 2 == 0",
        actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
      }),
    ).resolves.toMatchObject({ chatId: f.chatId });
  });

  test("the CHAT bus is refused on the global lane — v1's trigger surface is the domain bus", async () => {
    const f = await ruleFixture();
    const code = await refusalCode(
      f.svc.createRule({
        principal: principal(f.host),
        chatId: null,
        name: "global chat rule",
        trigger: { bus: "chat", type: "messageCommitted" },
        actions: [{ type: "set_variable", scope: "global", key: "k", op: "set", value: "v" }],
      }),
    );
    expect(code).toBe("automation_rule_global_trigger_bus");
  });
});

describe("C5 authority — whose lane it is", () => {
  test("another user's global rule is NOT FOUND, never forbidden — the id is no existence oracle", async () => {
    const f = await ruleFixture();
    const stranger = await seedUser(f.db, "user_stranger");
    const mine = await mintGlobal(f, [QUIET_PORTRAIT]);
    // NOT_FOUND rather than FORBIDDEN: this lane is visible to exactly one person, so the two answers must
    // be indistinguishable or a probe learns whether a given rule id exists on someone else's lane.
    const codes = await Promise.all([
      refusalCode(f.svc.setRuleEnabled({ principal: principal(stranger), ruleId: mine.id, enabled: true })),
      refusalCode(f.svc.deleteRule({ principal: principal(stranger), ruleId: mine.id })),
      refusalCode(f.svc.listFires({ principal: principal(stranger), ruleId: mine.id })),
      refusalCode(f.svc.runRuleNow({ principal: principal(stranger), ruleId: mine.id })),
    ]);
    expect(codes).toEqual(["unexpected:RuleNotFoundError", "unexpected:RuleNotFoundError", "unexpected:RuleNotFoundError", "unexpected:RuleNotFoundError"]);
    // …and the stranger's own lane is empty, which is the read half of the same partition.
    await expect(f.svc.listOwnerRules({ principal: principal(stranger) })).resolves.toEqual([]);
  });

  test("the AUTHOR drives their own global rule through the same rule verbs a room rule uses", async () => {
    const f = await ruleFixture();
    const mine = await mintGlobal(f, [QUIET_PORTRAIT]);
    await f.svc.setRuleEnabled({ principal: principal(f.host), ruleId: mine.id, enabled: true });
    const [after] = await f.svc.listOwnerRules({ principal: principal(f.host) });
    expect(after?.enabled).toBe(true);
    // The dry run works chat-lessly too: there is no chat message count to read, and the chat-keyed CEL
    // roots stay UNBOUND, so a template reaching for one previews as the error it would be at fire time.
    await expect(f.svc.testRule({ principal: principal(f.host), ruleId: mine.id })).resolves.toMatchObject({ predicate: true });
  });
});

describe("C5 preset — the living library", () => {
  test("the preset mints ONLY onto the global lane, and the mismatch is refused in BOTH directions", async () => {
    const f = await ruleFixture();
    await expect(refusalCode(f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "livingLibrary" }))).resolves.toBe(
      "automation_rule_preset_scope",
    );
    await expect(refusalCode(f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: null, presetId: "diceChips" }))).resolves.toBe(
      "automation_rule_preset_scope",
    );
    const [minted] = await f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: null, presetId: "livingLibrary" });
    expect(minted?.chatId).toBeNull();
    expect(minted?.trigger).toEqual(DOMAIN_TRIGGER); // the BUS was derived from the type, never spelled
    expect(minted?.enabled).toBe(false);
    expect(minted?.actions).toEqual([expect.objectContaining({ type: "generate_image", mode: "character_multimodal", quiet: true })]);
  });
});
