import type { SessionView } from "@orb/contracts/session";
import type { SessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "vitest";

// Branded SessionId built at the untyped seam (castId is the sanctioned cast) — no pasted ids (noSecrets).
const SAMPLE_SESSION_ID = castId<SessionId>("session_sample");

// A live device: revokedAt null (not yet logged-out/kicked), userAgent present.
const SAMPLE_VIEW: SessionView = {
  id: SAMPLE_SESSION_ID,
  createdAt: 1_700_000_000_000,
  lastSeenAt: 1_700_000_300_000,
  expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
  revokedAt: null,
  userAgent: "sample-agent",
};

test("SessionView pins the device-list shape: id+createdAt+lastSeenAt+expiresAt+revokedAt+userAgent", () => {
  expect(Object.keys(SAMPLE_VIEW).sort()).toEqual(
    ["createdAt", "expiresAt", "id", "lastSeenAt", "revokedAt", "userAgent"].sort(),
  );
});

// The token is not identity: the opaque token, its peppered hash, the SESSION_SECRET pepper, and the
// owning userId are server-only — none may leak onto the admin-facing device view.
test("SessionView carries NO secret/identity fields (token, tokenHash, sessionSecret, userId absent)", () => {
  expect("token" in SAMPLE_VIEW).toBe(false);
  expect("tokenHash" in SAMPLE_VIEW).toBe(false);
  expect("sessionSecret" in SAMPLE_VIEW).toBe(false);
  expect("userId" in SAMPLE_VIEW).toBe(false);
  // D12 / spine PIN: this is the BFF browser session, NOT the agent-sdk chat session — no SDK-frame
  // lineage fields (`session_entries` is a different table in a different tier).
  expect("seedFrames" in SAMPLE_VIEW).toBe(false);
});

test("revokedAt and userAgent are nullable (a revoked device + a UA-less mint)", () => {
  const revoked: SessionView = { ...SAMPLE_VIEW, revokedAt: 1_700_000_600_000 };
  expect(revoked.revokedAt).toBe(1_700_000_600_000);

  const headless: SessionView = { ...SAMPLE_VIEW, userAgent: null };
  expect(headless.userAgent).toBeNull();

  // The live device keys back to null revokedAt (the column's "not yet revoked" sentinel).
  expect(SAMPLE_VIEW.revokedAt).toBeNull();
});
