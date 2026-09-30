// No child process inherits an app secret once the server has scrubbed `process.env`. The three named spawns run for
// real (tar and git through PATH wrappers that record their env and exec the system binary, cloudflared through the
// `cloudflared` package over a stand-in that tar itself unpacked), and each child-creation API is checked with no env.

import { execFileSync, fork, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Worker } from "node:worker_threads";
import { extractTgzWithTar, spawnQuickTunnel } from "@orb/server/infra/relay";
import { afterAll, beforeAll } from "vitest";
import { APP_SECRET_ENV_KEYS, scrubAppSecretsFromProcessEnv } from "../../../../packages/server/src/foundation/env/index.ts";
import { readBuildIdentity } from "../../../../packages/server/src/foundation/observability/debug/bug-report.ts";
import { expect, test } from "../../../support/fixtures.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const EXECUTABLE_MODE = 0o700;
const ORIGIN = "http://127.0.0.1:65000";
const TUNNEL_URL = "https://clean-env-probe.trycloudflare.com";
const SHA_RE = /^[0-9a-f]{40}$/u;
const SENTINELS = new Map(APP_SECRET_ENV_KEYS.map((key) => [key, `cbs-${key.toLowerCase()}-${randomUUID()}`]));

const root = mkdtempSync(join(tmpdir(), "orb-child-env-"));
const wrappers = join(root, "bin");
const dumps = join(root, "dumps");
// biome-ignore lint/style/noProcessEnv: the test process's own env is the subject; it is restored after the file.
const saved = new Map(["PATH", ...APP_SECRET_ENV_KEYS].map((key) => [key, process.env[key]]));

function realBinary(name: string): string {
  return execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim();
}

// Records the env the child received, then runs the real binary with the same arguments.
function plantWrapper(name: string, real: string): void {
  const path = join(wrappers, name);
  writeFileSync(path, `#!/bin/sh\nenv > '${join(dumps, `${name}.env`)}'\nexec '${real}' "$@"\n`);
  chmodSync(path, EXECUTABLE_MODE);
}

// The stand-in cloudflared records its env, prints the banner and link the relay reads, then waits to be stopped.
const CLOUDFLARED_LIKE = `#!/bin/sh
env > '${join(dumps, "cloudflared.env")}'
echo 'INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |' >&2
echo 'INF |  ${TUNNEL_URL}  |' >&2
exec sleep 30
`;

function leakedKeys(envText: string): string[] {
  return APP_SECRET_ENV_KEYS.filter((key) => envText.includes(`${key}=`) || envText.includes(SENTINELS.get(key) ?? key));
}

function keysOf(names: readonly string[]): string[] {
  return APP_SECRET_ENV_KEYS.filter((key) => names.includes(key));
}

beforeAll(() => {
  mkdirSync(wrappers);
  mkdirSync(dumps);
  plantWrapper("tar", realBinary("tar"));
  plantWrapper("git", realBinary("git"));
  const staged = join(root, "staged");
  mkdirSync(staged);
  writeFileSync(join(staged, "cloudflared"), CLOUDFLARED_LIKE);
  chmodSync(join(staged, "cloudflared"), EXECUTABLE_MODE);
  execFileSync(realBinary("tar"), ["-czf", join(root, "cloudflared.tgz"), "-C", staged, "cloudflared"]);
  // biome-ignore-start lint/style/noProcessEnv: the test process's own env is the subject.
  process.env["PATH"] = `${wrappers}:${saved.get("PATH") ?? ""}`;
  for (const [key, value] of SENTINELS) {
    process.env[key] = value;
  }
  // biome-ignore-end lint/style/noProcessEnv: end of the block above
  scrubAppSecretsFromProcessEnv();
});

afterAll(() => {
  for (const [key, value] of saved) {
    // biome-ignore lint/style/noProcessEnv: restores the env this file changed.
    Reflect.deleteProperty(process.env, key);
    if (value !== undefined) {
      // biome-ignore lint/style/noProcessEnv: restores the env this file changed.
      process.env[key] = value;
    }
  }
  rmSync(root, { recursive: true, force: true });
});

test("tar unpacks the cloudflared archive and cloudflared starts, and neither receives an app secret", { timeout: 30_000 }, async () => {
  const unpacked = join(root, "unpacked");
  mkdirSync(unpacked);
  await extractTgzWithTar(join(root, "cloudflared.tgz"), unpacked);

  const exited = Promise.withResolvers<string>();
  const firstUrl = Promise.withResolvers<string>();
  const relay = spawnQuickTunnel(join(unpacked, "cloudflared"), ORIGIN, {
    onUrl: (url) => firstUrl.resolve(url),
    onExit: (detail) => exited.resolve(detail),
  });
  expect(await firstUrl.promise).toBe(TUNNEL_URL);
  relay.stop();
  await exited.promise;

  expect(leakedKeys(readFileSync(join(dumps, "tar.env"), "utf8"))).toEqual([]);
  expect(leakedKeys(readFileSync(join(dumps, "cloudflared.env"), "utf8"))).toEqual([]);
});

test("the bug report's git call reads the build identity and receives no app secret", () => {
  expect(readBuildIdentity(REPO_ROOT).sha).toMatch(SHA_RE);
  expect(leakedKeys(readFileSync(join(dumps, "git.env"), "utf8"))).toEqual([]);
});

test("every child-creation API with no explicit env starts a child that holds no app secret", { timeout: 30_000 }, async () => {
  const listKeys = "process.stdout.write(Object.keys(process.env).join('\\n'))";
  const spawned = spawnSync(process.execPath, ["-e", listKeys], { encoding: "utf8" });
  expect(keysOf(spawned.stdout.split("\n"))).toEqual([]);

  expect(leakedKeys(execFileSync("env", { encoding: "utf8" }))).toEqual([]);
  expect(leakedKeys(execFileSync("env", { encoding: "utf8", shell: true }))).toEqual([]);

  const forkedEntry = join(root, "forked.cjs");
  writeFileSync(forkedEntry, "process.send(Object.keys(process.env), () => process.exit(0));\n");
  const forked = fork(forkedEntry);
  const [forkedKeys] = (await once(forked, "message")) as [string[]];
  expect(keysOf(forkedKeys)).toEqual([]);

  const worker = new Worker("require('node:worker_threads').parentPort.postMessage(Object.keys(process.env));", { eval: true });
  const [workerKeys] = (await once(worker, "message")) as [string[]];
  await worker.terminate();
  expect(keysOf(workerKeys)).toEqual([]);
});

// The image entrypoint exports each secret it loads from a `*_FILE` into the server env, and the scrub deletes only
// the keys it names. A secret on one list and not the other either misses its file or reaches every child.
test("the image entrypoint loads exactly the secrets the server scrubs", () => {
  const entrypoint = readFileSync(join(REPO_ROOT, "docker", "entrypoint.sh"), "utf8");
  const loaded = /^for name in ([^;]+); do\n\s+load_secret "\$\{name\}"$/mu.exec(entrypoint)?.[1]?.split(" ");
  expect(loaded?.toSorted()).toEqual([...APP_SECRET_ENV_KEYS].toSorted());
});
