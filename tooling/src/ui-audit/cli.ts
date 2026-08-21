// design-audit — the deterministic UI defect scan. Argv parse + dispatch ONLY (the five-slot cap):
// the programmatic surface is ./index.ts; `pnpm design-audit --help`-equivalent is the misuse help text.
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
// Exit: 0 clean (no finding at/above --fail-on) · 1 findings or a nav error (an audit that never loaded
// the page has nothing to say) · EXIT.misuse on a bad CLI — a typo'd flag silently scans the wrong
// surface and reports it clean, so it is a hard error, never an ignored line.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import { DESIGN_AUDIT_HELP, parseAuditArgs, runUiAudit } from "./index.ts";

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
  return await runUiAudit(opts);
}

await runTool(main);
