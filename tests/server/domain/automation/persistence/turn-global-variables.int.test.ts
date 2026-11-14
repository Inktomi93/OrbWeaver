// A turn's `{{setglobalvar}}` writes the host's per-user global plane with the reply, and a later turn's
// `{{getglobalvar}}` reads it back, only while the host is the room's one present human. With another human seated the
// plane is held: reads give nothing, writes store nothing, and the room is warned. A swipe upserts, and the caps drop a
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
import type { ChatBusEvent } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG, promptSectionIdSchema } from "@orb/contracts/preset";
import { globalVariables } from "@orb/db";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { connectDevice } from "@orb/testkit/node/composed";
import { asc, eq } from "drizzle-orm";
import { invitePerson } from "../../chat/persona-cache-physical.ts";
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

type PlainWarningCode = Exclude<Extract<ChatBusEvent, { readonly type: "warning" }>["code"], "settings_adjusted">;

/** The room's plain warning codes, collected from the live chat bus until the returned handle is disposed. The
 *  corpus provider's own `settings_adjusted` notices are not this file's subject. */
function warningsOf(h: ChatRoot): { readonly codes: PlainWarningCode[] } & Disposable {
  const codes: PlainWarningCode[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.type === "warning" && event.chatId === h.chatId && event.code !== "settings_adjusted") {
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
  expect(rows.some(({ key }) => key === "fresh")).toBe(false);
  expect(warnings.codes).toEqual(["global_variable_dropped"]);
});
