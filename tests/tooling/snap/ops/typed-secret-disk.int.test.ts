// A private value an operator hands snap still does its job in the page and reaches no file snap writes: run indexes,
// session rows and logs, failure traces and exported evidence, each read byte by byte through the real cli. That holds
// for what the browser quotes back and for what a page echoes, in every spelling a page sends it on in.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { pid } from "node:process";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";
import { DEDICATED_BOX_ENV } from "@orb/tooling/floor/host/concurrency-profile";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/floor/host/host-slots";
import { unzipSync, zipSync } from "fflate";
import { vi } from "vitest";
import { PRIVATE_MASK } from "../../../../tooling/src/snap/contract/disk-safe-argv.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { listeningAddress } from "../../_server-address.ts";

const CASE_BUDGET_MS = scaledBudget(180_000, 4);
const CLI_BUDGET_MS = scaledBudget(90_000, 4);
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });

const PLANTS = {
  fill: "plant-fill-5e1c9",
  later: "plant-later-call-77ad",
  token: "plant-debug-token-a3f0",
  storage: "plant-storage-value-c41b",
  refused: "plant-refused-echo-90de",
} as const;
const FILL_ENV = "L4_PRIVATE_FILL";
const SESSION_HOME_KEY = "ORB_SNAP_SESSION_HOME";
const FIXTURE_HTML =
  '<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>fixture</title></head>' +
  '<body><main id="m"><label>Field<input id="field" type="text"></label></main>' +
  "<script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}}</script></body></html>";
const READ_FIELD_LENGTH = 'document.querySelector("#field").value.length';
const EVAL_RE = /EVAL\[0\][^\n]*\n(\d+)/u;
const NUMBER_FIELD_HTML =
  '<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>fixture</title></head>' +
  '<body><main id="m"><label>Age<input id="age" type="number"></label></main>' +
  "<script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}}</script></body></html>";

/** What a real password looks like: JSON, a URL and a form each spell these characters differently. */
const REFLECTED = 'pl"ant& word+9z';
/** Every spelling a scan must not find, from the standard library rather than from the code under test, and the two
 *  fragments a value leaves when a page splits it at its own `&`. */
const REFLECTED_SPELLINGS = [
  REFLECTED,
  JSON.stringify(REFLECTED).slice(1, -1),
  encodeURI(REFLECTED),
  encodeURIComponent(REFLECTED),
  new URLSearchParams({ v: REFLECTED }).toString().slice(2),
  "word+9z",
  "word%2B9z",
] as const;
/** Echoes the value through every channel a page has: its text, its title, its URL, its console, a thrown error and the network. */
const REFLECTING_HTML = `<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>fixture</title></head>
<body><main id="m"><label>Password<input id="pw" type="password"></label><div id="echo"></div><button id="send" onclick="go()">send</button></main>
<script>
globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}};
async function go(){
  const v=document.querySelector("#pw").value;
  document.title="title "+v;
  document.querySelector("#echo").textContent="echo "+v;
  console.log("console-log "+v);
  console.error("console-error "+v);
  history.replaceState(null,"","/?state="+encodeURIComponent(v));
  await fetch("/echo?plain="+encodeURIComponent(v));
  await fetch("/raw?plain="+v);
  await fetch("/api?input="+encodeURIComponent(JSON.stringify({q:v})));
  await fetch("/json",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({note:v})});
  await fetch("/form",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({note:v}).toString()});
  setTimeout(()=>{throw new Error("page-error "+v)},0);
  await new Promise((resolve)=>{const s=document.createElement("script");s.src="/busy.js?plain="+encodeURIComponent(v);s.onload=resolve;document.head.append(s);});
  document.querySelector("#send").dataset["sent"]="yes";
}
</script></body></html>`;
const SENT_SELECTOR = "#send[data-sent=yes]";
const REFLECT_ARMS = ["--aria", "--map", "--requests", "--request-body", "/json", "--eval", "document.title", "--eval", "location.href", "--json"] as const;
const ASSERT_FAILS = "#m=a string the page never shows";
const PEER_ORIGIN = "http://peer.invalid";
/** Long enough that a CPU profile samples it: a profile holds a script's URL only if the script ran. */
const BUSY_SCRIPT = "const end=performance.now()+80;while(performance.now()<end){}";
const MASKED_ECHO_HEADER = /"name": "x-echo",\s+"value": "<private>"/u;

/** A loopback peer that serves the reflecting page, records what really arrived, and echoes each body back. */
async function reflectingServer(): Promise<AsyncDisposable & { readonly base: string; readonly received: readonly string[] }> {
  const received: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      received.push(`${request.url ?? ""} ${body}`);
      if (request.url === "/") {
        response.writeHead(200, { "content-type": "text/html" }).end(REFLECTING_HTML);
        return;
      }
      if (request.url?.startsWith("/busy.js") === true) {
        response.writeHead(200, { "content-type": "text/javascript" }).end(BUSY_SCRIPT);
        return;
      }
      // The header is the page-side echo a HAR keeps: a real run reads no request body into it.
      const plain = new URL(request.url ?? "/", PEER_ORIGIN).searchParams.get("plain") ?? "";
      response.writeHead(200, { "content-type": "application/json", "x-echo": plain }).end(JSON.stringify({ echoed: request.url, body }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${String(listeningAddress(server).port)}`,
    received,
    [Symbol.asyncDispose]: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Which spellings of the reflected value `text` holds. */
function spellingsIn(text: string): readonly string[] {
  return REFLECTED_SPELLINGS.filter((spelling) => text.includes(spelling));
}

/** Every file under `roots` holding a spelling of the reflected value, by name or by bytes, a zip read entry by entry. */
function reflections(roots: readonly string[]): readonly string[] {
  const found: string[] = [];
  const judge = (label: string, text: string): void => {
    found.push(...spellingsIn(text).map((spelling) => `${label} holds ${spelling}`));
  };
  for (const path of roots.flatMap(filesUnder)) {
    const bytes = readFileSync(path);
    judge(path, path);
    judge(path, bytes.toString("utf8"));
    if (path.endsWith(".zip")) {
      for (const [entry, content] of Object.entries(unzipSync(bytes))) {
        judge(`${path}!${entry}`, Buffer.from(content).toString("utf8"));
      }
    }
  }
  return found;
}

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((entry) => join(root, entry))
    .filter((path) => statSync(path).isFile());
}

/** Every file under `roots` that holds a plant, a zip read entry by entry. Names the file and the plant, never its bytes. */
function disclosures(roots: readonly string[]): readonly string[] {
  const found: string[] = [];
  const judge = (label: string, bytes: Uint8Array): void => {
    const text = Buffer.from(bytes).toString("latin1");
    for (const [name, plant] of Object.entries(PLANTS)) {
      if (text.includes(plant)) {
        found.push(`${label} holds ${name}`);
      }
    }
  };
  for (const path of roots.flatMap(filesUnder)) {
    const bytes = readFileSync(path);
    judge(path, bytes);
    if (path.endsWith(".zip")) {
      for (const [entry, content] of Object.entries(unzipSync(bytes))) {
        judge(`${path}!${entry}`, content);
      }
    }
  }
  return found;
}

function slotOf(stdout: string): string {
  const index = /\bindex=(?<path>\/\S+)\/run\.json\b/u.exec(stdout)?.groups?.["path"];
  if (index === undefined) {
    throw new Error(`the run printed no index:\n${stdout}`);
  }
  return index;
}

/** The decoded action log of the one trace a red run kept. */
function keptTrace(slot: string): string {
  const [zip, ...others] = filesUnder(slot).filter((path) => path.endsWith(".zip"));
  if (zip === undefined || others.length > 0) {
    throw new Error(`a red run must keep exactly one trace under ${slot}`);
  }
  const entry = unzipSync(readFileSync(zip))["trace.trace"];
  if (entry === undefined) {
    throw new Error("the kept trace has no action log");
  }
  return Buffer.from(entry).toString("utf8");
}

test("the scan finds a plant in a plain file and inside a zip entry", ({ scratch }) => {
  const root = join(scratch, "scan-control");
  mkdirSync(root);
  writeFileSync(join(root, "plain.txt"), `before ${PLANTS.fill} after`);
  writeFileSync(join(root, "archive.zip"), zipSync({ "inner.json": Buffer.from(PLANTS.token) }));
  writeFileSync(join(root, "clean.txt"), "nothing here");
  expect(disclosures([root]).map((line) => line.replace(root, ""))).toEqual(["/archive.zip!inner.json holds token", "/plain.txt holds fill"]);
});

test("a red one-shot run types its value and seeds its token, and no file it keeps holds either", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const run = await runCli(
    "snap",
    [
      "--file",
      fixture,
      "--fill",
      `#field=${PLANTS.fill}`,
      "--debug-token",
      PLANTS.token,
      "--local-storage",
      `orb:plant=${PLANTS.storage}`,
      "--eval",
      READ_FIELD_LENGTH,
      "--expect-text",
      "#m=a string the page never shows",
      "--no-shot",
    ],
    { timeoutMs: CLI_BUDGET_MS },
  );
  expect(EVAL_RE.exec(run.stdout)?.[1]).toBe(String(PLANTS.fill.length));
  expect(run.code).not.toBe(0);
  const slot = slotOf(run.stdout);
  expect(disclosures([slot])).toEqual([]);
  expect(run.stdout).not.toContain(PLANTS.fill);
  expect(run.stdout).not.toContain(PLANTS.token);

  const index = JSON.parse(readFileSync(join(slot, "run.json"), "utf8")) as { readonly process: { readonly argv: readonly string[] } };
  expect(index.process.argv).toEqual(
    expect.arrayContaining(["--fill", "#field=<private>", "--debug-token", "<private>", "--local-storage", "orb:plant=<private>"]),
  );
  const trace = keptTrace(slot);
  expect(nonEmpty(trace.split("\n").filter((line) => line !== "")).every((line) => typeof JSON.parse(line) === "object")).toBe(true);
  expect(trace).toContain("<private>");
});

test("a fill that cannot find its field names the selector, and its failure text carries no value", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const run = await runCli("snap", ["--file", fixture, "--fill", `#absent=${PLANTS.fill}`, "--no-shot"], { timeoutMs: CLI_BUDGET_MS });
  expect(run.code).not.toBe(0);
  expect(run.stdout).toContain("#absent");
  expect(run.stdout).not.toContain(PLANTS.fill);
  expect(disclosures([slotOf(run.stdout)])).toEqual([]);
});

// A number field refuses text inside Playwright's fill, past the point `#absent` dies at, so the error quotes the value.
test.for([
  ["--fill", `#age=${PLANTS.fill}`, {}],
  ["--fill-env", `#age=${FILL_ENV}`, { [FILL_ENV]: PLANTS.fill }],
] as const)("a %s that Playwright refuses writes its value to no failure row, file or stdout", async ([flag, value, env], { runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, NUMBER_FIELD_HTML);
  const run = await runCli("snap", ["--file", fixture, flag, value, "--no-shot"], { timeoutMs: CLI_BUDGET_MS, env });
  expect(run.code).not.toBe(0);
  expect(run.stdout).toContain("STEP FAILED  fill #age");
  // The positive control: the fill reached Playwright, which quoted the value, and the mask stands where it stood.
  expect(run.stdout).toContain(`fill("<private>")`);
  expect(run.stdout).not.toContain(PLANTS.fill);
  expect(disclosures([slotOf(run.stdout)])).toEqual([]);
  const capture = JSON.parse(readFileSync(join(slotOf(run.stdout), "evidence", "core-capture.json"), "utf8")) as {
    readonly captures: readonly { readonly driveFailures: readonly { readonly flag: string; readonly reason: string }[] }[];
  };
  expect(capture.captures[0]?.driveFailures[0]?.flag).toBe("--fill");
  expect(capture.captures[0]?.driveFailures[0]?.reason).toContain("Cannot type text into input[type=number]");
});

test.for([
  ["--fill", `#pw=${REFLECTED}`, {}],
  ["--fill-env", `#pw=${FILL_ENV}`, { [FILL_ENV]: REFLECTED }],
] as const)("a page that echoes a %s value through every channel leaves no spelling of it in any file or line", async ([flag, value, env], { runCli }) => {
  await using peer = await reflectingServer();
  const run = await runCli(
    "snap",
    ["--base", peer.base, "/", flag, value, "--click", "#send", "--wait-for", SENT_SELECTOR, ...REFLECT_ARMS, "--expect-text", ASSERT_FAILS, "--no-shot"],
    { timeoutMs: CLI_BUDGET_MS, env },
  );
  // The positive controls: the value really left the page in each spelling, and each echo really was read.
  expect(peer.received.join("\n")).toContain(`/echo?plain=${encodeURIComponent(REFLECTED)}`);
  expect(peer.received.join("\n")).toContain(`/form ${new URLSearchParams({ note: REFLECTED }).toString()}`);
  expect(peer.received.join("\n")).toContain(JSON.stringify({ note: REFLECTED }));
  expect(run.code).not.toBe(0);
  expect(run.stdout).toContain('textbox "Password": <private>');
  expect(run.stdout).toContain("console-error <private>");
  expect(run.stdout).toContain("page-error <private>");
  expect(run.stdout).toContain("echo <private>");
  expect(run.stdout).toContain("title <private>");
  expect(run.stdout).toContain("/echo?plain=<private>");

  expect(spellingsIn(run.stdout)).toEqual([]);
  expect(spellingsIn(run.stderr)).toEqual([]);
  const slot = slotOf(run.stdout);
  expect(reflections([slot])).toEqual([]);
  expect(readFileSync(join(slot, "traces", "root.har"), "utf8")).toMatch(MASKED_ECHO_HEADER);
});

test("a session keeps a page's echoes out of its slots, its log and its export", async ({ runCli, scratch }) => {
  await using peer = await reflectingServer();
  const home = join(scratch, "registry");
  mkdirSync(home);
  const env = { [SESSION_HOME_KEY]: home, [HOST_POOL_ROOT_ENV]: join(scratch, "host-slots"), [DEDICATED_BOX_ENV]: "0", [FILL_ENV]: REFLECTED };
  const snap = (args: readonly string[]): ReturnType<typeof runCli> => runCli("snap", args, { env, timeoutMs: CLI_BUDGET_MS });
  const name = `typed-echo-${pid}`;
  try {
    const boot = await snap(["--session", name, "--base", peer.base, "/", "--no-shot"]);
    expect(boot.code).toBe(0);
    const call = await snap([
      "--session",
      name,
      "--fill-env",
      `#pw=${FILL_ENV}`,
      "--click",
      "#send",
      "--wait-for",
      SENT_SELECTOR,
      ...REFLECT_ARMS,
      "--no-shot",
    ]);
    expect(peer.received.join("\n")).toContain(`/echo?plain=${encodeURIComponent(REFLECTED)}`);
    expect(call.stdout).toContain('textbox "Password": <private>');
    expect(spellingsIn(call.stdout)).toEqual([]);
    const status = await snap(["--session-status", name]);
    expect(status.stdout).toContain("?state=<private>");
    expect(spellingsIn(status.stdout)).toEqual([]);
    const exported = join(scratch, "exported");
    const exporting = await snap(["--session-export", name, "--out", exported]);
    expect(spellingsIn(exporting.stdout)).toEqual([]);
    expect(filesUnder(exported).some((path) => path.endsWith(".har"))).toBe(true);
    expect(reflections([home, exported, slotOf(boot.stdout), slotOf(call.stdout)])).toEqual([]);
  } finally {
    await snap(["--session-close", name]);
    await snap(["--session-sweep"]);
  }
  expect(reflections([home])).toEqual([]);
});

// One case per dump: each is the page's own bytes, so each is a separate door.
test.for([
  ["--heap", ["--heap", "typed"], "heap"],
  ["--lighthouse", ["--lighthouse", "desktop"], "lighthouse"],
  ["--cpu-profile", ["--cpu-profile"], "cpu-profile"],
  ["--react-profile", ["--react-profile"], "react-profile"],
] as const)("a %s dump of the page keeps none of the echoed value", async ([, arm, folder], { runCli }) => {
  await using peer = await reflectingServer();
  const run = await runCli(
    "snap",
    ["--base", peer.base, "/", "--fill-env", `#pw=${FILL_ENV}`, "--click", "#send", "--wait-for", SENT_SELECTOR, ...arm, "--no-shot"],
    {
      timeoutMs: CLI_BUDGET_MS,
      env: { [FILL_ENV]: REFLECTED },
    },
  );
  expect(peer.received.join("\n")).toContain(`/echo?plain=${encodeURIComponent(REFLECTED)}`);
  expect(spellingsIn(run.stdout)).toEqual([]);
  const slot = slotOf(run.stdout);
  expect(reflections([slot])).toEqual([]);
  // The positive control: the dump really held the value, so its absence above is the scrub and not an empty artifact.
  expect(filesUnder(join(slot, folder)).some((path) => readFileSync(path).includes(PRIVATE_MASK))).toBe(true);
});

test("a measured fill labels its step by selector, so perf evidence holds no value", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const run = await runCli("snap", ["--file", fixture, "--fill", `#field=${PLANTS.fill}`, "--perf", "--no-shot"], { timeoutMs: CLI_BUDGET_MS });
  const slot = slotOf(run.stdout);
  const perf = filesUnder(slot).filter((path) => readFileSync(path, "latin1").includes("fill #field"));
  expect(perf.length).toBeGreaterThan(0);
  expect(disclosures([slot])).toEqual([]);
});

test("a value read from the environment reaches the field and no argument or file", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const run = await runCli(
    "snap",
    ["--file", fixture, "--fill-env", `#field=${FILL_ENV}`, "--eval", READ_FIELD_LENGTH, "--expect-text", "#m=a string the page never shows", "--no-shot"],
    { timeoutMs: CLI_BUDGET_MS, env: { [FILL_ENV]: PLANTS.fill } },
  );
  expect(EVAL_RE.exec(run.stdout)?.[1]).toBe(String(PLANTS.fill.length));
  const slot = slotOf(run.stdout);
  expect(disclosures([slot])).toEqual([]);
  const index = JSON.parse(readFileSync(join(slot, "run.json"), "utf8")) as { readonly process: { readonly argv: readonly string[] } };
  expect(index.process.argv).toEqual(expect.arrayContaining(["--fill-env", `#field=${FILL_ENV}`]));
  expect(keptTrace(slot)).toContain("<private>");

  const unset = await runCli("snap", ["--file", fixture, "--fill-env", "#field=L4_UNSET_VARIABLE"], { timeoutMs: CLI_BUDGET_MS });
  expect(unset.code).not.toBe(0);
  expect(unset.stdout).toContain("--fill-env names L4_UNSET_VARIABLE");
});

const BASE_USER = "canary";
const BASE_PLANTS = { password: "plant-base-pass-6d1f", token: "plant-base-token-2b8e" } as const;
/** What the browser sends a basic-auth gate: the pair, base64, as the standard library spells it. */
const BASE_AUTHORIZATION = `Basic ${Buffer.from(`${BASE_USER}:${BASE_PLANTS.password}`).toString("base64")}`;
const BASE_SPELLINGS = [BASE_PLANTS.password, BASE_PLANTS.token, BASE_AUTHORIZATION.slice("Basic ".length)] as const;

/** A loopback peer behind a basic-auth gate, the reason an operator writes credentials into `--base`. */
async function gatedServer(): Promise<AsyncDisposable & { readonly base: string; readonly admitted: () => number }> {
  let admitted = 0;
  const server = createServer((request, response) => {
    if (request.headers.authorization !== BASE_AUTHORIZATION) {
      response.writeHead(401, { "www-authenticate": 'Basic realm="gate"' }).end();
      return;
    }
    admitted += 1;
    response.writeHead(200, { "content-type": "text/html" }).end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://${BASE_USER}:${BASE_PLANTS.password}@127.0.0.1:${String(listeningAddress(server).port)}/?token=${BASE_PLANTS.token}`,
    admitted: () => admitted,
    [Symbol.asyncDispose]: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Every file under `roots` holding a base credential, by name or by bytes, a zip read entry by entry. */
function baseDisclosures(roots: readonly string[]): readonly string[] {
  const found: string[] = [];
  const judge = (label: string, text: string): void => {
    found.push(...BASE_SPELLINGS.filter((spelling) => text.includes(spelling)).map((spelling) => `${label} holds ${spelling}`));
  };
  for (const path of roots.flatMap(filesUnder)) {
    const bytes = readFileSync(path);
    judge(path, bytes.toString("latin1"));
    if (path.endsWith(".zip")) {
      for (const [entry, content] of Object.entries(unzipSync(bytes))) {
        judge(`${path}!${entry}`, Buffer.from(content).toString("latin1"));
      }
    }
  }
  return found;
}

test("a credentialed --base opens its gate, and no file, log or line holds its password or token", async ({ runCli }) => {
  await using peer = await gatedServer();
  const run = await runCli("snap", ["--base", peer.base, "/", "--requests", "--json", "--expect-text", ASSERT_FAILS, "--no-shot"], {
    timeoutMs: CLI_BUDGET_MS,
  });
  // The positive control: the browser presented the credentials and the gate let the page through.
  expect(peer.admitted()).toBeGreaterThan(0);
  expect(run.code).not.toBe(0);
  expect(BASE_SPELLINGS.filter((spelling) => run.stdout.includes(spelling) || run.stderr.includes(spelling))).toEqual([]);
  const slot = slotOf(run.stdout);
  expect(baseDisclosures([slot])).toEqual([]);
  const index = JSON.parse(readFileSync(join(slot, "run.json"), "utf8")) as { readonly process: { readonly argv: readonly string[] } };
  expect(index.process.argv).toEqual(expect.arrayContaining(["--base", expect.stringContaining(`${PRIVATE_MASK}@127.0.0.1`)]));
  expect(keptTrace(slot)).toContain(PRIVATE_MASK);
});

test("a session booted on a credentialed --base keeps its password and token out of its row, log and slots", async ({ runCli, scratch }) => {
  await using peer = await gatedServer();
  const home = join(scratch, "registry");
  mkdirSync(home);
  const env = { [SESSION_HOME_KEY]: home, [HOST_POOL_ROOT_ENV]: join(scratch, "host-slots"), [DEDICATED_BOX_ENV]: "0" };
  const snap = (args: readonly string[]): ReturnType<typeof runCli> => runCli("snap", args, { env, timeoutMs: CLI_BUDGET_MS });
  const name = `gated-base-${pid}`;
  try {
    const boot = await snap(["--session", name, "--base", peer.base, "/", "--no-shot"]);
    expect(boot.code).toBe(0);
    expect(peer.admitted()).toBeGreaterThan(0);
    const status = await snap(["--session-status", name]);
    expect(status.stdout).toContain(`${PRIVATE_MASK}@127.0.0.1`);
    expect(BASE_SPELLINGS.filter((spelling) => boot.stdout.includes(spelling) || status.stdout.includes(spelling))).toEqual([]);
    expect(existsSync(join(home, `${name}.log`))).toBe(true);
    expect(baseDisclosures([home, slotOf(boot.stdout)])).toEqual([]);
  } finally {
    await snap(["--session-close", name]);
    await snap(["--session-sweep"]);
  }
  expect(baseDisclosures([home])).toEqual([]);
});

test("a session keeps boot and call values out of its row, log, slots and export", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const home = join(scratch, "registry");
  mkdirSync(home);
  const env = { [SESSION_HOME_KEY]: home, [HOST_POOL_ROOT_ENV]: join(scratch, "host-slots"), [DEDICATED_BOX_ENV]: "0" };
  const snap = (args: readonly string[]): ReturnType<typeof runCli> => runCli("snap", args, { env, timeoutMs: CLI_BUDGET_MS });
  const name = `typed-secret-${pid}`;
  const row = (): { readonly slotDir: string; readonly lastOp: string; readonly bootArgv: readonly string[] } =>
    JSON.parse(readFileSync(join(home, `${name}.json`), "utf8")) as { readonly slotDir: string; readonly lastOp: string; readonly bootArgv: readonly string[] };
  try {
    const boot = await snap(["--session", name, "--file", fixture, "--debug-token", PLANTS.token, "--fill", `#field=${PLANTS.fill}`, "--no-shot"]);
    expect(boot.code).toBe(0);
    expect(row().bootArgv).toEqual(expect.arrayContaining(["--debug-token", "<private>", "--fill", "#field=<private>"]));
    const call = await snap(["--session", name, "--fill", `#field=${PLANTS.later}`, "--eval", READ_FIELD_LENGTH, "--no-shot"]);
    expect(EVAL_RE.exec(call.stdout)?.[1]).toBe(String(PLANTS.later.length));
    expect(row().lastOp).toContain("--fill #field=<private>");
    const refused = await snap(["--session", name, "--fill", PLANTS.refused, "--no-shot"]);
    expect(refused.stdout).toContain("--fill expects sel=value");
    expect(refused.stdout).not.toContain(PLANTS.refused);
    const exported = join(scratch, "exported");
    await snap(["--session-export", name, "--out", exported]);
    expect(filesUnder(exported).some((path) => path.endsWith(".zip"))).toBe(true);
    expect(existsSync(join(home, `${name}.log`))).toBe(true);
    expect(disclosures([home, exported, slotOf(boot.stdout), slotOf(call.stdout), row().slotDir])).toEqual([]);
  } finally {
    await snap(["--session-close", name]);
    await snap(["--session-sweep"]);
  }
  expect(disclosures([home])).toEqual([]);
});
