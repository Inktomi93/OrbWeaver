// deriveWireShape (D66, Finding-1 fix, part 01 §3) — the DOMAIN-side (api, source) → wire-shape key. The
// per-(api, source) → shape matrix. This is the carriage that makes the per-shape `turns` cells
// producible (they were invisible without it).

import type { CredentialSource } from "@orb/contracts/connection";
import { describe } from "vitest";
import { deriveWireShape, WIRE_SHAPES } from "../../../../../packages/server/src/domain/connection/catalog/wire-shape.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const SOURCES: readonly CredentialSource[] = ["max-pro-sub", "openrouter", "vllm", "local-light", "custom_openai"];

describe("deriveWireShape — the (api, source) → wire-shape key", () => {
  test("chat-completions → openai-compat for EVERY source (api-determined)", () => {
    for (const source of SOURCES) {
      expect(deriveWireShape("chat-completions", source)).toBe("openai-compat");
    }
  });

  test("responses → openai-responses", () => {
    expect(deriveWireShape("responses", "openrouter")).toBe("openai-responses");
  });

  test("agent-sdk → anthropic-cli (the subprocess transport, modes 1/2/3 share one profile)", () => {
    expect(deriveWireShape("agent-sdk", "max-pro-sub")).toBe("anthropic-cli");
    expect(deriveWireShape("agent-sdk", "openrouter")).toBe("anthropic-cli");
  });

  test("every produced shape is a member of the WIRE_SHAPES union (no orphan string)", () => {
    for (const api of ["chat-completions", "responses", "agent-sdk"] as const) {
      expect(WIRE_SHAPES).toContain(deriveWireShape(api, "openrouter"));
    }
  });
});
