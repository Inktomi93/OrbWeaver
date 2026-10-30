import type { Locator, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SurfacePass } from "../iso/surface-pass.ts";
import { attachNativeFile } from "../node/native-attachments.ts";
import type { SurfaceAuditRequest } from "../node/surface-audit.ts";
import { accessibilityScan } from "./accessibility-scan.ts";
import { actionGroupGeometry } from "./action-group-geometry.ts";
import { assertSurfaceReady, auditSurface } from "./settle-surface.ts";
import { readSurfaceDesignAudit } from "./surface-design-audit.ts";
import { publishSurfaceInventory } from "./surface-inventory.ts";
import { touchTargetFindings } from "./touch-floor.ts";
import { readWebVitals } from "./web-vitals.ts";

export interface SurfaceActionGroup {
  readonly region: Locator;
  readonly actions: readonly Locator[];
}

/** Collect native evidence only after the checkpoint's declared subject has actually rendered. */
export async function surfaceCheckpoint(
  info: TestInfo,
  request: SurfaceAuditRequest,
  groups: readonly SurfaceActionGroup[] = [],
  pass: SurfacePass = "evidence",
): Promise<void> {
  await test.step(`Checkpoint: ${request.name}`, async (step) => {
    const page = request.scope.page();
    await assertCheckpointReady(info, request);
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
    const axe = await accessibilityScan(page);
    await attachNativeFile(info, step, `${request.name}-axe`, { body: JSON.stringify(axe, null, 2), contentType: "application/json" });
    step.annotations.push({
      type: "axe",
      description: `violations=${String(axe.violations.length)}; incomplete=${String(axe.incomplete.length)}; passes=${String(axe.passes.length)}; inapplicable=${String(axe.inapplicable.length)}; full vendor nodes retained`,
    });
    await attachNativeFile(info, step, `${request.name}-screenshot`, {
      body: await page.screenshot({ fullPage: false, scale: "css" }),
      contentType: "image/png",
    });
    step.annotations.push({
      type: "screenshot",
      description: `Visible viewport at one image pixel per CSS pixel; viewport=${JSON.stringify(page.viewportSize())}. Nested scroll positions are separate checkpoints; offscreen content is not pictured.`,
    });
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
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
    expect.soft(axe.violations.map(({ id, impact, nodes }) => ({ id, impact, affectedNodes: nodes.length }))).toEqual([]);
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
    });
  });
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
