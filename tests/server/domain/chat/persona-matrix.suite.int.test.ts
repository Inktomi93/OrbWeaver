// @subject packages/server/src/domain/chat/assembly/turn-personas.ts
// The current-policy report observes native provider bytes; every persona and room mutation uses the real graph.
import { mkdir, writeFile } from "node:fs/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import type { GroupConfig } from "@orb/contracts/chat";
import type { CreatePersonaInput } from "@orb/contracts/persona";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { NamesBehavior, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { PersonaId } from "@orb/kit/ids";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import {
  attachPersonaLore,
  inputMessages,
  inputSystem,
  invitePerson,
  messageText,
  personaAutoTurn,
  personaInputs,
  personaRoom,
} from "./persona-cache-physical.ts";

const PRESET_PROBE: PromptSection = { type: "literal", id: "probe", name: "probe", role: "system", enabled: true, content: "PRESET_USER=<{{user}}>" };

function presetOf(namesBehavior: NamesBehavior): PromptConfig {
  return {
    ...DEFAULT_PROMPT_CONFIG,
    namesBehavior,
    sections: [PRESET_PROBE, ...DEFAULT_PROMPT_CONFIG.sections],
    guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "GUIDED_USER=<{{user}}> {{input}}", role: "user" } },
  };
}

interface RoomOptions {
  readonly namesBehavior?: NamesBehavior;
  readonly output?: GroupConfig["output"];
  readonly characters?: readonly string[];
  readonly cardScope?: Extract<GroupConfig, { output: "per-speaker" }>["cardScope"];
  readonly bob?: boolean;
  readonly bobOffline?: boolean;
}

interface Room extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly alice: ChatRoot["owner"];
  readonly bob: ChatRoot["owner"];
}

async function roomFor(options: RoomOptions): Promise<Room> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await personaRoom(
      Array.from({ length: 16 }, (_, index) => `reply ${index}`),
      {
        promptConfig: presetOf(options.namesBehavior ?? "default"),
        characters: (options.characters ?? ["aria"]).map((name) => createCharacterSchema.parse({ handle: name, name, description: "CARD_USER=<{{user}}>" })),
        group:
          options.output === "narrator"
            ? { policy: "list", output: "narrator", allowSelfResponses: true }
            : { policy: "list", output: "per-speaker", allowSelfResponses: true, ...(options.cardScope === undefined ? {} : { cardScope: options.cardScope }) },
      },
    ),
  );
  const bob = options.bob === false ? await h.root.principalFor((await h.root.actor()).id) : await invitePerson(h);
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: null });
  const online = new AbortController();
  construction.defer(() => online.abort());
  h.root.app.presence.connect(h.owner.userId, online.signal);
  if (options.bobOffline !== true) {
    h.root.app.presence.connect(bob.userId, online.signal);
  }
  const lifetime = construction.move();
  return { h, alice: h.owner, bob, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

let personaSequence = 0;
async function insertPersona(room: Room, principal: ChatRoot["owner"], name: string, metadata: CreatePersonaInput["metadata"] = null): Promise<PersonaId> {
  personaSequence += 1;
  return (
    await room.h.root.services.persona.create({
      principal,
      input: createPersonaSchema.parse({ name, description: `desc-of-${name}#${personaSequence}`, metadata }),
    })
  ).id;
}

async function setSeat(room: Room, principal: ChatRoot["owner"], personaId: PersonaId | null): Promise<void> {
  await room.h.root.services.persona.setActivePersona({ principal, chatId: room.h.chatId, personaId });
}

async function setAnchor(room: Room, personaId: PersonaId | null): Promise<void> {
  await room.h.root.services.chat.setChatAnchorPersona({ principal: room.alice, chatId: room.h.chatId, personaId });
}

async function leave(room: Room, principal: ChatRoot["owner"]): Promise<void> {
  await room.h.root.services.chat.selfLeave({ principal, chatId: room.h.chatId });
}

async function seatCara(room: Room): Promise<ChatRoot["owner"]> {
  return await invitePerson(room.h);
}

async function attachLore(room: Room, principal: ChatRoot["owner"], personaId: PersonaId, name: string): Promise<void> {
  await attachPersonaLore(room.h, principal, personaId, `LORE=<${name}:{{user}}>`);
}

async function twoHumans(room: Room): Promise<{ alice: PersonaId; bob: PersonaId }> {
  const alice = await insertPersona(room, room.alice, "Alice");
  const bob = await insertPersona(room, room.bob, "Bob");
  await setSeat(room, room.alice, alice);
  await setSeat(room, room.bob, bob);
  return { alice, bob };
}

type Step =
  | { readonly kind: "send"; readonly who: "alice" | "bob"; readonly personaId?: PersonaId }
  | { readonly kind: "auto" }
  | { readonly kind: "impersonate"; readonly who: "alice" | "bob" }
  | { readonly kind: "reanchor"; readonly personaId: PersonaId | null }
  | { readonly kind: "leave"; readonly who: "bob" };

async function sendStep(room: Room, step: Extract<Step, { kind: "send" }>): Promise<string> {
  const { h } = room;
  expect(
    (
      await h.root.services.chat.send({
        principal: room[step.who],
        chatId: h.chatId,
        content: `${step.who} speaks`,
        guided: { action: "response", input: "go" },
        ...(step.personaId === undefined ? {} : { personaId: step.personaId }),
      })
    ).aborted,
  ).toBe(false);
  return `${step.who} sends${step.personaId === undefined ? "" : " (explicit persona)"}`;
}

async function impersonateStep(room: Room, step: Extract<Step, { kind: "impersonate" }>): Promise<string> {
  let text = "";
  for await (const { delta } of room.h.root.services.chat.impersonateStream({ principal: room[step.who], chatId: room.h.chatId })) {
    text += delta;
  }
  expect(text).not.toBe("");
  return `${step.who} impersonates`;
}

async function runStep(room: Room, step: Step): Promise<string | null> {
  switch (step.kind) {
    case "send":
      return await sendStep(room, step);
    case "auto":
      await personaAutoTurn(room.h);
      return "auto turn";
    case "impersonate":
      return await impersonateStep(room, step);
    case "reanchor":
      await setAnchor(room, step.personaId);
      return null;
    case "leave":
      await leave(room, room.bob);
      return null;
    default:
      return assertNeverStep(step);
  }
}

function assertNeverStep(step: never): never {
  throw new Error(`unhandled persona step ${JSON.stringify(step)}`);
}

interface Combo {
  readonly id: string;
  readonly title: string;
  readonly room: RoomOptions;
  readonly setup: (room: Room) => Promise<readonly Step[]>;
}

const TWO_HUMAN_STEPS: readonly Step[] = [{ kind: "send", who: "alice" }, { kind: "send", who: "bob" }, { kind: "auto" }];
const COMBOS: readonly Combo[] = [
  {
    id: "1a",
    title: "solo, one persona, no swap",
    room: { bob: false },
    setup: async (room) => {
      const alex = await insertPersona(room, room.alice, "Alex");
      await setSeat(room, room.alice, alex);
      await setAnchor(room, alex);
      return [{ kind: "send", who: "alice" }, { kind: "auto" }];
    },
  },
  {
    id: "1b",
    title: "solo, mid-chat persona swap (anchor Alex, seat Steve)",
    room: { bob: false },
    setup: async (room) => {
      const alex = await insertPersona(room, room.alice, "Alex");
      const steve = await insertPersona(room, room.alice, "Steve");
      await setSeat(room, room.alice, steve);
      await setAnchor(room, alex);
      return [{ kind: "send", who: "alice" }, { kind: "auto" }];
    },
  },
  {
    id: "1c",
    title: "solo, no anchor set",
    room: { bob: false },
    setup: async (room) => {
      const alex = await insertPersona(room, room.alice, "Alex");
      await setSeat(room, room.alice, alex);
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
      await leave(room, room.bob);
      return [{ kind: "send", who: "alice" }, { kind: "auto" }];
    },
  },
  {
    id: "5",
    title: "a human seated with NO persona (the kit floor)",
    room: {},
    setup: async (room) => {
      const alice = await insertPersona(room, room.alice, "Alice");
      await setSeat(room, room.alice, alice);
      await setAnchor(room, alice);
      return TWO_HUMAN_STEPS;
    },
  },
  {
    id: "6b",
    title: "two different personas with the same NAME",
    room: {},
    setup: async (room) => {
      const sam1 = await insertPersona(room, room.alice, "Sam");
      const sam2 = await insertPersona(room, room.bob, "Sam");
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
      const alex = await insertPersona(room, room.alice, "Alex");
      const alt = await insertPersona(room, room.alice, "Alt");
      await setSeat(room, room.alice, alex);
      await setAnchor(room, alex);
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
    id: "11a",
    title: "Bob's persona places its description at depth",
    room: {},
    setup: async (room) => {
      const alice = await insertPersona(room, room.alice, "Alice");
      const bob = await insertPersona(room, room.bob, "Bob", { descriptionPosition: "at_depth", inject: { depth: 2, role: "system" } });
      await setSeat(room, room.alice, alice);
      await setSeat(room, room.bob, bob);
      await setAnchor(room, alice);
      return TWO_HUMAN_STEPS;
    },
  },
  {
    id: "11b",
    title: "Bob's persona opts its description out (placement none)",
    room: {},
    setup: async (room) => {
      const alice = await insertPersona(room, room.alice, "Alice");
      const bob = await insertPersona(room, room.bob, "Bob", { descriptionPosition: "none" });
      await setSeat(room, room.alice, alice);
      await setSeat(room, room.bob, bob);
      await setAnchor(room, alice);
      return TWO_HUMAN_STEPS;
    },
  },
  {
    id: "12",
    title: "three humans, each on their own persona (Cara joined after Bob)",
    room: {},
    setup: async (room) => {
      const { alice } = await twoHumans(room);
      const cara = await seatCara(room);
      await setSeat(room, cara, await insertPersona(room, cara, "Cara"));
      await setAnchor(room, alice);
      return TWO_HUMAN_STEPS;
    },
  },
  {
    id: "13",
    title: "Bob leaves mid-chat",
    room: {},
    setup: async (room) => {
      const { alice } = await twoHumans(room);
      await setAnchor(room, alice);
      return [
        { kind: "send", who: "alice" },
        { kind: "send", who: "bob" },
        { kind: "leave", who: "bob" },
        { kind: "send", who: "alice" },
      ];
    },
  },
  ...[false, true].map(
    (bobOffline): Combo => ({
      id: bobOffline ? "14b" : "14a",
      title: `each human's persona carries its own book${bobOffline ? ", Bob offline" : ""}`,
      room: { bobOffline },
      setup: async (room) => {
        const { alice, bob } = await twoHumans(room);
        await attachLore(room, room.alice, alice, "Alice");
        await attachLore(room, room.bob, bob, "Bob");
        await setAnchor(room, alice);
        return [
          { kind: "send", who: "alice" },
          { kind: "send", who: "bob" },
          { kind: "impersonate", who: "bob" },
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

const ANCHOR_LEAD = resolveProseText("chat.assembly.anchorIdentity", {});
const [PERSON_OPEN = "", PERSON_CLOSE = ""] = resolveProseText("chat.group.personaHeading", {}, { name: "\u0000" }).split("\u0000");
const PERSON_RE = new RegExp(`${RegExp.escape(PERSON_OPEN)}(.+?)${RegExp.escape(PERSON_CLOSE)}(\ndesc-of-)?`, "gu");

function probe(text: string, key: string): string {
  const all = [...text.matchAll(new RegExp(`${key}=<([^>]*)>`, "gu"))].map((match) => match[1] ?? "");
  return all.length === 0 ? "—" : [...new Set(all)].join(" / ");
}

interface ReportRow {
  readonly step: string;
  readonly preset: string;
  readonly card: string;
  readonly lore: string;
  readonly system: string;
  readonly people: string;
  readonly description: string;
  readonly anchor: string;
  readonly labels: string;
  readonly tail: string;
  readonly repeated: readonly string[];
}

function readRow(step: string, body: Parameters<typeof inputSystem>[0]): ReportRow {
  const system = inputSystem(body);
  const texts = inputMessages(body).map(messageText);
  const delivered = [system, ...texts].join("\n");
  const counts = new Map<string, number>();
  for (const match of delivered.matchAll(/desc-of-\w+#\d+/gu)) {
    counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
  }
  const anchor = [...system.matchAll(new RegExp(`\\[${ANCHOR_LEAD} ([^:]+): ([^\\]]*)\\]`, "gu"))][0];
  return {
    step,
    preset: probe(system, "PRESET_USER"),
    card: probe(system, "CARD_USER"),
    lore: probe(system, "LORE"),
    system,
    people: [...system.matchAll(PERSON_RE)].map((match) => `${match[1]} (${match[2] === undefined ? "name only" : "described"})`).join(" · ") || "—",
    description: [...(anchor === undefined ? system : system.replace(anchor[0], "")).matchAll(/desc-of-(\w+)/gu)].map((match) => match[1]).join(", ") || "—",
    anchor: anchor?.[1] ?? "—",
    labels: texts.map((text) => /(?:^|\n\n)([^:\n[]{1,40}): /u.exec(text)?.[1] ?? "(none)").join(" · "),
    tail: texts.at(-1) ?? "",
    repeated: [...counts].filter(([, count]) => count > 1).map(([token, count]) => `${token} ×${count}`),
  };
}

test("the current persona matrix runs all 23 combinations and writes its native-input report", { tags: "slow" }, async () => {
  const results: { combo: Combo; rows: ReturnType<typeof readRow>[] }[] = [];
  for (const combo of COMBOS) {
    await using room = await roomFor(combo.room);
    const steps = await combo.setup(room);
    const rows: ReturnType<typeof readRow>[] = [];
    for (const step of steps) {
      const before = (await personaInputs(room.h)).length;
      const label = await runStep(room, step);
      if (label === null) {
        continue;
      }
      const inputs = (await personaInputs(room.h)).slice(before);
      expect(inputs.length, `${combo.id}: ${label} made no physical call`).toBeGreaterThan(0);
      const input = inputs.at(-1);
      if (input === undefined) {
        throw new Error("the current matrix step made no native request");
      }
      rows.push(readRow(label, input));
    }
    results.push({ combo, rows });
  }
  expect(results).toHaveLength(23);
  expect(new Set(results.map(({ combo }) => combo.id)).size).toBe(23);
  expect(results.flatMap(({ combo, rows }) => rows.flatMap((row) => row.repeated.map((value) => `${combo.id} ${row.step}: ${value}`)))).toEqual([]);
  expect(
    results.flatMap(({ combo, rows }) =>
      rows.flatMap((row) =>
        row.lore
          .split(" / ")
          .filter((cell) => cell.includes(":") && cell.split(":")[0] !== cell.split(":")[1])
          .map((cell) => `${combo.id} ${row.step}: ${cell}`),
      ),
    ),
  ).toEqual([]);
  expect(results.filter(({ combo }) => combo.id.startsWith("14")).flatMap(({ rows }) => rows.map((row) => row.lore.split(" / ").sort().join(" / ")))).toEqual(
    Array.from({ length: 6 }, () => "Alice:Alice / Bob:Bob"),
  );
  const sections = results.map(
    ({ combo, rows }) =>
      `### ${combo.id}. ${combo.title}\n\n| step | preset | card | people | lore | description | anchor | labels | tail |\n| - | - | - | - | - | - | - | - | - |\n${rows.map((row) => `| ${row.step} | ${row.preset} | ${row.card} | ${row.people} | ${row.lore} | ${row.description} | ${row.anchor} | ${row.labels} | ${row.tail.replaceAll("\n", "<br>")} |`).join("\n")}\n\nSystem block byte-identical: ${rows.every((row) => row.system === rows[0]?.system) ? "yes" : "NO"}`,
  );
  await mkdir("reports/persona-matrix", { recursive: true });
  await writeFile("reports/persona-matrix/current.md", `# Current persona matrix\n\n${sections.join("\n\n")}\n`);
});
