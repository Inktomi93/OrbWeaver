// `seed multi-user` against a db that already holds a user named like the fixture member (a cloned container db):
// the member's password is reset to the fixture password, so the fixture login works instead of staying locked out.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { vi } from "vitest";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import { runMultiUserSeed } from "../../../tooling/src/seed/ops/multi-user.ts";

const MEMBER_PASSWORD = "member-fixture-pass";

interface Call {
  readonly proc: string;
  readonly body: unknown;
}

/** A local-mode server's HTTP surface as `seed multi-user` uses it, over the given user list. */
async function fakeServer(users: readonly { readonly id: string; readonly handle: string }[]): Promise<{
  readonly base: string;
  readonly calls: Call[];
  readonly close: () => Promise<void>;
}> {
  const calls: Call[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const url = request.url ?? "";
      const raw = Buffer.concat(chunks).toString("utf8");
      const proc = url.slice("/api/trpc/".length);
      if (url.startsWith("/api/trpc/")) {
        calls.push({ proc, body: raw === "" ? null : JSON.parse(raw) });
      }
      const bodies: Record<string, unknown> = {
        "/api/auth/config": { multiHumanCapable: true, mode: "local" },
      };
      response.writeHead(200, { "content-type": "application/json", "set-cookie": "orb_session_insecure=minted; Path=/" });
      response.end(JSON.stringify(bodies[url] ?? { result: { data: proc === "admin.listUsers" ? users : null } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    calls,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function seedAgainst(users: readonly { readonly id: string; readonly handle: string }[]): Promise<readonly Call[]> {
  const server = await fakeServer(users);
  vi.stubEnv("SEED_BASE_URL", server.base);
  vi.stubEnv("FIXTURE_MEMBER_PASSWORD", MEMBER_PASSWORD);
  try {
    expect(await runMultiUserSeed()).toBe(EXIT.clean);
    return server.calls;
  } finally {
    vi.unstubAllEnvs();
    await server.close();
  }
}

test("a member handle that already exists gets the fixture password instead of staying locked out", async () => {
  const calls = await seedAgainst([
    { id: "user_owner", handle: "owner" },
    { id: "user_existing_member", handle: "Member" },
  ]);
  expect(calls).toContainEqual({ proc: "admin.resetPassword", body: { userId: "user_existing_member", password: MEMBER_PASSWORD } });
  expect(calls.some((call) => call.proc === "admin.createUser")).toBe(false);
});

test("a missing member is created, and nobody else's password is touched", async () => {
  const calls = await seedAgainst([{ id: "user_owner", handle: "owner" }]);
  expect(calls).toContainEqual({ proc: "admin.createUser", body: { handle: "member", password: MEMBER_PASSWORD, role: "user" } });
  expect(calls.filter((call) => call.proc === "admin.resetPassword").map((call) => call.body)).toEqual([expect.objectContaining({ userId: "user_owner" })]);
});
