// The chat-ROW lifecycle + variables + persisted injections (chat.md Part III §11). Proves against a real
// libSQL db: the host-authority gate, the row writes, the variables round-trip (config plane), the injections
// CRUD, and the emitted bus events. Reached through the BUNDLE `createChatLifecycle(ctx, { emit })`.

import process from "node:process";
import type { DurableChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ChoiceBlockSpec, UserMacroSpec } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { chatEvents, chatInjections, chats } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns.ts";
import { createChatBus } from "../../../../../packages/server/src/domain/chat/bus.ts";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import type { ActiveTurns } from "../../../../../packages/server/src/domain/chat/contract/active-turns.ts";
import type { ClaimChatOp } from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { loadStoredUserMacroValues } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createChatLifecycle } from "../../../../../packages/server/src/domain/chat/verbs/chat-lifecycle.ts";
import { scenario } from "../../../../support/chat/scenario.ts";
import { tape } from "../../../../support/chat/tape.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, noClaim, seedChat, seedParticipant, seedPersona, seedUser } from "../_support.ts";

let db: Db;
let emitted: DurableChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

const emit = (event: DurableChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

/** The bundle deps: the recorder emit + a private (empty) turn registry. `delete` sweeps the registry, so the
 *  delete-mid-turn arm below wires the SCENARIO's live one instead. */
function lifecycleDeps(): { emit: typeof emit; activeTurns: ActiveTurns; claimChat: ClaimChatOp } {
  return { emit, activeTurns: createActiveTurns(), claimChat: noClaim };
}

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** Seed a room with a host + a plain member; returns their ids + the chat id. */
async function seedRoom(): Promise<{
  host: UserId;
  member: UserId;
  chatId: Awaited<ReturnType<typeof seedChat>>;
}> {
  const host = await seedUser(db, castId<Handle>("host"));
  const member = await seedUser(db, castId<Handle>("member"));
  const chatId = await seedChat(db, "a");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  return { host, member, chatId };
}

describe("chat-row flags (host-only)", () => {
  test("updateTitle writes the row + emits chatUpdated; a member is refused", async () => {
    const { host, member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    await life.updateTitle({ principal: principal(host), chatId, title: "Renamed" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.title).toBe("Renamed");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);

    const err = await life.updateTitle({ principal: principal(member), chatId, title: "no" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("archive + star toggle the row flags", async () => {
    const { host, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    await life.archive({ principal: principal(host), chatId, archived: true });
    await life.star({ principal: principal(host), chatId, starred: true });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.archived).toBe(true);
    expect(row?.starred).toBe(true);
  });

  test("delete drops the chat + emits chatDeleted + writes the chat.delete audit row", async () => {
    const { host, chatId } = await seedRoom();
    const audits: AuditEntry[] = [];
    const life = createChatLifecycle(
      makeChatContext(db, {
        audit: (entry): Promise<void> => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      lifecycleDeps(),
    );

    await life.delete({ principal: principal(host), chatId });
    const rows = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(rows).toHaveLength(0);
    expect(emitted).toEqual([{ type: "chatDeleted", chatId }]);
    // The best-effort forensic row (entity_id is the D24-sanctioned soft ref — it outlives the chat).
    expect(audits).toEqual([{ actorUserId: host, action: "chat.delete", entityType: "chat", entityId: chatId }]);
  });

  // The observed production crash (server.log 12:45:05Z / 12:47:54Z): deleting a chat mid-turn left the
  // in-flight turn streaming, its next `delta` INSERT tripped the `chat_events.chat_id` FK, and the
  // fire-and-forget emit's rejection was UNHANDLED — the node process exited for every user. The fix is both
  // halves: `delete` ABORTS the room's turns (source) and the bus emit is TOTAL (floor).
  test("deleting a chat mid-turn: the streaming turn is aborted, the post-delete delta is dropped (no unhandled rejection), and the process survives", async () => {
    let sawFirstDelta!: () => void;
    const streaming = new Promise<void>((resolve) => {
      sawFirstDelta = resolve;
    });
    let deleteDone!: () => void;
    const deleted = new Promise<void>((resolve) => {
      deleteDone = resolve;
    });
    // The scripted role stream, PARKED mid-turn: chunk 1 streams while the chat is alive, chunk 2 + the
    // terminal `final` only resume AFTER the chat row is gone — the exact interleaving that crashed.
    async function* gatedStream(): AsyncGenerator<TurnStreamChunk> {
      yield { kind: "text", text: "hel" };
      sawFirstDelta();
      await deleted;
      yield { kind: "text", text: "lo" };
      yield { kind: "final", economics: { content: "hello", tokensIn: 4, tokensOut: 2, model: "test-model" } };
    }
    // The REAL durable bus (not the recorder) — this test exists to exercise the `chat_events` FK itself.
    const bus = createChatBus(makeChatContext(db));
    const sc = await scenario.chat(tape(), { db, emit: bus.emit, ctx: { runChatTurn: () => gatedStream() } });
    // The verb emits through the SAME durable bus the turn does — `chatDeleted` is itself an append into the
    // chat it is deleting, so its ordering against the row drop is part of what this test pins.
    const life = createChatLifecycle(makeChatContext(db), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit: async (event: DurableChatBusEvent): Promise<void> => {
        await bus.emit(event);
      },
      activeTurns: sc.activeTurns,
    });
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    const sending = sc.send("hi");
    await streaming;
    expect(sc.activeTurns.countActive(sc.chatId)).toBe(1);

    await life.delete({ principal: sc.principal(), chatId: sc.chatId });
    deleteDone();
    const outcome = await sending;
    // Let any rejection the fire-and-forget emits produced reach the process handler.
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", onUnhandled);

    // THE bug: a single racing emit must never reach the process as an unhandled rejection.
    expect(rejections).toEqual([]);
    // The turn TERMINATED (aborted) instead of running to completion against a dead chat — and it committed
    // no canon into the deleted room.
    expect(outcome.aborted).toBe(true);
    expect(sc.activeTurns.countActive(sc.chatId)).toBe(0);
    expect(await sc.loadCanon()).toEqual([]);
    // The row is gone and no orphan event survived (`chatDeleted` rode the cascade, as it must).
    expect(await db.select().from(chats).where(eq(chats.id, sc.chatId))).toEqual([]);
    expect(await db.select().from(chatEvents).where(eq(chatEvents.chatId, sc.chatId))).toEqual([]);
    // `chatDeleted` was still DELIVERED: it is emitted before the row drop, so it got a real durable seq and
    // reached the ring the transport fans from (emitting after the delete would silently drop it).
    // (Ring ORDER is not asserted: the in-flight delta emits are fire-and-forget, so one can settle after it.)
    expect(bus.readRing(sc.chatId).map((e) => e.event)).toContainEqual({ type: "chatDeleted", chatId: sc.chatId });
  });

  test("a member's refused delete writes NO audit row (existence-before-audit order)", async () => {
    const { member, chatId } = await seedRoom();
    const audits: AuditEntry[] = [];
    const life = createChatLifecycle(
      makeChatContext(db, {
        audit: (entry): Promise<void> => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      lifecycleDeps(),
    );

    await life.delete({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(audits).toEqual([]);
  });
});

describe("setChatAnchorPersona — the manual/host Anchor re-pin (#4, FINAL-Persona §A.6b gap #2)", () => {
  test("host re-pins to a present human's persona; emits chatUpdated; a member is refused", async () => {
    const { host, member, chatId } = await seedRoom();
    const hostPersona = await seedPersona(db, host, "host_p");
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    await life.setChatAnchorPersona({
      principal: principal(host),
      chatId,
      personaId: hostPersona,
    });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.anchorPersonaId).toBe(hostPersona);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);

    const err = await life.setChatAnchorPersona({ principal: principal(member), chatId, personaId: hostPersona }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("the host may pin to ANOTHER present human's persona (multi-human — the host freely picks it)", async () => {
    const { host, member, chatId } = await seedRoom();
    const memberPersona = await seedPersona(db, member, "member_p");
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    await life.setChatAnchorPersona({
      principal: principal(host),
      chatId,
      personaId: memberPersona,
    });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.anchorPersonaId).toBe(memberPersona);
  });

  test("a persona NOT owned by any present human participant is refused (not_persona_owner)", async () => {
    const { host, chatId } = await seedRoom();
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    const foreignPersona = await seedPersona(db, outsider, "foreign_p");
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    const err = await life.setChatAnchorPersona({ principal: principal(host), chatId, personaId: foreignPersona }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_persona_owner");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.anchorPersonaId).toBeNull();
  });

  test("personaId: null clears an existing pin", async () => {
    const { host, chatId } = await seedRoom();
    const hostPersona = await seedPersona(db, host, "host_p");
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());
    await life.setChatAnchorPersona({
      principal: principal(host),
      chatId,
      personaId: hostPersona,
    });

    await life.setChatAnchorPersona({ principal: principal(host), chatId, personaId: null });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.anchorPersonaId).toBeNull();
  });
});

describe("variables — the config-plane round-trip (member)", () => {
  test("setVariables persists; getVariables + the picks read read them back; clearVariables empties", async () => {
    const { member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    await life.setVariables({ principal: principal(member), chatId, values: { mood: "tense" } });
    // The PERSISTED bag is read through the picks pane's own proc (the one stored-variables read there is).
    expect((await life.getVariablePicks({ principal: principal(member), chatId })).values).toEqual({
      mood: "tense",
    });
    expect(await life.getVariables({ principal: principal(member), chatId })).toEqual({
      mood: "tense",
    });

    await life.clearVariables({ principal: principal(member), chatId });
    expect((await life.getVariablePicks({ principal: principal(member), chatId })).values).toEqual({});
  });
});

describe("getVariablePicks — the picks pane's ChoiceBlock half (member)", () => {
  // The host's preset declarations the pane renders controls from — one single-pick variable and one
  // multi-select POOL. `resolvePromptVariables` is the compose op the verb reads.
  const povVariable: ChoiceBlockSpec = {
    name: "pov",
    question: "Narration POV",
    options: [
      { label: "First", value: "first person" },
      { label: "Third", value: "third person" },
    ],
    defaultValue: "third person",
    multiSelect: false,
    separator: ", ",
    randomPick: false,
  };
  const weatherVariable: ChoiceBlockSpec = {
    name: "weather",
    question: "Weather pool",
    options: [
      { label: "Storm", value: "storm" },
      { label: "Clear", value: "clear" },
    ],
    multiSelect: true,
    separator: ", ",
    randomPick: true,
  };

  function lifeWithVariables(specs: readonly ChoiceBlockSpec[]): ReturnType<typeof createChatLifecycle> {
    return createChatLifecycle(makeChatContext(db, { resolvePromptVariables: () => Promise.resolve(specs) }), lifecycleDeps());
  }

  test("a member reads the DECLARED variables + the stored picks (the setVariables round-trip)", async () => {
    const { member, chatId } = await seedRoom();
    const life = lifeWithVariables([povVariable, weatherVariable]);

    await life.setVariables({ principal: principal(member), chatId, values: { pov: "first person" } });
    const view = await life.getVariablePicks({ principal: principal(member), chatId });

    // The declarations are projected WHOLE — a ChoiceBlock has no body/args class to withhold, and every
    // field decides how a pick is stored or what UNSET resolves to.
    expect(view.variables).toEqual([povVariable, weatherVariable]);
    expect(view.values).toEqual({ pov: "first person" });
  });

  test("no picks stored yet ⇒ an empty bag (every control renders UNSET), not a throw", async () => {
    const { member, chatId } = await seedRoom();
    const view = await lifeWithVariables([povVariable]).getVariablePicks({ principal: principal(member), chatId });

    expect(view.values).toEqual({});
    expect(view.variables).toHaveLength(1);
  });

  test("a stored pick whose variable the preset no longer declares SURVIVES the read (orphan-preserve)", async () => {
    const { member, chatId } = await seedRoom();
    const life = lifeWithVariables([povVariable]);

    // The pane rebuilds the WHOLE bag on every edit, so an orphan it never renders must still come back —
    // otherwise the next pick would silently drop it (`resolveChoiceVariables` still resolves it at turn time).
    await life.setVariables({ principal: principal(member), chatId, values: { pov: "first person", retired: "kept" } });
    const view = await life.getVariablePicks({ principal: principal(member), chatId });

    expect(view.values).toEqual({ pov: "first person", retired: "kept" });
    expect(view.variables.map((v) => v.name)).toEqual(["pov"]);
  });

  test("a non-participant (stranger) is refused — neither declarations nor picks leak", async () => {
    const { chatId } = await seedRoom();
    const stranger = await seedUser(db, castId<Handle>("stranger"));

    const err = await lifeWithVariables([povVariable])
      .getVariablePicks({ principal: principal(stranger), chatId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
  });
});

describe("setUserMacroValues — the per-chat user-macro picks flush (WAVE MU, member)", () => {
  test("a member persists the nested picks bag + emits chatUpdated; the turn build reads it back", async () => {
    const { member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    const picks = { mood: { tone: "grim" }, weather: { pool: ["storm", "clear"] } };
    await life.setUserMacroValues({ principal: principal(member), chatId, values: picks });
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    // Round-trips through the SAME reader the turn build feeds `buildTurnUserMacros`.
    expect(await loadStoredUserMacroValues(db, chatId)).toEqual(picks);
  });

  test("a non-participant (stranger) is refused — no cross-tenant write", async () => {
    const { chatId } = await seedRoom();
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    const err = await life.setUserMacroValues({ principal: principal(stranger), chatId, values: { mood: { tone: "grim" } } }).catch((e: unknown) => e);
    // A non-member gets the leak-free NOT_FOUND (the membership precedent — never reveals the chat exists).
    expect(err).toBeInstanceOf(ChatNotFoundError);
    // No write landed + no bus event fired.
    expect(await loadStoredUserMacroValues(db, chatId)).toEqual({});
    expect(emitted).toEqual([]);
  });

  test("a malformed pick leaf is REFUSED at the verb (userMacroValuesSchema defense-in-depth)", async () => {
    const { member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    // A number leaf is not a valid pick (string | boolean | string[]) — the verb's schema.parse throws.
    // FABRICATION-OK: a DELIBERATE invalid-input probe — no factory produces an intentionally malformed bag.
    const bad = { mood: { tone: 42 } } as unknown as Parameters<typeof life.setUserMacroValues>[0]["values"];
    await expect(life.setUserMacroValues({ principal: principal(member), chatId, values: bad })).rejects.toThrow();
    // Nothing persisted.
    expect(await loadStoredUserMacroValues(db, chatId)).toEqual({});
  });
});

describe("getUserMacroPicks — the picks pane read (#24, member)", () => {
  // The host's preset declarations the pane renders controls from: one PICKABLE macro (a typed input) and
  // one input-less macro (nothing to pick). `resolvePromptUserMacros` is the compose op the verb reads.
  const pickableMacro: UserMacroSpec = {
    name: "mood",
    description: "The scene's emotional weather.",
    args: [],
    body: "The mood is {{tone}}.",
    inputs: [
      {
        kind: "single-select",
        name: "tone",
        label: "Tone",
        options: [
          { label: "Grim", value: "grim" },
          { label: "Warm", value: "warm" },
        ],
        separator: ", ",
        onValue: "true",
        offValue: "",
        defaultValue: "warm",
      },
    ],
    strict: false,
  };
  const inputlessMacro: UserMacroSpec = { name: "sig", description: "", args: [], body: "— the house", inputs: [], strict: false };

  /** The GAME's own `{{mood}}` (a DIFFERENT input set) — the second definition home, delivered by the
   *  injected `ChatRpgOps.resolveUserMacros`. Its distinct `inputs` make "which def the pane projected"
   *  observable. */
  const gameMoodMacro: UserMacroSpec = {
    ...pickableMacro,
    description: "The game's own scene weather.",
    inputs: [{ ...(pickableMacro.inputs[0] as UserMacroSpec["inputs"][number]), options: [{ label: "Doomed", value: "doomed" }], defaultValue: "doomed" }],
  };

  function lifeWithMacros(defs: readonly UserMacroSpec[], gameDefs?: readonly UserMacroSpec[]): ReturnType<typeof createChatLifecycle> {
    return createChatLifecycle(
      makeChatContext(db, {
        resolvePromptUserMacros: () => Promise.resolve(defs),
        // A minimal rpg op set: the pane read reaches ONLY the declaration op (FABRICATION-OK).
        ...(gameDefs === undefined ? {} : { rpg: { resolveUserMacros: () => Promise.resolve(gameDefs) } as unknown as NonNullable<ChatContext["rpg"]> }),
      }),
      lifecycleDeps(),
    );
  }

  test("a member reads the PICKABLE declarations + the stored picks; an input-less macro is omitted", async () => {
    const { member, chatId } = await seedRoom();
    const life = lifeWithMacros([pickableMacro, inputlessMacro]);

    await life.setUserMacroValues({ principal: principal(member), chatId, values: { mood: { tone: "grim" } } });
    const view = await life.getUserMacroPicks({ principal: principal(member), chatId });

    expect(view.macros.map((m) => m.name)).toEqual(["mood"]);
    expect(view.macros[0]?.inputs).toEqual(pickableMacro.inputs);
    expect(view.values).toEqual({ mood: { tone: "grim" } });
  });

  test("the macro BODY + args never cross the wire (the least-privilege projection)", async () => {
    const { member, chatId } = await seedRoom();
    const view = await lifeWithMacros([pickableMacro]).getUserMacroPicks({ principal: principal(member), chatId });

    // The body is prompt content (host-gated everywhere else) — the projection is identity + inputs + the
    // authoring home only.
    expect(Object.keys(view.macros[0] ?? {}).sort()).toEqual(["description", "inputs", "name", "source"]);
    expect(view.macros[0]?.source).toBe("preset");
  });

  test("a GAME-declared macro appears in the pane, source-labelled `game` (the second definition home)", async () => {
    const { member, chatId } = await seedRoom();
    const view = await lifeWithMacros([], [gameMoodMacro]).getUserMacroPicks({ principal: principal(member), chatId });

    expect(view.macros.map((m) => [m.name, m.source])).toEqual([["mood", "game"]]);
  });

  test("SHADOW: on a name clash the pane asks the GAME's question (the def the turn resolves), exactly once", async () => {
    const { member, chatId } = await seedRoom();
    const view = await lifeWithMacros([pickableMacro], [gameMoodMacro]).getUserMacroPicks({ principal: principal(member), chatId });

    expect(view.macros).toHaveLength(1);
    expect(view.macros[0]?.source).toBe("game");
    expect(view.macros[0]?.inputs).toEqual(gameMoodMacro.inputs);
  });

  test("no picks stored yet ⇒ an empty bag (every input renders UNSET), not a throw", async () => {
    const { member, chatId } = await seedRoom();
    const view = await lifeWithMacros([pickableMacro]).getUserMacroPicks({ principal: principal(member), chatId });

    expect(view.values).toEqual({});
    expect(view.macros).toHaveLength(1);
  });

  test("a non-participant (stranger) is refused — neither declarations nor picks leak", async () => {
    const { chatId } = await seedRoom();
    const stranger = await seedUser(db, castId<Handle>("stranger"));

    const err = await lifeWithMacros([pickableMacro])
      .getUserMacroPicks({ principal: principal(stranger), chatId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
  });
});

describe("injections — CRUD (write host, list member)", () => {
  test("create → list → update → delete", async () => {
    const { host, member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());

    const created = await life.setChatInjection({
      principal: principal(host),
      chatId,
      position: "in_prompt",
      depth: 2,
      role: "system",
      content: "be terse",
    });
    expect(created.content).toBe("be terse");
    const listed = await life.listChatInjections({ principal: principal(member), chatId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);

    const updated = await life.setChatInjection({
      principal: principal(host),
      chatId,
      id: created.id,
      position: "in_prompt",
      depth: 2,
      role: "system",
      content: "be verbose",
    });
    expect(updated.id).toBe(created.id);
    const [row] = await db.select().from(chatInjections).where(eq(chatInjections.id, created.id));
    expect(row?.content).toBe("be verbose");

    await life.deleteChatInjection({ principal: principal(host), chatId, injectionId: created.id });
    expect(await life.listChatInjections({ principal: principal(member), chatId })).toHaveLength(0);
  });

  test("a member cannot write an injection (host-only)", async () => {
    const { member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());
    const err = await life
      .setChatInjection({
        principal: principal(member),
        chatId,
        position: "in_prompt",
        depth: 0,
        role: "system",
        content: "x",
      })
      .catch((e: unknown) => e);
    expect((err as ChatOperationError).code).toBe("not_host");
  });
});

describe("reapTemporaryChats — the caller's expired temp chats (PD-65)", () => {
  // The verb's 24h TTL against the frozen clock: a chat born just past the horizon is reap-eligible.
  const ttlMs = 86_400_000;
  const expiredAt = FROZEN_AT - ttlMs - 1;

  test("reaps only expired+temporary+caller-hosted; fresh / non-temp / foreign-hosted survive", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const other = await seedUser(db, castId<Handle>("other"));
    // 1. expired temporary hosted by the caller → REAPED.
    const reapable = await seedChat(db, "reapable", { temporary: true, createdAt: expiredAt });
    await seedParticipant(db, { chatId: reapable, key: "r_h", userId: host, role: "host" });
    // 2. FRESH temporary hosted by the caller → survives (inside the TTL).
    const fresh = await seedChat(db, "fresh", { temporary: true });
    await seedParticipant(db, { chatId: fresh, key: "f_h", userId: host, role: "host" });
    // 3. expired NON-temporary hosted by the caller → survives (never reap a real chat).
    const persistent = await seedChat(db, "persistent", { createdAt: expiredAt });
    await seedParticipant(db, { chatId: persistent, key: "p_h", userId: host, role: "host" });
    // 4. expired temporary hosted by SOMEONE ELSE (caller is a mere member) → survives (host-only sweep).
    const foreign = await seedChat(db, "foreign", { temporary: true, createdAt: expiredAt });
    await seedParticipant(db, { chatId: foreign, key: "x_h", userId: other, role: "host" });
    await seedParticipant(db, { chatId: foreign, key: "x_m", userId: host, role: "member" });

    const life = createChatLifecycle(makeChatContext(db), lifecycleDeps());
    expect(await life.reapTemporaryChats({ principal: principal(host) })).toEqual({ reaped: 1 });

    const surviving = (await db.select({ id: chats.id }).from(chats)).map((r) => r.id);
    expect(surviving).not.toContain(reapable);
    expect(surviving).toEqual(expect.arrayContaining([fresh, persistent, foreign]));
    // R0 §4.5 REVERSED the old silence: the sweep now also reaps HUSKS, and a husk can be the OPEN room on
    // the creating device, so every reaped room emits `chatDeleted` (the temporary arm rides the same emit
    // rather than re-reading the rows to classify them — an extra event for a room nobody has open is inert).
    expect(emitted).toEqual([{ type: "chatDeleted", chatId: reapable }]);
    // Idempotent: a second sweep finds nothing.
    emitted.length = 0;
    expect(await life.reapTemporaryChats({ principal: principal(host) })).toEqual({ reaped: 0 });
    expect(emitted).toEqual([]);
  });

  // ⑧(a) — the reap TTL is the caller's `UserSettings.chat.tempChatTtlHours` (via the FOREIGN op), not a
  // const. A shorter TTL reaps a chat the default (24h) window would spare.
  test("a user's tempChatTtlHours narrows the reap window (the knob threads, not a const)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    // Born 2h ago — SAFE under the 24h default, EXPIRED under a 1h TTL.
    const twoHoursAgo = FROZEN_AT - 2 * 3_600_000;
    const chatId = await seedChat(db, "recent-temp", { temporary: true, createdAt: twoHoursAgo });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    // Default 24h TTL → survives.
    const lifeDefault = createChatLifecycle(makeChatContext(db), lifecycleDeps());
    expect(await lifeDefault.reapTemporaryChats({ principal: principal(host) })).toEqual({ reaped: 0 });

    // A 1h TTL (the user's knob) → the same 2h-old chat is now reap-eligible.
    const lifeShort = createChatLifecycle(makeChatContext(db, { resolveTempChatTtlHours: () => Promise.resolve(1) }), lifecycleDeps());
    expect(await lifeShort.reapTemporaryChats({ principal: principal(host) })).toEqual({ reaped: 1 });
  });
});
