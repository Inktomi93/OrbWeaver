// Maintainer-only exact-revision materializer for the official DevTools frontend closure. Normal Snap
// and CT runs use the committed bytes only; this is the sole networked update path.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { launchProbeSession, withProbeSession } from "../../_shared/browser.ts";
import type {
  DevToolsAssetEntry,
  DevToolsAssetManifest,
  DevToolsAssetPin,
  DevToolsLicenseFamily,
  DevToolsLicenseFile,
  DevToolsLicenseManifest,
} from "../../_shared/devtools-assets.ts";
import { parseDevToolsAssetPin } from "../../_shared/devtools-assets.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { budget } from "../../_shared/load-budget.ts";
import { DEVTOOLS_LICENSE_SOURCES } from "../lib/devtools-license-sources.ts";
import { literalModuleAssetPaths, pathForDevToolsRequest } from "../lib/devtools-module-assets.ts";
import { devToolsDiscoveryProof } from "./page-validate.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap:devtools-assets");
const ROOT = fileURLToPath(new URL("../lib/devtools-frontend", import.meta.url));
const SOURCE_ORIGIN = "https://chrome-devtools-frontend.appspot.com";
const GITILES = "https://chromium.googlesource.com/devtools/devtools-frontend";
const SHA256_RE = /^[a-f0-9]{64}$/u;
const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVICE_UNAVAILABLE = 503;
const DEBUG_PORT_ATTEMPTS = 100;
const DEBUG_PORT_RETRY_MS = 25;
const FRONTEND_ATTACH_MS = 3000;
const CLOSURE_SETTLE_MS = 3000;
const PLANTED_CASES = 9;
const RESOURCE_FETCH_BATCH = 6;
const RESOURCE_FETCH_ATTEMPTS = 3;
const RESOURCE_FETCH_RETRY_MS = 250;
/** All THREE DevTools ceilings ride `budget()` (#1266, #1508): asset fetch, license-notice fetch and the
 *  frontend navigation are ceilings a healthy materialisation never reaches, so stretching them under load
 *  costs nothing, stops a contended box reading as a broken pin, and no fetch here can hang unbounded. */
const RESOURCE_FETCH_BASE_MS = 30_000;
const RESOURCE_FETCH_TIMEOUT_MS = budget(RESOURCE_FETCH_BASE_MS);
const FRONTEND_NAV_BASE_MS = 30_000;
const FRONTEND_NAV_TIMEOUT_MS = budget(FRONTEND_NAV_BASE_MS);
const JAVASCRIPT_MIME_TYPES = new Set(["application/javascript", "text/javascript"]);

interface CachedAsset {
  readonly body: Buffer;
  readonly mimeType: string;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readPin(): Promise<DevToolsAssetPin> {
  return parseDevToolsAssetPin(JSON.parse(await readFile(join(ROOT, "pin.json"), "utf8")));
}

async function fetchAsset(path: string): Promise<CachedAsset> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= RESOURCE_FETCH_ATTEMPTS; attempt += 1) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): each failed attempt is retained as `lastError`; retry exhaustion throws it with the asset path below. Ends if exhaustion stops throwing the retained detail.
    try {
      const response = await fetch(`${SOURCE_ORIGIN}${path}`, { redirect: "manual", signal: AbortSignal.timeout(RESOURCE_FETCH_TIMEOUT_MS) });
      if (response.status === HTTP_OK && !response.headers.has("location")) {
        const mimeType = (response.headers.get("content-type") ?? "application/octet-stream").split(";", 1)[0] ?? "application/octet-stream";
        return { body: Buffer.from(await response.arrayBuffer()), mimeType };
      }
      lastError = new Error(`returned ${response.status} or redirected`);
      if (response.status !== HTTP_TOO_MANY_REQUESTS && response.status !== HTTP_SERVICE_UNAVAILABLE) {
        break;
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < RESOURCE_FETCH_ATTEMPTS) {
      stdout.write(`PROGRESS snap-devtools-assets retry=${attempt + 1}/${RESOURCE_FETCH_ATTEMPTS} path=${path}\n`);
      await new Promise((resolve) => setTimeout(resolve, RESOURCE_FETCH_RETRY_MS * attempt));
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`DevTools asset fetch ${path} exhausted its retry budget: ${detail}`);
}

async function discoverLiteralModuleAssets(
  entries: readonly (readonly [string, Promise<CachedAsset>])[],
  revision: string,
  cache: ReadonlyMap<string, Promise<CachedAsset>>,
): Promise<ReadonlySet<string>> {
  const discovered = new Set<string>();
  for (const [path, pending] of entries) {
    const asset = await pending;
    if (!JAVASCRIPT_MIME_TYPES.has(asset.mimeType)) {
      continue;
    }
    for (const literalPath of literalModuleAssetPaths(path, asset.body.toString("utf8"), revision)) {
      if (!cache.has(literalPath)) {
        discovered.add(literalPath);
      }
    }
  }
  return discovered;
}

async function fetchLiteralModuleAssets(paths: readonly string[], cache: Map<string, Promise<CachedAsset>>): Promise<void> {
  for (let start = 0; start < paths.length; start += RESOURCE_FETCH_BATCH) {
    const batch = paths.slice(start, start + RESOURCE_FETCH_BATCH);
    const pending = batch.map((path) => [path, fetchAsset(path)] as const);
    for (const [path, asset] of pending) {
      cache.set(path, asset);
    }
    await Promise.all(pending.map(([, asset]) => asset));
    stdout.write(`PROGRESS snap-devtools-assets literal-assets=${Math.min(start + batch.length, paths.length)}/${paths.length}\n`);
  }
}

async function closeLiteralModuleAssets(revision: string, cache: Map<string, Promise<CachedAsset>>): Promise<void> {
  const scanned = new Set<string>();
  let pendingEntries = [...cache.entries()];
  while (pendingEntries.length > 0) {
    for (const [path] of pendingEntries) {
      scanned.add(path);
    }
    const discovered = await discoverLiteralModuleAssets(pendingEntries, revision, cache);
    if (discovered.size > 0) {
      await fetchLiteralModuleAssets([...discovered], cache);
    }
    pendingEntries = [...cache.entries()].filter(([path]) => !scanned.has(path));
  }
}

async function startDiscoveryProxy(revision: string, cache: Map<string, Promise<CachedAsset>>, failures: string[]): Promise<Server> {
  const server = createServer((request, response) => {
    // @orb-gate-ignore caught-failure-ownership(promise:promise): any escape from the request handler is recorded in `failures`, destroys the response, and aborts materialization after discovery. Ends if the shared failure receipt stops gating installation.
    (async (): Promise<void> => {
      // @orb-gate-ignore caught-failure-ownership(empty:error): request failures enter the shared `failures` receipt, return HTTP 502, and abort materialization after discovery. Ends if the post-discovery failures check is removed.
      try {
        if (request.method !== "GET") {
          response.writeHead(HTTP_METHOD_NOT_ALLOWED).end();
          return;
        }
        const path = pathForDevToolsRequest(request.url, revision);
        const pending = cache.get(path) ?? fetchAsset(path);
        cache.set(path, pending);
        const asset = await pending;
        response.writeHead(HTTP_OK, { "content-type": asset.mimeType, "x-content-type-options": "nosniff" }).end(asset.body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
        response.writeHead(HTTP_BAD_GATEWAY).end(message);
      }
    })().catch((unhandled: unknown) => {
      const message = unhandled instanceof Error ? unhandled.message : String(unhandled);
      failures.push(`discovery response failure: ${message}`);
      response.destroy(unhandled instanceof Error ? unhandled : new Error(message));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

function serverPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string" || address.address !== "127.0.0.1") {
    throw new Error("DevTools discovery proxy did not bind an IPv4 loopback TCP address");
  }
  return address.port;
}

async function debugPort(profile: string): Promise<number> {
  const file = join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < DEBUG_PORT_ATTEMPTS; attempt += 1) {
    // @orb-gate-ignore caught-failure-ownership(empty:catch): Chrome creates this file only after binding the ephemeral endpoint; the bounded retry loop owns the race and throws when its budget expires. Ends if exhaustion stops throwing.
    try {
      const [line] = (await readFile(file, "utf8")).split("\n");
      const port = Number(line);
      if (Number.isInteger(port) && port > 0) {
        return port;
      }
    } catch {
      // Chrome writes this after the process has bound its OS-assigned endpoint.
    }
    await new Promise((resolve) => setTimeout(resolve, DEBUG_PORT_RETRY_MS));
  }
  throw new Error("Chrome did not publish DevToolsActivePort");
}

async function targetId(page: Page): Promise<{ readonly id: string; readonly revision: string; readonly protocolVersion: string; readonly product: string }> {
  const cdp = await page.context().newCDPSession(page);
  const [target, version] = await Promise.all([cdp.send("Target.getTargetInfo"), cdp.send("Browser.getVersion")]);
  return { id: target.targetInfo.targetId, revision: version.revision, protocolVersion: version.protocolVersion, product: version.product };
}

const FIXTURE_HTML = `<style>
@layer low { #layered { color:red } } #layered { color:blue }
.specific { color:red } #specific { color:blue } #inline { color:red } #parent { color:purple }
#custom { --tone:orange; color:var(--missing,var(--tone)) }
#cycle { --a:var(--b); --b:var(--a); color:var(--a,green) }
#undefined { color:var(--void,teal) }
@keyframes pulse { from { color:red } to { color:blue } }
#animation { color:black; animation:pulse 100s linear infinite }
#transition { color:red; transition:color 100s linear } #transition.on { color:blue }
/*# sourceURL=/packages/ui/src/styles/globals.css */
</style><style>
#layered { background: white }
/*# sourceURL=/packages/client/src/styles/globals.css */
</style><style data-orb-theme-css>
#layered { border-color: currentColor }
</style><main data-orb-devtools-fixture>
<div id="layered"></div><div id="specific" class="specific"></div><div id="inline" style="color:lime"></div>
<div id="parent"><span id="inherited"></span></div><div id="custom"></div><div id="cycle"></div>
<div id="undefined"></div><div id="animation"></div><div id="transition"></div></main>`;

const DISCOVERY_BRIDGE = `(async () => {
  const SDK = await import("./core/sdk/sdk.js");
  const Root = await import("./core/root/root.js");
  const Formatter = await import("./models/formatter/formatter.js"), formatted = await Formatter.ScriptFormatter.formatScriptContent("text/css", "a{color:red}", "  ");
  if (!formatted.formattedContent.includes("color")) throw new Error("formatter worker returned no content");
  Object.assign(Root.Runtime.hostConfig, { devToolsAnimationStylesInStylesTab: { enabled: true } });
  if (Root.Runtime.hostConfig.devToolsAnimationStylesInStylesTab?.enabled !== true) throw new Error("animation host config arm missing");
  let target = SDK.TargetManager.TargetManager.instance().primaryPageTarget();
  for (let attempt = 0; target === null && attempt < 100; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
    target = SDK.TargetManager.TargetManager.instance().primaryPageTarget();
  }
  if (!target) throw new Error("no primary target");
  const dom = target.model(SDK.DOMModel.DOMModel); const css = target.model(SDK.CSSModel.CSSModel);
  if (!dom || !css) throw new Error("missing DOM/CSS model");
  const doc = await dom.requestDocument(); if (!doc) throw new Error("missing document");
  const cases = [["#layered","color"],["#specific","color"],["#inline","color"],["#inherited","color"],
    ["#custom","color"],["#cycle","color"],["#undefined","color"],["#animation","color"],["#transition","color"]];
  const rows = [];
  for (const [selector, property] of cases) {
    const nodeId = await dom.querySelector(doc.id, selector); if (!nodeId) throw new Error("missing fixture node " + selector);
    const matched = await css.getMatchedStyles(nodeId); const computed = await css.getComputedStyle(nodeId);
    if (!matched || !computed) throw new Error("missing style evidence " + selector);
    const styles = matched.nodeStyles();
    const sheetTexts = new Map();
    for (const style of styles) {
      if (style.styleSheetId && !sheetTexts.has(style.styleSheetId)) {
        const text = await css.getStyleSheetText(style.styleSheetId);
        if (typeof text !== "string") throw new Error("stylesheet text unavailable");
        sheetTexts.set(style.styleSheetId, text);
      }
    }
    const states = [];
    for (const style of styles) {
      const header = style.styleSheetId ? css.styleSheetHeaderForId(style.styleSheetId) : null;
      const owner = header?.ownerNode ? await header.ownerNode.resolvePromise() : null;
      const ownerCustomCss = owner?.getAttribute("data-orb-theme-css") !== undefined;
      for (const candidate of style.allProperties()) {
        if (candidate.name !== property) continue;
        const parentRule = style.parentRule;
        states.push({
          state: matched.propertyState(candidate),
          ownerCustomCss,
          important: candidate.important,
          inherited: matched.isInherited(style),
          styleType: style.type,
          selector: parentRule && typeof parentRule.selectorText === "function" ? parentRule.selectorText() : null,
          styleSheetId: style.styleSheetId ?? null,
          sourceUrl: header?.sourceURL ?? null,
          range: candidate.range ? candidate.range.serializeToObject() : null,
        });
      }
    }
    for (const [sheetId, before] of sheetTexts) {
      const after = await css.getStyleSheetText(sheetId);
      if (after !== before) throw new Error("stylesheet bytes changed");
    }
    if (states.length === 0) throw new Error("zero declarations " + selector);
    rows.push({ selector, computed: computed.get(property) ?? null, states });
  }
  return { inspectedUrl: target.inspectedURL(), fixture: Boolean(await dom.querySelector(doc.id, "[data-orb-devtools-fixture]")), rows };
})()`;
function devToolsTargets(value: unknown): readonly { readonly id: string; readonly type: string }[] {
  if (!Array.isArray(value)) {
    throw new Error("DevTools /json/list response is not an array");
  }
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`DevTools /json/list row ${String(index)} is not an object`);
    }
    const id = Reflect.get(entry, "id");
    const type = Reflect.get(entry, "type");
    if (typeof id !== "string" || typeof type !== "string") {
      throw new Error(`DevTools /json/list row ${String(index)} has no string id/type`);
    }
    return { id, type };
  });
}

async function exerciseClosure(page: Page, pin: DevToolsAssetPin, frontendOrigin: string, profile: string): Promise<void> {
  await page.setContent(FIXTURE_HTML);
  await page.evaluate(
    `(async()=>{const e=document.querySelector("#transition");getComputedStyle(e).color;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);e.classList.add("on")})()`,
  );
  const identity = await targetId(page);
  if (
    identity.revision !== `@${pin.chromiumRevision}` ||
    identity.protocolVersion !== pin.protocolVersion ||
    !identity.product.endsWith(`/${pin.browserVersion}`)
  ) {
    throw new Error(`installed browser tuple drifted: ${JSON.stringify(identity)}`);
  }
  const port = await debugPort(profile);
  const targets = devToolsTargets(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json());
  if (!targets.some((candidate) => candidate.id === identity.id && candidate.type === "page")) {
    throw new Error("captured product target absent from /json/list");
  }
  const frontend = await page.context().newPage();
  try {
    await frontend.goto(`${frontendOrigin}/serve_rev/@${pin.devtoolsFrontendRevision}/inspector.html?ws=127.0.0.1:${port}/devtools/page/${identity.id}`, {
      waitUntil: "domcontentloaded",
      timeout: FRONTEND_NAV_TIMEOUT_MS,
    });
    await frontend.waitForTimeout(FRONTEND_ATTACH_MS);
    // #1004 — this object IS the attach proof for the whole materialisation; a malformed one used to
    // satisfy the three checks below by way of undefined comparisons.
    const proof = devToolsDiscoveryProof(await frontend.evaluate(DISCOVERY_BRIDGE));
    if (proof.inspectedUrl !== "about:blank" || !proof.fixture || proof.rows.length !== PLANTED_CASES) {
      throw new Error("DevTools SDK attached to the wrong target or returned an empty matrix");
    }
    await frontend.waitForTimeout(CLOSURE_SETTLE_MS);
  } finally {
    await frontend.close();
  }
}

function familyFor(relativePath: string): string {
  const match = DEVTOOLS_LICENSE_SOURCES.find((source) => source.assetPrefix !== "" && relativePath.startsWith(source.assetPrefix));
  return match?.family ?? "devtools-frontend";
}
async function fetchNotice(revision: string, path: string): Promise<Buffer> {
  const response = await fetch(`${GITILES}/+/${revision}/${path}?format=TEXT`, { redirect: "manual", signal: AbortSignal.timeout(RESOURCE_FETCH_TIMEOUT_MS) });
  if (response.status !== HTTP_OK || response.headers.has("location")) {
    throw new Error(`license fetch failed: ${path} (${response.status})`);
  }
  return Buffer.from(await response.text(), "base64");
}

async function writeClosure(staging: string, pin: DevToolsAssetPin, cache: Map<string, Promise<CachedAsset>>): Promise<DevToolsAssetPin> {
  const prefix = `/serve_rev/@${pin.devtoolsFrontendRevision}/`;
  const entries: DevToolsAssetEntry[] = [];
  for (const [url, pending] of [...cache.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const asset = await pending;
    const relative = url.slice(prefix.length);
    const file = `assets${url}`;
    await mkdir(dirname(join(staging, file)), { recursive: true });
    await writeFile(join(staging, file), asset.body);
    entries.push({ url, file, bytes: asset.body.byteLength, sha256: sha256(asset.body), mimeType: asset.mimeType, licenseFamily: familyFor(relative) });
  }
  const decodedBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const manifest: DevToolsAssetManifest = { schemaVersion: 1, resources: entries };
  const manifestText = canonical(manifest);
  await writeFile(join(staging, "manifest.json"), manifestText);

  const families: DevToolsLicenseFamily[] = [];
  for (const source of DEVTOOLS_LICENSE_SOURCES) {
    const notices: DevToolsLicenseFile[] = [];
    for (const sourcePath of source.paths) {
      const body = await fetchNotice(pin.devtoolsFrontendRevision, sourcePath);
      const file = `licenses/${source.family}/${basename(sourcePath)}`;
      await mkdir(dirname(join(staging, file)), { recursive: true });
      await writeFile(join(staging, file), body);
      notices.push({ file, source: `${GITILES}/+/${pin.devtoolsFrontendRevision}/${sourcePath}`, bytes: body.byteLength, sha256: sha256(body) });
    }
    families.push({ family: source.family, assetPrefix: source.assetPrefix, notices });
  }
  const licenses: DevToolsLicenseManifest = { schemaVersion: 1, families };
  await writeFile(join(staging, "licenses.json"), canonical(licenses));
  const nextPin: DevToolsAssetPin = { ...pin, resourceCount: entries.length, decodedBytes, manifestSha256: sha256(manifestText) };
  if (!SHA256_RE.test(nextPin.manifestSha256)) {
    throw new Error("manifest checksum generation failed");
  }
  await writeFile(join(staging, "pin.json"), canonical(nextPin));
  return nextPin;
}

async function installStaging(staging: string, temp: string): Promise<void> {
  const backup = join(temp, "previous");
  if (existsSync(ROOT)) {
    await rename(ROOT, backup);
  }
  try {
    await rename(staging, ROOT);
  } catch (error) {
    if (existsSync(backup)) {
      await rename(backup, ROOT);
    }
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

export async function materializeDevToolsAssets(): Promise<number> {
  const pin = await readPin();
  const temp = await mkdtemp(join(tmpdir(), "orb-devtools-assets-"));
  const profile = join(temp, "profile");
  const staging = join(temp, "generated");
  await mkdir(profile);
  await mkdir(staging);
  const cache = new Map<string, Promise<CachedAsset>>();
  const failures: string[] = [];
  const server = await startDiscoveryProxy(pin.devtoolsFrontendRevision, cache, failures);
  const origin = `http://127.0.0.1:${serverPort(server)}`;
  try {
    const session = await launchProbeSession({
      headless: true,
      viewport: { width: 1280, height: 720 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [],
      persistentProfileDir: profile,
      browserArgs: ["--remote-debugging-port=0", `--remote-allow-origins=${origin}`],
    });
    await withProbeSession(session, async ({ page }) => exerciseClosure(page, pin, origin, profile));
    stdout.write(`PROGRESS snap-devtools-assets runtime-resources=${cache.size}\n`);
    if (failures.length > 0) {
      throw new Error(`asset discovery failures: ${failures.join("; ")}`);
    }
    await closeLiteralModuleAssets(pin.devtoolsFrontendRevision, cache);
    const nextPin = await writeClosure(staging, pin, cache);
    await installStaging(staging, temp);
    stdout.write(
      `RESULT snap-devtools-assets resources=${nextPin.resourceCount} decoded-bytes=${nextPin.decodedBytes} manifest-sha256=${nextPin.manifestSha256}\n`,
    );
    return 0;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    await rm(temp, { recursive: true, force: true });
  }
}
