// Official DevTools SDK cascade runtime. Owns the temporary profile, exact-origin loopback server,
// ephemeral debugging endpoint, target identity, SDK bridge, and teardown. It observes; it never calls
// a CSS mutation API and never evaluates returned CSS text in the product page.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Page } from "@playwright/test";
import type { ProbeMedia } from "./browser-media.ts";
import { applyProbeMedia, readProbeMedia } from "./browser-media.ts";
import { CSS_PSEUDO_TYPE, splitPseudoSelector } from "./css-pseudo-selector.ts";
import { REMOTE_DEBUGGING_PORT_ARG, readDebuggingPort } from "./debugging-endpoint.ts";
import type { DevToolsAssetPin, DevToolsAssetServer } from "./devtools-assets.ts";
import { startDevToolsAssetServer, verifyDevToolsAssets } from "./devtools-assets.ts";
import { budget } from "./load-budget.ts";

// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base. The DevTools
// frontend is a large first-party bundle served off a local revision pin — on a contended box its first
// paint legitimately runs long, and a fixed 30s made that read as a broken pin.
const FRONTEND_NAV_BASE_MS = 30_000;

const PROPERTY_RE = /^(?:--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/u;
const MAX_QUERIES = 32;
const MAX_DECLARATIONS = 256;
const MAX_EVIDENCE_TEXT = 4096;
const MEDIA_RESTORE_ATTEMPTS = 3;
const MEDIA_RESTORE_STABILITY_MS = 250;

export interface DevToolsCascadeInput {
  readonly selector: string;
  readonly property: string;
  readonly matchIndex?: number;
  readonly allowComputedDefault?: boolean;
}

export interface DevToolsCascadeRawDeclaration {
  readonly property: string;
  readonly value: string;
  readonly state: "Active" | "Overloaded";
  readonly important: boolean;
  readonly inherited: boolean;
  readonly styleType: string;
  readonly selector: string | null;
  readonly styleSheetId: string | null;
  readonly sourceUrl: string | null;
  readonly ownerCustomCss: boolean;
  readonly range: { readonly startLine: number; readonly startColumn: number; readonly endLine: number; readonly endColumn: number } | null;
}

export interface DevToolsCascadeRawReceipt {
  readonly selector: string;
  readonly property: string;
  readonly matchIndex: number;
  readonly computedValue: string;
  readonly targetId: string;
  readonly computedDefault: boolean;
  readonly declarations: readonly DevToolsCascadeRawDeclaration[];
}

export interface DevToolsCascadeRuntime {
  readonly profileDir: string;
  readonly browserArgs: readonly string[];
  readonly pin: DevToolsAssetPin;
  readonly query: (page: Page, inputs: readonly DevToolsCascadeInput[]) => Promise<readonly DevToolsCascadeRawReceipt[]>;
  readonly close: () => Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function initializationFailure(failures: readonly unknown[], cause: unknown): AggregateError {
  return new AggregateError(failures, `DevTools cascade runtime failed to initialize: ${message(cause)}`, { cause });
}

function validateInputs(inputs: readonly DevToolsCascadeInput[]): void {
  if (inputs.length === 0 || inputs.length > MAX_QUERIES) {
    throw new Error(`cascade query population must be 1..${MAX_QUERIES}`);
  }
  for (const input of inputs) {
    if (input.selector === "" || input.selector.length > MAX_EVIDENCE_TEXT) {
      throw new Error("cascade selector is empty or over the receipt bound");
    }
    if (!PROPERTY_RE.test(input.property)) {
      throw new Error(`invalid CSS property name: ${input.property}`);
    }
    if (input.matchIndex !== undefined && (!Number.isSafeInteger(input.matchIndex) || input.matchIndex < 0)) {
      throw new Error(`invalid cascade match index: ${String(input.matchIndex)}`);
    }
  }
}

async function targetIdentity(page: Page, pin: DevToolsAssetPin, profileDir: string): Promise<{ readonly id: string; readonly port: number }> {
  const session = await page.context().newCDPSession(page);
  // The port read is ./debugging-endpoint.ts's — the one reader of `DevToolsActivePort` (#1231).
  const [target, version, port] = await Promise.all([session.send("Target.getTargetInfo"), session.send("Browser.getVersion"), readDebuggingPort(profileDir)]);
  if (
    version.revision !== `@${pin.chromiumRevision}` ||
    version.protocolVersion !== pin.protocolVersion ||
    !version.product.endsWith(`/${pin.browserVersion}`)
  ) {
    throw new Error(`browser tuple drift: ${version.product}/${version.revision}/CDP-${version.protocolVersion}`);
  }
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{ id: string; type: string }>;
  if (!targets.some((candidate) => candidate.id === target.targetInfo.targetId && candidate.type === "page")) {
    throw new Error("captured product target is absent from the ephemeral debugging endpoint");
  }
  return { id: target.targetInfo.targetId, port };
}

function mediaFeatures(media: ProbeMedia): readonly { readonly name: string; readonly value: string }[] {
  return [
    ...(media.colorScheme === undefined ? [] : [{ name: "prefers-color-scheme", value: media.colorScheme }]),
    { name: "prefers-reduced-motion", value: media.reducedMotion },
    ...(media.contrast === undefined ? [] : [{ name: "prefers-contrast", value: media.contrast }]),
    { name: "prefers-reduced-transparency", value: media.reducedTransparency ? "reduce" : "no-preference" },
  ];
}

function sameMedia(left: ProbeMedia, right: ProbeMedia): boolean {
  return (
    left.colorScheme === right.colorScheme &&
    left.reducedMotion === right.reducedMotion &&
    left.contrast === right.contrast &&
    left.reducedTransparency === right.reducedTransparency
  );
}

async function restoreMediaAfterObserver(page: Page, expected: ProbeMedia): Promise<void> {
  let actual = await readProbeMedia(page);
  for (let attempt = 0; attempt < MEDIA_RESTORE_ATTEMPTS; attempt += 1) {
    await applyProbeMedia(page, expected);
    // Closing inspector.html resolves before its inspected-target detach finishes. An immediate read is
    // a false green: the delayed detach can clear the slate ~250ms later. Require one full quiet window
    // after each application; a late clear forces another application rather than escaping as PASS.
    await sleep(MEDIA_RESTORE_STABILITY_MS);
    actual = await readProbeMedia(page);
    if (sameMedia(actual, expected)) {
      return;
    }
  }
  throw new Error(`DevTools observer did not restore stable media: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

/** THE SUBJECT MAY BE A PSEUDO CARRIER (#2431). The selector arrives as CSS spells it
 *  (`.shell-panel::before`); the bridge needs the HOST for `dom.querySelectorAll` — which cannot select a
 *  pseudo — plus Chromium's own pseudo-type key to walk from that host node to its generated-box node,
 *  whose matched AND computed styles are the ones a carrier's declarations live on. The full selector
 *  travels too: it is the identity every receipt and every appearance-row join is keyed by. */
function bridgeInput(input: DevToolsCascadeInput): Record<string, unknown> {
  const { host, pseudo } = splitPseudoSelector(input.selector);
  return { ...input, host, pseudoType: pseudo === null ? null : CSS_PSEUDO_TYPE[pseudo] };
}

function bridgeSource(inputs: readonly DevToolsCascadeInput[], inspectedMedia: ProbeMedia): string {
  return `(async () => {
    try {
    const inputs = ${JSON.stringify(inputs.map(bridgeInput))};
    const mediaFeatures = ${JSON.stringify(mediaFeatures(inspectedMedia))};
    const SDK = await import("./core/sdk/sdk.js");
    const Root = await import("./core/root/root.js");
    Object.assign(Root.Runtime.hostConfig, { devToolsAnimationStylesInStylesTab: { enabled: true } });
    if (Root.Runtime.hostConfig.devToolsAnimationStylesInStylesTab?.enabled !== true) throw new Error("animation host-config arm missing");
    let target = SDK.TargetManager.TargetManager.instance().primaryPageTarget();
    for (let attempt = 0; !target && attempt < 100; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
      target = SDK.TargetManager.TargetManager.instance().primaryPageTarget();
    }
    if (!target) throw new Error("DevTools SDK has no primary page target");
    const dom = target.model(SDK.DOMModel.DOMModel); const css = target.model(SDK.CSSModel.CSSModel);
    const emulation = target.model(SDK.EmulationModel.EmulationModel);
    if (!dom || !css || !emulation) throw new Error("DevTools SDK DOM/CSS/Emulation models are unavailable");
    // The frontend attach clears target media before CSSModel observes it. Restore through the SAME
    // official SDK connection so CSSModel receives mediaQueryResultChanged before reading winners.
    await emulation.emulateCSSMedia("", mediaFeatures);
    const documentNode = await dom.requestDocument(); if (!documentNode) throw new Error("DevTools SDK document is unavailable");
    const output = [];
    for (const input of inputs) {
      const nodeIds = await dom.querySelectorAll(documentNode.id, input.host);
      const matchIndex = input.matchIndex ?? 0;
      const hostId = nodeIds[matchIndex];
      if (!hostId) throw new Error("selector match index " + matchIndex + " is outside population " + nodeIds.length + ": " + input.selector);
      // A pseudo subject is READ ON ITS OWN NODE: Chromium pushes a generated box as a child node of its
      // host, and both the matched-style walk and the computed read below take a node id. Asking the HOST
      // for a carrier's declarations is exactly the blindness this arm exists to end (#2431).
      let nodeId = hostId;
      if (input.pseudoType) {
        const hostNode = dom.nodeForId(hostId);
        const pseudoNode = hostNode ? (hostNode.pseudoElements().get(input.pseudoType) || [])[0] : null;
        if (!pseudoNode) throw new Error("pseudo element is not generated on this host: " + input.selector);
        nodeId = pseudoNode.id;
      }
      const matched = await css.getMatchedStyles(nodeId); const computed = await css.getComputedStyle(nodeId);
      if (!matched || !computed) throw new Error("matched/computed styles unavailable: " + input.selector);
      const relevantStyles = matched.nodeStyles();
      if (relevantStyles.length === 0) throw new Error("matched stylesheet population is zero: " + input.selector);
      const sheetTexts = new Map();
      for (const style of relevantStyles) {
        if (style.styleSheetId && !sheetTexts.has(style.styleSheetId)) {
          const text = await css.getStyleSheetText(style.styleSheetId);
          if (typeof text !== "string") throw new Error("stylesheet text unavailable: " + style.styleSheetId);
          sheetTexts.set(style.styleSheetId, text);
        }
      }
      const declarations = [];
      for (const style of relevantStyles) {
        const header = style.styleSheetId ? css.styleSheetHeaderForId(style.styleSheetId) : null;
        const owner = header?.ownerNode ? await header.ownerNode.resolvePromise() : null;
        for (const property of style.allProperties()) {
          if (property.name !== input.property) continue;
          const state = matched.propertyState(property);
          if (state === null) continue;
          if (state !== "Active" && state !== "Overloaded") throw new Error("unknown property state for " + input.property);
          const parentRule = style.parentRule;
          const selector = parentRule && typeof parentRule.selectorText === "function" ? parentRule.selectorText() : null;
          // Vite's injected stylesheet header is blank/document-scoped; its owning node retains the exact source module.
          const sourceUrl = owner?.getAttribute("data-vite-dev-id") || header?.sourceURL || null;
          declarations.push({
            property: property.name, value: property.value, state, important: property.important,
            inherited: matched.isInherited(style), styleType: style.type, selector,
            styleSheetId: style.styleSheetId ?? null, sourceUrl,
            ownerCustomCss: owner?.getAttribute("data-orb-theme-css") !== undefined,
            range: property.range ? property.range.serializeToObject() : null,
          });
        }
      }
      const computedValue = computed.get(input.property);
      if (typeof computedValue !== "string") throw new Error("computed value unavailable: " + input.property);
      if (declarations.length === 0 && input.allowComputedDefault !== true) throw new Error("declaration population is zero: " + input.property);
      if (declarations.length > ${MAX_DECLARATIONS}) throw new Error("declaration receipt overflow: " + declarations.length);
      for (const [sheetId, before] of sheetTexts) {
        const after = await css.getStyleSheetText(sheetId);
        if (after !== before) throw new Error("stylesheet bytes changed during observation: " + sheetId);
      }
      output.push({ selector: input.selector, property: input.property, matchIndex, computedValue, computedDefault: declarations.length === 0, declarations });
    }
    return { inspectedUrl: target.inspectedURL(), output };
    } catch (error) {
      return { bridgeError: error instanceof Error ? error.message : String(error) };
    }
  })()`;
}

function boundedText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_EVIDENCE_TEXT) {
    throw new Error(`${label} is absent or exceeds ${MAX_EVIDENCE_TEXT} characters`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} is not a non-negative integer`);
  }
  return value as number;
}

function parseRange(value: unknown, label: string): DevToolsCascadeRawDeclaration["range"] {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object") {
    throw new Error(`${label} is not an object`);
  }
  const range = value as Record<string, unknown>;
  return {
    startLine: boundedInteger(range["startLine"], `${label}.startLine`),
    startColumn: boundedInteger(range["startColumn"], `${label}.startColumn`),
    endLine: boundedInteger(range["endLine"], `${label}.endLine`),
    endColumn: boundedInteger(range["endColumn"], `${label}.endColumn`),
  };
}

function parseDeclaration(entry: unknown, receiptIndex: number, declarationIndex: number): DevToolsCascadeRawDeclaration {
  const label = `cascade declaration ${receiptIndex}/${declarationIndex}`;
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`${label} is not an object`);
  }
  const declaration = entry as Record<string, unknown>;
  const state = declaration["state"];
  if (state !== "Active" && state !== "Overloaded") {
    throw new Error(`${label} has an unknown state`);
  }
  return {
    property: boundedText(declaration["property"], "declaration property"),
    value: boundedText(declaration["value"], "declaration value"),
    state,
    important: declaration["important"] === true,
    inherited: declaration["inherited"] === true,
    styleType: boundedText(declaration["styleType"], "declaration style type"),
    selector: declaration["selector"] === null ? null : boundedText(declaration["selector"], "declaration selector"),
    styleSheetId: declaration["styleSheetId"] === null ? null : boundedText(declaration["styleSheetId"], "stylesheet id"),
    sourceUrl: declaration["sourceUrl"] === null ? null : boundedText(declaration["sourceUrl"], "stylesheet URL"),
    ownerCustomCss: declaration["ownerCustomCss"] === true,
    range: parseRange(declaration["range"], `${label}.range`),
  };
}

function validateBridgeOutput(value: unknown, inputs: readonly DevToolsCascadeInput[], targetId: string, expectedUrl: string): DevToolsCascadeRawReceipt[] {
  if (typeof value !== "object" || value === null) {
    throw new Error("DevTools SDK bridge returned a non-object");
  }
  const bridge = value as { inspectedUrl?: unknown; output?: unknown; bridgeError?: unknown };
  if (typeof bridge.bridgeError === "string") {
    throw new Error(bridge.bridgeError);
  }
  if (bridge.inspectedUrl !== expectedUrl || !Array.isArray(bridge.output) || bridge.output.length !== inputs.length) {
    throw new Error("DevTools SDK bridge returned the wrong target or query population");
  }
  return bridge.output.map((raw, index): DevToolsCascadeRawReceipt => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`cascade receipt ${index} is not an object`);
    }
    const row = raw as Record<string, unknown>;
    if (!Array.isArray(row["declarations"]) || row["declarations"].length > MAX_DECLARATIONS) {
      throw new Error(`cascade receipt ${index} declaration population is invalid`);
    }
    const declarations = row["declarations"].map((entry, declarationIndex) => parseDeclaration(entry, index, declarationIndex));
    return {
      selector: boundedText(row["selector"], "receipt selector"),
      property: boundedText(row["property"], "receipt property"),
      matchIndex: boundedInteger(row["matchIndex"], "receipt match index"),
      computedValue: boundedText(row["computedValue"], "computed value"),
      targetId,
      computedDefault: row["computedDefault"] === true,
      declarations,
    };
  });
}

interface QueryRuntimeArgs {
  readonly page: Page;
  readonly inputs: readonly DevToolsCascadeInput[];
  readonly pin: DevToolsAssetPin;
  readonly profileDir: string;
  readonly server: DevToolsAssetServer;
}

async function queryRuntime(args: QueryRuntimeArgs): Promise<readonly DevToolsCascadeRawReceipt[]> {
  const { page, inputs, pin, profileDir, server } = args;
  validateInputs(inputs);
  const browser = page.context().browser();
  if (browser === null || !browser.isConnected()) {
    throw new Error("cascade browser is disconnected");
  }
  const identity = await targetIdentity(page, pin, profileDir);
  const inspectedMedia = await readProbeMedia(page);
  const frontend = await page.context().newPage();
  const externalRequests: string[] = [];
  frontend.on("request", (request) => {
    if (!request.url().startsWith(`${server.origin}/`)) {
      externalRequests.push(request.url());
    }
  });
  const [observation] = await Promise.allSettled([
    (async (): Promise<readonly DevToolsCascadeRawReceipt[]> => {
      await frontend.goto(
        `${server.origin}/serve_rev/@${pin.devtoolsFrontendRevision}/inspector.html?ws=127.0.0.1:${identity.port}/devtools/page/${identity.id}`,
        { waitUntil: "domcontentloaded", timeout: budget(FRONTEND_NAV_BASE_MS) },
      );
      // Attaching DevTools clears the inspected target's emulated-media slate before the SDK reads
      // computed style. Restore the exact pre-attach identity *before* observation as well as after
      // detach; otherwise the receipt can describe a different cascade winner than the rated page.
      const output = validateBridgeOutput(await frontend.evaluate(bridgeSource(inputs, inspectedMedia)), inputs, identity.id, page.url());
      if (externalRequests.length > 0 || server.unexpectedRequests.length > 0) {
        throw new Error(`DevTools frontend attempted an external/unexpected request: ${[...externalRequests, ...server.unexpectedRequests].join(", ")}`);
      }
      if (!browser.isConnected()) {
        throw new Error("cascade browser disconnected during observation");
      }
      return output;
    })(),
  ]);
  const [detached] = await Promise.allSettled([frontend.close()]);
  // Loading DevTools' frontend clears Emulation.setEmulatedMedia on the inspected target. Restore the
  // exact live slate after detaching so both successful and failed observations leave the cell intact.
  const [restored] = await Promise.allSettled([restoreMediaAfterObserver(page, inspectedMedia)]);
  const failures = [observation, detached, restored].flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, "cascade observation and cleanup failed");
  }
  if (observation.status === "rejected") {
    throw observation.reason;
  }
  return observation.value;
}

export async function prepareDevToolsCascadeRuntime(assetRoot: string): Promise<DevToolsCascadeRuntime> {
  const tempRoot = await mkdtemp(join(tmpdir(), "orb-devtools-runtime-"));
  const profileDir = join(tempRoot, "profile");
  await mkdir(profileDir);
  let server: DevToolsAssetServer | null = null;
  try {
    const assets = verifyDevToolsAssets(assetRoot);
    server = await startDevToolsAssetServer(assets);
    const ownedServer = server;
    let closed = false;
    return {
      profileDir,
      browserArgs: [REMOTE_DEBUGGING_PORT_ARG, `--remote-allow-origins=${ownedServer.origin}`],
      pin: assets.pin,
      query: async (page, inputs) => queryRuntime({ page, inputs, pin: assets.pin, profileDir, server: ownedServer }),
      close: async (): Promise<void> => {
        if (closed) {
          return;
        }
        closed = true;
        const failures: unknown[] = [];
        // @orb-waive caught-failure-ownership(error): cleanup failures are retained in `failures` and surfaced together as the terminal AggregateError below. Ends if the aggregate throw is removed.
        try {
          await ownedServer.close();
        } catch (error) {
          failures.push(error);
        }
        // @orb-waive caught-failure-ownership(error): cleanup failures are retained in `failures` and surfaced together as the terminal AggregateError below. Ends if the aggregate throw is removed.
        try {
          await rm(tempRoot, { recursive: true, force: true });
        } catch (error) {
          failures.push(error);
        }
        if (failures.length > 0) {
          throw new AggregateError(failures, "DevTools cascade runtime cleanup failed");
        }
      },
    };
  } catch (error) {
    const failures: unknown[] = [error];
    if (server !== null) {
      // @orb-waive caught-failure-ownership(server.close): initialization cleanup joins the original failure in the AggregateError below. Ends if cleanup errors stop being appended or the aggregate throw is removed.
      await server.close().catch((cleanupError: unknown) => failures.push(cleanupError));
    }
    // @orb-waive caught-failure-ownership(rm): initialization cleanup joins the original failure in the AggregateError below. Ends if cleanup errors stop being appended or the aggregate throw is removed.
    await rm(tempRoot, { recursive: true, force: true }).catch((cleanupError: unknown) => failures.push(cleanupError));
    throw initializationFailure(failures, error);
  }
}
