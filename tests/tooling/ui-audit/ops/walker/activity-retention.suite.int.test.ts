import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS } from "../../../../support/ui-audit-relational.ts";

interface ActivityAuditReport {
  readonly findings: readonly { readonly rule: string; readonly selector?: string }[];
  readonly populationAccounting: Readonly<Record<string, { readonly candidates: number; readonly judged: number; readonly emitted: number }>>;
  readonly domPopulation: {
    readonly accounting: {
      readonly walked: number;
      readonly renderedSubjects: number;
      readonly retainedHiddenSubjects: number;
    };
  };
  readonly themeEvidence: {
    readonly rendered: {
      readonly shellScope: { readonly present: boolean };
      readonly subjectPolarities: { readonly light: number; readonly dark: number; readonly mixed: number; readonly unknown: number };
    };
  };
}

function activityDocument(activeBody: string, retainedBody: string): string {
  return `<!doctype html><html data-app-ready="settled" style="color-scheme:dark"><head><meta charset="utf-8"><title>activity retention</title></head>
<body style="margin:0;background:#000;color:#fff;font:16px system-ui"><main>${activeBody}</main>
<section data-testid="retained" style="display:none;color-scheme:light dark">${retainedBody}</section></body></html>`;
}

test("a closed inactive off-canvas pane stays in identity accounting without requesting off-frame paint", async ({ runCli, scratch }) => {
  const document = `<!doctype html><html data-app-ready="settled" style="color-scheme:dark"><head><title>closed pane</title></head>
    <body style="margin:0;overflow:hidden;background:#000;color:#fff;font:16px system-ui"><main><h1>Active surface</h1></main>
    <aside inert aria-hidden="true" style="position:fixed;inset:0 auto 0 0;width:360px;translate:360px;background:#fff">
      <button data-testid="closed-control" style="width:8px;height:8px"></button>
      <span data-testid="closed-paint" style="color:#fff;background:#fff">Map caption</span>
    </aside></body></html>`;
  await writeFile(join(scratch, "closed-pane.html"), document);
  const result = await runCli("snap", ["--file", join(scratch, "closed-pane.html"), "--viewport", "360x640", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as ActivityAuditReport;
  expect(report.domPopulation.accounting).toMatchObject({ walked: 7, renderedSubjects: 4, retainedHiddenSubjects: 3 });
  expect(report.findings.some(({ selector }) => selector?.includes("closed-") ?? false)).toBe(false);
  expect(result.stdout).not.toContain("INSTRUMENT ERROR");
});

test("visible inactive paint and boxless ancestors remain judged", async ({ runCli, scratch }) => {
  const body = `<h1>Active surface</h1>
    <aside inert aria-hidden="true" style="position:fixed;left:350px;top:0;width:360px;height:100px">
      <span data-testid="partial-paint" style="position:fixed;left:10px;top:50px;color:#fff;background:#fff">Partial pane paint</span>
      <div style="position:fixed;left:400px;top:0;width:8px;height:8px"></div>
    </aside>
    <section inert style="position:fixed;left:400px;top:0;width:0;height:0">
      <span data-testid="zero-box-paint" style="position:fixed;left:10px;top:100px;color:#fff;background:#fff">Zero box paint</span>
      <div style="position:fixed;left:400px;top:10px;width:8px;height:8px"></div>
    </section>
    <section aria-hidden="true" style="display:contents">
      <span data-testid="contents-paint" style="position:fixed;left:10px;top:150px;color:#fff;background:#fff">Contents paint</span>
      <div style="position:fixed;left:400px;top:20px;width:8px;height:8px"></div>
    </section>
    <aside inert aria-hidden="true" style="position:fixed;left:400px;top:0;width:360px;height:100px">
      <span data-testid="escaped-paint" style="position:fixed;left:10px;top:200px;color:#fff;background:#fff">Escaped pane paint</span>
    </aside>
    <div aria-hidden="true" style="position:fixed;left:400px;top:30px;width:8px;height:8px"></div>`;
  await writeFile(join(scratch, "pane-controls.html"), activityDocument(body, ""));
  const result = await runCli("snap", ["--file", join(scratch, "pane-controls.html"), "--viewport", "360x640", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as ActivityAuditReport;
  for (const testId of ["partial-paint", "zero-box-paint", "escaped-paint"]) {
    expect(report.findings.some(({ rule, selector }) => rule === "inactive-control-legibility" && (selector?.includes(testId) ?? false))).toBe(true);
  }
  expect(report.findings.some(({ rule, selector }) => rule === "contrast" && (selector?.includes("contents-paint") ?? false))).toBe(true);
  expect(report.domPopulation.accounting).toMatchObject({ walked: 17, renderedSubjects: 13, retainedHiddenSubjects: 4 });
  expect(report.domPopulation.accounting.renderedSubjects + report.domPopulation.accounting.retainedHiddenSubjects).toBe(
    report.domPopulation.accounting.walked,
  );
});

test("active off-frame controls retain the loud viewport measurement refusal", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "active-off-frame.html"),
    activityDocument(
      '<button style="position:fixed;left:400px;top:200px;width:8px;height:8px"></button><div aria-hidden="true" style="position:fixed;left:400px;top:30px;width:8px;height:8px"></div>',
      "",
    ),
  );
  const result = await runCli("snap", ["--file", join(scratch, "active-off-frame.html"), "--viewport", "360x640", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(result.stdout).toContain("the interactive census's viewport reach");
  expect(result.stdout).toContain("1 offered control(s) were found and NONE could be measured");
  await expect(result).toExitWith(2);
});

test("retained Activity-shaped DOM stays in identity accounting but outside the rendered verdict", async ({ runCli, scratch }) => {
  const retained = `<div data-slot="theme-scope" style="--color-background:#fff"></div><main data-testid="hidden-main"><h3>Skipped heading</h3>
    <button data-testid="hidden-control" tabindex="3" style="position:relative;z-index:9999;width:8px;height:8px"></button>
    <p data-testid="hidden-contrast" style="color:#fff;background:#fff">invisible bad contrast</p></main>`;
  const active = `<h1>Active surface</h1><button aria-label="Visible action" style="width:48px;height:48px">Open</button>
    <section inert data-testid="visible-inert"><button data-testid="inert-control" style="width:8px;height:8px"></button>
    <span data-testid="inert-paint" style="color:#fff;background:#fff">Visible inert paint</span></section>`;
  await writeFile(join(scratch, "activity-retained.html"), activityDocument(active, retained));
  const result = await runCli("snap", ["--file", join(scratch, "activity-retained.html"), "--fail-on", "P3", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as ActivityAuditReport;

  expect(report.findings.some(({ selector }) => selector?.includes("retained") ?? false)).toBe(false);
  expect(
    report.findings.filter(({ rule }) => ["contrast", "skipped-heading", "tabindex-positive", "z-index-escalation", "aria-name", "tap-target"].includes(rule)),
  ).toHaveLength(0);
  expect(report.findings.some(({ rule, selector }) => rule === "inactive-control-legibility" && (selector?.includes("inert-paint") ?? false))).toBe(true);
  expect(
    report.findings.some(
      ({ rule, selector }) => ["aria-name", "tap-target", "duplicate-action-door"].includes(rule) && (selector?.includes("inert-control") ?? false),
    ),
  ).toBe(false);
  expect(report.populationAccounting["aria-name"]?.candidates).toBe(1);
  expect(report.populationAccounting["tap-target"]?.candidates).toBe(1);
  expect(report.domPopulation.accounting.renderedSubjects + report.domPopulation.accounting.retainedHiddenSubjects).toBe(
    report.domPopulation.accounting.walked,
  );
  expect(report.domPopulation.accounting.retainedHiddenSubjects).toBeGreaterThan(0);
  const polarities = report.themeEvidence.rendered.subjectPolarities;
  expect(report.themeEvidence.rendered.shellScope.present).toBe(false);
  expect(polarities.light + polarities.dark + polarities.mixed + polarities.unknown).toBe(report.domPopulation.accounting.renderedSubjects);
  expect(polarities.mixed).toBe(0);
  expect(result.stdout).toContain(`dom-rendered=${String(report.domPopulation.accounting.renderedSubjects)}`);
  expect(result.stdout).toContain(`dom-retained-hidden=${String(report.domPopulation.accounting.retainedHiddenSubjects)}`);
});

test("a retained main landmark cannot satisfy the rendered-surface landmark rule", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "hidden-main.html"),
    '<!doctype html><html data-app-ready="settled" style="color-scheme:dark"><head><meta charset="utf-8"><title>hidden main</title></head><body style="margin:0;background:#000;color:#fff;font:16px system-ui"><section role="region" aria-label="Active"><h1>Active surface</h1></section><section style="display:none"><main>retained</main></section></body></html>',
  );
  const auditRun = await runCli("snap", ["--file", join(scratch, "hidden-main.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(auditRun.stdout), "utf8")) as ActivityAuditReport;
  expect(report.findings.some(({ rule }) => rule === "landmark-missing")).toBe(true);
});

test("a visibility-visible descendant is rendered and operable while its non-overridden sibling stays retained", async ({ runCli, scratch }) => {
  const body = `<h1>Active surface</h1><section style="visibility:hidden">
    <button data-testid="restored-control" style="visibility:visible;width:8px;height:8px"></button>
    <button data-testid="still-hidden-control" style="width:8px;height:8px"></button>
    <span data-testid="restored-paint" style="visibility:visible;color:#fff;background:#fff">restored paint</span>
    <span data-testid="still-hidden-paint" style="color:#fff;background:#fff">hidden paint</span>
  </section>`;
  await writeFile(join(scratch, "visibility-override.html"), activityDocument(body, ""));
  const auditRun = await runCli("snap", ["--file", join(scratch, "visibility-override.html"), "--fail-on", "P3", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(auditRun.stdout), "utf8")) as ActivityAuditReport;

  expect(report.populationAccounting["aria-name"]?.candidates).toBe(1);
  expect(report.populationAccounting["tap-target"]?.candidates).toBe(1);
  expect(report.findings.some(({ rule, selector }) => rule === "aria-name" && (selector?.includes("restored-control") ?? false))).toBe(true);
  expect(report.findings.some(({ rule, selector }) => rule === "tap-target" && (selector?.includes("restored-control") ?? false))).toBe(true);
  expect(report.findings.some(({ rule, selector }) => rule === "contrast" && (selector?.includes("restored-paint") ?? false))).toBe(true);
  expect(report.findings.some(({ selector }) => selector?.includes("still-hidden") ?? false)).toBe(false);
  expect(report.domPopulation.accounting.retainedHiddenSubjects).toBeGreaterThan(0);
});
