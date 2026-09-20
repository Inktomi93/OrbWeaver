// The Saved-keys row's pure copy model (inference program §5.3a). Three claims worth a test and no
// tautologies: a key NAMES ITSELF one way (so the visible label and every action's accessible name are the
// same string — WCAG 2.5.3 by identity), the reuse fact reads as a SENTENCE at every count because the row's
// two confirms quote it mid-sentence, and the revocation cause is a CLOSED dispatch that never echoes
// anything the provider said.

import {
  keyRowSubtitle,
  keySubject,
  reuseSentence,
  revokedReasonCopy,
} from "../../../../../packages/client/src/features/credentials/lib/credential-key-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a key names itself ONE way — the row's title and every action's subject are the same string", () => {
  // `Replace the <provider> "<label>" key` / `Revoke the <provider> "<label>" key` are built from this, so a
  // second spelling for the title would put the visible label and the accessible name out of agreement.
  expect(keySubject("OpenRouter", "work")).toBe('OpenRouter "work"');
  expect(`Revoke the ${keySubject("OpenRouter", "work")} key`).toBe('Revoke the OpenRouter "work" key');
});

test("the reuse sentence survives every count, including the zero a fresh key has", () => {
  expect(reuseSentence(0)).toBe("No connection uses this key yet");
  expect(reuseSentence(1)).toBe("1 connection uses this key");
  expect(reuseSentence(3)).toBe("3 connections use this key");
});

test("the subtitle is the COUNT, and gains the cause ONLY on a revoked row", () => {
  expect(keyRowSubtitle({ revokedAt: null, revokedReason: null }, 3)).toEqual({ text: "used by 3 connections", wrap: false });
  expect(keyRowSubtitle({ revokedAt: null, revokedReason: null }, 1).text).toBe("used by 1 connection");
  // `wrap` rides the cause: the line becomes a sentence, and a clipped explanation of a dead credential is
  // worse than none.
  expect(keyRowSubtitle({ revokedAt: 1, revokedReason: "auth_failed" }, 2)).toEqual({
    text: "used by 2 connections · Revoked — the provider rejected this key",
    wrap: true,
  });
  // A revoked row whose cause the server never wrote shows the chip and GUESSES NOTHING.
  expect(keyRowSubtitle({ revokedAt: 1, revokedReason: null }, 0)).toEqual({ text: "used by 0 connections", wrap: false });
});

test("each revocation cause gets its own sentence, and `unreachable` never blames the provider", () => {
  expect(revokedReasonCopy("auth_failed")).toBe("Revoked — the provider rejected this key");
  expect(revokedReasonCopy("user")).toBe("Revoked by you");
  // Nothing answered, so nothing judged the key — saying "rejected" here costs the user a working key.
  expect(revokedReasonCopy("unreachable")).toBe("Revoked — the endpoint stopped responding");
  expect(revokedReasonCopy("unreachable")).not.toContain("rejected");
});
