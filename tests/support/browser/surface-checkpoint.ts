import type { RawSamples } from "@orb/tooling/ui-audit";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator, Page, TestInfo, TestStepInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SurfacePass } from "../iso/surface-pass.ts";
import { attachNativeFile } from "../node/native-attachments.ts";
import type { SurfaceAuditRequest } from "../node/surface-audit.ts";
import { accessibilityEvidence } from "./accessibility-scan.ts";
import { actionGroupGeometry } from "./action-group-geometry.ts";
import { enlargedTextGeometry, LEAVING_LAYER } from "./enlarged-text-geometry.ts";
import { readCheckpointStability } from "./layout-stability.ts";
import { assertSurfaceReady, auditSurface } from "./settle-surface.ts";
import { readSurfaceCohortRenders, readSurfaceDesignAudit } from "./surface-design-audit.ts";
import { publishSurfaceInventory } from "./surface-inventory.ts";
import { touchTargetFindings } from "./touch-floor.ts";
import { readWebVitals } from "./web-vitals.ts";

export interface SurfaceActionGroup {
  readonly region: Locator;
  readonly actions: readonly Locator[];
}

/** An enlarged-text profile: the root font size its document must resolve before its geometry is judged. */
interface SurfaceTextGeometry {
  readonly expectedRootFontPx: number;
}

export interface SurfaceCheckpointPosture {
  readonly pass: SurfacePass;
  /** Sample the witnesses across the post-ready settle window; only the layout-stability matrix pays its cost. */
  readonly layoutStability: boolean;
  /** Judge enlarged-text geometry in either pass; null outside an enlarged-text profile. */
  readonly textGeometry: SurfaceTextGeometry | null;
}

/** Collect native evidence only after the checkpoint's declared subject has actually rendered. */
export async function surfaceCheckpoint(
  info: TestInfo,
  request: SurfaceAuditRequest,
  groups: readonly SurfaceActionGroup[] = [],
  { pass, layoutStability, textGeometry }: SurfaceCheckpointPosture = { pass: "evidence", layoutStability: false, textGeometry: null },
): Promise<void> {
  await test.step(`Checkpoint: ${request.name}`, async (step) => {
    const page = request.scope.page();
    await assertCheckpointReady(info, request);
    await profileMeasures(info, step, request, { layoutStability, textGeometry });
    const vitals = await readWebVitals(page, pass === "evidence");
    await attachNativeFile(info, step, `${request.name}-web-vitals`, { body: JSON.stringify(vitals, null, 2), contentType: "application/json" });
    step.annotations.push({
      type: "web-vitals",
      description: `document timeOrigin=${String(vitals.timeOrigin)}; capturedAt=${String(vitals.capturedAt)}; ${vitals.finalization}; prior audit overhead=${String(vitals.includesPriorAuditOverhead)}; ${vitals.metrics.map(({ name, status, metric }) => `${name}: ${status}${metric === undefined ? "" : ` value=${String(metric.value)} rating=${metric.rating}`}`).join("; ")}`,
    });
    await publishSurfaceInventory(info, {
      name: `Checkpoint: ${request.name}`,
      expected: [{ id: request.name, kind: "checkpoint" }],
      observations: [
        {
          id: request.name,
          kind: "checkpoint",
          disposition: "observed",
          reason: `The declared ${request.state} subject witnesses rendered; this is not operation completion`,
        },
      ],
    });
    if (pass === "measurement") {
      return;
    }
    const audit = await auditSurface(request);
    const geometry = await Promise.all(groups.map(({ region, actions }) => actionGroupGeometry(region, actions)));
    const { raw: axe, results, reclassified } = await accessibilityEvidence(page);
    await attachNativeFile(info, step, `${request.name}-axe`, { body: JSON.stringify(axe, null, 2), contentType: "application/json" });
    await attachNativeFile(info, step, `${request.name}-axe-reclassified`, { body: JSON.stringify(reclassified, null, 2), contentType: "application/json" });
    step.annotations.push({
      type: "axe",
      description: `violations=${String(axe.violations.length)}; incomplete=${String(axe.incomplete.length)}; passes=${String(axe.passes.length)}; inapplicable=${String(axe.inapplicable.length)}; full vendor result unchanged; judged apart: ${String(reclassified.length)} node(s) in ${request.name}-axe-reclassified`,
    });
    await attachNativeFile(info, step, `${request.name}-screenshot`, {
      body: await page.screenshot({ fullPage: false, scale: "css" }),
      contentType: "image/png",
    });
    step.annotations.push({
      type: "screenshot",
      description: `Visible viewport at one image pixel per CSS pixel; viewport=${JSON.stringify(page.viewportSize())}. Nested scroll positions are separate checkpoints; offscreen content is not pictured.`,
    });
    const coarse = await page.evaluate((pointerCoarse) => matchMedia(pointerCoarse).matches, MEDIA_QUERIES["pointer-coarse"]);
    const touch = coarse
      ? { status: "measured" as const, findings: await touchTargetFindings(page) }
      : { status: "unmeasured" as const, reason: "fine pointer project" };
    await attachNativeFile(info, step, `${request.name}-surface`, {
      body: JSON.stringify(
        {
          state: request.state,
          errorSource: request.errorSource,
          audit,
          geometry:
            groups.length === 0 ? { status: "unmeasured", reason: "No action group declared for this checkpoint" } : { status: "measured", groups: geometry },
          touch,
          appShiftEvidence: { status: "unavailable", reason: "The production client does not install the development motion bridge; vendor CLS is separate" },
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    const { scanDeadCss } = await import("@orb/tooling/snap");
    const deadCss = await scanDeadCss(page, false);
    await attachNativeFile(info, step, `${request.name}-dead-css`, { body: JSON.stringify(deadCss, null, 2), contentType: "application/json" });
    step.annotations.push({
      type: "css-token-hygiene",
      description: `Current rendered class tokens only; dead=${String(deadCss.dead.length)}; empty-used=${String(deadCss.empty.length)}; readable sheets=${String(deadCss.readableSheets)}/${String(deadCss.sheets)}; unreadable=${String(deadCss.unreadable.length)}. This is not selector matching, cascade correctness, or whole-application unused CSS.`,
    });
    expect.soft(deadCss.dead, `${request.name}: rendered class tokens absent from readable CSSOM`).toEqual([]);
    expect.soft(deadCss.empty, `${request.name}: used class selectors with no surviving declarations`).toEqual([]);
    expect.soft(deadCss.unreadable, `${request.name}: incomplete CSSOM coverage; unreadable stylesheets are not a clean result`).toEqual([]);
    // The gate reads what is not judged apart; the attachment above keeps every vendor violation.
    expect.soft(results.violations.map(({ id, impact, nodes }) => ({ id, impact, affectedNodes: nodes.length }))).toEqual([]);
    for (const [check, findings] of Object.entries(audit)) {
      expect.soft(findings.length, `${request.name}: ${check}; inspect the local surface attachment`).toBe(0);
    }
    for (const group of geometry) {
      expect.soft(group.inlineOverflow, `${request.name}: action group containment <=1px; actual ${JSON.stringify(group)}`).toBeLessThanOrEqual(1);
    }
    expect
      .soft(touch, `${request.name}: explicit touch applicability and findings`)
      .toEqual(coarse ? { status: "measured", findings: [] } : { status: "unmeasured", reason: "fine pointer project" });
    await test.step(`Design consistency: ${request.name}`, async (designStep) => {
      const design = await readSurfaceDesignAudit(page);
      await attachNativeFile(info, designStep, `${request.name}-design-audit`, {
        body: JSON.stringify(design, null, 2),
        contentType: "application/json",
      });
      designStep.annotations.push({
        type: "design-audit",
        description: `Existing static engine with native pixel-backdrop resolution; findings=${String(design.audit.findings.length)}; incomplete=${String(design.gaps.length)}; pixel-sampled=${String(design.pixels.sampled)}; pixel-refusals=${String(design.pixels.refusals.length)}. Token/tier conformance and authored-cohort geometry are automated consistency evidence, not a complete aesthetic review. Forced hover is not run.`,
      });
      expect.soft(design.gaps.length, design.gaps.map(({ evidence, detail }) => `${evidence}: ${detail}`).join("\n")).toBe(0);
      for (const rule of new Set(design.audit.findings.map((finding) => finding.rule))) {
        const findings = design.audit.findings.filter((finding) => finding.rule === rule);
        await test.step(
          `Design ${rule}`,
          () => {
            expect
              .soft(
                findings.length,
                `${request.name}: ${rule} at ${findings.map(({ selector }) => selector).join("; ")}; original subject selectors and measured values remain in the design-audit attachment and native step parameters`,
              )
              .toBe(0);
          },
          { params: { findings } },
        );
      }
      await cohortRenders(info, designStep, { name: request.name, page, samples: design.samples });
    });
  });
}

// The measures only a profile's own projects pay for, in either pass.
async function profileMeasures(
  info: TestInfo,
  step: TestStepInfo,
  request: SurfaceAuditRequest,
  { layoutStability, textGeometry }: Pick<SurfaceCheckpointPosture, "layoutStability" | "textGeometry">,
): Promise<void> {
  if (layoutStability) {
    await checkpointStability(info, step, request);
  }
  if (textGeometry !== null) {
    await checkpointTextGeometry(info, step, request, textGeometry);
  }
}

async function checkpointTextGeometry(
  info: TestInfo,
  step: TestStepInfo,
  request: SurfaceAuditRequest,
  { expectedRootFontPx }: SurfaceTextGeometry,
): Promise<void> {
  const page = request.scope.page();
  const rootFontPx = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  // A profile the document did not take measures default text; that is no enlarged-text verdict at all.
  expect(rootFontPx, `${request.name}: the enlarged-text profile must reach the checkpoint's document`).toBe(expectedRootFontPx);
  const shellRegime = await page.evaluate((desktop) => (matchMedia(desktop).matches ? "desktop" : "mobile"), MEDIA_QUERIES["shell-desktop"]);
  // While a content swap's view transition is active the document root takes every hit test in the captured pane, so a
  // centre probe reads it as the cover. That starts at capture, before the swap's update lets any animation exist, so
  // probe once the transition itself has ended, not its animations.
  const swapRunning = async (): Promise<boolean> => await page.evaluate(() => document.documentElement.matches(":active-view-transition"));
  const swapAtReadiness = await swapRunning();
  await expect.poll(swapRunning, { message: `${request.name}: the content swap's view transition must end before its hit tests are read` }).toBe(false);
  // A disclosure that just opened still grows its clipping panel, so its rows read clipped until the height settles.
  // Judge the resting layout: wait out every finite animation on the scope, inside it or around it. A looping one
  // (a spinner, a skeleton pulse) never ends and moves no box the probes judge.
  const settling = async (): Promise<boolean> =>
    await request.scope.evaluate((subject) =>
      document.getAnimations().some(({ effect, playState }) => {
        const target = effect instanceof KeyframeEffect ? effect.target : null;
        return (
          playState === "running" &&
          target !== null &&
          (subject.contains(target) || target.contains(subject)) &&
          Number.isFinite(effect?.getComputedTiming().endTime ?? Number.POSITIVE_INFINITY)
        );
      }),
    );
  const settlingAtReadiness = await settling();
  await expect.poll(settling, { message: `${request.name}: the scope's finite animations must end before its geometry is read` }).toBe(false);
  // A layer outside the scope that is still leaving, such as a closed dialog's backdrop, is waited out by the probe; record whether one was.
  const leavingAtReadiness = (await page.locator(LEAVING_LAYER).count()) > 0;
  const { findings, declaredOverlays } = await enlargedTextGeometry(request.scope);
  await attachNativeFile(info, step, `${request.name}-text-geometry`, {
    body: JSON.stringify(
      { rootFontPx, shellRegime, swapAtReadiness, settlingAtReadiness, leavingAtReadiness, viewport: page.viewportSize(), findings, declaredOverlays },
      null,
      2,
    ),
    contentType: "application/json",
  });
  step.annotations.push({
    type: "text-geometry",
    description: `Enlarged-text geometry over the checkpoint scope; root font=${String(rootFontPx)}px; shell regime=${shellRegime}; findings=${String(findings.length)}; declared overlays=${String(declaredOverlays.length)}`,
  });
  expect.soft(findings, `${request.name}: enlarged-text geometry findings; inspect the text-geometry attachment`).toEqual([]);
}

// The rendered cohort layer: every member's box and band fingerprints are retained; only a divergent cohort fails.
async function cohortRenders(
  info: TestInfo,
  step: TestStepInfo,
  { name, page, samples }: { readonly name: string; readonly page: Page; readonly samples: RawSamples },
): Promise<void> {
  const renders = await readSurfaceCohortRenders(page, samples);
  await attachNativeFile(info, step, `${name}-cohort-renders`, { body: JSON.stringify(renders, null, 2), contentType: "application/json" });
  const count = (verdict: string): number => renders.cohorts.filter((cohort) => cohort.verdict === verdict).length;
  const members = renders.cohorts.flatMap((cohort) => cohort.members);
  const incomplete = members.filter(({ fingerprint }) => fingerprint.status === "incomplete").length;
  step.annotations.push({
    type: "cohort-renders",
    description: `Census cohorts with member boxes and edge and fill band fingerprints; cohorts=${String(renders.cohorts.length)}; divergent=${String(count("divergent"))}; uniform=${String(count("uniform"))}; no-verdict=${String(count("no-verdict"))}; measured members=${String(members.length - incomplete)}; incomplete members=${String(incomplete)}${renders.error === null ? "" : `; census or screenshot error=${renders.error}`}`,
  });
  for (const cohort of renders.cohorts.filter(({ verdict }) => verdict === "divergent")) {
    const outliers = cohort.comparisons.flatMap((comparison) => comparison.outliers);
    expect
      .soft(outliers, `${name}: cohort ${cohort.cohortKey} under ${cohort.parent} has members that render differently; inspect the cohort-renders attachment`)
      .toEqual([]);
  }
}

async function checkpointStability(info: TestInfo, step: TestStepInfo, request: SurfaceAuditRequest): Promise<void> {
  const stability = await readCheckpointStability(request.witnesses);
  await attachNativeFile(info, step, `${request.name}-layout-stability`, { body: JSON.stringify(stability, null, 2), contentType: "application/json" });
  const native =
    stability.nativeLayoutShift.status === "measured"
      ? `native layout-shift entries=${String(stability.nativeLayoutShift.entries.length)}`
      : `native layout-shift ${stability.nativeLayoutShift.status}`;
  step.annotations.push({
    type: "layout-stability",
    description: `${stability.measure} (not CLS): ${stability.status}; window=${String(stability.windowMs)}ms; frames=${String(stability.frames)}; movements=${String(stability.movements.length)}; unexpected=${String(stability.unexpected)}; ${native}`,
  });
  expect.soft(stability.incomplete, `${request.name}: a witness left the document inside the post-ready settle window`).toBeNull();
  expect
    .soft(
      stability.movements.filter(({ animated }) => !animated),
      `${request.name}: checkpoint witnesses moved after readiness with no running animation; inspect the layout-stability attachment`,
    )
    .toEqual([]);
}

async function assertCheckpointReady(info: TestInfo, request: SurfaceAuditRequest): Promise<void> {
  try {
    await assertSurfaceReady(request);
  } catch (error) {
    try {
      await publishSurfaceInventory(info, {
        name: `Checkpoint: ${request.name}`,
        expected: [{ id: request.name, kind: "checkpoint" }],
        observations: [
          { id: request.name, kind: "checkpoint", disposition: "failed", reason: "The declared subject readiness witness failed; inspect the native failure" },
        ],
      });
    } catch (artifactError) {
      info.annotations.push({ type: "inventory-unavailable", description: String(artifactError) });
    }
    throw error;
  }
}
