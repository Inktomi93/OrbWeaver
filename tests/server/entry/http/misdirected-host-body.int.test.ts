// @subject packages/server/src/entry/http/host-allowlist.ts
// The client reads every auth refusal through `authErrorResponseSchema` (`packages/client/src/data/auth-bootstrap.ts`), so the
// host allowlist's 421 body must parse there, or login shows the status line instead of the server's sentence.
import { authErrorResponseSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const FOREIGN_HOST = "chat.example.com";
const MISDIRECTED_REQUEST = 421;

test("the host allowlist's refusal of an auth call parses as the auth error the client reads", async () => {
  await using root = await createServerHarness();
  const response = await root.http.request("/api/auth/login", { method: "POST", headers: { host: FOREIGN_HOST, [CSRF_HEADER]: "1" } });
  expect(response.status).toBe(MISDIRECTED_REQUEST);
  const parsed = authErrorResponseSchema.safeParse(await response.json());
  expect(parsed.error?.issues ?? []).toEqual([]);
  expect(parsed.data?.error).toContain(FOREIGN_HOST);
});
