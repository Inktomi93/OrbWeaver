// A missing boot secret is generated only when no row depends on it; each dependent alone refuses and names the file.
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { ChatId } from "@orb/kit/ids";
import { MS_PER_HOUR } from "@orb/kit/time";
import { settleBootSecrets } from "@orb/server/entry/boot";
import { SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const SECRET_BOX_KEY = Buffer.alloc(32, 7);
const HEX_SECRET = /^[0-9a-f]{64}$/u;
const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;

interface AbsentSecrets {
  readonly credentialPath: string;
  readonly sessionPath: string;
  readonly settle: (now?: () => number) => ReturnType<typeof settleBootSecrets>;
}

async function absentSecretsFor(root: ServerTestHarness, resources: AsyncDisposableStack): Promise<AbsentSecrets> {
  const directory = await mkdtemp(join(tmpdir(), "boot-secrets-"));
  resources.defer(() => rm(directory, { recursive: true, force: true }));
  const credentialPath = join(directory, SECRET_FILE_NAMES.credentialsKey);
  const sessionPath = join(directory, SECRET_FILE_NAMES.sessionSecret);
  return {
    credentialPath,
    sessionPath,
    settle: (now = root.clock.now) =>
      settleBootSecrets({
        db: databaseHandle(root.db),
        now,
        credentialsKey: { kind: "absent", path: credentialPath },
        sessionSecret: { kind: "absent", path: sessionPath },
        reportKeyfile: () => undefined,
      }),
  };
}

async function expectMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

async function openRoom(root: ServerTestHarness): Promise<{ readonly host: Principal; readonly chatId: ChatId }> {
  const host = await root.principalFor((await root.actor()).id);
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [], opening: "none" });
  return { host, chatId: chat.id };
}

test("a database with no dependent row generates both absent keyfiles", async () => {
  await using resources = new AsyncDisposableStack();
  const root = resources.use(await createServerHarness());
  const secrets = await absentSecretsFor(root, resources);
  const settled = await secrets.settle();
  expect(settled.sessionSecret).toMatch(HEX_SECRET);
  expect(settled.secretBoxKey?.length).toBe(SECRET_BOX_KEY.length);
  for (const path of [secrets.credentialPath, secrets.sessionPath]) {
    // biome-ignore lint/suspicious/noBitwiseOperators: a permission mask is a bitwise AND.
    expect((await stat(path)).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
  }
});

test("a sealed provider credential refuses the absent credentials keyfile before either keyfile is written", async () => {
  await using resources = new AsyncDisposableStack();
  const root = resources.use(await createServerHarness({ secretBoxKey: SECRET_BOX_KEY }));
  await root.services.credentials.add({ principal: await root.principalFor(root.ownerId), provider: "custom-openai", key: "boot-secrets-sealed-key" });
  const secrets = await absentSecretsFor(root, resources);
  await expect(secrets.settle()).rejects.toThrow(`CREDENTIALS_KEY is unset and the keyfile ${secrets.credentialPath} does not exist`);
  await expectMissing(secrets.credentialPath);
  await expectMissing(secrets.sessionPath);
});

test("a session row alone refuses the absent session keyfile after the credentials keyfile settles", async () => {
  await using resources = new AsyncDisposableStack();
  const root = resources.use(await createServerHarness());
  await root.app.sessions.create({ userId: root.ownerId });
  const secrets = await absentSecretsFor(root, resources);
  await expect(secrets.settle()).rejects.toThrow(`SESSION_SECRET is unset and the keyfile ${secrets.sessionPath} does not exist`);
  expect((await stat(secrets.credentialPath)).isFile()).toBe(true);
  await expectMissing(secrets.sessionPath);
});

test("a redeemable invite alone refuses the absent session keyfile until its expiry passes", async () => {
  await using resources = new AsyncDisposableStack();
  const root = resources.use(await createServerHarness());
  const { host, chatId } = await openRoom(root);
  const expiresAt = root.clock.now() + MS_PER_HOUR;
  await root.services.chat.createInvite({ principal: host, chatId, input: { expiresAt } });
  const secrets = await absentSecretsFor(root, resources);
  await expect(secrets.settle(() => expiresAt - 1)).rejects.toThrow(`SESSION_SECRET is unset and the keyfile ${secrets.sessionPath} does not exist`);
  await expectMissing(secrets.sessionPath);
  // An invite at its expiry can no longer be redeemed, so nothing depends on the pepper.
  expect((await secrets.settle(() => expiresAt)).sessionSecret).toMatch(HEX_SECRET);
  expect((await stat(secrets.sessionPath)).isFile()).toBe(true);
});

test("resolved secrets pass through over every dependent, and a resolved null stays null, with nothing written", async () => {
  await using resources = new AsyncDisposableStack();
  const root = resources.use(await createServerHarness({ secretBoxKey: SECRET_BOX_KEY }));
  await root.services.credentials.add({ principal: await root.principalFor(root.ownerId), provider: "custom-openai", key: "boot-secrets-resolved-key" });
  await root.app.sessions.create({ userId: root.ownerId });
  const { credentialPath, sessionPath } = await absentSecretsFor(root, resources);
  const explicitSecret = "boot-secrets-explicit-session-secret-value";
  const settle = (credentialsKey: Buffer | null, sessionSecret: string | null): ReturnType<typeof settleBootSecrets> =>
    settleBootSecrets({
      db: databaseHandle(root.db),
      now: root.clock.now,
      credentialsKey: { kind: "resolved", value: credentialsKey, path: credentialPath },
      sessionSecret: { kind: "resolved", value: sessionSecret, path: sessionPath },
      reportKeyfile: () => undefined,
    });
  expect(await settle(SECRET_BOX_KEY, explicitSecret)).toEqual({ secretBoxKey: SECRET_BOX_KEY, sessionSecret: explicitSecret });
  expect(await settle(null, null)).toEqual({ secretBoxKey: null, sessionSecret: null });
  await expectMissing(credentialPath);
  await expectMissing(sessionPath);
});

test("an open-ended invite refuses the absent session keyfile at any time", async () => {
  await using resources = new AsyncDisposableStack();
  const root = resources.use(await createServerHarness());
  const { host, chatId } = await openRoom(root);
  await root.services.chat.createInvite({ principal: host, chatId, input: { expiresAt: null } });
  const secrets = await absentSecretsFor(root, resources);
  await expect(secrets.settle(() => Number.MAX_SAFE_INTEGER)).rejects.toThrow(`SESSION_SECRET is unset and the keyfile ${secrets.sessionPath} does not exist`);
  await expectMissing(secrets.sessionPath);
});
