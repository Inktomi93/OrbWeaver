// entry/boot/boot-secrets — the owner ruling on a missing boot secret: generate it only when no row depends
// on it, otherwise refuse and name the file. Real schema over a `:memory:` db, real keyfiles in a temp dir.

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderId } from "@orb/contracts/inference";
import { chatInvites, sessions, userCredentials } from "@orb/db";
import type { ChatInviteId, SessionId, UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { settleBootSecrets } from "@orb/server/entry/boot";
import { SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import type { BootSecretResolution } from "@orb/server/infra/crypto";
import { decode32Bytes } from "@orb/server/infra/crypto";
import { afterEach, describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { seedChat } from "../../../support/factories/chat.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { createSeededIds } from "../../../support/ids.ts";

const Hex64 = /^[0-9a-f]{64}$/u;
const ids = createSeededIds();
const dirs: string[] = [];
function secretsDir(): string {
  const dir = join(mkdtempSync(join(tmpdir(), "orb-boot-secrets-")), "secrets");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(join(dir, ".."), { recursive: true, force: true });
  }
});

const NOW = 1_700_000_000_000;
const now = (): number => NOW;

function absent(dir: string): { now: () => number; credentialsKey: BootSecretResolution<Buffer>; sessionSecret: BootSecretResolution<string> } {
  return {
    now,
    credentialsKey: { kind: "absent", path: join(dir, SECRET_FILE_NAMES.credentialsKey) },
    sessionSecret: { kind: "absent", path: join(dir, SECRET_FILE_NAMES.sessionSecret) },
  };
}

/** A pending invite whose peppered token hash can still be redeemed until `expiresAt` (null: never expires). */
async function plantInvite(db: Awaited<ReturnType<typeof freshDb>>, expiresAt: number | null): Promise<void> {
  const chat = await seedChat(db);
  await db
    .insert(chatInvites)
    .values({ id: castId<ChatInviteId>(ids.next("chat_invite")), chatId: chat.id, tokenHash: `peppered-${ids.next("hash")}`, expiresAt });
}

describe("settleBootSecrets", () => {
  test("an empty db generates both absent keyfiles at mode 0600 and returns what it wrote", async () => {
    const db = await freshDb();
    const dir = secretsDir();
    const settled = await settleBootSecrets({ db, ...absent(dir) });
    expect(settled.sessionSecret).toMatch(Hex64);
    expect(settled.secretBoxKey?.length).toBe(32);
    for (const name of Object.values(SECRET_FILE_NAMES)) {
      // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
      expect(statSync(join(dir, name)).mode & 0o777).toBe(0o600);
    }
    expect(readdirSync(dir).sort()).toEqual(Object.values(SECRET_FILE_NAMES).sort());
    expect(decode32Bytes(settled.sessionSecret ?? "")?.toString("hex")).toBe(settled.sessionSecret);
  });

  test("a sealed credential row with the credentials keyfile absent refuses, names the file, and writes nothing", async () => {
    const db = await freshDb();
    const dir = secretsDir();
    const owner = await seedUser(db);
    await db.insert(userCredentials).values({
      id: castId<UserCredentialId>(ids.next("cred")),
      ownerId: owner.id,
      provider: castId<ProviderId>("openrouter"),
      ciphertext: "c",
      iv: "i",
      tag: "t",
    });
    await expect(settleBootSecrets({ db, ...absent(dir) })).rejects.toThrow(join(dir, SECRET_FILE_NAMES.credentialsKey));
    expect(existsSync(dir)).toBe(false);
  });

  test("a user with a password hash and the session keyfile absent refuses, names the file, and writes nothing", async () => {
    const db = await freshDb();
    const dir = secretsDir();
    await seedUser(db, { passwordHash: "scrypt$not-a-real-hash" });
    await expect(settleBootSecrets({ db, ...absent(dir) })).rejects.toThrow(join(dir, SECRET_FILE_NAMES.sessionSecret));
    expect(existsSync(join(dir, SECRET_FILE_NAMES.sessionSecret))).toBe(false);
  });

  test("a session row alone, with no password anywhere, still refuses the absent session keyfile", async () => {
    const db = await freshDb();
    const dir = secretsDir();
    const user = await seedUser(db);
    await db.insert(sessions).values({ id: castId<SessionId>(ids.next("sess")), userId: user.id, tokenHash: "peppered", expiresAt: 1 });
    await expect(settleBootSecrets({ db, ...absent(dir) })).rejects.toThrow(join(dir, SECRET_FILE_NAMES.sessionSecret));
    expect(existsSync(join(dir, SECRET_FILE_NAMES.sessionSecret))).toBe(false);
  });

  // A chat invite's token hash is peppered with the session secret too (`entry/compose/chat.ts` wires the
  // same hasher), so a link that can still be redeemed depends on it as much as a session does.
  test("a live, unexpired invite alone refuses the absent session keyfile; an expired one does not", async () => {
    const live = await freshDb();
    const liveDir = secretsDir();
    await plantInvite(live, NOW + 1);
    await expect(settleBootSecrets({ db: live, ...absent(liveDir) })).rejects.toThrow(join(liveDir, SECRET_FILE_NAMES.sessionSecret));
    expect(existsSync(join(liveDir, SECRET_FILE_NAMES.sessionSecret))).toBe(false);

    const openEnded = await freshDb();
    const openEndedDir = secretsDir();
    await plantInvite(openEnded, null);
    await expect(settleBootSecrets({ db: openEnded, ...absent(openEndedDir) })).rejects.toThrow(join(openEndedDir, SECRET_FILE_NAMES.sessionSecret));

    // CONTROL: an invite past its expiry can never be redeemed, so nothing depends on the pepper.
    const expired = await freshDb();
    const expiredDir = secretsDir();
    await plantInvite(expired, NOW);
    const settled = await settleBootSecrets({ db: expired, ...absent(expiredDir) });
    expect(settled.sessionSecret).toMatch(Hex64);
    expect(existsSync(join(expiredDir, SECRET_FILE_NAMES.sessionSecret))).toBe(true);
  });

  test("CONTROL: the same dependent rows with the secrets already resolved pass through, and nothing is written", async () => {
    const db = await freshDb();
    const dir = secretsDir();
    const owner = await seedUser(db, { passwordHash: "scrypt$not-a-real-hash" });
    await db.insert(userCredentials).values({
      id: castId<UserCredentialId>(ids.next("cred")),
      ownerId: owner.id,
      provider: castId<ProviderId>("openrouter"),
      ciphertext: "c",
      iv: "i",
      tag: "t",
    });
    const key = Buffer.alloc(32, 7);
    const settled = await settleBootSecrets({
      db,
      now,
      credentialsKey: { kind: "resolved", value: key, path: null },
      sessionSecret: { kind: "resolved", value: "an-explicit-session-secret-of-40-chars!!", path: null },
    });
    expect(settled.secretBoxKey?.equals(key)).toBe(true);
    expect(settled.sessionSecret).toBe("an-explicit-session-secret-of-40-chars!!");
    expect(existsSync(dir)).toBe(false);
  });

  test("a resolved null (a corrupt keyfile) stays null: it is neither replaced nor refused here", async () => {
    const db = await freshDb();
    const dir = secretsDir();
    const settled = await settleBootSecrets({
      db,
      now,
      credentialsKey: { kind: "resolved", value: null, path: join(dir, SECRET_FILE_NAMES.credentialsKey) },
      sessionSecret: { kind: "resolved", value: null, path: join(dir, SECRET_FILE_NAMES.sessionSecret) },
    });
    expect(settled).toEqual({ secretBoxKey: null, sessionSecret: null });
    expect(existsSync(dir)).toBe(false);
  });
});
