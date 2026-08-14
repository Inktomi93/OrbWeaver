// FREEZE-AT-SELECTION (D129-F) — the swipe re-resolution the freeze provenance was stored for, at its real
// seam (`verbs/edit.ts::selectVariant`, real db, real verb bundle).
//
// THE DEFECT. Volatile macros bake ONCE, at the first user turn, into the SELECTED variant of each greeting
// row (`freezeGreetingVolatiles`, verbs/turn.ts — whose own comment names the hole: "A later swipe to an
// unfrozen alternate is not re-frozen — there is no subsequent 'first turn' to catch it"). Swipe a greeting
// after that instant and the alternate has never been through a freeze, so the literal `{{roll::1d1}}` ships
// to the model, and keeps shipping. That is the documented greeting-swipe KNOWN GAP.
//
// WHAT IS NOT THE DEFECT (checked before this suite was written, so nobody re-derives it): identity macros
// are not in the freeze set at all — `registerVolatileMacros` (kit registry.ts) registers only
// random/pick/roll and the clock family, and the volatile-only registry re-emits everything else verbatim
// (pinned by `volatile-freeze-record.suite.int.test.ts`, "an IDENTITY macro is not a freeze"). A persona
// rename therefore already reaches every stored row through `renderHistoryMacros`; there was never a frozen
// `{{user}}` to re-resolve.
//
// THE REPLAY is what makes running this on EVERY selection safe rather than only on virgin variants: an
// already-frozen variant replays its own `macro_freezes` positionally, reproduces its bytes, and writes
// nothing — so A → B → A is byte-stable (§13's swipe-determinism invariant) while B finally gets its bake.

import type { MacroFreezeRecord } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { createEdit } from "../../../../../packages/server/src/domain/chat/verbs/edit.ts";
import { scenario, tape } from "../../../../support/chat/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../_support.ts";

/** The FOREIGN-half fake the edit bundle needs — DEFAULT config only (the `edit.int.test` stub). */
const foreignInputsStub: Parameters<typeof createEdit>[1]["resolveForeignInputs"] = () =>
  Promise.resolve({ promptConfig: DEFAULT_PROMPT_CONFIG, personas: { anchor: null, active: null }, scanDepth: 6, injectionTokenBudget: 0 });

/** The persisted provenance triple, read straight off the host-plane columns (never `MessageView` — D129-F). */
async function readProvenance(
  db: Db,
  variantId: MessageVariantId,
): Promise<{ content: string; rawContent: string | null; macroFreezes: MacroFreezeRecord | null }> {
  const [row] = await db
    .select({ content: messageVariants.content, rawContent: messageVariants.rawContent, macroFreezes: messageVariants.macroFreezes })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId));
  if (row === undefined) {
    throw new Error(`no variant ${variantId}`);
  }
  return row;
}

/** A second (unselected) variant on an existing greeting slot — the alternate a later swipe lands on. */
async function seedAlternate(db: Db, messageId: MessageId, content: string): Promise<MessageVariantId> {
  const id = castId<MessageVariantId>(`variant_alt_${messageId}`);
  await db.insert(messageVariants).values({ id, messageId, idx: 1, content, createdAt: 0 });
  return id;
}

/** The room this suite drives: a greeting slot carrying a volatile alternate, with the first user turn ALREADY
 *  sent — i.e. the freeze window CLOSED, which is the whole precondition of the gap. */
async function roomPastTheWindow(alternateBody = "Alt greeting, you rolled {{roll::1d1}} for {{user}}"): Promise<{
  scn: Awaited<ReturnType<typeof scenario.chat>>;
  edit: ReturnType<typeof createEdit>;
  greeting: Awaited<ReturnType<typeof seedMessage>>;
  alternateId: MessageVariantId;
}> {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });
  const greeting = await seedMessage(scn.db, scn.chatId, 1, {
    role: "assistant",
    characterId: scn.chars[0] ?? null,
    content: "Selected greeting, you rolled {{roll::1d1}}",
  });
  const alternateId = await seedAlternate(scn.db, greeting.messageId, alternateBody);
  await scn.send("hello"); // closes the window; bakes the SELECTED variant only
  const edit = createEdit(scn.ctx, {
    emit: () => Promise.resolve(),
    resolveForeignInputs: foreignInputsStub,
    claimChat: (): Promise<void> => Promise.resolve(),
    prng: () => 0.5,
  });
  return { scn, edit, greeting, alternateId };
}

test("THE GAP: selecting an unfrozen greeting alternate after the window closed BAKES it — no literal macro reaches canon", async () => {
  const { scn, edit, greeting, alternateId } = await roomPastTheWindow();

  // Pre-state: the selected variant froze at the first turn, the alternate never did.
  expect((await readProvenance(scn.db, greeting.variantId)).content).toBe("Selected greeting, you rolled 1");
  expect((await readProvenance(scn.db, alternateId)).content).toContain("{{roll::1d1}}");

  await edit.selectVariant({ principal: scn.principal(), chatId: scn.chatId, messageId: greeting.messageId, variantId: alternateId });

  const after = await readProvenance(scn.db, alternateId);
  // The volatile is gone from canon; the IDENTITY macro is untouched (it resolves per view, forever).
  expect(after.content).toBe("Alt greeting, you rolled 1 for {{user}}");
  // …and the bake carries its provenance, exactly like the two freeze hops that already existed.
  expect(after.rawContent).toBe("Alt greeting, you rolled {{roll::1d1}} for {{user}}");
  expect(after.macroFreezes).toEqual([{ name: "roll", args: "1d1", value: "1" }]);
});

test("A → B → A is BYTE-STABLE: re-selecting the already-frozen variant replays its record and writes nothing", async () => {
  const { scn, edit, greeting, alternateId } = await roomPastTheWindow();
  const principal = scn.principal();
  const args = { principal, chatId: scn.chatId, messageId: greeting.messageId };

  const beforeA = await readProvenance(scn.db, greeting.variantId);
  await edit.selectVariant({ ...args, variantId: alternateId });
  const afterB = await readProvenance(scn.db, alternateId);
  await edit.selectVariant({ ...args, variantId: greeting.variantId });
  await edit.selectVariant({ ...args, variantId: alternateId });

  // Neither body moved on the round trip — the replay reproduced each record's own draw rather than rolling
  // again. Without the `frozenMacros` arm a re-freeze would re-draw and the swipe would rewrite settled canon.
  expect(await readProvenance(scn.db, greeting.variantId)).toEqual(beforeA);
  expect(await readProvenance(scn.db, alternateId)).toEqual(afterB);
});

test("NULL provenance with no volatiles degrades to today: no write, no provenance invented", async () => {
  const { scn, edit, greeting, alternateId } = await roomPastTheWindow("Alt greeting with {{char}} and no dice");

  await edit.selectVariant({ principal: scn.principal(), chatId: scn.chatId, messageId: greeting.messageId, variantId: alternateId });

  const after = await readProvenance(scn.db, alternateId);
  expect(after.content).toBe("Alt greeting with {{char}} and no dice");
  // The one-directional storage rule: raw is written ONLY when it differs from content.
  expect(after.rawContent).toBeNull();
  expect(after.macroFreezes).toBeNull();
});

test("THE WINDOW GATE: while the greeting window is still OPEN, selection does NOT freeze (setSeededGreeting stays usable)", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });
  const greeting = await seedMessage(scn.db, scn.chatId, 1, {
    role: "assistant",
    characterId: scn.chars[0] ?? null,
    content: "Selected greeting, you rolled {{roll::1d1}}",
  });
  const alternateId = await seedAlternate(scn.db, greeting.messageId, "Alt greeting, you rolled {{roll::1d1}}");
  const edit = createEdit(scn.ctx, {
    emit: () => Promise.resolve(),
    resolveForeignInputs: foreignInputsStub,
    claimChat: (): Promise<void> => Promise.resolve(),
    prng: () => 0.5,
  });

  // No user row yet — the first turn's own freeze will catch whatever is selected then, and `setSeededGreeting`
  // refuses a FROZEN row, so baking here would silently close a host affordance that is supposed to be open.
  await edit.selectVariant({ principal: scn.principal(), chatId: scn.chatId, messageId: greeting.messageId, variantId: alternateId });

  const after = await readProvenance(scn.db, alternateId);
  expect(after.content).toBe("Alt greeting, you rolled {{roll::1d1}}");
  expect(after.rawContent).toBeNull();

  // And the first user turn still bakes it — the gate DEFERS the freeze, it does not skip one.
  await scn.send("hello");
  expect((await readProvenance(scn.db, alternateId)).content).toBe("Alt greeting, you rolled 1");
});
