// @subject packages/server/src/transport/trpc/routers/chat.ts
// @subject packages/kit/src/time/index.ts
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { textRoom } from "../../../domain/chat/scenario-physical.ts";
import { CLOCK_CONFIG, CLOCK_PREFIX, KATHMANDU, KATHMANDU_CLOCK, NOW } from "./turn-lifetimes-clock-physical.ts";

test("the actual mounted send refuses numeric or missing zones before provider work after a valid zoned request", async () => {
  await using h = await textRoom(["The keeper records the requested clock."], {
    server: { clock: createFrozenClock(NOW), physicalPeer: () => "127.0.0.1", env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" } },
    group: { output: "per-speaker", policy: "list" },
    promptConfig: CLOCK_CONFIG,
  });
  const send = async (input: JsonValue): Promise<Response> =>
    await h.root.http.request("/api/trpc/chat.send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  const accepted = await send({ chatId: h.chatId, content: "Read this clock.", timeZone: KATHMANDU });
  expect(accepted.status).toBe(200);
  expect(jsonValueSchema.parse(await accepted.json())).toMatchObject({ result: { data: { aborted: false } } });
  const modelRequests = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(modelRequests).toHaveLength(1);
  const first = modelRequests[0];
  if (first === undefined) {
    throw new Error("the passing mounted request made no actual native model call");
  }
  expect(await first.clone().text()).toContain(`${CLOCK_PREFIX}${KATHMANDU_CLOCK}`);
  for (const input of [
    { chatId: h.chatId, content: "Reject a numeric zone.", timeZone: 545 },
    { chatId: h.chatId, content: "Reject a missing zone." },
  ]) {
    const refused = await send(input);
    expect(refused.status).toBe(400);
    expect(jsonValueSchema.parse(await refused.json())).toMatchObject({ error: { data: { code: "BAD_REQUEST" } } });
    expect(h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
  }
});
