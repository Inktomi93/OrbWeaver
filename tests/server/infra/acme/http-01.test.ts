// infra/acme/http-01 — the HTTP-01 responder answers the one pending token and 404s everything else (D269). A real
// listener on an ephemeral loopback port, read with a plain fetch, as the certificate authority reads it.

import type { OpenChallenge } from "@orb/server/infra/acme";
import { openChallengeResponder } from "@orb/server/infra/acme";
import { afterEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { freeLoopbackPort } from "../../../support/node/free-port.ts";

const TOKEN = "tok_Abc123-xyz";
const KEY_AUTHORIZATION = `${TOKEN}.thumbprint_Q1w2e3`;
let open: OpenChallenge | null = null;
let port = 0;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function openAt(): Promise<void> {
  port = await freeLoopbackPort();
  open = await openChallengeResponder({ port, host: "127.0.0.1", token: TOKEN, keyAuthorization: KEY_AUTHORIZATION });
}

function url(path: string): string {
  return `http://127.0.0.1:${String(port)}${path}`;
}

describe("openChallengeResponder", () => {
  test("GET on the exact pending token path answers the key authorization as text/plain", async () => {
    await openAt();
    const answer = await fetch(url(`/.well-known/acme-challenge/${TOKEN}`));
    expect(answer.status).toBe(200);
    expect(answer.headers.get("content-type")).toBe("text/plain");
    expect(await answer.text()).toBe(KEY_AUTHORIZATION);
  });

  test("HEAD on the token path answers 200 with no body", async () => {
    await openAt();
    const answer = await fetch(url(`/.well-known/acme-challenge/${TOKEN}`), { method: "HEAD" });
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe("");
  });

  test("every other path, token, query and method is a 404 with an empty body", async () => {
    await openAt();
    const misses: readonly [string, RequestInit][] = [
      ["/", {}],
      ["/api/auth/config", {}],
      ["/.well-known/acme-challenge/", {}],
      [`/.well-known/acme-challenge/${TOKEN}x`, {}],
      ["/.well-known/acme-challenge/other_token", {}],
      [`/.well-known/acme-challenge/${TOKEN}?probe=1`, {}],
      [`/.well-known/acme-challenge/${TOKEN}/`, {}],
      [`/.well-known/acme-challenge/../acme-challenge/${TOKEN}x`, {}],
      [`/.well-known/acme-challenge/${TOKEN}`, { method: "POST", body: "x" }],
      [`/.well-known/acme-challenge/${TOKEN}`, { method: "PUT", body: "x" }],
    ];
    for (const [path, init] of misses) {
      const answer = await fetch(url(path), init);
      expect({ path, method: init.method ?? "GET", status: answer.status, body: await answer.text() }).toEqual({
        path,
        method: init.method ?? "GET",
        status: 404,
        body: "",
      });
    }
  });

  test("after close the port refuses connections: nothing answers between challenges", async () => {
    await openAt();
    await open?.close();
    open = null;
    await expect(fetch(url(`/.well-known/acme-challenge/${TOKEN}`))).rejects.toThrow();
  });

  test("a port already in use rejects the open, so the order fails instead of answering nothing", async () => {
    await openAt();
    await expect(openChallengeResponder({ port, host: "127.0.0.1", token: TOKEN, keyAuthorization: KEY_AUTHORIZATION })).rejects.toThrow(/EADDRINUSE/u);
  });
});
