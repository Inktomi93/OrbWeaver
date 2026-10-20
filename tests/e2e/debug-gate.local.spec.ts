// E2E (LOCAL): the /api/_debug token states, and D17 over real password-login cookies: an owner session opens the
// door, a plain user or a delegated admin does not, and the wire ring holding another account's prompt bytes stays shut.
import { randomBytes } from "node:crypto";
import { wireCapturesResponseSchema } from "@orb/contracts/debug";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { E2E_FIXTURE_PROVIDER_PORT } from "@orb/tooling/floor/host/ports";
import { expect, test } from "@playwright/test";
import type { ActorClient } from "./support/actors.ts";
import { configureCustomProvider, loginLocal, ownerActor } from "./support/actors.ts";
import { ALL_ADMITTED, bugReportStatus, debugOutcomes, describeDebugTokenStates, gateRefusalReason, operatorToken, RELAYED } from "./support/debug-gate.ts";
import { startFixtureProvider } from "./support/fixture-provider.ts";
import { LOCAL_MEMBER, LOCAL_OWNER } from "./support/modes.ts";

const ADMIN_PASSWORD = "debug-gate-admin-password";
const WIRE_CAPTURES = "/api/_debug/wire/captures";
const MARKER_BYTES = 4;

function marker(label: string): string {
  return `${label}-${randomBytes(MARKER_BYTES).toString("hex")}`;
}

/** A delegated admin: a real account the owner promoted, signed in with its own password. */
async function delegatedAdmin(origin: string): Promise<ActorClient> {
  const handle = castId<Handle>(marker("debug-gate-admin"));
  await ownerActor(origin).trpc.admin.createUser.mutate({ handle, password: ADMIN_PASSWORD, role: "admin" });
  const admin = await loginLocal(origin, handle, ADMIN_PASSWORD);
  expect((await admin.whoami()).role).toBe("admin");
  return admin;
}

describeDebugTokenStates("local");

test("an OWNER session cookie authorizes", async ({ baseURL }) => {
  const owner = await loginLocal(baseURL ?? "", castId<Handle>(LOCAL_OWNER.handle), LOCAL_OWNER.password);
  expect(await debugOutcomes(baseURL ?? "", { ...RELAYED, cookie: owner.headers["cookie"] ?? "" })).toEqual(ALL_ADMITTED);
});

test("a plain USER session cookie is still refused (the role gate denies below owner)", async ({ baseURL }) => {
  const user = await loginLocal(baseURL ?? "", castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
  expect(await gateRefusalReason(baseURL ?? "", { ...RELAYED, ...user.headers })).toEqual(expect.any(String));
});

test("a plain USER session cookie is refused on the WRITE too", async ({ baseURL }) => {
  const user = await loginLocal(baseURL ?? "", castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
  expect(await bugReportStatus(baseURL ?? "", { ...RELAYED, ...user.headers })).toBe(401);
});

test("the narrowing is the GATE, not one route — a delegated admin is refused on every probe", async ({ baseURL }) => {
  const admin = await delegatedAdmin(baseURL ?? "");
  expect(await gateRefusalReason(baseURL ?? "", { ...RELAYED, ...admin.headers })).toEqual(expect.any(String));
});

test.describe("D17: a DELEGATED admin is not the box operator — the wire ring is the worst case", () => {
  test("an ADMIN session cookie cannot read another user's provider wire bytes; the OWNER and the operator token can", async ({ baseURL }) => {
    test.setTimeout(120_000);
    const origin = baseURL ?? "";
    const owner = ownerActor(origin);
    const promptMarker = marker("debug-gate-foreign-prompt");
    const fixture = await startFixtureProvider(E2E_FIXTURE_PROVIDER_PORT);
    let restoreProvider: (() => Promise<void>) | undefined;
    const character = await owner.trpc.character.create.mutate({
      input: { handle: marker("debug-gate-card"), name: "Warden", description: "wire ring witness" },
    });
    try {
      restoreProvider = await configureCustomProvider(owner, fixture.baseUrl, "fixture-model");
      const { chat } = await owner.trpc.chat.startChat.mutate({ characterIds: [character.id] });
      await owner.trpc.chat.send.mutate({ chatId: chat.id, timeZone: UTC_TIME_ZONE, content: promptMarker, intent: { maxOutputTokens: 64 } });
      const read = async (headers: Readonly<Record<string, string>>): Promise<{ readonly status: number; readonly text: string }> => {
        const response = await fetch(`${origin}${WIRE_CAPTURES}?chatId=${chat.id}`, { headers: { ...RELAYED, ...headers } });
        return { status: response.status, text: await response.text() };
      };
      // The operator's token reads the ring the owner's turn just wrote; this is the fence against an empty ring.
      await expect
        .poll(async () => {
          const { status, text } = await read(operatorToken());
          return status === 200 && wireCapturesResponseSchema.parse(JSON.parse(text)).captures.length > 0 && text.includes(promptMarker);
        })
        .toBe(true);
      const admin = await delegatedAdmin(origin);
      const refused = await read(admin.headers);
      expect(refused.text).not.toContain(promptMarker);
      expect(refused.status).toBe(401);
      const ownerSession = await loginLocal(origin, castId<Handle>(LOCAL_OWNER.handle), LOCAL_OWNER.password);
      const ownerRead = await read({ cookie: ownerSession.headers["cookie"] ?? "" });
      expect(ownerRead.status).toBe(200);
      expect(ownerRead.text).toContain(promptMarker);
      await owner.trpc.chat.delete.mutate({ chatId: chat.id });
    } finally {
      await restoreProvider?.();
      await owner.trpc.character.remove.mutate({ characterId: character.id });
      await fixture.close();
    }
  });
});
