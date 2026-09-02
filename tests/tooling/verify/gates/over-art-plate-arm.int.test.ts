// The PERMANENT PIN for the `over-art-plate-arm` gate (tooling/src/verify/gates/over-art-plate-arm.ts):
// the OVER-ART PLATE LAW had no enforcer at all, and the absence WAS the lying instrument — nine surfaces
// adopted `--color-reading-plate` one at a time and every adoption was found by a post-ship pixel sample on
// one surface (#204 #217 #241 #229 #221 #167 #237 #487 #623). Conformance proves the matcher against
// synthetic mini-projects; THIS proves it against the REAL stylesheets and against planted controls in both
// directions, so the blindness cannot be reintroduced. Every arm is a planted control: the real tree derives
// the exact five-surface population (a count you did not expect is the blind-gate failure mode), the three
// ADOPTED surfaces are silent, a fixed surface with a surviving ledger row REDs, and a tree with zero glass
// rules REFUSES LOUDLY rather than printing a clean zero.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { BASELINE_REL, gate } from "../../../../tooling/src/verify/gates/over-art-plate-arm.ts";
import { judgeStylesheets } from "../../../../tooling/src/verify/lib/over-art-plate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SHEET = "packages/client/src/styles/globals.css";
/** Every ledger row must SAY which it is — the orchestrator's #626 ruling: a reader must never mistake
 *  "the gate flagged it" for "someone measured it". */
const PROVENANCE_RE = /MEASURED failure|STRUCTURAL finding, PENDING MEASUREMENT/u;

/** The population the cb-plate-gate lane measured on 2026-08-24 — restated here rather than imported, so
 *  this file is a SECOND opinion on the ledger instead of a tautology over it. A row leaving this list is a
 *  fix (regenerate the ledger); a row ARRIVING is surface number ten, which is the whole point.
 *
 *  `.shell-main::--color-card` LEFT BY BEING FIXED (a743e4799, #1247's re-pin). It is the case this
 *  comment names: `.shell-main`'s glass carrier took D144's plate arm — its `::before` mixes the tint over
 *  `--color-reading-plate` on the light arm instead of over `transparent` — so #626's MEASURED 3.69:1 row
 *  was deleted from the ledger rather than re-keyed, and the derivation stopped reporting it. Confirmed by
 *  running the gate's OWN lib (`judgeStylesheets`) on the real tree, not by reading the test: live went
 *  five → four with `findings: []`, and the four survivors are byte-identical to the four rows the
 *  committed ledger still carries. `admitted()` and the ledger-row check below both read this list's
 *  length, so they follow. */
const UNPAIRED_AT_MINT: readonly string[] = [
  `${SHEET}::[data-slot="composer"]::--color-sidebar`,
  `${SHEET}::[data-slot="message-bubble"]::--color-ai-bubble`,
  `${SHEET}::[data-slot="message-bubble"]::--color-system-bubble`,
  `${SHEET}::[data-slot="message-bubble"]::--color-user-bubble`,
];

/** The three surfaces that ADOPTED the plate (#237, #623) — they must never appear in the live set. */
const ADOPTED: readonly string[] = [
  `${SHEET}::.shell-panel::--color-sidebar`,
  `${SHEET}::[data-slot="dialog-popup"]::--color-popover`,
  `${SHEET}::[data-slot="alert-dialog-popup"]::--color-popover`,
];

interface Run {
  readonly findings: readonly Finding[];
  readonly declarations: readonly GateScanDeclaration[];
}

/** Drive the gate's OWN `run` over a root — the real descriptor, never a re-implementation. */
function runGate(root: string): Run {
  const project = new Project({ useInMemoryFileSystem: true });
  const findings: Finding[] = [];
  const declarations: GateScanDeclaration[] = [];
  const ctx: GateRunCtx = {
    root,
    project,
    scope: { kind: "project" },
    files: [],
    checker: () => project.getTypeChecker(),
    report: (arg: Node | Finding): void => {
      if ("file" in arg) {
        findings.push(arg);
      }
    },
    scan: (counts) => {
      declarations.push(counts);
    },
  };
  gate.run?.(ctx);
  return { findings, declarations };
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const messages = (run: Run): string => run.findings.map((f) => f.message ?? "").join("\n");
const admitted = (run: Run): number => run.declarations.reduce((sum, d) => sum + (d.admitted ?? 0), 0);

const BASE = (tint: string): string => `color-mix(in oklab, var(${tint}) 70%, transparent)`;
const PLATED = (tint: string): string => `light-dark(\n    color-mix(in oklab, var(${tint}) 70%, var(--color-reading-plate)),\n    ${BASE(tint)}\n  )`;

describe("over-art-plate-arm — the REAL tree derives the exact population, both directions", () => {
  test("the live unpaired set IS the five surfaces the lane measured — no more, no fewer", ({ repoRoot }) => {
    expect([...judgeStylesheets(repoRoot).live.keys()].sort()).toEqual([...UNPAIRED_AT_MINT].sort());
  });

  test("the three ADOPTED surfaces are paired and silent — the positive control for the pairing itself", ({ repoRoot }) => {
    const live = judgeStylesheets(repoRoot).live;
    for (const key of ADOPTED) {
      expect(live.has(key), `${key} adopted the plate (#237/#623) and must not be reported`).toBe(false);
    }
  });

  test("the real tree recognises glass rules and reports its own stylesheet denominator, not a file count", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    expect(judgeStylesheets(repoRoot).glassRules).toBeGreaterThan(0);
    expect(run.declarations[0]?.unit).toBe("stylesheet");
    expect(run.declarations[0]?.scanned).toBeGreaterThan(0);
  });

  test("the committed ratchet admits all five, so the gate lands GREEN on a tree it did not break", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    expect(run.findings).toEqual([]);
    expect(admitted(run)).toBe(UNPAIRED_AT_MINT.length);
  });

  test("every ledger row says whether it was MEASURED or is STRUCTURAL and pending measurement", ({ repoRoot }) => {
    const rows = JSON.parse(readFileSync(join(repoRoot, BASELINE_REL), "utf8")) as Record<string, { why?: string }>;
    expect(Object.keys(rows).sort()).toEqual([...UNPAIRED_AT_MINT].sort());
    for (const [key, row] of Object.entries(rows)) {
      expect(row.why ?? "", `${key} must not read as measured when nobody sampled it`).toMatch(PROVENANCE_RE);
    }
  });
});

describe("over-art-plate-arm — planted controls on a throwaway tree", () => {
  test("an unpaired glass surface with NO ledger REDs, and names the missing plate arm", ({ scratch }) => {
    plant(scratch, SHEET, `html[data-blur-composer] [data-slot="composer"] {\n  background-color: ${BASE("--color-sidebar")};\n}\n`);
    const run = runGate(scratch);
    expect(messages(run)).toContain("gives that pair a `light-dark()` plate arm");
    expect(run.findings[0]?.file).toBe(SHEET);
  });

  test("the SAME surface with its [data-has-bg-image] light-dark() companion is silent — the other direction", ({ scratch }) => {
    plant(
      scratch,
      SHEET,
      `html[data-blur-composer] [data-slot="composer"] {\n  background-color: ${BASE("--color-sidebar")};\n}\n` +
        `html[data-blur-composer] .shell-grid[data-has-bg-image] [data-slot="composer"] {\n  background-color: ${PLATED("--color-sidebar")};\n}\n`,
    );
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("a FIXED surface whose ledger row survives REDs — the ratchet only goes down (§4.8)", ({ scratch }) => {
    const key = `${SHEET}::[data-slot="composer"]::--color-sidebar`;
    plant(
      scratch,
      SHEET,
      `html[data-blur-composer] [data-slot="composer"] {\n  background-color: ${BASE("--color-sidebar")};\n}\n` +
        `html[data-blur-composer] .shell-grid[data-has-bg-image] [data-slot="composer"] {\n  background-color: ${PLATED("--color-sidebar")};\n}\n`,
    );
    plant(scratch, BASELINE_REL, `${JSON.stringify({ [key]: 1 }, null, 2)}\n`);
    expect(messages(runGate(scratch))).toContain("no longer violates");
  });

  test("a ledger row whose whole STYLESHEET is gone REDs too — §4.4's mode (B), the row nobody ever visits", ({ scratch }) => {
    plant(
      scratch,
      SHEET,
      ".plain {\n  color: var(--color-foreground);\n}\nhtml[data-blur-panels] .x {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n",
    );
    plant(scratch, BASELINE_REL, `${JSON.stringify({ "packages/ui/src/styles/deleted.css::.gone::--color-card": 1 }, null, 2)}\n`);
    expect(messages(runGate(scratch))).toContain("no longer violates");
  });

  test("a tree with the anchor but ZERO recognised glass rules REFUSES LOUDLY — it does not print a clean zero", ({ scratch }) => {
    plant(scratch, SHEET, ".plain {\n  color: var(--color-foreground);\n}\n");
    expect(messages(runGate(scratch))).toContain("BLINDNESS TRIPWIRE");
  });

  test("a mix over another TOKEN is a counted skip, never a finding — the conservative fence, stated", ({ scratch }) => {
    plant(
      scratch,
      SHEET,
      "html[data-blur-panels] .shell-panel {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, var(--color-background));\n}\n",
    );
    const run = runGate(scratch);
    expect(run.findings.filter((f) => (f.message ?? "").includes("plate arm"))).toEqual([]);
    expect(run.declarations[0]?.skipped?.["mix-partner-is-another-token"]).toBe(1);
  });
});

// #1171 — THE PERMANENT PIN for the reader that bucketed "no fill" as "an alpha I cannot compute". Two
// different claims wore one label: `background-color: transparent` under a glass gate landed in the
// UNREADABLE arm, which `judgeMarkers` cannot exempt (it only ever saw `plateless` sites), so the marker
// the finding's OWN fix text prescribed REDded a second time as STALE and there was no legal way to be
// green in CSS. Every arm below is a planted control, in both directions.
describe("over-art-plate-arm — alpha 0 is READ, not unreadable (#1171)", () => {
  const noFillSpellings = ["background-color: transparent", "background: none", "background-color: rgba(0, 0, 0, 0)", "background-color: oklch(0.2 0 0 / 0)"];

  test("every spelling of alpha 0 under a glass gate is the SAME finding — the gate is not dodgeable by keyword", ({ scratch }) => {
    for (const declaration of noFillSpellings) {
      plant(scratch, SHEET, `html[data-blur-panels] .shell-panel {\n  ${declaration};\n}\n`);
      expect(messages(runGate(scratch)), `${declaration} paints nothing and must read as such`).toContain("paints NO FILL");
    }
  });

  test("a well-formed marker ABSOLVES a no-fill site — the exact case that had no legal green", ({ scratch }) => {
    plant(
      scratch,
      SHEET,
      "/* @over-art-plate-ok: this pane can never sit over the art. */\nhtml[data-blur-panels] .shell-panel {\n  background-color: transparent;\n}\n",
    );
    const run = runGate(scratch);
    expect(messages(run), "neither the plate finding…").not.toContain("paints NO FILL");
    expect(messages(run), "…nor the STALE arm, which is how it REDded twice").not.toContain("STALE");
  });

  test("a fill PROVED to have moved to the subject's own pseudo carrier leaves as a counted skip, not an exemption", ({ scratch }) => {
    plant(
      scratch,
      SHEET,
      "html[data-blur-panels] .shell-panel {\n  background: none;\n}\n" +
        `html[data-blur-panels] .shell-panel::before {\n  content: "";\n  background-color: ${BASE("--color-sidebar")};\n}\n` +
        `html[data-blur-panels] .shell-grid[data-has-bg-image] .shell-panel::before {\n  background-color: ${PLATED("--color-sidebar")};\n}\n`,
    );
    const run = runGate(scratch);
    expect(run.findings, "#1154's shipped shape must be green with no marker at all").toEqual([]);
    expect(run.declarations[0]?.skipped?.["fill-moved-to-pseudo-carrier"]).toBe(1);
  });

  test("the carrier proof does not widen: a pseudo that carries NO fill leaves the host in the population", ({ scratch }) => {
    plant(
      scratch,
      SHEET,
      'html[data-blur-panels] .shell-panel {\n  background: none;\n}\nhtml[data-blur-panels] .shell-panel::before {\n  content: "";\n  backdrop-filter: blur(8px);\n}\n',
    );
    expect(messages(runGate(scratch)), "a blur carrier is not a FILL carrier — nothing plates the ink").toContain("paints NO FILL");
  });

  test("an UNREADABLE shape stays unreadable, and its marker does NOT absolve it", ({ scratch }) => {
    plant(
      scratch,
      SHEET,
      "/* @over-art-plate-ok: I would like this to go away please. */\nhtml[data-blur-panels] .shell-panel {\n  background-color: oklch(0.2 0 0 / 0.7);\n}\n",
    );
    const run = runGate(scratch);
    expect(messages(run), "a missing MEASUREMENT is not a declarable exemption").toContain("UNREADABLE translucent background");
    expect(messages(run), "…and the marker that cannot apply is itself a finding").toContain("STALE");
  });

  // TWO panes leave by classification now, not one (#1247). The second is `.shell-main`, whose no-fill +
  // `::before` glass pair landed at 3b86ae427 ("…, .shell-main glass carrier", 2026-09-02 10:54) — two
  // hours BEFORE a743e4799, and that commit did not re-pair this pin. Attribution matters here because the
  // rest of this file's re-pin does trace to a743e4799 and this arm does not: proven by restoring
  // globals.css from `a743e4799^` and re-running the gate's own `judgeStylesheets`, which already reported
  // `fill-moved-to-pseudo-carrier: 2`. The rule's own comment in globals.css had ALREADY named both
  // ("this rule and the `.shell-main` pair below") while quoting the stale measurement of 1 beside it — a
  // count nobody re-derived after the surface it counts changed.
  test("the real tree's shell panes leave by CLASSIFICATION — the #1154 and .shell-main carriers, counted", ({ repoRoot }) => {
    const judged = judgeStylesheets(repoRoot);
    expect(
      judged.skipped["fill-moved-to-pseudo-carrier"],
      "`.shell-panel` and `.shell-main` each go `background: none` and hand their fill to their own ::before",
    ).toBe(2);
    expect(judged.findings, "and nothing on the real tree reads as unreadable or dark-arm-moved").toEqual([]);
  });
});
