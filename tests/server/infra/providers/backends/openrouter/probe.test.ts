// backends/openrouter probe — the credential-health probe: a credits round-trip classified into
// CredentialHealth (ok / revoked / unreachable). The SDK client is a fake; the clock is injected.

import { probeOpenRouterCredential } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const FIXED_NOW = 5000;
type ProbeClient = Parameters<typeof probeOpenRouterCredential>[0];

describe("probeOpenRouterCredential", () => {
  test("a successful credits read → ok, stamped with the injected clock", async () => {
    // FABRICATION-OK: hand-built fake vendor SDK client — the probe only calls `credits.getCredits`.
    const client = {
      credits: { getCredits: (): Promise<unknown> => Promise.resolve({ data: {} }) },
    } as unknown as ProbeClient;
    expect(await probeOpenRouterCredential(client, () => FIXED_NOW)).toEqual({
      status: "ok",
      checkedAt: FIXED_NOW,
    });
  });

  test("a 401-class error → revoked (with a sanitized reason)", async () => {
    // FABRICATION-OK: hand-built fake vendor SDK client — the probe only calls `credits.getCredits`.
    const client = {
      credits: {
        getCredits: (): Promise<unknown> => Promise.reject(new Error("401 invalid api key")),
      },
    } as unknown as ProbeClient;
    const health = await probeOpenRouterCredential(client, () => FIXED_NOW);
    expect(health.status).toBe("revoked");
    expect(health.checkedAt).toBe(FIXED_NOW);
  });

  test("any other error → unreachable", async () => {
    // FABRICATION-OK: hand-built fake vendor SDK client — the probe only calls `credits.getCredits`.
    const client = {
      credits: { getCredits: (): Promise<unknown> => Promise.reject(new Error("ECONNRESET")) },
    } as unknown as ProbeClient;
    expect((await probeOpenRouterCredential(client, () => FIXED_NOW)).status).toBe("unreachable");
  });

  // SHAPE-BELT CONTROL (#1760/#1785/#1809): this fixture matches the `sk-…` shape, so `redactSecretsFromText`'s
  // defense-in-depth sweep removes it whatever the BY-VALUE belt does — it pins the sweep, never the by-value
  // scrub. The shape-blind by-value pin is at the foot of this file.
  test("a provider-reflected credential is scrubbed from the UI-visible health reason", async () => {
    const secret = "sk-or-probe-reflected-123456";
    const client: ProbeClient = {
      credits: { getCredits: (): Promise<never> => Promise.reject(new Error(`401 invalid api key ${secret}`)) },
    };
    const health = await probeOpenRouterCredential(client, () => FIXED_NOW, [secret]);

    expect(health.status).toBe("revoked");
    if (health.status !== "revoked") {
      throw new Error(`expected revoked health, got ${health.status}`);
    }
    expect(health.reason).not.toContain(secret);
    expect(health.reason).toContain("█");
  });
});

// #1809 (SECURITY): the probe's reason was `redactSecretsFromText(sanitizeApiError(errorMessage(err)), …)` —
// SANITIZE, then scrub. `sanitizeApiError` replaces each `<…>` span with a space and caps at 500 chars, so a
// credential holding markup (or straddling the cap) was already in fragments when the by-value belt looked
// for it; neither spelling matched and the remainder rode `CredentialHealth.reason` to the UI and the
// credential audit trail. Scrub first, mangle second.
//
// SHAPE-BLIND FIXTURE (#1760/#1785): the `sk-or-probe-reflected-123456` arm above is the labelled SHAPE-BELT
// control — `redactSecretsFromText`'s `sk-…` sweep removes it whatever the by-value belt does, so it cannot
// serve as the by-value pin. This one matches neither `sk-…` nor `Bearer …` and is assembled from parts.
describe("probeOpenRouterCredential — the by-value scrub runs BEFORE sanitize (#1809)", () => {
  test("a markup-bearing reflected credential is scrubbed whole, not fragmented into the reason", async () => {
    const lt = "<";
    const gt = ">";
    const angleKey = `byo${lt}tag${gt}cred4d8e1b6a2c90`;
    const angleTail = "cred4d8e1b6a2c90";
    const client: ProbeClient = {
      credits: { getCredits: (): Promise<never> => Promise.reject(new Error(`401 invalid api key ${angleKey}`)) },
    };

    const health = await probeOpenRouterCredential(client, () => FIXED_NOW, [angleKey]);

    expect(health.status).toBe("revoked");
    if (health.status !== "revoked") {
      throw new Error(`expected revoked health, got ${health.status}`);
    }
    expect(health.reason).not.toContain(angleKey);
    expect(health.reason).not.toContain(angleTail);
    expect(health.reason).toContain("█");
    // Non-vacuity: `redactKnownSecrets` fail-closes to "", which would satisfy every not.toContain above.
    expect(health.reason).toContain("invalid api key");
  });
});
