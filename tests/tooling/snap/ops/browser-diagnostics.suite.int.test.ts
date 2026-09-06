// The structured browser-diagnostics substrate, exercised through its real Chromium and Snap/session
// doors. The page plants every source we promise to agents; zero records is never a passing control.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import { createPageCapture, wireProbePage } from "@orb/tooling/_shared/browser-capture";
import type { BrowserDiagnostic, OrbConsoleCompleteness } from "@orb/tooling/_shared/browser-diagnostics";
import { collectOrbConsoleDiagnostics, wirePageDiagnostics } from "@orb/tooling/_shared/browser-diagnostics";
import { BoundedEvidenceRing, browserEvidenceRetentionBatchSchema } from "@orb/tooling/_shared/browser-evidence-ring";
import { resolveProbeMedia } from "@orb/tooling/_shared/browser-media";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { chromium } from "@playwright/test";
import { vi } from "vitest";
import { parseDiagnosticQuery, queryDiagnostics } from "../../../../tooling/src/snap/ops/diagnostics.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

vi.setConfig({ testTimeout: scaledBudget(120_000, 4), hookTimeout: scaledBudget(120_000, 4) });

const DISK_CANARIES = {
  sig: "diagnostic-sig-canary",
  amz: "diagnostic-amz-canary",
  goog: "diagnostic-goog-canary",
  azure: "diagnostic-azure-canary",
  userinfo: "diagnostic-userinfo-canary",
} as const;

interface DiagnosticRunIndex {
  readonly process: { readonly argv: readonly string[] };
  readonly diagnostics: { readonly recordArtifacts: readonly string[] };
}

const FORM_AND_LOG_PLANT = `<!doctype html><html><head><title>diagnostics</title></head><body>
  <form id="testform" method="post">
    <label for="input_1_name">wrong association</label><input type="text" name="input_1_name" id="input_1">
    <input aria-label="one" type="text" id="not_unique_id"><input aria-label="two" type="text" id="not_unique_id">
    <input type="text" id="input_4"><input aria-label="empty autocomplete" type="text" id="input_5" autocomplete>
    <input aria-label="missing identifiers" type="text"><label></label>
  </form>
  <img src="http://127.0.0.1:1/planted-browser-log.png">
  <img src="http://user:${DISK_CANARIES.userinfo}@127.0.0.1:1/signed.png?sig=${DISK_CANARIES.sig}&X-Amz-Signature=${DISK_CANARIES.amz}">
  <iframe src="/csp-issue"></iframe>
  <script>
    const orbConsoleRecords = [{
      source: "console", at: 1700000000000,
      text: "planted orb console sig=${DISK_CANARIES.sig} X-Goog-Signature=${DISK_CANARIES.goog}",
      stack: "at http://user:${DISK_CANARIES.userinfo}@[::1/path?sig=${DISK_CANARIES.sig}",
      route: "/orb?sig=${DISK_CANARIES.sig}"
    }];
    window.__orb = {
      consoleErrors: () => ({ records: [...orbConsoleRecords], dropped: 0, cap: 128 }),
      resetEvidence: () => { orbConsoleRecords.length = 0; }
    };
    console.debug("planted debug"); console.info("planted info");
    console.info("clean Content-Security-Policy default-src self");
    console.warn("planted warning"); console.error("planted error");
    console.error("malformed authority http://user:${DISK_CANARIES.userinfo}@[::1/path?X-Goog-Signature=${DISK_CANARIES.goog}");
    setTimeout(() => { throw new Error("planted uncaught sig=${DISK_CANARIES.azure}"); }, 0);
  </script>
</body></html>`;

test("page wiring shares one CDP session across diagnostics, Network, and CDP-only media emulation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const createSession = context.newCDPSession.bind(context);
    const sessionSpy = vi.spyOn(context, "newCDPSession").mockImplementation(async (target) => await createSession(target));
    const capture = createPageCapture(resolveProbeMedia({ colorScheme: "dark", reducedMotion: true, contrast: "more", reducedTransparency: true }), 0);

    await wireProbePage(page, capture, 0);

    expect(sessionSpy).toHaveBeenCalledTimes(1);
    expect(
      await page.evaluate(`(() => ({
        dark: matchMedia("(prefers-color-scheme: dark)").matches,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        contrast: matchMedia("(prefers-contrast: more)").matches,
        reducedTransparency: matchMedia("(prefers-reduced-transparency: reduce)").matches,
      }))()`),
    ).toEqual({ dark: true, reducedMotion: true, contrast: true, reducedTransparency: true });
  } finally {
    vi.restoreAllMocks();
    await browser.close();
  }
});

test("real Chromium retains console, uncaught, Log, Audits, page identity, filters, and evidence windows", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/csp-issue") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "script-src 'none'" });
      response.end("<!doctype html><script>window.blockedByCsp = true</script>");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(FORM_AND_LOG_PLANT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 640, height: 480 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  try {
    await withProbeSession(session, async () => {
      await session.page.goto(`http://127.0.0.1:${port}/diagnostics.html`);
      await settle(session.page, 250);

      const consoleRecords = session.diagnostics.filter((record) => record.origin === "page-console");
      expect(consoleRecords.map((record) => record.level)).toEqual(expect.arrayContaining(["verbose", "info", "warning", "error"]));
      expect(consoleRecords.find((record) => record.text === "planted warning")?.location?.url).toContain("diagnostics.html");
      expect(session.diagnostics.some((record) => record.origin === "page-error" && record.text.includes("planted uncaught"))).toBe(true);
      expect(session.diagnostics.some((record) => record.origin === "browser-log" && record.text.length > 0)).toBe(true);
      const overlap = session.diagnostics.filter((record) => record.text.includes("Failed to load resource"));
      expect(overlap.length).toBe(2);
      expect(queryDiagnostics(overlap, parseDiagnosticQuery("all").query, 0)).toHaveLength(1);
      expect(overlap).toHaveLength(2);

      const auditIssues = session.diagnostics.filter((record) => record.origin === "audits");
      const liveIssue = auditIssues.find((record) => record.issueCode !== null && record.raw !== null);
      expect(liveIssue, JSON.stringify(session.diagnostics, null, 2)).toBeDefined();
      expect(liveIssue?.details).not.toBeNull();
      expect(liveIssue?.contextIndex).toBe(0);
      expect(liveIssue?.pageIndex).toBe(0);

      session.diagnosticWindow.value = 1;
      await session.page.evaluate("console.warn('current-window-warning')");
      const popupPromise = session.context.waitForEvent("page");
      await session.page.evaluate("window.open('about:blank')");
      const popup = await popupPromise;
      await settle(popup, 50);
      await popup.evaluate("console.error('popup-diagnostic')");
      await settle(popup, 50);

      const parsed = parseDiagnosticQuery("level=warning,source=console-api,text=current-window,page=0,window=current");
      expect(parsed.errors).toEqual([]);
      expect(queryDiagnostics(session.diagnostics, parsed.query, session.diagnosticWindow.value).map((record) => record.text)).toEqual([
        "current-window-warning",
      ]);
      expect(session.diagnostics.some((record) => record.pageIndex === 1 && record.text === "popup-diagnostic")).toBe(true);
      expect(parseDiagnosticQuery("window=banana,unknown=x").errors).toHaveLength(2);
      for (const invalid of ["level=nope", "page=-1", "page=1.5", "text=a,text=b", "text=", "window=-1", "window=1.5", "unknown=x"]) {
        expect(parseDiagnosticQuery(invalid).errors, invalid).not.toEqual([]);
      }
      expect(parseDiagnosticQuery("all")).toEqual({
        query: { level: null, source: null, category: null, text: null, page: null, window: null },
        errors: [],
      });
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});

test("the full orb console ring retains subtypes, windows, reset, and explicit cap loss", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const diagnosticRing = new BoundedEvidenceRing<BrowserDiagnostic>(512);
    const completenessRing = new BoundedEvidenceRing<OrbConsoleCompleteness>(32);
    const ring = diagnosticRing.values();
    const completeness = completenessRing.values();
    const window = { value: 1 };
    await wirePageDiagnostics(page, diagnosticRing, { contextIndex: 2, pageIndex: 3, window });
    await page.setContent(`<html data-app-ready><script>
      (() => {
        const records = []; let dropped = 0; const cap = 128;
        const push = (source, value) => {
          records.push({ source, at: 1700000000000 + records.length, text: String(value?.message || value), stack: value?.stack, route: location.pathname });
          if (records.length > cap) { records.shift(); dropped += 1; }
        };
        const original = console.error.bind(console);
        console.error = (...args) => { push('console', args.join(' ')); original(...args); };
        addEventListener('error', (event) => push('uncaught', event.error || event.message));
        addEventListener('unhandledrejection', (event) => push('rejection', event.reason));
        globalThis.__orb = {
          consoleErrors: () => ({ records: [...records], dropped, cap }),
          resetEvidence: () => { records.length = 0; dropped = 0; }
        };
      })();
    </script></html>`);
    await page.evaluate(`(() => {
      console.error('orb-console-unique');
      setTimeout(() => { throw new Error('orb-uncaught-unique'); }, 0);
      Promise.reject(new Error('orb-rejection-unique'));
    })()`);
    await expect.poll(() => page.evaluate("globalThis.__orb.consoleErrors().records.length")).toBe(3);
    expect(await collectOrbConsoleDiagnostics(page, diagnosticRing, completenessRing, false)).toBeNull();
    expect(ring.filter((record) => record.origin === "orb-console-ring").map((record) => record.category)).toEqual(
      expect.arrayContaining(["console", "uncaught", "rejection"]),
    );
    expect(ring.find((record) => record.text.includes("orb-uncaught-unique"))?.details).toMatchObject({ route: expect.any(String), subtype: "uncaught" });

    await page.evaluate("for (let index = 0; index < 130; index += 1) console.error('orb-overflow-' + index)");
    const gap = await collectOrbConsoleDiagnostics(page, diagnosticRing, completenessRing, false);
    expect(gap).toMatchObject({ kind: "instrument", message: expect.stringContaining("dropped 5 record(s)"), name: null, stack: null });
    expect(ring.some((record) => record.origin === "instrument-limit" && record.source === "orb-console-ring")).toBe(true);
    expect(completeness.at(-1)).toMatchObject({ contextIndex: 2, pageIndex: 3, evidenceWindow: 1, records: 128, dropped: 5, cap: 128, complete: false });

    window.value = 2;
    await page.evaluate("globalThis.__orb.resetEvidence(); console.error('orb-after-reset')");
    expect(await collectOrbConsoleDiagnostics(page, diagnosticRing, completenessRing, false)).toBeNull();
    expect(completeness.at(-1)).toMatchObject({ evidenceWindow: 2, records: 1, dropped: 0, complete: true });
    expect(ring.filter((record) => record.origin === "orb-console-ring" && record.text === "orb-after-reset")).toHaveLength(1);

    await page.evaluate("globalThis.__orb = { consoleErrors: 7 }");
    expect(await collectOrbConsoleDiagnostics(page, diagnosticRing, completenessRing, false)).toMatchObject({
      kind: "instrument",
      message: expect.stringContaining("malformed"),
    });
    await page.evaluate("delete globalThis.__orb");
    expect(await collectOrbConsoleDiagnostics(page, diagnosticRing, completenessRing, false)).toMatchObject({
      kind: "instrument",
      message: expect.stringContaining("missing __orb.consoleErrors"),
    });
    expect(await collectOrbConsoleDiagnostics(page, diagnosticRing, completenessRing, true)).toBeNull();
  } finally {
    await browser.close();
  }
});

// The env key `_shared/browser.ts`'s protocol-level CDP fault injector reads (#1093). Spelled here rather
// than imported so this pin exercises the PROTOCOL the seam publishes, exactly as an operator would —
// mirrors tests/tooling/ui-audit/ops/hover.int.test.ts's identical convention.
const CDP_FAULT_ENV = "ORB_PROBE_TEST_CDP_FAULT";

/** Run `body` with the seam's fault injector armed for `fault`, restoring whatever the env carried
 *  before (never assume it was unset — a sibling arm in the same run may have left it). */
async function withCdpFault<T>(fault: string, body: () => Promise<T>): Promise<T> {
  // biome-ignore lint/style/noProcessEnv: the seam's fault gate IS process.env-shaped (`_shared/browser.ts` reads it fresh per `newContext`) — this is the seam's own knob, not app config; restored below.
  const prior = process.env[CDP_FAULT_ENV];
  // biome-ignore lint/style/noProcessEnv: see above — arming the fault is the mechanism.
  process.env[CDP_FAULT_ENV] = fault;
  try {
    return await body();
  } finally {
    if (prior === undefined) {
      // biome-ignore lint/style/noProcessEnv: see above — the restore half.
      delete process.env[CDP_FAULT_ENV];
    } else {
      // biome-ignore lint/style/noProcessEnv: see above — the restore half.
      process.env[CDP_FAULT_ENV] = prior;
    }
  }
}

test("controlled CDP failures stay loud: Audits degrades explicitly while Log stays live, and Log setup rejects", async () => {
  // ROUTED THROUGH THE SHARED SEAM (#1812): a local `rejectCommand` Proxy re-spelled the exact fault
  // `_shared/browser.ts` already injects at the protocol level. `launchProbeSession` installs that
  // injector on its context (`installCdpFaultInjector`); every `context.newCDPSession(...)` taken AFTER
  // launch returns the same seam-faulted session `ops/hover.ts`'s CLI-level fixtures rely on — so this
  // suite now proves the same seam via its in-process door instead of carrying a second one.
  await withCdpFault("Audits.enable", async () => {
    const session = await launchProbeSession({
      headless: true,
      viewport: { width: 640, height: 480 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [],
    });
    await withProbeSession(session, async () => {
      // REUSE `session.page` rather than opening a fresh one: `launchProbeSession` already auto-wires
      // every NEW page through the context's `page` event (`watchProbeContextPages`), which would spend
      // one of the gated calls on that auto-wire before our own explicit `wirePageDiagnostics` runs.
      // `session.page` was wired inside `buildProbeContext` BEFORE the fault injector installs, so it
      // carries none of that — our explicit call below is the first (and only) gated attempt.
      const diagnosticRing = new BoundedEvidenceRing<BrowserDiagnostic>(128);
      const ring = diagnosticRing.values();
      const window = { value: 0 };
      const auditsCdp = await session.context.newCDPSession(session.page);
      await wirePageDiagnostics(session.page, diagnosticRing, { contextIndex: 0, pageIndex: 0, window }, { cdp: auditsCdp });
      await session.page.setContent('<img src="http://127.0.0.1:1/planted-log.png">');
      await expect.poll(() => ring.some((record) => record.origin === "browser-log")).toBe(true);
      expect(ring.some((record) => record.origin === "instrument-limit" && record.text.includes("Audits.enable"))).toBe(true);
      expect(ring.some((record) => record.origin === "browser-log")).toBe(true);
    });
  });

  await withCdpFault("Log.enable", async () => {
    const session = await launchProbeSession({
      headless: true,
      viewport: { width: 640, height: 480 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [],
    });
    await withProbeSession(session, async () => {
      // Same reuse-`session.page` reasoning as the Audits arm above.
      const failedDiagnosticRing = new BoundedEvidenceRing<BrowserDiagnostic>(128);
      const failedRing = failedDiagnosticRing.values();
      const window = { value: 0 };
      const logCdp = await session.context.newCDPSession(session.page);
      await expect(wirePageDiagnostics(session.page, failedDiagnosticRing, { contextIndex: 0, pageIndex: 1, window }, { cdp: logCdp })).rejects.toThrow(
        `planted CDP fault: Log.enable call #1 refused by ${CDP_FAULT_ENV}`,
      );
      expect(failedRing).toEqual([]);
    });
  });
});

test("Snap JSON and a live session export retain the lossless diagnostics ring", async ({ plantedTree, repoRoot, runCli, scratch }) => {
  const root = await plantedTree({
    "diagnostics.html": FORM_AND_LOG_PLANT,
    "orb-overflow.html": `<!doctype html><html><script>
      const records = Array.from({ length: 128 }, (_, index) => ({ source: "console", at: 1700000000000 + index, text: "overflow-" + index, route: location.pathname }));
      window.__orb = { consoleErrors: () => ({ records, dropped: 2, cap: 128 }), resetEvidence: () => {} };
    </script></html>`,
  });
  const file = join(root, "diagnostics.html");
  const runName = `browser_diagnostics_${process.pid}`;
  const overflowName = `browser_diagnostics_overflow_${process.pid}`;
  const sessionName = `browser-diagnostics-${process.pid}`;
  const sessionHome = join(scratch, "sessions");
  const env = Object.fromEntries([
    ["ORB_SNAP_SESSION_HOME", sessionHome],
    ["ORB_SESSION_CAP", "3"],
    ["ORB_SESSION_TTL_MIN", "1"],
  ]);
  const manifestPath = join(repoRoot, "reports", "snaps", `${runName}.json`);
  const overflowManifestPath = join(repoRoot, "reports", "snaps", `${overflowName}.json`);
  const exportDir = join(repoRoot, "reports", "sessions", sessionName);
  try {
    const oneShot = await runCli(
      "snap",
      ["--file", file, "--out", runName, "--json", "--no-shot", "--no-failure-evidence", "--diagnostics", "text=planted warning"],
      { env, timeoutMs: scaledBudget(60_000, 4) },
    );
    await expect(oneShot).toExitWith(EXIT.violations);
    expect(oneShot.stdout).toContain("diagnostic query  matched=1");
    const manifestText = readFileSync(manifestPath, "utf8");
    for (const canary of Object.values(DISK_CANARIES)) {
      expect(manifestText).not.toContain(canary);
    }
    expect(manifestText).toContain("[REDACTED]");
    const manifest = JSON.parse(manifestText) as { readonly diagnostics?: readonly { readonly raw?: unknown }[] };
    expect(manifest.diagnostics?.length).toBeGreaterThan(0);
    expect(manifest.diagnostics?.some((record) => record.raw !== undefined)).toBe(true);
    const matchingRunIndexes = readdirSync(join(repoRoot, "reports", "runs", "snap")).flatMap((runId) => {
      const indexPath = join(repoRoot, "reports", "runs", "snap", runId, "run.json");
      if (!existsSync(indexPath)) {
        return [];
      }
      const runIndex = JSON.parse(readFileSync(indexPath, "utf8")) as DiagnosticRunIndex;
      return runIndex.process.argv.includes(runName) ? [runIndex] : [];
    });
    expect(matchingRunIndexes).toHaveLength(1);
    for (const runIndex of matchingRunIndexes) {
      expect(runIndex.diagnostics.recordArtifacts).toHaveLength(1);
      const artifactPath = runIndex.diagnostics.recordArtifacts[0] as string;
      expect(artifactPath).not.toContain(runName);
      for (const canary of Object.values(DISK_CANARIES)) {
        expect(artifactPath).not.toContain(canary);
      }
      const artifactText = readFileSync(artifactPath, "utf8");
      for (const canary of Object.values(DISK_CANARIES)) {
        expect(artifactText, artifactPath).not.toContain(canary);
      }
      expect(artifactText).toContain("[REDACTED]");
      expect(artifactText).toContain("clean Content-Security-Policy default-src self");
      expect(artifactText).toContain("planted warning");
    }

    const overflow = await runCli("snap", ["--file", join(root, "orb-overflow.html"), "--out", overflowName, "--json", "--no-shot", "--no-failure-evidence"], {
      env,
      timeoutMs: scaledBudget(60_000, 4),
    });
    await expect(overflow).toExitWith(EXIT.violations);
    expect(overflow.stdout).toContain("dropped 2 record(s) at cap 128");
    const overflowManifest = JSON.parse(readFileSync(overflowManifestPath, "utf8")) as {
      readonly diagnosticCompleteness?: readonly OrbConsoleCompleteness[];
    };
    expect(overflowManifest.diagnosticCompleteness?.at(-1)).toMatchObject({ records: 128, dropped: 2, cap: 128, complete: false });

    const boot = await runCli("snap", ["--session", sessionName, "--file", file, "--no-shot", "--no-failure-evidence"], {
      env,
      timeoutMs: scaledBudget(60_000, 4),
    });
    await expect(boot).toExitWith(EXIT.violations);
    const call = await runCli("snap", ["--session", sessionName, "--eval", "console.warn('session-call-window')", "--no-shot"], {
      env,
      timeoutMs: scaledBudget(60_000, 4),
    });
    await expect(call).toExitWith(EXIT.clean);
    const exported = await runCli("snap", ["--session-export", sessionName], { env, timeoutMs: scaledBudget(60_000, 4) });
    await expect(exported).toExitWith(EXIT.clean);
    const exportIndexPath = /RESULT snap exit=\d+ index=(\S+)/u.exec(exported.stdout)?.[1];
    expect(exportIndexPath).toBeDefined();
    const exportIndex = JSON.parse(readFileSync(exportIndexPath ?? "", "utf8")) as {
      readonly artifacts: ReadonlyArray<{ readonly channel: string; readonly path: string }>;
    };
    const retentionArtifact = exportIndex.artifacts.find((artifact) => artifact.channel === "browser-retention");
    expect(retentionArtifact).toBeDefined();
    const retention = browserEvidenceRetentionBatchSchema.parse(JSON.parse(readFileSync(retentionArtifact?.path ?? "", "utf8")));
    expect(retention.rows).toEqual(expect.arrayContaining([expect.objectContaining({ source: "browser-console", complete: true })]));
    const readBack = await runCli("snap", ["--report", exportIndexPath ?? "", "--all"], { env, timeoutMs: scaledBudget(30_000, 4) });
    await expect(readBack).toExitWith(EXIT.clean);
    expect(readBack.stdout).toContain("browser-retention");
    const diagnosticsPath = join(exportDir, "diagnostics.json");
    expect(existsSync(diagnosticsPath)).toBe(true);
    const diagnostics = JSON.parse(readFileSync(diagnosticsPath, "utf8")) as readonly { readonly text: string; readonly evidenceWindow: number }[];
    expect(diagnostics.some((record) => record.text === "session-call-window" && record.evidenceWindow > 1)).toBe(true);
    expect(diagnostics.some((record) => record.text.startsWith("planted orb console"))).toBe(true);
    const completeness = JSON.parse(readFileSync(join(exportDir, "diagnostic-completeness.json"), "utf8")) as readonly OrbConsoleCompleteness[];
    expect(completeness.some((record) => record.cap === 128 && record.complete)).toBe(true);
    for (const exportedName of ["diagnostics.json", "console.json", "page-errors.json", "requests.json"]) {
      const exportedText = readFileSync(join(exportDir, exportedName), "utf8");
      for (const canary of Object.values(DISK_CANARIES)) {
        expect(exportedText, exportedName).not.toContain(canary);
      }
    }
  } finally {
    await runCli("snap", ["--session-close", sessionName, "--force"], { env, timeoutMs: scaledBudget(30_000, 4) });
    rmSync(manifestPath, { force: true });
    rmSync(overflowManifestPath, { force: true });
    rmSync(exportDir, { recursive: true, force: true });
  }
});
