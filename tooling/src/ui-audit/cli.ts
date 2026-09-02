// design-audit — the deterministic UI defect scan. Argv parse + dispatch ONLY (the five-slot cap):
// the programmatic surface is ./index.ts; `pnpm design-audit --help`-equivalent is the misuse help text.
//
// WHERE it audits: whatever `--base` serves (default the dev stack, which serves MAIN) — or, with
// `--isolated`/`--ref <sha>` (#678), snap's ISOLATED STAGE, so a lane can audit its OWN branch and hand in
// the "design-audit rows clean" receipt with its fix instead of leaving it as a post-merge step (ops/stage.ts).
//
// Loads a route in its own headless Playwright chromium (read-only, never touches app settings), waits
// for `data-app-ready`, optionally drives the argv-ordered reveal queue, then flags high-value
// usability/design/a11y defects. Two rule families, origin-tagged per finding: "orbweaver" (contrast/
// text-over-art, distorted images, tap targets, accessible names/landmarks, tabindex, z-index, nested
// cards, gradient text, animated img-hover) and "impeccable" (adapted from pbakaus/impeccable,
// Apache-2.0 — triage + attribution: ops/walker.ts + lib/collect.ts headers).
//
// EVERY finding carries a LOCATABLE selector (ops/walker.ts's describe machinery): paste it into the
// page and you get exactly its element. Objective + fixture-tested — the walker only gathers raw facts
// in-page; all severity/threshold decisions happen back in Node via lib/collect.ts (unit-tested at
// tests/tooling/ui-audit/index.test.ts). The browser never decides pass/fail.
//
// ZERO HYGIENE (#409): every check family is a fold over a sample list, so an EMPTY walk folds to
// "no findings — clean" — the cleanest report in the product describing a page that rendered nothing.
// A zero node census, or a walk that threw, is EXIT.toolError naming what was absent (lib/evidence.ts),
// and the RESULT line publishes `census=` so a clean verdict always shows its denominator.
//
// …AND A FRACTIONAL ONE IS THE SAME LIE (#808): a run that censused 22 of a surface's 1421 nodes printed
// `census=22 reached=3 findings=2 nav=OK` and read clean, because `data-app-ready` is ONE-SHOT at boot and
// says nothing about a route reached by an --actions click. So the census's own denominator is MEASURED —
// the element population is read around the walk and watched until it holds — and growth past that window
// is EXIT.toolError too. `dom-walk=` / `dom-settled=` ride the RESULT line beside `census=`.
//
// …AND AN ERROR BOUNDARY IS NOT A SURFACE (#1081). `design-audit /__no-such-route__` printed all 48
// POPULATION rows, filed a P2 against the router's not-found boundary and exited 0: the route RESOLVED, so
// `data-app-ready` went up, the census was 11 and one control was reached — every arm above passes on a page
// whose whole message is "there is nothing here". The app therefore DECLARES its two non-surfaces
// (`data-app-failure` on the not-found boundary and the crash fallback, packages/client/src/lib/
// app-failure-surface.tsx) and the audit refuses on sight of one. The same ruling covers the two other
// pre-measurement failures the report used to print tables under: a nav error and a failed reveal action.
//
// Exit: 0 clean (no finding at/above --fail-on) · 1 findings · EXIT.toolError when the run is NOT A VERDICT
// (nothing censused, a nav error, an action that did not land, or a declared failure surface) · EXIT.misuse
// on a bad CLI — a typo'd flag silently scans the wrong surface and reports it clean, so it is a hard error,
// never an ignored line.
import process from "node:process";
import { withInstrumentRun } from "../_shared/artifact-out.ts";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import { configureAuditStage, DESIGN_AUDIT_HELP, parseAuditArgs, runUiAudit, runUiAuditMatrix } from "./index.ts";

async function main(): Promise<number> {
  const opts = parseAuditArgs(process.argv.slice(2));
  if (opts.errors.length > 0) {
    for (const message of opts.errors) {
      print(`ARG ERROR    ${message}`);
    }
    print("");
    print(DESIGN_AUDIT_HELP);
    return EXIT.misuse;
  }
  // The isolated stage (#678) resolves BEFORE the browser: an unresolvable --ref is misuse and a stage that
  // will not boot is an instrument failure — neither may fall through to an audit of the dev stack.
  const stageExit = configureAuditStage(opts);
  if (stageExit !== null) {
    return stageExit;
  }
  // The run's own artifact slot; `reports/design-audit/<name>.json` becomes its published pointer (#1164).
  return await withInstrumentRun("ui-audit", async () => (opts.matrix ? await runUiAuditMatrix(opts) : await runUiAudit(opts)));
}

await runTool(main);
