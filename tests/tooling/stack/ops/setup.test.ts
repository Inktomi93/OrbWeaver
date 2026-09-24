// `pnpm start`'s setup pass driven with scripted answers through injected streams, so no real terminal is
// spawned. Each written `.env` is then loaded by the server's own env module, so the schema and the bind
// resolver judge the values, not a restatement of them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { PassThrough } from "node:stream";
import { parseEnv } from "node:util";
import { afterEach, vi } from "vitest";
import type { SetupMachine } from "../../../../tooling/src/stack/index.ts";
import { ALLOWED_HOSTS_KEY, AUTH_MODE_KEY, PORT_KEY, runSetup } from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

interface Driven {
  readonly result: Awaited<ReturnType<typeof runSetup>>;
  readonly shown: string;
  readonly input: PassThrough;
}

/** Run one setup pass with `answers` typed into an injected stdin (one line per answer, "" = Enter). */
async function drive(opts: {
  readonly envPath: string;
  readonly answers: readonly string[];
  readonly setup?: boolean;
  readonly interactive?: boolean;
  readonly endInput?: boolean;
  readonly machine?: SetupMachine;
}): Promise<Driven> {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
  const script = opts.answers.map((answer) => `${answer}\n`).join("");
  if (opts.endInput === false) {
    input.write(script);
  } else {
    input.end(script);
  }
  const result = await runSetup({
    envPath: opts.envPath,
    setup: opts.setup ?? false,
    interactive: opts.interactive ?? true,
    input,
    output,
    ambient: {},
    machine: opts.machine ?? NAMELESS,
  });
  return { result, shown: chunks.join(""), input };
}

/** A machine whose host name is outside the grammar and which has no network: nothing is detected, so only typed
 *  answers are written. */
const NAMELESS: SetupMachine = { hostname: "not a host name", interfaces: {}, wsl: false };

/** A LAN machine as `node:os` reports it on Windows: an upper-case NetBIOS name and one LAN IPv4 address. */
const LAN_BOX: SetupMachine = {
  hostname: "ORB-BOX",
  interfaces: {
    ...Object.fromEntries([
      ["Ethernet", [{ address: "192.168.1.20", netmask: "255.255.255.0", family: "IPv4", mac: "00:00:00:00:00:01", internal: false, cidr: "192.168.1.20/24" }]],
    ]),
  },
  wsl: false,
};

function envAt(dir: string): string {
  return join(dir, ".env");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The server keys a stray shell export could pin under the vitest worker, where `.env` only fills unset keys. */
const SERVER_KEYS_UNDER_TEST = ["PORT", "AUTH_MODE", "BIND_HOST", "ALLOW_DEV_PUBLIC_BIND", "AUTH_FALLBACK", "AUTH_FALLBACK_TRUSTED_PEERS"] as const;

/** Boot the server's env module against `dir/.env` the way `pnpm start` launches it: cwd = the directory
 *  holding the file, NODE_ENV=production, and no ambient value for any key the assertions read. */
async function serverEnvIn(dir: string): Promise<typeof import("@orb/server/foundation/env")> {
  // The vitest config sets ORB_ENV_NO_FILE so no test reads a real `.env`; this one must read the file it wrote.
  vi.stubEnv("ORB_ENV_NO_FILE", undefined);
  vi.stubEnv("NODE_ENV", "production");
  for (const key of SERVER_KEYS_UNDER_TEST) {
    vi.stubEnv(key, undefined);
  }
  vi.resetModules();
  // The loader resolves `.env` against process.cwd(); pointing that at `dir` runs the real loader on the real
  // file without a process-wide chdir, which worker threads do not allow.
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  try {
    return await import("@orb/server/foundation/env");
  } finally {
    cwd.mockRestore();
  }
}

test("a first run in a terminal asks, writes .env with the answers, and writes only the keys setup owns", async ({ scratch }) => {
  const envPath = envAt(scratch);
  const { result, shown } = await drive({ envPath, answers: ["9100", "2", "", ""] });
  expect(result).toEqual({ kind: "written", values: { port: 9100, authMode: "local", ssoPending: false, allowedHosts: null } });
  expect(shown.length).toBeGreaterThan(0);
  expect({ ...parseEnv(readFileSync(envPath, "utf8")) }).toEqual(
    Object.fromEntries([
      [PORT_KEY, "9100"],
      [AUTH_MODE_KEY, "local"],
    ]),
  );
});

test("an unusable answer is asked again instead of written", async ({ scratch }) => {
  const envPath = envAt(scratch);
  const { result } = await drive({ envPath, answers: ["http", "70000", "9200", "people", "1"] });
  expect(result).toEqual({ kind: "written", values: { port: 9200, authMode: "single-user", ssoPending: false, allowedHosts: null } });
});

test("each answer boots under the server's own env schema and binds where the answer said", async ({ scratch }) => {
  const cases = [
    { answers: ["", "1"], mode: "single-user", port: 8788, publicBind: false },
    { answers: ["9100", "2", "1", ""], mode: "local", port: 9100, publicBind: true },
    { answers: ["", "2", "2", "192.168.1.20"], mode: "local", port: 8788, publicBind: true },
    // A written ALLOWED_HOSTS must parse under the server's own grammar, not only this file's copy of it.
    { answers: ["", "2", "1", "Game_PC.home.lan., .example.com"], mode: "local", port: 8788, publicBind: true },
  ] as const;
  for (const [index, row] of cases.entries()) {
    const dir = join(scratch, `case-${index}`);
    mkdirSync(dir);
    await drive({ envPath: envAt(dir), answers: row.answers });
    const server = await serverEnvIn(dir);
    expect(server.env.AUTH_MODE).toBe(row.mode);
    expect(server.env.PORT).toBe(row.port);
    // "people on my network" must be reachable from the LAN under `pnpm start`, and "just me" must not.
    expect(server.resolveBindPosture(server.bindPostureInput()).publicBind).toBe(row.publicBind);
  }
});

test("network mode: a host name answer writes ALLOWED_HOSTS, and an IP answer writes nothing for it", async ({ scratch }) => {
  const named = join(scratch, "named");
  const byIp = join(scratch, "by-ip");
  mkdirSync(named);
  mkdirSync(byIp);
  await drive({ envPath: envAt(named), answers: ["", "2", "1", "Orb.Home.Lan"] });
  expect(parseEnv(readFileSync(envAt(named), "utf8"))[ALLOWED_HOSTS_KEY]).toBe("orb.home.lan");
  const { result } = await drive({ envPath: envAt(byIp), answers: ["", "2", "1", "192.168.1.20"] });
  expect(result).toMatchObject({ kind: "written", values: { allowedHosts: null } });
  expect(Object.keys(parseEnv(readFileSync(envAt(byIp), "utf8")))).not.toContain(ALLOWED_HOSTS_KEY);
  // "just me" asks nothing about addresses: two answers are the whole pass.
  const single = join(scratch, "single");
  mkdirSync(single);
  expect((await drive({ envPath: envAt(single), answers: ["", "1"], machine: LAN_BOX })).result).toMatchObject({
    kind: "written",
    values: { allowedHosts: null },
  });
});

test("the address question is pre-filled from the machine: Enter writes its name and .local form, and the LAN URL comes first", async ({ scratch }) => {
  const envPath = envAt(scratch);
  const { result, shown } = await drive({ envPath, answers: ["9100", "2", "1", ""], machine: LAN_BOX });
  expect(result).toMatchObject({ kind: "written", values: { allowedHosts: "orb-box,orb-box.local" } });
  expect(parseEnv(readFileSync(envPath, "utf8"))[ALLOWED_HOSTS_KEY]).toBe("orb-box,orb-box.local");
  const lanUrl = shown.indexOf("http://192.168.1.20:9100");
  const mdnsUrl = shown.indexOf("http://orb-box.local:9100");
  expect(lanUrl).toBeGreaterThanOrEqual(0);
  expect(mdnsUrl).toBeGreaterThan(lanUrl);
  // A typed name is added to the detected ones rather than replacing them.
  const again = await drive({ envPath, setup: true, answers: ["", "", "", "orb.home.lan"], machine: LAN_BOX });
  expect(again.result).toMatchObject({ values: { allowedHosts: "orb-box,orb-box.local,orb.home.lan" } });
});

test("under WSL2 no address is printed as if another device could open it", async ({ scratch }) => {
  const { result, shown } = await drive({ envPath: envAt(scratch), answers: ["", "2", "1", ""], machine: { ...LAN_BOX, wsl: true } });
  expect(result).toMatchObject({ kind: "written", values: { allowedHosts: "orb-box,orb-box.local" } });
  expect(shown).not.toContain("http://");
});

test("--setup on an existing .env keeps every line it does not own byte-for-byte", async ({ scratch }) => {
  const envPath = envAt(scratch);
  const before = "# my box\r\nOPENROUTER_API_KEY=sk-or-x # key\r\n\r\n#AUTH_MODE=oidc\r\nPORT=8788\r\nLOG_LEVEL=debug\r\n";
  writeFileSync(envPath, before);
  const { result } = await drive({ envPath, setup: true, answers: ["9300", "2", "1", ""] });
  expect(result.kind).toBe("written");
  expect(readFileSync(envPath, "utf8")).toBe(before.replace("PORT=8788", "PORT=9300").concat("AUTH_MODE=local\r\n"));
});

test("--setup offers the current values, so pressing Enter through it changes nothing", async ({ scratch }) => {
  const envPath = envAt(scratch);
  await drive({ envPath, answers: ["9400", "2", "1", "orb.lan"] });
  const first = readFileSync(envPath, "utf8");
  const { result } = await drive({ envPath, setup: true, answers: ["", "", "", ""] });
  expect(result).toEqual({ kind: "written", values: { port: 9400, authMode: "local", ssoPending: false, allowedHosts: "orb.lan" } });
  expect(readFileSync(envPath, "utf8")).toBe(first);
});

test("an existing .env without --setup is used as it is: nothing asked, nothing read, nothing written", async ({ scratch }) => {
  const envPath = envAt(scratch);
  writeFileSync(envPath, "PORT=1234\n");
  const { result, shown, input } = await drive({ envPath, answers: ["9"], endInput: false });
  expect(result).toEqual({ kind: "keep" });
  expect(shown).toBe("");
  expect(input.readableLength).toBe("9\n".length);
  expect(readFileSync(envPath, "utf8")).toBe("PORT=1234\n");
});

test("with no terminal a first run prompts nothing, reads nothing and writes nothing: it boots on the defaults", async ({ scratch }) => {
  const envPath = envAt(scratch);
  const { result, shown, input } = await drive({ envPath, interactive: false, answers: ["9100", "2"], endInput: false });
  expect(result).toEqual({ kind: "defaults" });
  expect(shown).toBe("");
  expect(input.readableLength).toBe("9100\n2\n".length);
  expect(existsSync(envPath)).toBe(false);
});

test("--setup with no terminal is refused and writes nothing", async ({ scratch }) => {
  const envPath = envAt(scratch);
  writeFileSync(envPath, "PORT=1234\n");
  const { result, shown } = await drive({ envPath, setup: true, interactive: false, answers: ["9100"] });
  expect(result).toEqual({ kind: "refuse" });
  expect(shown).toBe("");
  expect(readFileSync(envPath, "utf8")).toBe("PORT=1234\n");
});

test("input that ends before the last answer cancels the pass and leaves .env untouched", async ({ scratch }) => {
  const envPath = envAt(scratch);
  const first = await drive({ envPath, answers: ["9100"] });
  expect(first.result).toEqual({ kind: "cancelled" });
  expect(existsSync(envPath)).toBe(false);
  writeFileSync(envPath, "PORT=1234\n");
  const again = await drive({ envPath, setup: true, answers: ["9100", "2"] });
  expect(again.result).toEqual({ kind: "cancelled" });
  expect(readFileSync(envPath, "utf8")).toBe("PORT=1234\n");
});
