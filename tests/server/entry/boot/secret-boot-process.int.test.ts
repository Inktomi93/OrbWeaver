// The boot's secret controls over the real server process: the scrub a spawned child observes, the cookie-mode
// refusal that keeps a pepperless password hasher from ever serving a login, and the failure line a database credential
// must stay out of.
// @subject packages/server/src/entry/index.ts
// @subject packages/server/src/entry/lifecycle.ts
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { AUTH_MODE_KEY } from "@orb/contracts/identity";
import { ENV_NO_FILE_KEY } from "@orb/kit/env-file";
import { DATA_LAYOUT_DIRS, DATABASE_URL_KEY, SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { APP_SECRET_ENV_KEYS } from "@orb/server/foundation/env/record";
import { expect, test } from "@orb/testkit/node";
import { freeLoopbackPort } from "@orb/testkit/node/helpers";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { onTestFinished } from "vitest";
import { z } from "zod";

const ENTRY = fileURLToPath(new URL("../../../../packages/server/src/entry/index.ts", import.meta.url));
const INHERITED_CONTROL = "ORB_CHILD_ENV_CONTROL";
const UNUSABLE_KEYFILE = "not a 32-byte key\n";
const USABLE_KEYFILE = `${"ab".repeat(32)}\n`;
const LISTENING = "boot: listening";
const EXIT_BOOT_FAILURE = 1;
const DATABASE_CREDENTIAL = "planted-database-credential-0123456789";
const UTF8_BOM = String.fromCodePoint(0xfe_ff);
// A closed loopback port, so no case waits on a resolver or reaches a real host.
const UNREACHABLE_HOST = "127.0.0.1:1";
const CREDENTIALED_URL = `libsql://user:${DATABASE_CREDENTIAL}@${UNREACHABLE_HOST}`;
// Provider credentials a launcher's environment or `.env` carries that the parse never reads. The last name is one no
// code knows, so the scrub must hold by the name's shape, not by a list someone has to extend.
const UNREAD_PROVIDER_CREDENTIALS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_PROBE_KEY",
  "OPENROUTER_PROBE_KEY",
  "OPENAI_PROBE_KEY",
  "GEMINI_PROBE_KEY",
  "DEEPSEEK_PROBE_KEY",
  "CLAUDE_SUB_PROBE_TOKEN",
  "FUTURE_PROVIDER_API_KEY",
];
const TOKEN_URL = `libsql://${UNREACHABLE_HOST}?authToken=${DATABASE_CREDENTIAL}`;

// On request, reports which variables a child started with no explicit env inherits from the running server.
const CHILD_ENV_PROBE = `import { spawnSync } from "node:child_process";
process.on("message", () => {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { encoding: "utf8" });
  process.send?.(JSON.parse(child.stdout));
});`;

function entryEnv(dataDir: string): NodeJS.ProcessEnv {
  return {
    ["PATH"]: processEnvValue("PATH"),
    ["HOME"]: processEnvValue("HOME"),
    [ENV_NO_FILE_KEY]: "1",
    ["DATA_DIR"]: dataDir,
    ["LOCAL_LIGHT_PREFETCH"]: "off",
    ["CORPUS_AUTOINDEX"]: "false",
    ["EGRESS_FIREWALL"]: "false",
    ["LOG_LEVEL"]: "info",
  };
}

interface BootOutcome {
  readonly listened: boolean;
  readonly code: number | null;
  readonly output: string;
}

// Boot the real entry once. A server that reaches listening is stopped there, so a boot that should refuse cannot hang.
async function bootOnce(env: NodeJS.ProcessEnv): Promise<BootOutcome> {
  const child = spawn(process.execPath, [ENTRY], { env: { ...env, ["PORT"]: String(await freeLoopbackPort()) }, stdio: ["ignore", "pipe", "pipe"] });
  const closed = once(child, "close");
  let output = "";
  let listened = false;
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    if (output.includes(LISTENING)) {
      listened = true;
      child.kill("SIGKILL");
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const [code] = z
    .tuple([z.number().nullable()])
    .rest(z.unknown())
    .parse(await closed);
  return { listened, code, output };
}

async function localBootOverKeyfile(dataDir: string, keyfileBytes: string): Promise<BootOutcome & { readonly keyfileAfter: string }> {
  const secrets = join(dataDir, DATA_LAYOUT_DIRS.secrets);
  const keyfile = join(secrets, SECRET_FILE_NAMES.sessionSecret);
  await mkdir(secrets, { recursive: true });
  await writeFile(keyfile, keyfileBytes);
  const outcome = await bootOnce({ ...entryEnv(dataDir), [AUTH_MODE_KEY]: "local" });
  return { ...outcome, keyfileAfter: await readFile(keyfile, "utf8") };
}

test("a booted server starts its children without one app secret or provider credential in their inherited env", { tags: "slow" }, async ({
  importStagingDir,
}) => {
  const planted = [...APP_SECRET_ENV_KEYS, ...UNREAD_PROVIDER_CREDENTIALS];
  const child = spawn(process.execPath, [`--import=data:text/javascript,${encodeURIComponent(CHILD_ENV_PROBE)}`, ENTRY], {
    env: {
      ...entryEnv(importStagingDir),
      ["PORT"]: String(await freeLoopbackPort()),
      [AUTH_MODE_KEY]: "single-user",
      [INHERITED_CONTROL]: "1",
      // Hex of the key width: the one value every secret's schema accepts.
      ...Object.fromEntries(planted.map((key) => [key, "ab".repeat(32)])),
      [DATABASE_URL_KEY]: `file:${join(importStagingDir, "child-env.db")}`,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const exited = once(child, "exit");
  onTestFinished(async () => {
    child.kill("SIGKILL");
    await exited;
  });
  let output = "";
  const listening = Promise.withResolvers<void>();
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    if (output.includes(LISTENING)) {
      listening.resolve();
    }
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  expect(await Promise.race([listening.promise.then(() => "listening"), exited.then(() => "exited")]), output).toBe("listening");

  const reported = once(child, "message");
  child.send("report");
  const [inherited] = z
    .tuple([z.array(z.string())])
    .rest(z.unknown())
    .parse(await reported);
  expect(inherited).toContain(INHERITED_CONTROL);
  expect(inherited.filter((key) => planted.includes(key))).toEqual([]);
  expect(inherited).not.toContain(DATABASE_URL_KEY);
});

test("a cookie mode refuses to boot over an unusable session keyfile and leaves it in place; a usable keyfile boots", { tags: "slow" }, async ({
  importStagingDir,
}) => {
  const refused = await localBootOverKeyfile(join(importStagingDir, "refused"), UNUSABLE_KEYFILE);
  expect({ listened: refused.listened, code: refused.code }, refused.output).toEqual({ listened: false, code: EXIT_BOOT_FAILURE });
  expect(refused.keyfileAfter).toBe(UNUSABLE_KEYFILE);

  const control = await localBootOverKeyfile(join(importStagingDir, "control"), USABLE_KEYFILE);
  expect(control.listened, control.output).toBe(true);
  expect(control.keyfileAfter).toBe(USABLE_KEYFILE);
});

const CREDENTIAL_SOURCES: readonly (readonly [name: string, source: { readonly url: string } | { readonly file: string }])[] = [
  ["an http URL with a password", { url: `http://user:${DATABASE_CREDENTIAL}@${UNREACHABLE_HOST}` }],
  ["a libsql URL with a password", { url: CREDENTIALED_URL }],
  ["a token URL with a leading space", { url: ` ${TOKEN_URL}` }],
  ["a credentialed URL in a secret file", { file: `${CREDENTIALED_URL}\n` }],
  ["a token URL in a secret file with a byte order mark", { file: `${UTF8_BOM}${TOKEN_URL}\n` }],
  ["a secret file that holds no URL at all", { file: `${DATABASE_CREDENTIAL}\n` }],
];

for (const [name, source] of CREDENTIAL_SOURCES) {
  test(`a failed database open prints no credential: ${name}`, { tags: "slow" }, async ({ importStagingDir }) => {
    const secretFile = join(importStagingDir, "database-url-secret");
    if ("file" in source) {
      await writeFile(secretFile, source.file);
    }
    const database = "file" in source ? { [`${DATABASE_URL_KEY}_FILE`]: secretFile } : { [DATABASE_URL_KEY]: source.url };
    const outcome = await bootOnce({ ...entryEnv(importStagingDir), [AUTH_MODE_KEY]: "single-user", ...database });
    expect({ listened: outcome.listened, code: outcome.code }, outcome.output).toEqual({ listened: false, code: EXIT_BOOT_FAILURE });
    expect(outcome.output.includes(DATABASE_CREDENTIAL), outcome.output).toBe(false);
  });
}

test("a failed open of a file database keeps its message, so the operator can read which path failed", { tags: "slow" }, async ({ importStagingDir }) => {
  const blocker = join(importStagingDir, "a-file-not-a-directory");
  await writeFile(blocker, "");
  const outcome = await bootOnce({
    ...entryEnv(importStagingDir),
    [AUTH_MODE_KEY]: "single-user",
    [DATABASE_URL_KEY]: `file:${join(blocker, "orbweaver.db")}`,
  });
  expect({ listened: outcome.listened, code: outcome.code }, outcome.output).toEqual({ listened: false, code: EXIT_BOOT_FAILURE });
  expect(outcome.output).toContain(blocker);
});
