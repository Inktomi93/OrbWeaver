// Live browser owner for #953's literal row receipts: reach the named surface, take checkpoint-scoped
// subject/pixel/cascade/merge evidence, then hand the complete receipt to the pure strict reconciler.

import { navResultShape } from "@orb/tooling/_shared/page-validate";
import type { Page, Route } from "@playwright/test";
import type { RuntimeAppearanceHistoricalRow } from "../../_shared/appearance-matrix.ts";
import { appearanceReachReceipt, readRuntimeAppearanceContract } from "../../_shared/appearance-matrix.ts";
import { readAppearancePrepaintEvidence } from "../../_shared/appearance-prepaint.ts";
import type { ProbeSession } from "../../_shared/browser.ts";
import { settle } from "../../_shared/browser.ts";
import { readBrowserEnvironment } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { buildNavScript } from "../../_shared/nav.ts";
import type { AppearanceCascadeExpectation, AppearanceInvariantReceipt, AppearanceMergeExpectation } from "../contract/appearance-invariants.ts";
import type { ContrastEvidence } from "../contract/contrast.ts";
import type { Args } from "../contract/types.ts";
import { HOVER_REVEAL_MS, MOUNT_SETTLE_MS, STEP_SETTLE_MS, STEP_TIMEOUT_MS } from "../lib/budgets.ts";
import type { AppearanceCheckContext, AppearanceMutationIsolationEvidence } from "./appearance-invariant-check-context.ts";
import { buildAppearanceInvariantChecks } from "./appearance-invariant-checks.ts";
import type { AppearanceDomSnapshot } from "./appearance-invariant-dom.ts";
import { probeAppearanceDom } from "./appearance-invariant-dom.ts";
import { evaluateAppearancePrepaint } from "./appearance-prepaint.ts";
import { capturePageCssEvidence } from "./cascade.ts";
import { captureContrastEvidence } from "./contrast.ts";
import { scanDeadCss } from "./dead-css.ts";
import { animationEvidence as animationEvidenceShape, checkpointReset, resetFailures } from "./page-validate.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

async function resetCheckpoint(page: Page): Promise<void> {
  // #1004 — each read below already had an INSTRUMENT ERROR arm for a FALSE answer and none for a
  // wrong SHAPE, which is the arm that reads as success (a non-boolean is truthy).
  const reset = checkpointReset(
    await page.evaluate(`(() => {
    if (typeof globalThis.__orb?.resetEvidence !== "function") return false;
    globalThis.__orb.resetEvidence();
    return true;
  })()`),
  );
  if (!reset) {
    instrumentError("Appearance row cannot reset checkpoint evidence");
  }
}

async function resetMeasuredEvidence(page: Page): Promise<void> {
  const failures = resetFailures(
    await page.evaluate(`(() => {
    if (typeof globalThis.__orb?.resetRing !== "function") return ["resetRing unavailable"];
    return ["bus-events", "flags", "motion", "renders"]
      .map((name) => globalThis.__orb.resetRing(name))
      .filter((result) => result?.ok !== true)
      .map((result) => String(result?.reason ?? result?.name ?? "unknown reset failure"));
  })()`),
  );
  if (failures.length > 0) {
    instrumentError(`Appearance row cannot reset measured evidence: ${failures.join(", ")}`);
  }
}

async function readMessageCarrierEvidence(page: Page): Promise<NonNullable<AppearanceCheckContext["messageCarrier"]>> {
  const contract = await readRuntimeAppearanceContract(page);
  appearanceReachReceipt(contract);
  const registry = contract.messageRegistry;
  if (registry === undefined) {
    return instrumentError("mobile document row has no live MessageRow registry receipt");
  }
  const chatStyle = contract.rows.find((candidate) => candidate.key === "chatStyle");
  if (chatStyle === undefined || chatStyle.observable?.kind !== "message-prop" || chatStyle.samples === undefined) {
    return instrumentError("mobile document row has no live chatStyle message-prop samples");
  }
  return { registry, chatStyles: chatStyle.samples };
}

async function driveSurface(page: Page, row: RuntimeAppearanceHistoricalRow): Promise<void> {
  let nav: readonly ["goto" | "open-chat", string, string];
  if (row.surface === "chat" || row.id === "light-art-scrim-glass-elevation") {
    nav = ["open-chat", "latest", '[data-slot="message-row"]'];
  } else if (row.surface === "config-sizing") {
    nav = ["goto", "settings:appearance.sizing", '[data-slot="density-preview"]'];
  } else {
    nav = ["goto", "home", ".shell-grid"];
  }
  const [kind, target, waitSelector] = nav;
  const result = navResultShape(await page.evaluate(buildNavScript(kind, target)), `nav ${kind} ${target}`);
  if (!result.ok) {
    instrumentError(`Appearance row ${row.id} navigation refused: ${result.reason ?? "unknown"}`);
  }
  await page.locator(waitSelector).first().waitFor({ state: "attached", timeout: 5000 });
  await settle(page, MOUNT_SETTLE_MS);
  if (row.id === "dark-name-time-short-bubble" || row.id === "hover-pointer") {
    const subjectId = row.id === "dark-name-time-short-bubble" ? "attribution" : "bubble";
    const selector = row.subjects.find((subject) => subject.id === subjectId)?.selector;
    if (selector === undefined) {
      instrumentError(`Appearance row ${row.id} has no ${subjectId} drive subject`);
    }
    // The chat list virtualizes around the latest turn, and a merely-visible header can sit under the
    // shell's fixed chrome. Center the client-declared relational subject so the pixel census judges the
    // row itself rather than classifying a legitimate mounted sample as offscreen/occluded.
    await page
      .locator(selector)
      .filter({ visible: true })
      .first()
      .evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }), { timeout: STEP_TIMEOUT_MS });
    await settle(page, STEP_SETTLE_MS);
  }
  if (row.id === "opposite-os-app-prepaint") {
    const selector = row.subjects.find((subject) => subject.id === "theme-ink")?.selector;
    if (selector === undefined) {
      instrumentError("opposite-os-app-prepaint policy is missing its theme-ink subject");
    }
    await page
      .locator(selector)
      .filter({ visible: true })
      .first()
      .evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }), { timeout: STEP_TIMEOUT_MS });
    await settle(page, STEP_SETTLE_MS);
  }
}

async function openPortalDialog(page: Page, row: RuntimeAppearanceHistoricalRow): Promise<void> {
  // #866 retired the settings overlay. The registered command dialog is the real current popup carrier;
  // R6 closes/reopens it around the real sizing control so popup tokens cannot inherit the draft preview.
  const result = navResultShape(await page.evaluate(buildNavScript("goto", "modal:command")), "nav goto modal:command");
  if (!result.ok) {
    instrumentError(`Appearance row ${row.id} dialog navigation refused: ${result.reason ?? "unknown"}`);
  }
  await page.locator('[data-slot="portal-root"] [data-slot="dialog-popup"]').waitFor({ state: "attached", timeout: 5000 });
  await settle(page, STEP_SETTLE_MS);
}

async function closePortalDialog(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.locator('[data-slot="portal-root"] [data-slot="dialog-popup"]').waitFor({ state: "detached", timeout: 5000 });
  await settle(page, STEP_SETTLE_MS);
}

async function closePortalDialogIfOpen(page: Page): Promise<void> {
  if ((await page.locator('[data-slot="portal-root"] [data-slot="dialog-popup"]').count()) > 0) {
    await closePortalDialog(page);
  }
}

async function revealHoverPointer(page: Page, row: RuntimeAppearanceHistoricalRow, coarse: boolean): Promise<void> {
  const bubbleSelector = row.subjects.find((subject) => subject.id === "bubble")?.selector;
  const actionSelector = row.subjects.find((subject) => subject.id === "action-buttons")?.selector;
  if (bubbleSelector === undefined || actionSelector === undefined) {
    instrumentError("hover-pointer policy is missing its bubble or action-button subject");
  }
  const bubble = page.locator(bubbleSelector).filter({ visible: true }).first();
  if (coarse) {
    await page.locator(actionSelector).filter({ visible: true }).first().focus();
  } else {
    await bubble.hover();
  }
  await settle(page, HOVER_REVEAL_MS);
}

const SETTINGS_SECTION_MUTATION = "**/api/trpc/settings.updateUserSettingsSection*";

interface DensityPersistenceGuard {
  readonly evidence: () => AppearanceMutationIsolationEvidence;
  readonly close: () => Promise<void>;
}

interface SettingsMutationBody {
  readonly 0?: {
    readonly section?: unknown;
    readonly patch?: { readonly density?: unknown };
  };
}

async function installDensityPersistenceGuard(page: Page, expectedDensity: string): Promise<DensityPersistenceGuard> {
  let attempted = 0;
  let exact = 0;
  let fulfilled = 0;
  let continued = 0;
  let section: string | null = null;
  let density: string | null = null;
  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    if (request.method() !== "POST") {
      continued += 1;
      await route.continue();
      return;
    }
    attempted += 1;
    const body = request.postDataJSON() as SettingsMutationBody;
    const input = body[0];
    section = typeof input?.section === "string" ? input.section : null;
    density = typeof input?.patch?.density === "string" ? input.patch.density : null;
    if (section === "appearance" && density === expectedDensity) {
      exact += 1;
    }
    // The R6 subject is a draft preview. Fulfil the real client mutation wire locally so the form's
    // lifecycle completes, but never let the rated audit rewrite even its isolated stage database.
    await route.fulfill({ status: 200, contentType: "application/json", body: '[{"result":{"data":{}}}]' });
    fulfilled += 1;
  };
  await page.route(SETTINGS_SECTION_MUTATION, handler);
  return {
    evidence: () => ({ attempted, exact, fulfilled, continued, section, density }),
    close: async () => await page.unroute(SETTINGS_SECTION_MUTATION, handler),
  };
}

async function driveOppositeDensity(page: Page, before: AppearanceDomSnapshot): Promise<AppearanceMutationIsolationEvidence> {
  const outer = before.subjects.find((subject) => subject.id === "outer-scope")?.facts?.attributes["data-density"];
  if (outer !== "compact" && outer !== "comfortable") {
    instrumentError(`density-preview outer carrier is ${String(outer)}`);
  }
  const label = outer === "compact" ? "Comfortable" : "Compact";
  const guard = await installDensityPersistenceGuard(page, label.toLowerCase());
  try {
    const mutation = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/api/trpc/settings.updateUserSettingsSection"),
      { timeout: STEP_TIMEOUT_MS },
    );
    await page.getByRole("button", { name: label, exact: true }).click();
    await mutation;
    await settle(page, MOUNT_SETTLE_MS);
    return guard.evidence();
  } finally {
    await guard.close();
  }
}

function expectedSource(row: RuntimeAppearanceHistoricalRow, selector: string, property: string): string {
  if (property === "--orb-matrix-fixture-ink") {
    return "owner-custom-css";
  }
  if (property.startsWith("--spacing-")) {
    return "client-global";
  }
  if (row.id === "dark-name-time-short-bubble") {
    return "client-global";
  }
  if (row.id === "light-art-scrim-glass-elevation") {
    return selector.includes("theme-background") ? "inline" : "client-global";
  }
  if (row.id === "hover-pointer") {
    return "client-global";
  }
  if (row.id === "mobile-compact-large-document" && property === "display") {
    return "client-global";
  }
  return "inline";
}

function cascadeExpectations(row: RuntimeAppearanceHistoricalRow, snapshot: AppearanceDomSnapshot): readonly AppearanceCascadeExpectation[] {
  return row.cascade.map((query) => {
    const subject = snapshot.subjects.find((candidate) => candidate.selector === query.selector);
    const expectedValue = subject?.facts?.style[query.property] ?? "";
    if (expectedValue === "" || subject?.matchIndex === null || subject?.matchIndex === undefined) {
      const accounting = subject === undefined ? "missing subject policy" : JSON.stringify(subject.accounting);
      const obstruction = subject?.withheldFacts?.centerHit;
      return instrumentError(
        `Appearance row ${row.id} cannot resolve expected ${query.selector}=${query.property}; ${accounting}; center-hit=${JSON.stringify(obstruction ?? null)}`,
      );
    }
    const source = expectedSource(row, query.selector, query.property);
    if (!query.sources.includes(source)) {
      return instrumentError(`Appearance row ${row.id} source policy excludes ${source} for ${query.selector}=${query.property}`);
    }
    return {
      selector: query.selector,
      property: query.property,
      matchIndex: subject.matchIndex,
      expectedValue,
      expectedSource: source,
      expectedOverloadedSources: query.overloadedSources ?? [],
    };
  });
}

function mergeExpectation(row: RuntimeAppearanceHistoricalRow, snapshot: AppearanceDomSnapshot): AppearanceMergeExpectation {
  if (row.merge.mechanism === "merge-not-applicable") {
    return row.merge;
  }
  const expectedOutput = snapshot.subjects.find((subject) => subject.selector === row.merge.selector)?.facts?.className ?? "";
  if (expectedOutput === "") {
    return instrumentError(`Appearance row ${row.id} cannot resolve configured merge output for ${row.merge.selector}`);
  }
  return { ...row.merge, expectedOutput };
}

function pixelSelectors(row: RuntimeAppearanceHistoricalRow): readonly string[] {
  return row.subjects.filter((subject) => subject.sample === "pixel").map((subject) => subject.selector);
}

async function pixelEvidence(
  page: Page,
  row: RuntimeAppearanceHistoricalRow,
  opts: Args,
): Promise<{
  readonly summary: Readonly<Record<string, { sampled: number; passed: boolean; actual: string }>>;
  readonly evidence: readonly ContrastEvidence[];
}> {
  const selectors = pixelSelectors(row);
  if (selectors.length === 0) {
    return { summary: {}, evidence: [] };
  }
  const results = await captureContrastEvidence(page, selectors, true, opts.device === null ? opts.viewport : (page.viewportSize() ?? opts.viewport));
  const evidence = {
    sampled: results.reduce((sum, result) => sum + result.evidence.sampled, 0),
    passed: results.length === selectors.length && results.every((result) => result.evidence.status === "ok" && result.evidence.passed === true),
    actual: results.map((result) => result.outcome.line).join(" | "),
  };
  const summary = row.id === "opposite-os-app-prepaint" ? { "theme-pixel-identity": evidence } : { "composited-contrast": evidence };
  return { summary, evidence: results.map((result) => result.evidence) };
}

async function animationEvidence(page: Page): Promise<{ readonly total: number; readonly dirty: number; readonly properties: readonly string[] }> {
  const evidence = animationEvidenceShape(
    await page.evaluate(`(() => {
    if (typeof globalThis.__orb?.animations !== "function") return null;
    const rows = globalThis.__orb.animations();
    return { total: rows.length, dirty: rows.filter((row) => !row.compositorClean).length, properties: [...new Set(rows.flatMap((row) => row.properties))] };
  })()`),
  );
  return evidence ?? instrumentError("Appearance row cannot read active-animation evidence");
}

async function prepaintEvidence(page: Page, snapshot: AppearanceDomSnapshot): Promise<{ sampled: number; continuous: boolean; actual: string }> {
  const evidence = await readAppearancePrepaintEvidence(page);
  const hydrated = snapshot.subjects.find((subject) => subject.id === "prepaint-html")?.facts;
  return evaluateAppearancePrepaint(
    evidence,
    hydrated === undefined || hydrated === null
      ? null
      : {
          dataTheme: hydrated.attributes["data-theme"] ?? null,
          fontScale: hydrated.style["--font-scale"] ?? "",
          reducedMotion: hydrated.attributes["data-reduced-motion"] ?? null,
        },
  );
}

async function captureRowSnapshots(
  page: Page,
  row: RuntimeAppearanceHistoricalRow,
  coarsePointer: boolean,
): Promise<{
  readonly before?: AppearanceDomSnapshot;
  readonly current: AppearanceDomSnapshot;
  readonly mutationIsolation?: AppearanceMutationIsolationEvidence;
}> {
  await resetCheckpoint(page);
  await driveSurface(page, row);
  if (row.id !== "opposite-os-app-prepaint") {
    // Navigation is setup, not the invariant's judged interaction. Keep the merge ring produced by the
    // live mount, but zero motion/layout evidence before opening/revealing/toggling the named subject.
    await resetMeasuredEvidence(page);
  }
  if (row.surface === "config-sizing") {
    await openPortalDialog(page, row);
  }
  const needsBefore = row.id === "hover-pointer" || row.id === "density-preview";
  const before = needsBefore ? await probeAppearanceDom(page, row) : undefined;
  if (row.id === "hover-pointer") {
    await revealHoverPointer(page, row, coarsePointer);
  }
  if (row.id === "density-preview") {
    if (before === undefined) {
      instrumentError("density-preview lost its before snapshot");
    }
    await closePortalDialog(page);
    const mutationIsolation = await driveOppositeDensity(page, before);
    await openPortalDialog(page, row);
    const current = await probeAppearanceDom(page, row);
    return { before, current, mutationIsolation };
  }
  const current = await probeAppearanceDom(page, row);
  return before === undefined ? { current } : { before, current };
}

async function captureAppearanceInvariantRow(session: ProbeSession, opts: Args, row: RuntimeAppearanceHistoricalRow): Promise<AppearanceInvariantReceipt> {
  const page = session.page;
  try {
    const snapshots = await captureRowSnapshots(page, row, session.environmentContract.applied.hasTouch);
    const environment = await readBrowserEnvironment(page, session.environmentContract);
    const settings = session.contexts[0]?.settingsEvidence;
    if (settings === undefined) {
      instrumentError(`Appearance row ${row.id} has no settings provenance`);
    }
    const cascade = cascadeExpectations(row, snapshots.current);
    const css = await capturePageCssEvidence(
      session,
      cascade.map(({ selector, property, matchIndex }) => ({ selector, property, matchIndex, page: 0 })),
      0,
      row.merge.mechanism === "merge-required",
    );
    const pixels = await pixelEvidence(page, row, opts);
    const animations = await animationEvidence(page);
    const messageCarrier = row.id === "mobile-compact-large-document" ? await readMessageCarrierEvidence(page) : undefined;
    const prepaint = row.id === "opposite-os-app-prepaint" ? await prepaintEvidence(page, snapshots.current) : undefined;
    const checks = buildAppearanceInvariantChecks(row, {
      ...snapshots,
      environment,
      settings,
      pixel: pixels.summary,
      animations,
      ...(messageCarrier === undefined ? {} : { messageCarrier }),
      ...(snapshots.mutationIsolation === undefined ? {} : { mutationIsolation: snapshots.mutationIsolation }),
      ...(prepaint === undefined ? {} : { prepaint }),
    });
    return {
      rowId: row.id,
      accounting: snapshots.current.accounting,
      subjects: snapshots.current.subjects.map(({ facts: _facts, withheldFacts: _withheldFacts, metrics: _metrics, ...subject }) => subject),
      checks,
      pixels: pixels.evidence,
      cascade,
      merge: mergeExpectation(row, snapshots.current),
      deadCss: await scanDeadCss(page, opts.includeHidden),
      css,
    };
  } finally {
    if (row.surface === "config-sizing") {
      await closePortalDialogIfOpen(page);
    }
  }
}

export async function captureAppearanceInvariantRows(
  session: ProbeSession,
  opts: Args,
  rows: readonly RuntimeAppearanceHistoricalRow[],
): Promise<readonly AppearanceInvariantReceipt[]> {
  const receipts: AppearanceInvariantReceipt[] = [];
  const ordered = [...rows].sort((left, right) => Number(right.id === "opposite-os-app-prepaint") - Number(left.id === "opposite-os-app-prepaint"));
  for (const row of ordered) {
    receipts.push(await captureAppearanceInvariantRow(session, opts, row));
  }
  return receipts;
}
