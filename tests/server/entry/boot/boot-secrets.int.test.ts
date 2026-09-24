// entry/boot/boot-secrets — the owner ruling on a missing boot secret: generate it only when no row depends
// on it, otherwise refuse and name the file. Real schema over a `:memory:` db, real keyfiles in a temp dir.

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderId } from "@orb/contracts/inference";
import { sessions, userCredentials } from "@orb/db";
import type { SessionId, UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { settleBootSecrets } from "@orb/server/entry/boot";
import { SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import type { BootSecretResolution } from "@orb/server/infra/crypto";
import { decode32Bytes } from "@orb/server/infra/crypto";
import { afterEach, describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
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

function absent(dir: string): { credentialsKey: BootSecretResolution<Buffer>; sessionSecret: BootSecretResolution<string> } {
  return {
    credentialsKey: { kind: "absent", path: join(dir, SECRET_FILE_NAMES.credentialsKey) },
    sessionSecret: { kind: "absent", path: join(dir, SECRET_FILE_NAMES.sessionSecret) },
  };
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
      credentialsKey: { kind: "resolved", value: null, path: join(dir, SECRET_FILE_NAMES.credentialsKey) },
      sessionSecret: { kind: "resolved", value: null, path: join(dir, SECRET_FILE_NAMES.sessionSecret) },
    });
    expect(settled).toEqual({ secretBoxKey: null, sessionSecret: null });
    expect(existsSync(dir)).toBe(false);
  });
});
