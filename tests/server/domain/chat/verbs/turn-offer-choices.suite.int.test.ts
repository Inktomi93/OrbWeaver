// @subject packages/server/src/domain/chat/verbs/turn.ts
// Saved host and room posture must reach the actual native model input, including the explicit-off override.
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { textRoom } from "../scenario-physical.ts";

const CASES = [
  {
    host: false,
    room: true,
    count: 1,
    title: "the ROOM knob ON teaches the model the :::choices fence",
  },
  {
    host: false,
    count: 0,
    title: "no room value + the host default OFF teaches nothing — the byte-identical floor",
  },
  {
    host: true,
    count: 1,
    title: "INHERIT: no room value + the host's per-user default ON teaches — a new room is born with its host's posture",
  },
  {
    host: true,
    room: false,
    count: 0,
    title: "THE ROOM VALUE WINS: room OFF over a host default of ON teaches nothing (never an OR of the two tiers)",
  },
];
const CHOICES_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text;

function textLeaves(value: JsonValue): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return (Array.isArray(value) ? value : Object.values(value)).flatMap(textLeaves);
}

async function modelText(request: Request): Promise<string> {
  const body = jsonValueSchema.parse(JSON.parse(await request.clone().text()));
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
    throw new Error("the native model request has no messages");
  }
  return body["messages"].flatMap(textLeaves).join("\n");
}

test.for(CASES)("$title", async (scene) => {
  await using h = await textRoom(["ok"], { group: { output: "per-speaker", policy: "list" } });
  await h.caller.settings.updateUserSettingsSection({ section: "chat", patch: { offerChoices: scene.host } });
  if (scene.room !== undefined) {
    await h.root.services.chat.setOfferChoices({ principal: h.owner, chatId: h.chatId, enabled: scene.room });
  }
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi" });
  const requests = h.requests.filter((candidate) => new URL(candidate.url).pathname.endsWith("/chat/completions"));
  expect(requests).toHaveLength(1);
  const request = requests[0];
  if (request === undefined) {
    throw new Error("the real send never reached its physical provider");
  }
  expect((await modelText(request)).split(CHOICES_TEACH).length - 1).toBe(scene.count);
});
