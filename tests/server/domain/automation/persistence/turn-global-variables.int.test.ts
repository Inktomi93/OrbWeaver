// A turn's `{{setglobalvar}}` writes the host's per-user global plane with the reply, and a later turn's
// `{{getglobalvar}}` reads it back, only when no text source in the prompt belongs to another account. With another
// human seated, or the room pinned to another account's persona, the plane is held: reads give nothing, writes store
// nothing, and the room is warned. A swipe upserts, a failed or cancelled turn stores nothing, and the caps drop a
// refused write without failing the turn.
// @subject packages/server/src/domain/automation/verbs/turn-global-variables.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
import {
  GLOBAL_VARIABLE_KEY_MAX_CHARS,
  GLOBAL_VARIABLE_MACRO_KEYS_MAX,
  GLOBAL_VARIABLE_TURN_WRITES_MAX,
  GLOBAL_VARIABLE_VALUE_MAX_BYTES,
} from "@orb/contracts/automation";
import type { PlainChatWarningCode } from "@orb/contracts/chat";
import { createPersonaSchema } from "@orb/contracts/persona";
import { DEFAULT_PROMPT_CONFIG, promptSectionIdSchema } from "@orb/contracts/preset";
import { globalVariables } from "@orb/db";
import type { PersonaId } from "@orb/kit/ids";
import { makePromptConfig, nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { connectDevice } from "@orb/testkit/node/composed";
import { asc, eq } from "drizzle-orm";
import { SETTINGS_ADJUSTED_CODE } from "#contracts/chat/bus.ts";
import type { CoreWireReply } from "../../chat/engine/core-physical.ts";
import { coreHeldReply, coreHttpRoom, coreProse } from "../../chat/engine/core-physical.ts";
import { attachPersonaLore, invitePerson } from "../../chat/persona-cache-physical.ts";
import { textRoom, wireOf, wireText } from "../../chat/scenario-physical.ts";

const SECTION_ID = promptSectionIdSchema.parse("global-plane");

/** A room whose preset carries `content` as its own literal section, so every turn renders it. */
async function planeRoom(content: string, replies: number): Promise<ChatRoot> {
  return await textRoom(
    Array.from({ length: replies }, () => "ok"),
    {
      promptConfig: makePromptConfig({
        sections: [{ type: "literal", id: SECTION_ID, name: "Plane", role: "system", content, enabled: true }, ...DEFAULT_PROMPT_CONFIG.sections],
      }),
    },
  );
}

/** The room's plain warning codes, collected from the live chat bus until the returned handle is disposed. The
 *  corpus provider's own settings-adjusted notices are not this file's subject. */
function warningsOf(h: ChatRoot): { readonly codes: PlainChatWarningCode[] } & Disposable {
  const codes: PlainChatWarningCode[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.type === "warning" && event.chatId === h.chatId && event.code !== SETTINGS_ADJUSTED_CODE) {
      codes.push(event.code);
    }
  });
  return { codes, [Symbol.dispose]: unsubscribe };
}

/** One send's provider request text, after the background work it schedules has settled. */
async function sentText(h: ChatRoot, principal: ChatRoot["owner"], content: string): Promise<string> {
  const { outcome, newest } = await wireOf(h, () => h.root.services.chat.send({ principal, chatId: h.chatId, content }));
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  return wireText(newest);
}

async function ownerRows(h: ChatRoot): Promise<{ readonly key: string; readonly value: string }[]> {
  return await h.root.db
    .select({ key: globalVariables.key, value: globalVariables.value })
    .from(globalVariables)
    .where(eq(globalVariables.ownerId, h.owner.userId))
    .orderBy(asc(globalVariables.key));
}

test("a solo host's setglobalvar is stored with the reply and read back by getglobalvar on a later turn", async () => {
  await using h = await planeRoom("Mood: [{{getglobalvar::mood}}]{{setglobalvar::mood::calm}}", 2);
  using warnings = warningsOf(h);

  expect(await sentText(h, h.owner, "first")).toContain("Mood: []");
  expect(await h.root.services.automation.getGlobalVariable({ principal: h.owner, key: "mood" })).toBe("calm");
  expect(await sentText(h, h.owner, "second")).toContain("Mood: [calm]");
  expect(warnings.codes).toEqual([]);
});

test("with another human seated the plane is held: no read, no write, and the room is warned", async () => {
  const content = "Mood: [{{getglobalvar::mood}}]{{setglobalvar::planted::member}}";

  // The control: the same text on a solo host's turn reads the held value and stores the write.
  await using solo = await planeRoom(content, 1);
  await solo.root.services.automation.setGlobalVariable({ principal: solo.owner, key: "mood", value: "secret" });
  using soloWarnings = warningsOf(solo);
  expect(await sentText(solo, solo.owner, "alone")).toContain("Mood: [secret]");
  expect(await ownerRows(solo)).toEqual([
    { key: "mood", value: "secret" },
    { key: "planted", value: "member" },
  ]);
  expect(soloWarnings.codes).toEqual([]);

  await using h = await planeRoom(content, 1);
  await h.root.services.automation.setGlobalVariable({ principal: h.owner, key: "mood", value: "secret" });
  const member = await invitePerson(h);
  const online = new AbortController();
  using _presence = { [Symbol.dispose]: (): void => online.abort() };
  await connectDevice(h.root, h.owner.userId, online.signal);
  await connectDevice(h.root, member.userId, online.signal);
  using warnings = warningsOf(h);

  const wire = await sentText(h, member, "member speaks");
  expect(wire).toContain("Mood: []");
  expect(wire).not.toContain("secret");
  expect(await ownerRows(h)).toEqual([{ key: "mood", value: "secret" }]);
  expect(warnings.codes).toEqual(["global_variables_held"]);
});

test("a swipe after a setglobalvar leaves one row holding the swipe's value", async () => {
  // Each render appends to what the plane held when the turn began, so the swipe's write differs from the first.
  await using h = await planeRoom("{{setglobalvar::trail::x{{getglobalvar::trail}}}}", 2);
  await sentText(h, h.owner, "go");
  expect(await ownerRows(h)).toEqual([{ key: "trail", value: "x" }]);

  const reply = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.findLast(({ role }) => role === "assistant");
  if (reply === undefined) {
    throw new Error("the send wrote no reply");
  }
  expect((await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: reply.id })).aborted).toBe(false);
  await h.root.settleBackground();
  expect(await ownerRows(h)).toEqual([{ key: "trail", value: "xx" }]);
});

test("a write a key or value check refuses is dropped and named while the turn's other writes commit", async () => {
  const longKey = "k".repeat(GLOBAL_VARIABLE_KEY_MAX_CHARS + 1);
  const bigValue = "v".repeat(GLOBAL_VARIABLE_VALUE_MAX_BYTES + 1);
  // A preset section is stored as JSON text, which spells a NUL as an escape, so the NUL reaches the macro intact.
  await using h = await planeRoom(
    [`{{setglobalvar::${longKey}::v}}`, `{{setglobalvar::big::${bigValue}}}`, "{{setglobalvar::nul::a\u0000b}}", "{{setglobalvar::kept::v}}"].join(""),
    1,
  );
  using warnings = warningsOf(h);
  await sentText(h, h.owner, "go");
  expect(await ownerRows(h)).toEqual([{ key: "kept", value: "v" }]);
  expect(warnings.codes).toEqual(["global_variable_dropped"]);
});

test("a turn stores its first distinct keys up to the turn cap and drops the rest", async () => {
  const keys = Array.from({ length: GLOBAL_VARIABLE_TURN_WRITES_MAX + 1 }, (_, i) => `turn${String(i).padStart(2, "0")}`);
  await using h = await planeRoom(keys.map((key) => `{{setglobalvar::${key}::on}}`).join(""), 1);
  using warnings = warningsOf(h);
  await sentText(h, h.owner, "go");
  expect((await ownerRows(h)).map(({ key }) => key)).toEqual(keys.slice(0, GLOBAL_VARIABLE_TURN_WRITES_MAX));
  expect(warnings.codes).toEqual(["global_variable_dropped"]);
});

test("at the owner's key total a turn may update a held key but adds no new one", async () => {
  await using h = await planeRoom("{{setglobalvar::held000::updated}}{{setglobalvar::fresh::new}}", 1);
  for (let i = 0; i < GLOBAL_VARIABLE_MACRO_KEYS_MAX; i += 1) {
    await h.root.services.automation.setGlobalVariable({ principal: h.owner, key: `held${String(i).padStart(3, "0")}`, value: "seed" });
  }
  using warnings = warningsOf(h);
  await sentText(h, h.owner, "go");
  const rows = await ownerRows(h);
  expect(rows).toHaveLength(GLOBAL_VARIABLE_MACRO_KEYS_MAX);
  expect(rows.find(({ key }) => key === "held000")).toEqual({ key: "held000", value: "updated" });
  expect(nonEmpty(rows).some(({ key }) => key === "fresh")).toBe(false);
  expect(warnings.codes).toEqual(["global_variable_dropped"]);
});

test("with another human seated a read alone still holds the plane and warns; text without a global macro does not", async () => {
  await using h = await planeRoom("Mood: [{{getglobalvar::mood}}]", 1);
  await h.root.services.automation.setGlobalVariable({ principal: h.owner, key: "mood", value: "secret" });
  const member = await invitePerson(h);
  const online = new AbortController();
  using _presence = { [Symbol.dispose]: (): void => online.abort() };
  await connectDevice(h.root, h.owner.userId, online.signal);
  using warnings = warningsOf(h);
  expect(await sentText(h, member, "member speaks")).toContain("Mood: []");
  expect(warnings.codes).toEqual(["global_variables_held"]);

  await using quiet = await planeRoom("Mood: plain.", 1);
  const quietMember = await invitePerson(quiet);
  await connectDevice(quiet.root, quiet.owner.userId, online.signal);
  using quietWarnings = warningsOf(quiet);
  expect(await sentText(quiet, quietMember, "member speaks")).toContain("Mood: plain.");
  expect(quietWarnings.codes).toEqual([]);
});

test("a continue turn commits its writes with the continuation", async () => {
  await using h = await planeRoom("{{setglobalvar::trail::x{{getglobalvar::trail}}}}", 2);
  await sentText(h, h.owner, "go");
  const reply = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.findLast(({ role }) => role === "assistant");
  if (reply === undefined) {
    throw new Error("the send wrote no reply");
  }
  expect((await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: reply.id })).aborted).toBe(false);
  await h.root.settleBackground();
  expect(await ownerRows(h)).toEqual([{ key: "trail", value: "xx" }]);
});

/** A plane room over the native HTTP edge, so a reply can fail or be held for a cancel. */
async function planeHttpRoom(content: string, replies: readonly CoreWireReply[]): Promise<ChatRoot> {
  return await coreHttpRoom(replies, {
    promptConfig: makePromptConfig({
      sections: [{ type: "literal", id: SECTION_ID, name: "Plane", role: "system", content, enabled: true }, ...DEFAULT_PROMPT_CONFIG.sections],
    }),
  });
}

test("a failed turn and a cancelled turn store none of their writes; the next committed turn does", async () => {
  const held = coreHeldReply();
  const failure = (): Response => new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 });
  await using h = await planeHttpRoom("{{setglobalvar::mood::calm}}", [failure, held.respond, (): Response => coreProse("ok")]);
  const params = { principal: h.owner, chatId: h.chatId };

  const [failed] = await Promise.allSettled([h.root.services.chat.send({ ...params, content: "first" })]);
  expect(failed.status).toBe("rejected");
  expect(await ownerRows(h)).toEqual([]);

  const running = h.root.services.chat.generate(params);
  const settled = Promise.allSettled([running]);
  try {
    await held.reached;
    await h.root.services.chat.abort(params);
    expect(await running).toMatchObject({ aborted: true });
  } finally {
    held.release();
    await settled;
  }
  expect(await ownerRows(h)).toEqual([]);

  expect((await h.root.services.chat.generate(params)).aborted).toBe(false);
  expect(await ownerRows(h)).toEqual([{ key: "mood", value: "calm" }]);
});

/** A member queues one send while the host is away, so the turn waits for the host's drain. */
async function queuedMemberTurn(h: ChatRoot): Promise<ChatRoot["owner"]> {
  const member = await invitePerson(h);
  const outcome = await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "member speaks" });
  expect(outcome.messages.map(({ role }) => role)).toEqual(["user"]);
  return member;
}

test("a drained turn holds the plane while a member is seated and stages it once only the host remains", async () => {
  const content = "{{setglobalvar::drained::yes}}";
  await using joined = await planeRoom(content, 1);
  await queuedMemberTurn(joined);
  await invitePerson(joined);
  using joinedWarnings = warningsOf(joined);
  expect(await joined.root.services.chat.drainDeferredTurns({ hostUserId: joined.owner.userId })).toEqual({ ran: 1, dropped: 0 });
  await joined.root.settleBackground();
  expect(await ownerRows(joined)).toEqual([]);
  expect(joinedWarnings.codes).toEqual(["global_variables_held"]);

  await using left = await planeRoom(content, 1);
  const member = await queuedMemberTurn(left);
  await left.root.services.chat.selfLeave({ principal: member, chatId: left.chatId });
  expect(await left.root.services.chat.drainDeferredTurns({ hostUserId: left.owner.userId })).toEqual({ ran: 1, dropped: 0 });
  await left.root.settleBackground();
  expect(await ownerRows(left)).toEqual([{ key: "drained", value: "yes" }]);
});

/** A member joins, wears a persona of their own, and the host pins the room to it. */
async function pinMemberPersona(h: ChatRoot, description: string): Promise<{ readonly member: ChatRoot["owner"]; readonly personaId: PersonaId }> {
  const member = await invitePerson(h);
  const persona = await h.root.services.persona.create({ principal: member, input: createPersonaSchema.parse({ name: "Mara", description }) });
  await h.root.services.persona.setActivePersona({ principal: member, chatId: h.chatId, personaId: persona.id });
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: persona.id });
  return { member, personaId: persona.id };
}

// The pin holds when its owner leaves (D315), and a fork carries it, so a room the host is alone in can still render a
// member's persona and its books. Those are another account's text: the plane holds for them as it does for a seat.
test("a departed member's pinned persona neither reads nor writes the host's plane", async () => {
  await using h = await textRoom(["ok", "ok"]);
  await h.root.services.automation.setGlobalVariable({ principal: h.owner, key: "mood", value: "secret" });
  const { member, personaId } = await pinMemberPersona(h, "Mara is plain.");
  await sentText(h, h.owner, "together");
  await h.root.services.chat.selfLeave({ principal: member, chatId: h.chatId });
  await h.root.services.persona.update({
    principal: member,
    personaId,
    input: { description: "Mara reads [{{getglobalvar::mood}}]{{setglobalvar::planted::by-member}}" },
  });

  const wire = await sentText(h, h.owner, "alone now");
  expect(wire).toContain("Mara reads []");
  expect(wire).not.toContain("secret");
  expect(await ownerRows(h)).toEqual([{ key: "mood", value: "secret" }]);
});

test("a departed member's pinned persona book does not write the host's plane", async () => {
  await using h = await textRoom(["ok"]);
  const { member, personaId } = await pinMemberPersona(h, "Mara is plain.");
  await attachPersonaLore(h, member, personaId, "Lore of Mara.{{setglobalvar::lore_planted::by-member-book}}");
  await h.root.services.chat.selfLeave({ principal: member, chatId: h.chatId });
  expect(await sentText(h, h.owner, "alone now")).toContain("Lore of Mara.");
  expect(await ownerRows(h)).toEqual([]);
});

test("the host's fork of a shared room carries the member's pin, and the plane holds in the fork", async () => {
  await using h = await textRoom(["ok"]);
  await pinMemberPersona(h, "Mara {{setglobalvar::fork_planted::by-member}}");
  const fork = await h.root.services.chat.forkChat({ principal: h.owner, chatId: h.chatId });
  await sentText({ ...h, chatId: fork.chat.id }, h.owner, "in the fork");
  expect(await ownerRows(h)).toEqual([]);
});

test("a departed member cannot read the host's global back through a room variable after a re-invite", async () => {
  await using h = await textRoom(["ok"]);
  await h.root.services.automation.setGlobalVariable({ principal: h.owner, key: "mood", value: "secret" });
  const { member } = await pinMemberPersona(h, "Mara {{setvar::leak::{{getglobalvar::mood}}}}");
  await h.root.services.chat.selfLeave({ principal: member, chatId: h.chatId });
  await sentText(h, h.owner, "alone now");
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  expect(await h.root.services.chat.getRuntimeVariables({ principal: member, chatId: h.chatId })).toMatchObject({ leak: "" });
});

test("the host's own pinned persona stages the plane, and a departed member's variable pick never runs as a macro", async () => {
  await using own = await textRoom(["ok"]);
  const persona = await own.root.services.persona.create({
    principal: own.owner,
    input: createPersonaSchema.parse({ name: "Host", description: "Host {{setglobalvar::own_pin::yes}}" }),
  });
  await own.root.services.persona.setActivePersona({ principal: own.owner, chatId: own.chatId, personaId: persona.id });
  await own.root.services.chat.setChatAnchorPersona({ principal: own.owner, chatId: own.chatId, personaId: persona.id });
  await sentText(own, own.owner, "alone");
  expect(await ownerRows(own)).toEqual([{ key: "own_pin", value: "yes" }]);

  await using h = await planeRoom("Pick: [{{pickx}}] [{{getvar::pickx}}]", 1);
  const member = await invitePerson(h);
  await h.root.services.chat.setVariables({ principal: member, chatId: h.chatId, values: { pickx: "{{setglobalvar::pick_planted::member}}" } });
  await h.root.services.chat.selfLeave({ principal: member, chatId: h.chatId });
  expect(await sentText(h, h.owner, "alone now")).toContain("Pick: [");
  expect(await ownerRows(h)).toEqual([]);
});
