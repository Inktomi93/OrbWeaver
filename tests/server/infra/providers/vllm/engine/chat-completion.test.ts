// Unit tests for the gen chat-completion wire core — request shaping over an INJECTED client (no network)
// + the `cleanJsonSchema` guided-decoding sanitizer.

import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { cleanJsonSchema, runVllmChatCompletion } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

// Narrow an indexed-access result (possibly-undefined under noUncheckedIndexedAccess) or fail the test.
function need<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected a defined value");
  }
  return value;
}

interface WireMsg {
  role: string;
  content: unknown;
}

function fakeClient(): { client: VllmEngineClient; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  const client: VllmEngineClient = {
    enginePost: <T>(_engine: unknown, _path: string, body: unknown): Promise<T> => {
      bodies.push(body as Record<string, unknown>);
      return Promise.resolve({
        choices: [{ message: { content: "the summary" } }],
        // biome-ignore lint/style/useNamingConvention: vLLM wire response shape (snake_case).
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      } as T);
    },
    engineStream: () => Promise.reject(new Error("chat-completion does not stream")),
    baseUrl: () => "http://127.0.0.1:0",
  };
  return { client, bodies };
}

describe("runVllmChatCompletion", () => {
  test("maps text messages to plain-string content and returns text + usage", async () => {
    const { client, bodies } = fakeClient();
    const res = await runVllmChatCompletion(client, {
      model: "gen-model",
      messages: [
        { role: "system", text: "be terse" },
        { role: "user", text: "summarize this" },
      ],
    });

    expect(res).toEqual({ text: "the summary", tokensIn: 12, tokensOut: 4 });
    const msgs = need(bodies[0])["messages"] as WireMsg[];
    expect(need(msgs[0])).toEqual({ role: "system", content: "be terse" });
    expect(need(msgs[1])).toEqual({ role: "user", content: "summarize this" });
  });

  test("a vision turn becomes image_url data-URI content parts (image first, then text)", async () => {
    const { client, bodies } = fakeClient();
    await runVllmChatCompletion(client, {
      model: "gen-model",
      messages: [{ role: "user", text: "describe", images: [new Uint8Array([0x89, 0x50])] }],
    });

    const msgs = need(bodies[0])["messages"] as WireMsg[];
    const parts = need(msgs[0]).content as { type: string }[];
    expect(need(parts[0]).type).toBe("image_url");
    expect(need(parts[1]).type).toBe("text");
    expect(JSON.stringify(parts)).toContain("data:image/png;base64,");
  });

  test("emits the vLLM sampling extensions only when provided", async () => {
    const { client, bodies } = fakeClient();
    await runVllmChatCompletion(client, {
      model: "gen-model",
      messages: [{ role: "user", text: "x" }],
      maxTokens: 256,
      temperature: 0.3,
      minP: 0.05,
      repetitionDetection: { maxPatternSize: 4, minCount: 3 },
    });

    const body = need(bodies[0]);
    expect(body["max_tokens"]).toBe(256);
    expect(body["temperature"]).toBe(0.3);
    expect(body["min_p"]).toBe(0.05);
    const rd = body["repetition_detection"] as Record<string, number>;
    expect(rd["max_pattern_size"]).toBe(4);
    expect(rd["min_pattern_size"]).toBe(1); // defaulted
    expect(rd["min_count"]).toBe(3);
  });

  test("a jsonSchema rides response_format with a guided-decoding-clean schema", async () => {
    const { client, bodies } = fakeClient();
    await runVllmChatCompletion(client, {
      model: "gen-model",
      messages: [{ role: "user", text: "x" }],
      // A DISTINCT schema name (not the old hardcoded "result") — the mapping must carry it through, so a
      // regression back to a constant name fails here.
      responseFormat: { name: "character_distillation", schema: { type: "object", title: "Out", properties: { n: { type: "number" } } } },
    });

    const rf = need(bodies[0])["response_format"] as Record<string, unknown>;
    expect(rf["type"]).toBe("json_schema");
    const js = rf["json_schema"] as { name: string; schema: Record<string, unknown> };
    expect(js.name).toBe("character_distillation"); // the caller's name rides through, not a hardcoded constant
    expect(js.schema["title"]).toBeUndefined(); // annotation stripped
    expect(js.schema["additionalProperties"]).toBe(false); // pinned
  });

  test("omits the extensions entirely when not asked for", async () => {
    const { client, bodies } = fakeClient();
    await runVllmChatCompletion(client, {
      model: "gen-model",
      messages: [{ role: "user", text: "x" }],
    });
    const body = need(bodies[0]);
    expect("max_tokens" in body).toBe(false);
    expect("response_format" in body).toBe(false);
    expect("repetition_detection" in body).toBe(false);
  });
});

describe("cleanJsonSchema", () => {
  test("strips annotation keywords and pins additionalProperties:false, keeping enum/required", () => {
    const cleaned = cleanJsonSchema({
      type: "object",
      title: "Person",
      $schema: "http://json-schema.org/draft-07/schema#",
      required: ["role"],
      properties: {
        role: { type: "string", enum: ["a", "b"], default: "a" },
      },
    }) as Record<string, unknown>;

    expect(cleaned["title"]).toBeUndefined();
    expect(cleaned["$schema"]).toBeUndefined();
    expect(cleaned["additionalProperties"]).toBe(false);
    expect(cleaned["required"]).toEqual(["role"]);
    const props = cleaned["properties"] as { role: Record<string, unknown> };
    expect(props.role["enum"]).toEqual(["a", "b"]);
    expect(props.role["default"]).toBeUndefined();
  });

  test("does not mutate the input schema (clones)", () => {
    const input = { type: "object", title: "keep-me", properties: {} };
    cleanJsonSchema(input);
    expect(input.title).toBe("keep-me");
  });
});
