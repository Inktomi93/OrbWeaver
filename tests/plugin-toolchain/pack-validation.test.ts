// `orb-plugin pack` refuses a project the install funnel or the host would refuse. Each refusal sits beside a
// valid twin that runs the same wiring, so a mis-wired fixture fails the twin rather than green-washing the refusal.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY, PLUGIN_UI_ENTRY } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/tooling";
import { packPluginDirectory } from "../../packages/plugin-toolchain/src/index.ts";

interface Project {
  // Text or bytes are written as is, so a case can plant a manifest that is not JSON or not UTF-8.
  readonly manifest: Readonly<Record<string, unknown>> | string | Uint8Array;
  readonly main: string;
  readonly ui?: string;
}

const BASE_MANIFEST = {
  id: "probe",
  name: "Probe",
  version: "0.1.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  description: "A probe plugin.",
  capabilities: [],
} as const;

const HOST = "const host = orb.host(1);\n";
const TOOL = '{ name: "greet", description: "Greet", parameters: { type: "object", properties: {} }, handler: async () => "hi" }';
const SURFACE = '{ id: "panel", anchor: "settings", title: "Panel", tier: "static" }';

let projectCount = 0;

function manifestContents(manifest: Project["manifest"]): string | Uint8Array {
  return typeof manifest === "string" || manifest instanceof Uint8Array ? manifest : JSON.stringify(manifest);
}

async function pack(scratch: string, project: Project, sdkDirectory: string): Promise<{ readonly messages: readonly string[]; readonly packed: boolean }> {
  projectCount += 1;
  const pluginDirectory = join(scratch, `project-${projectCount}`);
  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(join(pluginDirectory, PLUGIN_MANIFEST_ENTRY), manifestContents(project.manifest));
  await writeFile(join(pluginDirectory, "main.ts"), project.main);
  if (project.ui !== undefined) {
    await writeFile(join(pluginDirectory, "ui.ts"), project.ui);
  }
  const result = await packPluginDirectory({ pluginDirectory, sdkDirectory });
  return { messages: result.diagnostics.map((diagnostic) => diagnostic.message), packed: result.bundle !== null };
}

const CLEAN = { messages: [], packed: true } as const;

// The refusal names its reason; every other diagnostic may accompany it.
function refusedFor(reason: string): { readonly messages: unknown; readonly packed: false } {
  return { messages: expect.arrayContaining([expect.stringContaining(reason)]), packed: false };
}

const UNSERVED_HOST_VERSION = Math.max(...PLUGIN_HOST_VERSIONS) + 1;

// The text parses as JSON once the bad byte is replaced; the install funnel refuses the bytes, so pack does too.
const [DESCRIPTION_HEAD = "", DESCRIPTION_TAIL = ""] = JSON.stringify({ ...BASE_MANIFEST, description: "@@" }).split("@@");
const NOT_UTF8 = new Uint8Array([...new TextEncoder().encode(DESCRIPTION_HEAD), 0xff, ...new TextEncoder().encode(DESCRIPTION_TAIL)]);

const MANIFESTS = [
  ["a slug", BASE_MANIFEST, { ...BASE_MANIFEST, id: "Not A Slug" }, "manifest.json id:"],
  // A cross-field rule of the contract, not a regex a copy could carry: an egress capability needs netHosts.
  [
    "an egress capability",
    { ...BASE_MANIFEST, capabilities: ["net.fetch"], netHosts: ["example.com"] },
    { ...BASE_MANIFEST, capabilities: ["net.fetch"] },
    "netHosts",
  ],
  ["a membrane major", BASE_MANIFEST, { ...BASE_MANIFEST, hostVersion: UNSERVED_HOST_VERSION }, `hostVersion ${UNSERVED_HOST_VERSION} is not served`],
  ["text that is not JSON", JSON.stringify(BASE_MANIFEST), '{ "id": ', "manifest.json is not valid UTF-8 JSON"],
  ["JSON with no fields", BASE_MANIFEST, "[]", "manifest.json (root):"],
  ["bytes that are not UTF-8", BASE_MANIFEST, NOT_UTF8, "manifest.json is not valid UTF-8 JSON"],
] as const;

test.for(MANIFESTS)("pack validates %s through the contracts' manifest schema", async ([, valid, planted, reason], { repoRoot, scratch }) => {
  const sdk = join(repoRoot, "packages/plugin-sdk");
  expect(await pack(scratch, { manifest: valid, main: HOST }, sdk)).toEqual(CLEAN);
  expect(await pack(scratch, { manifest: planted, main: HOST }, sdk)).toEqual(refusedFor(reason));
});

test("pack refuses a project with no manifest.json", async ({ repoRoot, scratch }) => {
  const pluginDirectory = join(scratch, "no-manifest");
  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(join(pluginDirectory, "main.ts"), HOST);
  const result = await packPluginDirectory({ pluginDirectory, sdkDirectory: join(repoRoot, "packages/plugin-sdk") });
  expect(result.bundle).toBeNull();
  expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContainEqual(expect.stringContaining(`${PLUGIN_MANIFEST_ENTRY} is required`));
});

test("pack agrees uiEntry with an authored ui.ts in both directions", async ({ repoRoot, scratch }) => {
  const sdk = join(repoRoot, "packages/plugin-sdk");
  const withUiEntry = { ...BASE_MANIFEST, capabilities: ["ui.surface"], uiEntry: PLUGIN_UI_ENTRY };
  const ui = "const ui = orb.ui(1);\nui.onEvent(() => {});\n";
  expect(await pack(scratch, { manifest: withUiEntry, main: HOST, ui }, sdk)).toEqual(CLEAN);
  expect(await pack(scratch, { manifest: withUiEntry, main: HOST }, sdk)).toEqual(refusedFor("declares uiEntry but ui.ts is not authored"));
  expect(await pack(scratch, { manifest: { ...BASE_MANIFEST, capabilities: ["ui.surface"] }, main: HOST, ui }, sdk)).toEqual(
    refusedFor("ui.ts is authored but manifest.json declares no uiEntry"),
  );
});

const CAPABILITY_CALLS = [
  ["a property call", `host.tools.register(${TOOL});`],
  ["a destructured member", `const { register } = host.tools;\nregister(${TOOL});`],
  ["a destructured namespace", `const { tools } = host;\ntools.register(${TOOL});`],
  ["a bracket call", `host["tools"]["register"](${TOOL});`],
  ["an aliased member", `const add = host.tools.register;\nadd(${TOOL});`],
] as const;

test.for(CAPABILITY_CALLS)("pack cross-checks capabilities against %s", async ([, call], { repoRoot, scratch }) => {
  const sdk = join(repoRoot, "packages/plugin-sdk");
  const main = `${HOST}${call}\n`;
  expect(await pack(scratch, { manifest: BASE_MANIFEST, main }, sdk)).toEqual(refusedFor('host.tools.register needs the "tools.register" capability'));
  expect(await pack(scratch, { manifest: { ...BASE_MANIFEST, capabilities: ["tools.register"] }, main }, sdk)).toEqual(CLEAN);
});

test("pack cross-checks the capabilities the ui.js realm proxies", async ({ repoRoot, scratch }) => {
  const sdk = join(repoRoot, "packages/plugin-sdk");
  const ui = 'const ui = orb.ui(1);\nvoid ui.host.storage.get("key");\n';
  const manifest = { ...BASE_MANIFEST, capabilities: ["ui.surface"], uiEntry: PLUGIN_UI_ENTRY };
  expect(await pack(scratch, { manifest, main: HOST, ui }, sdk)).toEqual(refusedFor('host.storage.get needs the "storage.kv" capability'));
  expect(await pack(scratch, { manifest: { ...manifest, capabilities: ["ui.surface", "storage.kv"] }, main: HOST, ui }, sdk)).toEqual(CLEAN);
});

const SURFACE_CAPABLE = { ...BASE_MANIFEST, capabilities: ["ui.surface", "ui.frame"] } as const;
const FRAME = '{ id: "frame_one", anchor: "settings", title: "Frame", html: "<p>hi</p>" }';

const REGISTRATIONS = [
  ["a surface id", `host.ui.register(${SURFACE});`, `host.ui.register({ id: "Bad-Id", anchor: "settings", title: "Panel", tier: "static" });`, "id:"],
  [
    "a destructured surface id",
    `const { register } = host.ui;\nregister(${SURFACE});`,
    `const { register } = host.ui;\nregister({ id: "starter-browser", anchor: "settings", title: "Panel", tier: "static" });`,
    "id:",
  ],
  [
    "a surface whose other fields are not literals",
    `const title = String(host.grants.length);\nhost.ui.register({ id: "panel", anchor: "settings", title, tier: "static" });`,
    `const title = String(host.grants.length);\nhost.ui.register({ id: "Bad-Id", anchor: "settings", title, tier: "static" });`,
    "id:",
  ],
  [
    "a frame id",
    `host.ui.registerFrame(${FRAME});`,
    `host.ui["registerFrame"]({ id: "frame-one", anchor: "settings", title: "Frame", html: "<p>hi</p>" });`,
    "id:",
  ],
  [
    "a command name",
    'host.ui.registerCommand({ name: "say_hi", describe: "Say hi", onRun: async () => {} });',
    'host.ui.registerCommand({ name: "Say-Hi", describe: "Say hi", onRun: async () => {} });',
    "name:",
  ],
  [
    "a tool-card with an arrow handler",
    `host.ui.register({ id: "card", anchor: "tool-card", title: "Card", tier: "static", toolName: "greet", onAction: async () => {} });`,
    `host.ui.register({ id: "card", anchor: "tool-card", title: "Card", tier: "static", onAction: async () => {} });`,
    "toolName",
  ],
  [
    "a tool-card with a method handler",
    `host.ui.register({ id: "card", anchor: "tool-card", title: "Card", tier: "static", toolName: "greet", onAction() {} });`,
    `host.ui.register({ id: "card", anchor: "tool-card", title: "Card", tier: "static", onAction() {} });`,
    "toolName",
  ],
  [
    "a tool-card with a shorthand handler",
    `const onAction = async (): Promise<void> => {};\nhost.ui.register({ id: "card", anchor: "tool-card", title: "Card", tier: "static", toolName: "greet", onAction });`,
    `const onAction = async (): Promise<void> => {};\nhost.ui.register({ id: "card", anchor: "tool-card", title: "Card", tier: "static", onAction });`,
    "toolName",
  ],
  [
    "a tool-card whose toolName is not a literal",
    `const toolName = host.grants[0] ?? "greet";\nhost.ui.register({ id: "card", anchor: "tool-card", title: "Card", tier: "static", toolName });`,
    `host.ui.register({ id: "card", anchor: "tool-card", title: "Card", tier: "static" });`,
    "toolName",
  ],
  [
    "a surface built from a spread",
    `const base = { id: "card", title: "Card" };\nhost.ui.register({ ...base, anchor: "tool-card", tier: "static" });`,
    `host.ui.register({ id: "card", title: "Card", anchor: "tool-card", tier: "static" });`,
    "toolName",
  ],
  [
    "a command argument list held in a constant",
    `const ARGS = [{ name: "who", type: "string", describe: "Who" }] as const;\nhost.ui.registerCommand({ name: "say_hi", describe: "Say hi", args: ARGS, onRun: async () => {} });`,
    `const ARGS = [{ name: "Bad-Arg", type: "string", describe: "Who" }] as const;\nhost.ui.registerCommand({ name: "say_hi", describe: "Say hi", args: ARGS, onRun: async () => {} });`,
    "args.0.name",
  ],
  [
    "a command argument default",
    `host.ui.registerCommand({ name: "count", describe: "Count", args: [{ name: "n", type: "number", default: -3, required: true }], onRun: async () => {} });`,
    `host.ui.registerCommand({ name: "count", describe: "Count", args: [{ name: "n", type: "string", default: 3 }], onRun: async () => {} });`,
    "args.0.default",
  ],
  [
    "a frame at the tool-card anchor",
    `host.ui.registerFrame({ id: "frame_one", anchor: "tool-card", title: "Frame", html: "<p>hi</p>" });`,
    `host.ui.registerFrame({ id: "Bad-Id", anchor: "tool-card", title: "Frame", html: "<p>hi</p>" });`,
    "id:",
  ],
  [
    "a frame body",
    `const html = String(host.grants.length);\nhost.ui.registerFrame({ id: "frame_one", anchor: "settings", title: "Frame", html });`,
    // Far past any bound the frame body schema sets, so the test names no limit.
    `host.ui.registerFrame({ id: "frame_one", anchor: "settings", title: "Frame", html: "${"x".repeat(1_000_000)}" });`,
    "html:",
  ],
] as const;

test.for(REGISTRATIONS)("pack runs %s through the contracts' registration schema", async ([, valid, planted, reason], { repoRoot, scratch }) => {
  const sdk = join(repoRoot, "packages/plugin-sdk");
  expect(await pack(scratch, { manifest: SURFACE_CAPABLE, main: `${HOST}${valid}\n` }, sdk)).toEqual(CLEAN);
  expect(await pack(scratch, { manifest: SURFACE_CAPABLE, main: `${HOST}${planted}\n` }, sdk)).toEqual(refusedFor(reason));
});

const LINKED_CALLS = [
  ["a destructured setState", "const { setState } = host.ui;\nsetState(NAME, {});"],
  ["a bracket setState", 'host.ui["setState"](NAME, {});'],
  ["a bracket openDialog", 'host.ui["openDialog"](NAME);'],
] as const;

test.for(LINKED_CALLS)("surface links read %s", async ([, call], { repoRoot, scratch }) => {
  const sdk = join(repoRoot, "packages/plugin-sdk");
  const main = (name: string): string =>
    `${HOST}const NAME = "${name}";\nhost.ui.register({ id: "panel", anchor: "dialog", title: "Panel", tier: "static" });\n${call}\n`;
  expect(await pack(scratch, { manifest: SURFACE_CAPABLE, main: main("panel") }, sdk)).toEqual(CLEAN);
  expect(await pack(scratch, { manifest: SURFACE_CAPABLE, main: main("missing") }, sdk)).toEqual(
    refusedFor('names surface "missing", which this plugin never registers'),
  );
});
