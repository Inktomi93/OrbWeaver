// @subject packages/server/src/domain/chat/verbs/edit.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
// Actual card steps create the unfrozen alternate; public selection and first-user commit own its provenance.
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { LibSqlWrap } from "@orb/db";
import { closeDb, messageVariants } from "@orb/db";
import type { MessageVariantId } from "@orb/kit/ids";
import { parseIanaTimeZone } from "@orb/kit/time";
import { createFrozenClock } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerHarnessOptions } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

const PRIMARY = "Selected greeting, you rolled {{roll::1d1}}";
const ALTERNATE = "Alt greeting, you rolled {{roll::1d1}} for {{user}}";

interface GreetingOptions extends Pick<ServerHarnessOptions, "db"> {
  readonly windowClosed?: boolean;
}

async function room(
  primary = PRIMARY,
  alternate = ALTERNATE,
  options: GreetingOptions = {},
): Promise<
  AsyncDisposable & {
    readonly h: Awaited<ReturnType<typeof textRoom>>;
    readonly chatId: Awaited<ReturnType<typeof textRoom>>["chatId"];
    readonly greeting: Awaited<ReturnType<Awaited<ReturnType<typeof textRoom>>["root"]["services"]["chat"]["setSeededGreeting"]>>;
    readonly primaryId: MessageVariantId;
    readonly alternateId: MessageVariantId;
  }
> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await textRoom(["ok"], {
      server: { clock: createFrozenClock(Date.UTC(2026, 0, 15, 20, 0)), ...(options.db === undefined ? {} : { db: options.db }) },
      characters: [
        createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight.", greetings: [{ text: primary }, { text: alternate }] }),
      ],
    }),
  );
  const started = await h.caller.chat.startChat({ characterIds: h.characters.map(({ id }) => id), opening: "first-message" });
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the actual character card produced no opening");
  }
  const chatId = started.chat.id;
  const args = { principal: h.owner, chatId, messageId: greeting.id };
  // A real authored edit must survive beside a later card step, which legitimately appends a sibling.
  await h.root.services.chat.editMessage({ ...args, content: "An authored greeting distinct from both card texts." });
  const next = await h.root.services.chat.setSeededGreeting({ ...args, greetingIndex: 1 });
  expect(next.selectedVariantId).not.toBe(greeting.selectedVariantId);
  await h.root.services.chat.selectVariant({ ...args, variantId: greeting.selectedVariantId });
  await h.root.services.chat.editMessage({ ...args, content: primary });
  if (options.windowClosed !== false) {
    await h.root.services.chat.commitMessage({ principal: h.owner, chatId, content: "hello" });
  }
  const lifetime = construction.move();
  return {
    h,
    chatId,
    greeting,
    primaryId: greeting.selectedVariantId,
    alternateId: next.selectedVariantId,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

async function select(f: Awaited<ReturnType<typeof room>>, variantId: MessageVariantId): Promise<void> {
  await f.h.root.services.chat.selectVariant({ principal: f.h.owner, chatId: f.chatId, messageId: f.greeting.id, variantId });
}

async function provenance(
  f: Awaited<ReturnType<typeof room>>,
  variantId: MessageVariantId,
): Promise<Pick<typeof messageVariants.$inferSelect, "content" | "rawContent" | "macroFreezes">> {
  const row = await f.h.root.db
    .select({ content: messageVariants.content, rawContent: messageVariants.rawContent, macroFreezes: messageVariants.macroFreezes })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId))
    .get();
  if (row === undefined) {
    throw new Error("the actual greeting has no persisted variant");
  }
  return row;
}

test("THE GAP: selecting an unfrozen greeting alternate after the window closed BAKES it — no literal macro reaches canon", async () => {
  await using f = await room();
  expect((await provenance(f, f.primaryId)).content).toBe("Selected greeting, you rolled 1");
  expect((await provenance(f, f.alternateId)).content).toContain("{{roll::1d1}}");
  await select(f, f.alternateId);
  expect(await provenance(f, f.alternateId)).toEqual({
    content: "Alt greeting, you rolled 1 for {{user}}",
    rawContent: ALTERNATE,
    macroFreezes: [{ name: "roll", args: "1d1", value: "1" }],
  });
});

test("A → B → A is BYTE-STABLE: re-selecting the already-frozen variant replays its record and writes nothing", async () => {
  await using f = await room();
  const beforeA = await provenance(f, f.primaryId);
  await select(f, f.alternateId);
  const afterB = await provenance(f, f.alternateId);
  await select(f, f.primaryId);
  await select(f, f.alternateId);
  expect(await provenance(f, f.primaryId)).toEqual(beforeA);
  expect(await provenance(f, f.alternateId)).toEqual(afterB);
});

test("NULL provenance with no volatiles degrades to today: no write, no provenance invented", async () => {
  await using f = await room(PRIMARY, "Alt greeting with {{char}} and no dice");
  await select(f, f.alternateId);
  expect(await provenance(f, f.alternateId)).toEqual({ content: "Alt greeting with {{char}} and no dice", rawContent: null, macroFreezes: null });
});

test("THE WINDOW GATE: while the greeting window is still OPEN, selection does NOT freeze (setSeededGreeting stays usable)", async () => {
  await using f = await room(PRIMARY, ALTERNATE, { windowClosed: false });
  await select(f, f.alternateId);
  expect(await provenance(f, f.alternateId)).toEqual({ content: ALTERNATE, rawContent: null, macroFreezes: null });
  await f.h.root.services.chat.setSeededGreeting({ principal: f.h.owner, chatId: f.chatId, messageId: f.greeting.id, greetingIndex: 1 });
  await f.h.root.services.chat.commitMessage({ principal: f.h.owner, chatId: f.chatId, content: "hello" });
  expect((await provenance(f, f.alternateId)).content).toBe("Alt greeting, you rolled 1 for {{user}}");
});

test("a baked clock is the viewer's: the first user line and a later selection freeze `{{time}}` in the zone each request carried", async () => {
  await using f = await room("Selected at {{time}}", "Alternate at {{time}}", { windowClosed: false });
  const kathmandu = parseIanaTimeZone("Asia/Kathmandu");
  if (kathmandu === null) {
    throw new Error("the platform does not recognize Asia/Kathmandu");
  }
  await f.h.root.services.chat.commitMessage({ principal: f.h.owner, chatId: f.chatId, content: "hello", timeZone: kathmandu });
  expect((await provenance(f, f.primaryId)).content).toBe("Selected at 01:45:00");
  await f.h.root.services.chat.selectVariant({
    principal: f.h.owner,
    chatId: f.chatId,
    messageId: f.greeting.id,
    variantId: f.alternateId,
    timeZone: kathmandu,
  });
  expect((await provenance(f, f.alternateId)).content).toBe("Alternate at 01:45:00");
});

interface PersonaRead {
  readonly sql: string;
  readonly values: readonly string[];
}

function stringBindings(bindings: Parameters<Parameters<LibSqlWrap>[0]["execute"]>[1]): readonly string[] {
  return (Array.isArray(bindings) ? bindings : Object.values(bindings ?? {})).filter((value): value is string => typeof value === "string");
}

function personaReads(): { readonly wrap: LibSqlWrap; readonly watch: () => void; readonly observations: () => readonly PersonaRead[] } {
  const observations: PersonaRead[] = [];
  let watching = false;
  const wrap: LibSqlWrap = (client) => {
    const execute = client.execute.bind(client);
    client.execute = async (statement: Parameters<typeof client.migrate>[0][number], args?: Parameters<typeof execute>[1]): ReturnType<typeof execute> => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      const bindings = typeof statement === "string" ? args : statement.args;
      const result = typeof statement === "string" ? await execute(statement, args) : await execute(statement);
      if (watching && sql.includes('from "personas"') && sql.includes('"personas"."owner_id" in (')) {
        observations.push({
          sql,
          values: stringBindings(bindings),
        });
      }
      return result;
    };
    return client;
  };
  return {
    wrap,
    watch: (): void => {
      observations.length = 0;
      watching = true;
    },
    observations: () => observations,
  };
}

async function consentRoom(enabled: boolean): Promise<
  Awaited<ReturnType<typeof room>> & {
    readonly member: Awaited<ReturnType<typeof room>>["h"]["owner"];
    readonly reads: ReturnType<typeof personaReads>;
  }
> {
  await using construction = new AsyncDisposableStack();
  const reads = personaReads();
  const db = await freshDb(reads.wrap);
  construction.defer(() => closeDb(db));
  const f = construction.use(await room(PRIMARY, ALTERNATE, { db, windowClosed: false }));
  const hostPersona = await f.h.root.services.persona.create({
    principal: f.h.owner,
    input: createPersonaSchema.parse({ name: "Host witness", description: "The host persona participates in the room." }),
  });
  await f.h.root.services.persona.setActivePersona({ principal: f.h.owner, chatId: f.chatId, personaId: hostPersona.id });
  const member = await f.h.root.principalFor((await f.h.root.actor()).id);
  const memberPersona = await f.h.root.services.persona.create({
    principal: member,
    input: createPersonaSchema.parse({ name: "Member witness", description: "The member persona participates only while enabled." }),
  });
  const invite = await f.h.root.services.chat.createInvite({ principal: f.h.owner, chatId: f.chatId, input: { invitedHandle: member.handle } });
  await f.h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  await f.h.root.services.persona.setActivePersona({ principal: member, chatId: f.chatId, personaId: memberPersona.id });
  await f.h.root.services.admin.setEnabled({ principal: f.h.owner, userId: member.userId, enabled });
  const lifetime = construction.move();
  return { ...f, member, reads, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

function expectConsentReads(f: Awaited<ReturnType<typeof consentRoom>>, enabled: boolean): void {
  const reads = f.reads.observations();
  expect(reads.length).toBeGreaterThan(0);
  const expected = (enabled ? [f.h.owner.userId, f.member.userId] : [f.h.owner.userId]).toSorted();
  for (const read of reads) {
    expect(read.sql).toMatch(/from "personas"[\s\S]*"personas"\."owner_id" in \(/u);
    expect(read.values.filter((value) => value === f.h.owner.userId || value === f.member.userId).toSorted()).toEqual(expected);
  }
}

test.for([true, false])("selection uses actual persona owner consent with member enabled=%s", async (enabled) => {
  await using f = await consentRoom(enabled);
  await f.h.root.services.chat.commitMessage({ principal: f.h.owner, chatId: f.chatId, content: "hello" });
  f.reads.watch();
  await select(f, f.alternateId);
  expectConsentReads(f, enabled);
  expect(await provenance(f, f.alternateId)).toEqual({
    content: "Alt greeting, you rolled 1 for {{user}}",
    rawContent: ALTERNATE,
    macroFreezes: [{ name: "roll", args: "1d1", value: "1" }],
  });
});

test.for([true, false])("send uses actual persona owner consent with member enabled=%s", async (enabled) => {
  await using f = await consentRoom(enabled);
  f.reads.watch();
  const outcome = await f.h.root.services.chat.send({ principal: f.h.owner, chatId: f.chatId, content: "hello" });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  expect(outcome.messages[0]).toMatchObject({ authorUserId: f.h.owner.userId, content: "hello" });
  expectConsentReads(f, enabled);
  expect((await provenance(f, f.primaryId)).content).toBe("Selected greeting, you rolled 1");
});
