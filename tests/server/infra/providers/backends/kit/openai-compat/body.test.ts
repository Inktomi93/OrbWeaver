//
// backends/kit/openai-compat/body — snake_case wire field emission (only when set), header redaction (by
// name), and the include/exclude body transform (exclude wins, applied last).

import {
  applyIncludeExclude,
  buildOpenAiSamplingFields,
  rawResponseFormat,
  rawToolCallDeltas,
  rawToolChoice,
  rawWireTools,
  redactHeaders,
  redactSecretsFromText,
  secretHeaderValues,
} from "@orb/server/infra/providers/backends/kit/openai-compat";
import { describe } from "vitest";
import { expect, test } from "../../../../../../support/fixtures.ts";
import { wireSchema } from "../../../../../../support/wire-ready.ts";

describe("buildOpenAiSamplingFields", () => {
  test("emits only the set knobs, in snake_case wire form", () => {
    expect(buildOpenAiSamplingFields({ temperature: 0.7, topP: 0.9, maxTokens: 256, seed: 42 })).toEqual({
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 256,
      seed: 42,
    });
  });

  test("an empty input yields an empty body (no null/0 defaults)", () => {
    expect(buildOpenAiSamplingFields({})).toEqual({});
  });

  test("maps every knob to its wire name", () => {
    expect(
      buildOpenAiSamplingFields({
        topK: 40,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        repetitionPenalty: 1.1,
        minP: 0.05,
        logitBias: { "123": -1 },
        stop: ["END"],
      }),
    ).toEqual({
      top_k: 40,
      frequency_penalty: 0.1,
      presence_penalty: 0.2,
      repetition_penalty: 1.1,
      min_p: 0.05,
      logit_bias: { "123": -1 },
      stop: ["END"],
    });
  });

  test("emits min_p (D68-A) — the vLLM/BYO wire slot for the minP knob", () => {
    expect(buildOpenAiSamplingFields({ minP: 0.02 })).toEqual({ min_p: 0.02 });
  });
});

describe("redactHeaders", () => {
  test("redacts secret-named headers by NAME, passes the rest through", () => {
    expect(
      redactHeaders({
        Authorization: "Bearer sk-secret",
        "x-api-key": "key-123",
        "x-session-token": "tok",
        "content-type": "application/json",
        "x-title": "orbweaver",
      }),
    ).toEqual({
      Authorization: "█",
      "x-api-key": "█",
      "x-session-token": "█",
      "content-type": "application/json",
      "x-title": "orbweaver",
    });
  });
});

describe("secretHeaderValues", () => {
  test("returns the VALUES of secret-named headers only (the redactHeaders name signal)", () => {
    expect(
      secretHeaderValues({
        Authorization: "Bearer sk-secret",
        "x-api-key": "key-123",
        "x-session-token": "tok",
        "content-type": "application/json",
        "x-title": "orbweaver",
      }),
    ).toEqual(["Bearer sk-secret", "key-123", "tok"]);
  });

  test("null map → no secrets; empty-valued secret headers are skipped", () => {
    expect(secretHeaderValues(null)).toEqual([]);
    expect(secretHeaderValues({ authorization: "" })).toEqual([]);
  });
});

describe("redactSecretsFromText", () => {
  test("replaces every occurrence of a known secret literal by VALUE", () => {
    const key = "sk-test-abc123DEFsecretvalue";
    const body = `{"echoed":{"Authorization":"Bearer ${key}"},"seen":"${key}"}`;
    const out = redactSecretsFromText(body, [key]);
    expect(out).not.toContain(key);
    // The bearer frame around it is masked too (defense-in-depth), and the bare literal echo is gone.
    expect(out).toContain("█");
  });

  test("masks a Bearer token and an sk- key even when no exact literal is supplied (defense-in-depth)", () => {
    const out = redactSecretsFromText('{"h":"Bearer some-reshaped-token","k":"sk-abcdefghijklmnop01"}', []);
    expect(out).not.toContain("some-reshaped-token");
    expect(out).not.toContain("sk-abcdefghijklmnop01");
    expect(out).toContain("Bearer █");
  });

  test("does NOT over-redact legitimate content (no secrets present)", () => {
    const clean = '{"choices":[{"message":{"content":"ping ok — model responded"}}],"id":"chatcmpl-42"}';
    expect(redactSecretsFromText(clean, [])).toBe(clean);
  });

  test("scrubs even short configured secret literals — configured credential semantics outrank collision risk", () => {
    // Custom auth headers are user-defined and can be short; once a value is configured as a secret, an
    // upstream reflection must not survive merely because the value is collision-prone.
    const body = '{"content":"the alphabet abc appears here"}';
    const redacted = redactSecretsFromText(body, ["abc"]);
    expect(redacted).not.toContain("abc");
    expect(redacted).toContain("█");
  });

  test.each([
    [["a"], "a redacted marker cannot contain the one-character secret"],
    [["red"], "the historical marker contained red"],
    [["act"], "the historical marker contained act"],
    [["red", "act", "a"], "overlapping marker fragments"],
    [["token", "tok", "token", ""], "contained, duplicate, and empty values"],
    [["█", "■", "◆", "●", "¤", "§", "¶", "※"], "every proposed marker"],
  ])("the replacement is collision-safe for %j", (secrets) => {
    const out = redactSecretsFromText(`before ${secrets.filter(Boolean).join("/")} after`, secrets);
    for (const secret of new Set(secrets.filter(Boolean))) {
      expect(out).not.toContain(secret);
    }
    expect(redactSecretsFromText("nonsecret diagnostic", [""])).toBe("nonsecret diagnostic");
  });

  test("regex-meta in a secret literal is escaped (matched literally, not as a pattern)", () => {
    const key = "sk-a.b*c(secret)+lit";
    expect(redactSecretsFromText(`echo=${key}`, [key])).not.toContain(key);
  });

  // #1785 — a credential containing a JSON metacharacter. Every caller that hands this function a
  // SERIALIZED document (the wire capture, the inspector's surfaced request, an echoing endpoint's body)
  // holds such a credential only in its ESCAPED spelling, so the by-value belt must search for both. The
  // fixtures match NEITHER shape belt: an `sk-…`/`Bearer …` fixture is masked by the shape sweep whatever
  // the by-value belt does, and goes green against broken source (the #1760 instrument-lie).
  describe("a credential containing a JSON metacharacter (#1785)", () => {
    const quote = '"';
    const backslash = "\\";
    const tail = "tail7c1e4a";
    const quotedKey = `byo${quote}key${backslash}${tail}`;
    const escaped = (literal: string): string => JSON.stringify(literal).slice(1, -1);

    test("is removed from a SERIALIZED document, in both its raw and its escaped spelling", () => {
      const body = JSON.stringify({ auth: quotedKey, model: "local-model" });
      // The premise: the raw literal is not a substring of the serialized bytes at all.
      expect(body).not.toContain(quotedKey);
      const out = redactSecretsFromText(body, [quotedKey]);
      expect(out).not.toContain(quotedKey);
      expect(out).not.toContain(escaped(quotedKey));
      expect(out).toContain("local-model");
    });

    test("is removed WHOLE when the shape sweep also matches its frame — no fragment survives", () => {
      // ORDER pin. The `Bearer …` sweep's token class stops at the escape's backslash, so running it BEFORE
      // the by-value belt bit the literal in half (`Bearer byo` masked) and left the rest of the credential
      // standing — with the raw AND escaped literals now both absent, so nothing else could catch it. The
      // by-value belt is the PRIMARY guarantee and must see intact text; the shape sweep runs after it.
      const echoed = JSON.stringify({ headers: { authorization: `Bearer ${quotedKey}` }, note: "your request, reflected" });
      const out = redactSecretsFromText(echoed, [quotedKey]);
      expect(out).not.toContain(quotedKey);
      expect(out).not.toContain(escaped(quotedKey));
      // The distinctive tail of the credential is the fragment that used to survive the truncation.
      expect(out).not.toContain(tail);
      expect(out).toContain("your request, reflected");
    });

    test("the shape sweep still masks a RESHAPED token it holds no literal for (defense-in-depth kept)", () => {
      const out = redactSecretsFromText('{"h":"Bearer some-reshaped-token"}', [quotedKey]);
      expect(out).not.toContain("some-reshaped-token");
      expect(out).toContain("Bearer █");
    });

    test("the PRICE of the order: a suffix appended to our literal survives — the credential itself does not", () => {
      // Stated in the function header rather than hidden. When a reflected token has our exact literal as a
      // strict PREFIX, the literal pass masks the literal and the sweep stops at the marker, so the unknown
      // SUFFIX survives. That is the deliberate trade: removing OUR credential is the guarantee, masking an
      // unknown superstring is the bonus, and the bonus never outranks the guarantee.
      const plainKey = "byo-plain-key-9f3a2c";
      const out = redactSecretsFromText(`{"h":"Bearer ${plainKey}SUFFIX"}`, [plainKey]);
      expect(out).not.toContain(plainKey);
      expect(out).toContain("SUFFIX");
    });
  });
});

describe("applyIncludeExclude", () => {
  test("merges includeBody over the base (user wins)", () => {
    expect(applyIncludeExclude({ model: "m", temperature: 1 }, { temperature: 0.5, top_p: 0.8 }, null)).toEqual({ model: "m", temperature: 0.5, top_p: 0.8 });
  });

  test("excludeBody strips keys LAST — even one includeBody just added", () => {
    expect(applyIncludeExclude({ model: "m", reasoning: { effort: "high" } }, { extra: 1 }, ["reasoning", "extra"])).toEqual({ model: "m" });
  });

  test("no transforms → the base, merged", () => {
    expect(applyIncludeExclude({ a: 1 }, null, null)).toEqual({ a: 1 });
    expect(applyIncludeExclude({ a: 1 }, null, [])).toEqual({ a: 1 });
  });
});

describe("the D48 raw-wire builders (T2 — custom-byo + vLLM share these)", () => {
  test("rawWireTools wraps each WireTool in the {type:'function'} envelope, order preserved", () => {
    expect(
      rawWireTools([
        { name: "a", description: "da", parameters: { type: "object" } },
        { name: "b", description: "db", parameters: { type: "object" } },
      ]),
    ).toEqual([
      {
        type: "function",
        function: { name: "a", description: "da", parameters: { type: "object" } },
      },
      {
        type: "function",
        function: { name: "b", description: "db", parameters: { type: "object" } },
      },
    ]);
  });

  test("rawToolChoice: the three string modes pass through; the named form is the function object", () => {
    expect(rawToolChoice({ mode: "auto" })).toBe("auto");
    expect(rawToolChoice({ mode: "none" })).toBe("none");
    expect(rawToolChoice({ mode: "required" })).toBe("required");
    expect(rawToolChoice({ mode: "tool", name: "tick" })).toEqual({
      type: "function",
      function: { name: "tick" },
    });
  });

  test("rawResponseFormat: json_schema dialect, strict ONLY when the caller set it, description only when set", () => {
    // STRICTFMT — a translator never defaults a caller's optional wire knob: `strict:true` is a 400 on
    // OpenAI-family endpoints for our optional-by-construction schemas. vLLM PINS it at its own call site.
    expect(rawResponseFormat({ name: "s", schema: wireSchema({ type: "object" }) })).toEqual({
      type: "json_schema",
      json_schema: { name: "s", schema: { type: "object" } },
    });
    expect(rawResponseFormat({ name: "s", schema: wireSchema({}), strict: false, description: "d" })).toEqual({
      type: "json_schema",
      json_schema: { name: "s", schema: {}, strict: false, description: "d" },
    });
  });

  test("rawToolCallDeltas: fragments keep their wire index; one-shot entries (no index) use position", () => {
    expect(
      rawToolCallDeltas([
        { index: 2, id: "c2", function: { name: "n2", arguments: "{}" } },
        { id: "c0", function: { name: "n0", arguments: "{}" } },
      ]),
    ).toEqual([
      { index: 2, id: "c2", function: { name: "n2", arguments: "{}" } },
      { index: 1, id: "c0", function: { name: "n0", arguments: "{}" } },
    ]);
    expect(rawToolCallDeltas([])).toBeUndefined();
    expect(rawToolCallDeltas("not-an-array")).toBeUndefined();
    expect(rawToolCallDeltas(undefined)).toBeUndefined();
  });
});
