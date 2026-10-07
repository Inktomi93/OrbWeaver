// The external fixture refuses a wrong latest user turn and does not finish a held stream early.
import { expect, test } from "../../support/fixtures.ts";
import { FIXTURE_COVER_MARKER, startFixtureProvider } from "./fixture-provider.ts";

const TURN = { userMessage: "Synthetic correct turn", prefix: "Synthetic prefix", suffix: " and tail." };

function requestBody(content: string): string {
  return JSON.stringify({
    messages: [
      { role: "user", content: TURN.userMessage },
      { role: "assistant", content: "prior synthetic reply" },
      { role: "user", content },
    ],
  });
}

test("a wrong latest user turn is refused even when the expected marker exists earlier in the request", async () => {
  const fixture = await startFixtureProvider(0, [TURN]);
  try {
    const response = await fetch(`${fixture.baseUrl}/chat/completions`, { method: "POST", body: requestBody("Wrong synthetic turn") });
    expect(response.status).toBe(422);
    expect(await response.text()).toContain("wrong user turn");
    expect(fixture.requests.map((request) => ({ body: request.body, finished: request.finished }))).toEqual([
      { body: requestBody("Wrong synthetic turn"), finished: false },
    ]);
  } finally {
    await fixture.close();
  }
});

test("real readiness probe succeeds, then a correct turn exposes only its prefix until released", async () => {
  const fixture = await startFixtureProvider(0, [TURN]);
  try {
    const probe = await fetch(`${fixture.baseUrl}/models`);
    expect(probe.ok).toBe(true);
    expect(await probe.json()).toMatchObject({ data: [{ id: "fixture-model" }] });
    expect(fixture.requests).toEqual([]);
    const response = await fetch(`${fixture.baseUrl}/chat/completions`, { method: "POST", body: requestBody(TURN.userMessage) });
    expect(response.ok).toBe(true);
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("fixture response has no stream");
    }
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain(TURN.prefix);
    expect(new TextDecoder().decode(first.value)).not.toContain("[DONE]");
    expect(fixture.requests[0]?.finished).toBe(false);
    expect(fixture.requests[0]?.closed).toBe(false);
    fixture.release(0);
    let tail = "";
    for (;;) {
      const part = await reader.read();
      if (part.done) {
        break;
      }
      tail += new TextDecoder().decode(part.value);
    }
    expect(tail).toContain(TURN.suffix);
    expect(tail).toContain("[DONE]");
    expect(fixture.requests[0]?.finished).toBe(true);
  } finally {
    await fixture.close();
  }
});

test("the deception script admits the real name-stamped first line with game notes, but refuses an old-turn marker", async () => {
  const fixture = await startFixtureProvider(0, undefined, TURN.userMessage);
  try {
    const correct = await fetch(`${fixture.baseUrl}/chat/completions`, {
      method: "POST",
      body: requestBody(`Synthetic Persona: ${TURN.userMessage}\n\n[Game notes for the narrator]`),
    });
    expect(correct.ok).toBe(true);
    expect(await correct.text()).toContain(FIXTURE_COVER_MARKER);
    const wrong = await fetch(`${fixture.baseUrl}/chat/completions`, { method: "POST", body: requestBody("Wrong synthetic turn") });
    expect(wrong.status).toBe(422);
    expect(await wrong.text()).toContain("wrong user turn");
    expect(fixture.requests.map((request) => request.finished)).toEqual([true, false]);
  } finally {
    await fixture.close();
  }
});
