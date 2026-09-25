// infra/relay/quick-tunnel — the real `cloudflared` package wrapper over a planted script that prints what cloudflared
// prints. No tunnel runs; the script proves the spawn arguments, the process group, the banner-only URL and the stop.

import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import type { RelayProcess } from "@orb/server/infra/relay";
import { createQuickTunnelLauncher, quickTunnelOrigin, spawnQuickTunnel } from "@orb/server/infra/relay";
import { afterEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const runFile = promisify(execFile);
const ORIGIN = "http://127.0.0.1:65000";
const TUNNEL_URL = "https://calm-river-four-birds.trycloudflare.com";
const EXECUTABLE_MODE = 0o700;

// What cloudflared prints on a quick tunnel, in order: an error that quotes the API host, the banner, the link, then a
// later line naming another tunnel. The script records its arguments and process group, then waits to be stopped.
const CLOUDFLARED_LIKE = `#!/bin/sh
printf '%s\\n' "$*" > "$(dirname "$0")/args"
ps -o pgid= -p $$ | tr -d ' ' > "$(dirname "$0")/pgid"
echo 'ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp: i/o timeout' >&2
echo 'INF +--------------------------------------------------------------------------------------------+' >&2
echo 'INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |' >&2
echo 'INF |  ${TUNNEL_URL}                                            |' >&2
echo 'INF +--------------------------------------------------------------------------------------------+' >&2
echo 'INF |  https://someone-elses-tunnel-name.trycloudflare.com  |' >&2
exec sleep 30
`;

const dirs: string[] = [];
const running: RelayProcess[] = [];
afterEach(async () => {
  for (const relay of running.splice(0)) {
    relay.stop();
  }
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function plantedCloudflared(): Promise<{ readonly executable: string; readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "orb-quick-tunnel-"));
  dirs.push(dir);
  const executable = join(dir, "cloudflared");
  await writeFile(executable, CLOUDFLARED_LIKE);
  await chmod(executable, EXECUTABLE_MODE);
  return { executable, dir };
}

interface Observed {
  readonly urls: string[];
  readonly exits: string[];
  readonly firstUrl: Promise<string>;
  readonly exited: Promise<string>;
}

function observe(): Observed & { readonly onUrl: (url: string) => void; readonly onExit: (detail: string) => void } {
  const urls: string[] = [];
  const exits: string[] = [];
  let resolveUrl: (url: string) => void = () => undefined;
  let resolveExit: (detail: string) => void = () => undefined;
  const firstUrl = new Promise<string>((resolve) => {
    resolveUrl = resolve;
  });
  const exited = new Promise<string>((resolve) => {
    resolveExit = resolve;
  });
  return {
    urls,
    exits,
    firstUrl,
    exited,
    onUrl: (url): void => {
      urls.push(url);
      resolveUrl(url);
    },
    onExit: (detail): void => {
      exits.push(detail);
      resolveExit(detail);
    },
  };
}

describe("spawnQuickTunnel", () => {
  test("reports the link on the line after the created banner, never the API host an earlier error quotes", async () => {
    const { executable } = await plantedCloudflared();
    const seen = observe();
    running.push(spawnQuickTunnel(executable, ORIGIN, seen));
    expect(await seen.firstUrl).toBe(TUNNEL_URL);
    const stopper = running.pop();
    stopper?.stop();
    await seen.exited;
    expect(seen.urls).toEqual([TUNNEL_URL]);
  });

  test("runs the quick tunnel to the origin with autoupdate off, in this server's process group", async () => {
    const { executable, dir } = await plantedCloudflared();
    const seen = observe();
    running.push(spawnQuickTunnel(executable, ORIGIN, seen));
    await seen.firstUrl;
    expect((await readFile(join(dir, "args"), "utf8")).trim()).toBe(`tunnel --url ${ORIGIN} --no-autoupdate`);
    const ours = (await runFile("ps", ["-o", "pgid=", "-p", String(process.pid)])).stdout.trim();
    expect((await readFile(join(dir, "pgid"), "utf8")).trim()).toBe(ours);
  });

  test("stop ends the process, onExit fires once, and a second stop is a no-op", async () => {
    const { executable } = await plantedCloudflared();
    const seen = observe();
    const relay = spawnQuickTunnel(executable, ORIGIN, seen);
    await seen.firstUrl;
    relay.stop();
    relay.stop();
    expect(await seen.exited).toMatch(/cloudflared exited/u);
    expect(seen.exits).toHaveLength(1);
  });

  test("a spawn that cannot start reports one exit and no URL", async () => {
    const { dir } = await plantedCloudflared();
    const seen = observe();
    running.push(spawnQuickTunnel(join(dir, "missing-binary"), ORIGIN, seen));
    expect(await seen.exited).toMatch(/cloudflared (failed|exited)/u);
    expect(seen.urls).toEqual([]);
  });
});

describe("createQuickTunnelLauncher", () => {
  test("verifies the binary on every launch before it spawns, and spawns nothing when the verifier refuses", async () => {
    const spawned: string[] = [];
    let verdict: "ok" | "refuse" = "ok";
    const launcher = createQuickTunnelLauncher({
      binary: {
        ensure: () => (verdict === "ok" ? Promise.resolve("/verified/cloudflared") : Promise.reject(new Error("refused by the pin"))),
      },
      spawn: (executable, origin) => {
        spawned.push(`${executable} ${origin}`);
        return { stop: (): void => undefined };
      },
    });
    const events = { onUrl: (): void => undefined, onExit: (): void => undefined };
    await launcher.launch(ORIGIN, events);
    verdict = "refuse";
    await expect(launcher.launch(ORIGIN, events)).rejects.toThrow("refused by the pin");
    expect(spawned).toEqual([`/verified/cloudflared ${ORIGIN}`]);
  });
});

describe("quickTunnelOrigin", () => {
  test("accepts one hyphenated label directly under trycloudflare.com, as an origin", () => {
    expect(quickTunnelOrigin(TUNNEL_URL)).toBe(TUNNEL_URL);
    expect(quickTunnelOrigin(`${TUNNEL_URL}/`)).toBe(TUNNEL_URL);
  });

  test("refuses every other shape, including cloudflared's own API and login hosts", () => {
    for (const candidate of [
      "https://api.trycloudflare.com",
      "https://login.trycloudflare.com",
      "http://calm-river.trycloudflare.com",
      "https://calm-river.trycloudflare.com:8443",
      "https://calm-river.trycloudflare.com/path",
      "https://user:pw@calm-river.trycloudflare.com",
      "https://a.calm-river.trycloudflare.com",
      "https://calm-river.trycloudflare.com.attacker.example",
      "https://calm-river.trycloudflare.co",
      "not a url",
    ]) {
      expect(quickTunnelOrigin(candidate), candidate).toBeNull();
    }
  });
});
