// infra/crypto/secret-file — replaced secrets are owner-only, whole, and never followed through a symlink (D269).

import { lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSecretFile, removeSecretFile, writeSecretFile } from "@orb/server/infra/crypto";
import { afterEach, beforeEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ip-cert-secret-file-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeSecretFile", () => {
  test("writes the content at mode 0600, creating a missing directory owner-only", async () => {
    const path = join(dir, "secrets", "acme_account_key.pem");
    await writeSecretFile(path, "KEY-ONE");
    expect(await readFile(path, "utf-8")).toBe("KEY-ONE");
    // biome-ignore lint/suspicious/noBitwiseOperators: a permission mask is a bitwise AND.
    expect((await stat(path)).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
    // biome-ignore lint/suspicious/noBitwiseOperators: a permission mask is a bitwise AND.
    expect((await stat(join(dir, "secrets"))).mode & PERMISSION_BITS).toBe(0o700);
  });

  test("replaces an existing file whole", async () => {
    const path = join(dir, "ip_certificate.pem");
    await writeSecretFile(path, "OLD-CERTIFICATE-BYTES");
    await writeSecretFile(path, "NEW");
    expect(await readFile(path, "utf-8")).toBe("NEW");
  });

  test("a planted symlink is replaced by the file, and its target is never written", async () => {
    const target = join(dir, "victim.txt");
    await writeFile(target, "UNTOUCHED");
    const path = join(dir, "ip_certificate_key.pem");
    await symlink(target, path);
    await writeSecretFile(path, "SECRET");
    expect(await readFile(target, "utf-8")).toBe("UNTOUCHED");
    expect((await lstat(path)).isSymbolicLink()).toBe(false);
    expect(await readFile(path, "utf-8")).toBe("SECRET");
  });
});

describe("readSecretFile", () => {
  test("nothing at the path reads as null", async () => {
    await expect(readSecretFile(join(dir, "absent.pem"))).resolves.toBeNull();
  });

  test("a symlink is refused, never read through", async () => {
    const target = join(dir, "elsewhere.pem");
    await writeFile(target, "SOMEONE ELSE'S KEY");
    const path = join(dir, "acme_account_key.pem");
    await symlink(target, path);
    await expect(readSecretFile(path)).rejects.toThrow();
  });

  test("a group- or world-readable file is narrowed to 0600 as it is read", async () => {
    const path = join(dir, "acme_account_key.pem");
    await writeFile(path, "KEY", { mode: 0o644 });
    await expect(readSecretFile(path)).resolves.toBe("KEY");
    // biome-ignore lint/suspicious/noBitwiseOperators: a permission mask is a bitwise AND.
    expect((await stat(path)).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
  });

  test("control: removeSecretFile deletes, and a second remove is not an error", async () => {
    const path = join(dir, "ip_certificate.pem");
    await writeSecretFile(path, "X");
    await removeSecretFile(path);
    await removeSecretFile(path);
    await expect(readSecretFile(path)).resolves.toBeNull();
  });
});
