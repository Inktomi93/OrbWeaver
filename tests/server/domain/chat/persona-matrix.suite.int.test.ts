// persona-matrix — a REPORT harness, not an invariant suite. For each persona combination it drives the real turn
// verbs, engine, pipeline and SHAPE, reads what `{{user}}` became in every section kind, and writes the tables to
// `reports/persona-matrix/<label>.md`. No live calls: the tape answers every turn. The invariants live in
// `prompt-cache-prefix.suite.int.test.ts`; this file asserts only that every combination ran.
//
// Two bindings run on the current tree: `fix` is the composition root's own persona resolver; `alt` is an
// alternative the owner may prefer (in a room with more than one present human, preset `{{user}}` is the joined
// present humans' names). `PERSONA_MATRIX_LABEL=base` runs the pre-fix trigger binding instead, for a run on the
// base tree.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, env } from "node:process";
import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona } from "@orb/contracts/chat";
import type { NamesBehavior, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { chatParticipants, chats, personas } from "@orb/db";
import type { Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { resolvePersonaDescriptionPlacement } from "@orb/kit/persona";
import { activePersonaIdFor, createTurnPersonaResolver } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";
import type { ResolveForeignInputsOp } from "../../../../packages/server/src/domain/chat/contract/foreign.ts";
import type { GroupOutput, TurnRequest } from "../../../../packages/server/src/domain/chat/contract/results.ts";
import { loadPersonasForOwners } from "../../../../packages/server/src/domain/persona/persistence/queries.ts";
import type { ChatScenario } from "../../../support/chat/index.ts";
import { scenario, tape } from "../../../support/chat/index.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { FROZEN_AT, seedCharacter, seedParticipant, seedUser } from "./_support.ts";

const BINDING_VALUES = ["base", "fix", "alt"] as const;
type Binding = (typeof BINDING_VALUES)[number];

const LABEL = env["PERSONA_MATRIX_LABEL"] === "base" ? "base" : "fix";
const BINDINGS: readonly Binding[] = LABEL === "base" ? ["base"] : ["fix", "alt"];

/** The preset probe: a literal section in the system region whose `{{user}}` is PRESET-context. */
const PRESET_PROBE: PromptSection = { type: "literal", id: "probe", name: "probe", role: "system", enabled: true, content: "PRESET_USER=<{{user}}>" };

function presetOf(namesBehavior: NamesBehavior): PromptConfig {
  return {
    ...DEFAULT_PROMPT_CONFIG,
    namesBehavior,
    sections: [PRESET_PROBE, ...DEFAULT_PROMPT_CONFIG.sections],
    // The guided steer's `{{user}}` is the turn's tail: a user-role injection at depth 0.
    guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "GUIDED_USER=<{{user}}> {{input}}", role: "user" } },
  };
}

function cardOf(name: string): CharacterCard {
  return {
    name,
    description: "CARD_USER=<{{user}}>",
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
}

/** The consent-gated persona read the composition root uses, over this db. */
function personaRead(db: Db): Parameters<typeof createTurnPersonaResolver>[0] {
  return async ({ personaIds, allowedOwnerIds }) => {
    const rows = await loadPersonasForOwners(db, [...new Set(personaIds)], [...new Set(allowedOwnerIds)]);
    return new Map(rows.map((row) => [row.id, row]));
  };
}

function project(row: { readonly name: string; readonly description: string; readonly metadata: unknown } | undefined): AssemblePersona | null {
  return row === undefined ? null : { name: row.name, description: row.description, placement: resolvePersonaDescriptionPlacement(row.metadata) };
}

/** The FOREIGN resolver for one binding. `base` mirrors the pre-fix composition root: `active` = the trigger's
 *  persona (`activePersonaIdFor`), the null-stamp key the trigger. */
function foreignFor(binding: Binding, db: Db, promptConfig: PromptConfig): ResolveForeignInputsOp {
  const read = personaRead(db);
  return async (args) => {
    const base = { promptConfig, scanDepth: 6, injectionTokenBudget: 0 };
    if (binding === "base") {
      const activeId = activePersonaIdFor({ trigger: args.trigger, anchorPersonaId: args.anchorPersonaId });
      const rows = await read({
        personaIds: [args.anchorPersonaId, activeId].flatMap((id) => (id === null ? [] : [id])),
        allowedOwnerIds: args.presentHumanUserIds,
      });
      const anchor = args.anchorPersonaId === null ? null : project(rows.get(args.anchorPersonaId));
      const active = activeId === null ? null : project(rows.get(activeId));
      return { ...base, personas: { anchor, active, activeUserId: args.trigger.kind === "human" ? args.trigger.userId : null } };
    }
    const personasOut = await createTurnPersonaResolver(read)(args);
    if (binding === "fix" || args.presentHumanUserIds.length < 2) {
      return { ...base, personas: personasOut };
    }
    const rows = await read({
      personaIds: args.humanSeats.flatMap((seat) => (seat.personaId === null ? [] : [seat.personaId])),
      allowedOwnerIds: args.presentHumanUserIds,
    });
    const seated = args.humanSeats.map((seat) => (seat.personaId === null ? undefined : rows.get(seat.personaId)));
    const names = seated.map((row) => row?.name ?? "User").join(", ");
    const descriptions = seated.flatMap((row) => (row === undefined ? [] : [row.description])).join("\n");
    return { ...base, personas: { ...personasOut, active: { name: names, description: descriptions } } };
  };
}

// ── probes over one captured request ────────────────────────────────────────────────────────────────────────

const ANCHOR_LEAD = resolveProseText("chat.assembly.anchorIdentity", {});

function textOf(content: TurnRequest["history"][number]["content"]): string {
  return content.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function probe(text: string, key: string): string {
  const all = [...text.matchAll(new RegExp(`${key}=<([^>]*)>`, "gu"))].map((m) => m[1] ?? "");
  return all.length === 0 ? "—" : [...new Set(all)].join(" / ");
}

interface Row {
  readonly step: string;
  readonly preset: string;
  readonly card: string;
  readonly description: string;
  readonly anchorBlock: string;
  readonly labels: string;
  readonly tail: string;
  readonly system: string;
}

function readRow(step: string, req: TurnRequest): Row {
  const system = `${req.prompt.static}\n${req.prompt.dynamic}`;
  const anchorMatch = [...system.matchAll(new RegExp(`\\[${ANCHOR_LEAD} ([^:]+): ([^\\]]*)\\]`, "gu"))].at(0);
  const withoutAnchor = anchorMatch === undefined ? system : system.replace(anchorMatch[0], "");
  const descriptions = [...withoutAnchor.matchAll(/desc-of-(\w+)/gu)].map((m) => m[1] ?? "");
  const users = req.history.filter((m) => m.role === "user").map((m) => textOf(m.content));
  const labels = users.map((t) => /(?:^|\n\n)([^:\n[]{1,40}): /u.exec(t)?.[1] ?? "(none)");
  const tailText = users.at(-1) ?? "";
  const impersonate = /AS (.+?) \(not /u.exec(tailText)?.[1];
  const guided = probe(tailText, "GUIDED_USER");
  return {
    step,
    preset: probe(system, "PRESET_USER"),
    card: probe(system, "CARD_USER"),
    description: descriptions.length === 0 ? "—" : descriptions.join(", "),
    anchorBlock: anchorMatch === undefined ? "—" : (anchorMatch[1] ?? ""),
    labels: labels.join(" · "),
    tail: impersonate === undefined ? `guided ${guided}` : `impersonate AS ${impersonate}`,
    system,
  };
}

// ── rooms and steps ─────────────────────────────────────────────────────────────────────────────────────────

interface Room {
  readonly scn: ChatScenario;
  readonly alice: UserId;
  readonly bob: UserId;
  readonly persona: (key: string) => PersonaId;
}

async function insertPersona(db: Db, ownerId: UserId, name: string): Promise<PersonaId> {
  const id = mintTypeId(ID_PREFIX.persona);
  await db.insert(personas).values({ id, ownerId, name, description: `desc-of-${name}`, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return id;
}

async function setSeat(room: Room, userId: UserId, personaId: PersonaId | null): Promise<void> {
  await room.scn.db
    .update(chatParticipants)
    .set({ activePersonaId: personaId })
    .where(and(eq(chatParticipants.chatId, room.scn.chatId), eq(chatParticipants.userId, userId)));
}

async function setAnchor(room: Room, personaId: PersonaId | null): Promise<void> {
  await room.scn.db.update(chats).set({ anchorPersonaId: personaId }).where(eq(chats.id, room.scn.chatId));
}

interface RoomOptions {
  readonly binding: Binding;
  readonly namesBehavior?: NamesBehavior;
  readonly output?: GroupOutput;
  readonly characters?: readonly string[];
  readonly cardScope?: "merged" | "scoped";
  readonly bob?: boolean;
}

/** Alice (the host) and, unless `bob: false`, Bob as a member. Personas are made per combo. */
async function roomFor(opts: RoomOptions): Promise<Room> {
  const db = await freshDb();
  const preset = presetOf(opts.namesBehavior ?? "default");
  const replies = Array.from({ length: 16 }, (_, i) => `reply ${String(i)}`).reduce((t, r) => t.reply(r), tape());
  const scn = await scenario.chat(replies, {
    db,
    characters: opts.characters ?? ["aria"],
    output: opts.output ?? "per-speaker",
    ...(opts.cardScope !== undefined ? { cardScope: opts.cardScope } : {}),
    resolveForeignInputs: foreignFor(opts.binding, db, preset),
    ctx: { getCard: ({ characterId }) => Promise.resolve(cardOf(String(characterId).replace("character_", ""))) },
  });
  if (opts.output === "narrator") {
    await seedCharacter(db, scn.host, "group");
  }
  const bob = await seedUser(db, castId<Handle>("bob"));
  if (opts.bob !== false) {
    await seedParticipant(db, { chatId: scn.chatId, key: "bob", userId: bob, role: "member", joinSeq: 9 });
  }
  return { scn, alice: scn.host, bob, persona: (key) => castId<PersonaId>(key) };
}

type Step =
  | { readonly kind: "send"; readonly who: "alice" | "bob"; readonly personaId?: PersonaId }
  | { readonly kind: "auto" }
  | { readonly kind: "impersonate"; readonly who: "alice" | "bob" }
  | { readonly kind: "reanchor"; readonly personaId: PersonaId | null };

async function runStep(room: Room, step: Step): Promise<string | null> {
  const { scn } = room;
  switch (step.kind) {
    case "send": {
      const principal = scn.principal(step.who === "alice" ? room.alice : room.bob);
      await scn.turn.send({
        principal,
        chatId: scn.chatId,
        content: `${step.who} speaks`,
        guided: { action: "response", input: "go" },
        ...(step.personaId !== undefined ? { personaId: step.personaId } : {}),
      });
      return step.personaId === undefined ? `${step.who} sends` : `${step.who} sends (explicit persona)`;
    }
    case "auto":
      await scn.requestTurn({ chatId: scn.chatId, initiator: "automation", triggeredBy: room.alice, automationDepth: 1 });
      return "auto turn";
    case "impersonate":
      for await (const _delta of scn.turn.impersonateStream({ principal: scn.principal(step.who === "alice" ? room.alice : room.bob), chatId: scn.chatId })) {
        // Drained for the captured request.
      }
      return `${step.who} impersonates`;
    case "reanchor":
      await setAnchor(room, step.personaId);
      return null;
    default:
      return assertNeverStep(step);
  }
}

function assertNeverStep(step: never): never {
  throw new Error(`persona-matrix: unhandled step ${JSON.stringify(step)}`);
}

interface Combo {
  readonly id: string;
  readonly title: string;
  readonly room: Omit<RoomOptions, "binding">;
  /** Seats personas and the anchor, and returns the steps. */
  readonly setup: (room: Room) => Promise<readonly Step[]>;
}

async function twoHumans(room: Room): Promise<{ alice: PersonaId; bob: PersonaId }> {
  const alice = await insertPersona(room.scn.db, room.alice, "Alice");
  const bob = await insertPersona(room.scn.db, room.bob, "Bob");
  await setSeat(room, room.alice, alice);
  await setSeat(room, room.bob, bob);
  return { alice, bob };
}

const TWO_HUMAN_STEPS: readonly Step[] = [{ kind: "send", who: "alice" }, { kind: "send", who: "bob" }, { kind: "auto" }];

const COMBOS: readonly Combo[] = [
  {
    id: "1a",
    title: "solo, one persona, no swap",
    room: { bob: false },
    setup: async (room) => {
      const nate = await insertPersona(room.scn.db, room.alice, "Nate");
      await setSeat(room, room.alice, nate);
      await setAnchor(room, nate);
      return [{ kind: "send", who: "alice" }, { kind: "auto" }];
    },
  },
  {
    id: "1b",
    title: "solo, mid-chat persona swap (anchor Nate, seat Steve)",
    room: { bob: false },
    setup: async (room) => {
      const nate = await insertPersona(room.scn.db, room.alice, "Nate");
      const steve = await insertPersona(room.scn.db, room.alice, "Steve");
      await setSeat(room, room.alice, steve);
      await setAnchor(room, nate);
      return [{ kind: "send", who: "alice" }, { kind: "auto" }];
    },
  },
  {
    id: "1c",
    title: "solo, no anchor set",
    room: { bob: false },
    setup: async (room) => {
      const nate = await insertPersona(room.scn.db, room.alice, "Nate");
      await setSeat(room, room.alice, nate);
      return [{ kind: "send", who: "alice" }, { kind: "auto" }];
    },
  },
  {
    id: "2",
    title: "two humans, own seat personas, anchor = host's persona",
    room: {},
    setup: async (room) => {
      const { alice } = await twoHumans(room);
      await setAnchor(room, alice);
      return TWO_HUMAN_STEPS;
    },
  },
  {
    id: "3",
    title: "two humans, host re-picks the anchor to Bob's persona mid-chat",
    room: {},
    setup: async (room) => {
      const { alice, bob } = await twoHumans(room);
      await setAnchor(room, alice);
      return [
        { kind: "send", who: "alice" },
        { kind: "send", who: "bob" },
        { kind: "reanchor", personaId: bob },
        { kind: "send", who: "alice" },
        { kind: "send", who: "bob" },
      ];
    },
  },
  {
    id: "4",
    title: "anchor persona whose owner LEFT the room (consent gate ⇒ no anchor)",
    room: {},
    setup: async (room) => {
      const { bob } = await twoHumans(room);
      await setAnchor(room, bob);
      await room.scn.db
        .update(chatParticipants)
        .set({ leftSeq: 1 })
        .where(and(eq(chatParticipants.chatId, room.scn.chatId), eq(chatParticipants.userId, room.bob)));
      return [{ kind: "send", who: "alice" }, { kind: "auto" }];
    },
  },
  {
    id: "5",
    title: "a human seated with NO persona (the kit floor)",
    room: {},
    setup: async (room) => {
      const alice = await insertPersona(room.scn.db, room.alice, "Alice");
      await setSeat(room, room.alice, alice);
      await setAnchor(room, alice);
      return TWO_HUMAN_STEPS;
    },
  },
  {
    id: "6a",
    title: "two humans on the SAME persona id",
    room: {},
    setup: async (room) => {
      const shared = await insertPersona(room.scn.db, room.alice, "Sam");
      await setSeat(room, room.alice, shared);
      await setSeat(room, room.bob, shared);
      await setAnchor(room, shared);
      return TWO_HUMAN_STEPS;
    },
  },
  {
    id: "6b",
    title: "two different personas with the same NAME",
    room: {},
    setup: async (room) => {
      const sam1 = await insertPersona(room.scn.db, room.alice, "Sam");
      const sam2 = await insertPersona(room.scn.db, room.bob, "Sam");
      await setSeat(room, room.alice, sam1);
      await setSeat(room, room.bob, sam2);
      await setAnchor(room, sam1);
      return TWO_HUMAN_STEPS;
    },
  },
  {
    id: "7",
    title: "explicit per-send personaId override",
    room: { bob: false },
    setup: async (room) => {
      const nate = await insertPersona(room.scn.db, room.alice, "Nate");
      const alt = await insertPersona(room.scn.db, room.alice, "Alt");
      await setSeat(room, room.alice, nate);
      await setAnchor(room, nate);
      return [
        { kind: "send", who: "alice", personaId: alt },
        { kind: "send", who: "alice" },
      ];
    },
  },
  ...(["merged", "scoped", "narrator"] as const).map(
    (mode): Combo => ({
      id: `8-${mode}`,
      title: `group room (${mode}), two humans`,
      room: {
        characters: ["aria", "kai"],
        ...(mode === "narrator" ? { output: "narrator" as const } : {}),
        ...(mode === "scoped" ? { cardScope: "scoped" as const } : {}),
      },
      setup: async (room) => {
        const { alice } = await twoHumans(room);
        await setAnchor(room, alice);
        return [
          { kind: "send", who: "alice" },
          { kind: "send", who: "bob" },
        ];
      },
    }),
  ),
  ...(["default", "content", "completion", "none"] as const).map(
    (mode): Combo => ({
      id: `9-${mode}`,
      title: `names mode ${mode}, two humans`,
      room: { namesBehavior: mode },
      setup: async (room) => {
        const { alice } = await twoHumans(room);
        await setAnchor(room, alice);
        return [
          { kind: "send", who: "alice" },
          { kind: "send", who: "bob" },
        ];
      },
    }),
  ),
  {
    id: "10",
    title: "impersonate by Bob in an Alice-anchored room",
    room: {},
    setup: async (room) => {
      const { alice } = await twoHumans(room);
      await setAnchor(room, alice);
      return [
        { kind: "send", who: "alice" },
        { kind: "impersonate", who: "bob" },
      ];
    },
  },
];

interface ComboResult {
  readonly combo: Combo;
  readonly binding: Binding;
  readonly rows: readonly Row[];
  readonly systemIdentical: string;
  readonly error: string | null;
}

function sameSystem(systems: readonly string[]): string {
  if (systems.length < 2) {
    return "n/a";
  }
  return systems.every((s) => s === systems[0]) ? "yes" : "NO";
}

async function runCombo(combo: Combo, binding: Binding): Promise<ComboResult> {
  const room = await roomFor({ ...combo.room, binding });
  try {
    const steps = await combo.setup(room);
    const rows: Row[] = [];
    let beforeReanchor = true;
    const systems: string[] = [];
    for (const step of steps) {
      const before = room.scn.requests.length;
      const label = await runStep(room, step);
      if (label === null) {
        beforeReanchor = false;
        continue;
      }
      const req = room.scn.requests.slice(before).at(-1);
      if (req === undefined) {
        rows.push({ step: label, preset: "no call", card: "", description: "", anchorBlock: "", labels: "", tail: "", system: "" });
        continue;
      }
      const row = readRow(label, req);
      rows.push(row);
      if (beforeReanchor) {
        systems.push(row.system);
      }
    }
    const systemIdentical = sameSystem(systems);
    return { combo, binding, rows, systemIdentical, error: null };
  } catch (err) {
    return { combo, binding, rows: [], systemIdentical: "n/a", error: err instanceof Error ? err.message : String(err) };
  }
}

function tableOf(result: ComboResult): string {
  if (result.error !== null) {
    return `**CRASH:** ${result.error}\n`;
  }
  const head = "| step | preset {{user}} | card {{user}} | persona description | anchor block | user-row labels | tail |\n| - | - | - | - | - | - | - |";
  const body = result.rows.map((r) => `| ${r.step} | ${r.preset} | ${r.card} | ${r.description} | ${r.anchorBlock} | ${r.labels} | ${r.tail} |`).join("\n");
  return `${head}\n${body}\n\nSystem block byte-identical across senders (before any re-anchor): **${result.systemIdentical}**\n`;
}

test("the persona matrix runs every combination and writes its report", async () => {
  const results: ComboResult[] = [];
  for (const combo of COMBOS) {
    for (const binding of BINDINGS) {
      results.push(await runCombo(combo, binding));
    }
  }
  const sections = COMBOS.map((combo) => {
    const perBinding = results
      .filter((r) => r.combo.id === combo.id)
      .map((r) => `#### binding: ${r.binding}\n\n${tableOf(r)}`)
      .join("\n");
    return `### ${combo.id}. ${combo.title}\n\n${perBinding}`;
  });
  const dir = join(cwd(), "reports", "persona-matrix");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${LABEL}.md`), `# Persona matrix — ${LABEL}\n\n${sections.join("\n")}`);

  expect(results.filter((r) => r.error !== null).map((r) => `${r.combo.id}/${r.binding}: ${r.error ?? ""}`)).toEqual([]);
}, 120_000);
