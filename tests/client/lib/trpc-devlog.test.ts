// The [trpc] one-line formatter: → up / ← settle / ✗ error routing, the secret-redaction contract
// (bare `key` EXACT-match so queryKey stays visible; substring match for the token/apiKey class —
// neo V9-5: a dev logger once printed credentials.add's plaintext key), input truncation, and the
// result summaries. Console is spied (restoreMocks resets between tests).

import type { TrpcOpLogEntry } from "@orb/client/lib";
import { formatTrpcOp } from "@orb/client/lib";
import { describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures";

function upEntry(input: unknown, path = "character.get"): TrpcOpLogEntry {
  return { direction: "up", type: "query", path, input };
}

function downEntry(result: unknown, elapsedMs = 14): TrpcOpLogEntry {
  return {
    direction: "down",
    type: "query",
    path: "character.list",
    input: undefined,
    elapsedMs,
    result,
  };
}

/** First %s-template arg of the first console call — the actual log line. */
function firstLine(spy: ReturnType<typeof vi.spyOn>): string {
  const call = spy.mock.calls[0];
  expect(call).toBeDefined();
  return String(call?.[0]);
}

describe("formatTrpcOp", () => {
  test("up: one info line with arrow, op type, path, and compact input", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    formatTrpcOp(upEntry({ characterId: "char_abc" }));
    expect(info).toHaveBeenCalledTimes(1);
    const line = firstLine(info);
    expect(line).toContain("[trpc]");
    expect(line).toContain("→ query character.get");
    expect(line).toContain('{"characterId":"char_abc"}');
  });

  test("redaction: bare `key` + token-class keys are scrubbed; queryKey survives; arrays + depth covered", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    formatTrpcOp(
      upEntry(
        {
          key: "sk-plaintext-secret",
          apiKey: "ak-123",
          accessToken: "tok-456",
          authorization: "Bearer zzz",
        },
        "credentials.add",
      ),
    );
    const secretsLine = firstLine(info);
    expect(secretsLine).not.toContain("sk-plaintext-secret");
    expect(secretsLine).not.toContain("ak-123");
    expect(secretsLine).not.toContain("tok-456");
    expect(secretsLine).not.toContain("Bearer zzz");
    expect(secretsLine).toContain("[redacted]");

    // Bare `key` matches EXACTLY — `queryKey` (and plain values) stay visible; the scrub
    // recurses into arrays/objects (nested password redacted, sibling name kept).
    info.mockClear();
    formatTrpcOp(upEntry({ queryKey: ["chars"], nested: [{ password: "hunter2", name: "Kira" }] }));
    const mixedLine = firstLine(info);
    expect(mixedLine).not.toContain("hunter2");
    expect(mixedLine).toContain('"queryKey":["chars"]');
    expect(mixedLine).toContain('"name":"Kira"');
  });

  test("long inputs truncate to one compact line; circular inputs degrade to [unserializable]", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    formatTrpcOp(upEntry({ blob: "x".repeat(500) }));
    const long = firstLine(info);
    expect(long).toContain("…");
    expect(long.length).toBeLessThan(250);

    info.mockClear();
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    formatTrpcOp(upEntry(circular));
    expect(firstLine(info)).toContain("[unserializable]");
  });

  test("down success: ← line with ms + row-count summary for array data (envelope unwrapped)", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    formatTrpcOp(downEntry({ result: { data: [1, 2, 3] } }));
    const line = firstLine(info);
    expect(line).toContain("← query character.list");
    expect(line).toContain("14ms · 3 rows");

    info.mockClear();
    formatTrpcOp(downEntry({ result: { data: [1] } }));
    expect(firstLine(info)).toContain("1 row");

    info.mockClear();
    formatTrpcOp(downEntry({ result: { data: { id: "a", name: "b" } } }));
    expect(firstLine(info)).toContain("{id,name}");

    info.mockClear();
    formatTrpcOp(downEntry({ result: {} }));
    expect(firstLine(info)).toContain("· —");
  });

  test("down error: console.error ✗ line with ms + message; info channel untouched", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    formatTrpcOp(downEntry(new Error("DomainNoCredentialError: no key for role"), 5142));
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const line = firstLine(error);
    expect(line).toContain("✗ query character.list");
    expect(line).toContain("5142ms");
    expect(line).toContain("DomainNoCredentialError");
  });
});
