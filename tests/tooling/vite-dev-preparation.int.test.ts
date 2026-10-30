// Native Vite startup must finish the authenticated transform graph before its listener becomes available.
// The temporary project supplies module I/O; the startup plugin comes from the production config.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { z } from "zod";
import { scaledBudget } from "./_load-budget.ts";

const RUN_BUDGET_MS = scaledBudget(60_000);
const FIXTURE_WAIT_MS = scaledBudget(10_000);
const observationSchema = z.object({
  dependencyStartedDuringListen: z.boolean(),
  listeningBeforeRelease: z.boolean(),
  leafTransformedBeforeRelease: z.boolean(),
  listeningAfterRelease: z.boolean(),
  outcome: z.enum(["listening", "rejected"]),
  error: z.string().nullable(),
  fixtureReached: z.boolean(),
  transformedLeaf: z.string().nullable(),
  nativeHotTransport: z.boolean(),
  hotMessageReceived: z.boolean(),
});

async function observeStartup(repoRoot: string, scratch: string, failure: boolean): Promise<z.infer<typeof observationSchema>> {
  const clientRoot = join(repoRoot, "packages", "client");
  const driver = join(scratch, "startup.mjs");
  writeFileSync(
    driver,
    `import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServer } from ${JSON.stringify(pathToFileURL(join(clientRoot, "node_modules/vite/dist/node/index.js")).href)};
import productionConfig from ${JSON.stringify(pathToFileURL(join(clientRoot, "vite.config.ts")).href)};

const root = ${JSON.stringify(join(scratch, "project"))};
const files = {
  "index.html": '<script type="module" src="/src/entry.ts"></script>',
  "src/entry.ts": 'await import("./main.tsx");',
  "src/main.tsx": "export const main = true;",
  "src/routes/router.tsx": "export const router = true;",
  "src/compose/authed-app.tsx": 'import "./startup-branch.ts"; export const AuthedApp = true;',
  "src/compose/startup-branch.ts": 'import "./startup-leaf.ts"; export const branch = true;',
  "src/compose/startup-leaf.ts": 'export const preparedLeaf = "actual transformed dependency";',
  "src/compose/config-sections.ts": "export const configSections = true;",
  "src/dev/agent-handles/index.ts": "export const installAgentHandles = true;",
  "src/lib/long-task-tracer.ts": "export const installLongTaskTracer = true;",
};
for (const [name, source] of Object.entries(files)) {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}
const entered = Promise.withResolvers();
const release = Promise.withResolvers();
let fixtureReached = false;
const leafUrl = "/src/compose/startup-leaf.ts";
const edge = {
  name: "test:delayed-module-io",
  async load(id) {
    if (id !== join(root, leafUrl.slice(1))) return;
    fixtureReached = true;
    entered.resolve();
    await release.promise;
    if (${String(failure)}) throw new Error("nested dependency refused");
  },
};
const config = productionConfig({ command: "serve", mode: "development" });
const server = await createServer({
  ...config,
  configFile: false,
  root,
  cacheDir: ${JSON.stringify(join(scratch, "cache"))},
  // Keep the production startup plugin. Other plugins are unrelated to the environment lifecycle.
  plugins: [...config.plugins.filter((plugin) => plugin?.name === "orb:dev-preparation"), edge],
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: {
    ...config.server,
    host: "127.0.0.1", port: 0, strictPort: false, proxy: {}, watch: null,
    // The fixture is outside the workspace that the production file-access boundary admits.
    fs: { ...config.server?.fs, allow: [root] },
  },
});
const environment = server.environments.client;
if (!environment.config.dev.preTransformRequests) {
  throw new Error("fixture requires native client static-import pre-transforms");
}
const milestones = ["server-created"];
async function atMilestone(promise, label) {
  milestones.push(label);
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("fixture did not reach " + label + ": " + JSON.stringify({
          milestones, fixtureReached, listening: server.httpServer.listening,
          modules: [...environment.moduleGraph.urlToModuleMap.keys()],
        }))), ${String(FIXTURE_WAIT_MS)});
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const listening = server.listen().then(
  () => ({ outcome: "listening", error: null }),
  (error) => ({ outcome: "rejected", error: String(error) }),
);
try {
  const first = await atMilestone(Promise.race([
    listening.then(() => "listener"),
    entered.promise.then(() => "dependency"),
  ]), "listener-or-nested-load");
  const listeningBeforeRelease = server.httpServer.listening;
  const leaf = await environment.moduleGraph.getModuleByUrl(leafUrl);
  const leafTransformedBeforeRelease = leaf?.transformResult != null;
  // The old environment can return before it reaches the authenticated graph. Drive the same native
  // transform afterward only to prove the fixture is reachable; this cannot qualify its earlier listen.
  if (first === "listener") {
    const rootTransform = await atMilestone(
      environment.transformRequest("/src/compose/authed-app.tsx"), "positive-control-root-transform",
    );
    if (rootTransform === null) throw new Error("positive-control authenticated root returned no transform");
    await atMilestone(entered.promise, "positive-control-nested-load");
  }
  release.resolve();
  const result = await listening;
  let transformedLeaf = null;
  try {
    transformedLeaf = (await environment.transformRequest(leafUrl))?.code ?? null;
  } catch {
    // The failing I/O control deliberately rejects. The listener outcome above is the assertion subject.
  }
  const nativeHotTransport = environment.hot === server.ws;
  let hotMessageReceived = false;
  if (result.outcome === "listening" && nativeHotTransport) {
    const address = server.httpServer.address();
    const socket = new WebSocket("ws://127.0.0.1:" + address.port + "/?token=" + server.config.webSocketToken, "vite-hmr");
    try {
      await atMilestone(new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
      }), "native-hot-open");
      const message = new Promise((resolve) => {
        socket.addEventListener("message", (event) => {
          const payload = JSON.parse(event.data);
          if (payload.type === "custom" && payload.event === "test:prepared-hot" && payload.data.prepared === true) resolve(true);
        });
      });
      environment.hot.send("test:prepared-hot", { prepared: true });
      hotMessageReceived = await atMilestone(message, "native-hot-message");
    } finally {
      const closed = new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
      socket.close();
      await atMilestone(closed, "native-hot-close");
    }
  }
  console.log(JSON.stringify({
    nativeHotTransport,
    hotMessageReceived,
    dependencyStartedDuringListen: first === "dependency",
    listeningBeforeRelease,
    leafTransformedBeforeRelease,
    listeningAfterRelease: server.httpServer.listening,
    ...result,
    fixtureReached,
    transformedLeaf,
  }));
} finally {
  release.resolve();
  await server.close();
}
`,
  );
  const result = await spawnNiced("node", [driver], { cwd: repoRoot, timeoutMs: RUN_BUDGET_MS });
  expect(result.code, result.stderr || result.stdout).toBe(0);
  return observationSchema.parse(JSON.parse(result.stdout.trim().split("\n").at(-1) ?? ""));
}

test("Vite keeps its listener unavailable until the authenticated nested transform completes", { timeout: RUN_BUDGET_MS }, async ({ repoRoot, scratch }) => {
  const observed = await observeStartup(repoRoot, scratch, false);
  expect(observed.fixtureReached).toBe(true);
  expect(observed.transformedLeaf).toContain("actual transformed dependency");
  expect(observed.dependencyStartedDuringListen).toBe(true);
  expect(observed.listeningBeforeRelease).toBe(false);
  expect(observed.leafTransformedBeforeRelease).toBe(false);
  expect(observed.outcome).toBe("listening");
  expect(observed.listeningAfterRelease).toBe(true);
  expect(observed.nativeHotTransport).toBe(true);
  expect(observed.hotMessageReceived).toBe(true);
});

test("Vite rejects startup when an authenticated nested transform fails instead of publishing a listener", { timeout: RUN_BUDGET_MS }, async ({
  repoRoot,
  scratch,
}) => {
  const observed = await observeStartup(repoRoot, scratch, true);
  expect(observed.fixtureReached).toBe(true);
  expect(observed.transformedLeaf).toBeNull();
  expect(observed.outcome).toBe("rejected");
  expect(observed.error).toContain("nested dependency refused");
  expect(observed.listeningAfterRelease).toBe(false);
});
