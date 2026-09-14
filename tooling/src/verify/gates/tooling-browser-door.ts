// Policy: tooling-browser-door (docs/architecture/core/Core-Tooling-Law.md §4.4, arms B + H of the retired
// `tooling-shared-plumbing`) — a Playwright browser is reached ONE way each: LAUNCHED by
// `_shared/browser.ts#launchProbeSession` and ATTACHED by `attachProbeSession`, the one door onto a session
// daemon's browser (docs/design/1208-instrument-substrate.md §3.4). A `<engine>.launch(`,
// `<engine>.connect(` or `<engine>.connectOverCDP(` anywhere else under `tooling/src/**` is a second bootstrap
// or a second `ProbeSession` shape. Comment posture: comment-SAFE (node kinds only).
//
// AUTHORITY IS reviewed-grant (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950 group 4): the legacy `HOMES` row for browser.ts is a
// recurring repository PERMISSION — two exact rows now, `(browser.ts, browser-launch)` and
// `(browser.ts, browser-attach)`, because the home performs two licensed acts and a grant licenses one
// identity; the legacy stale sweep is central grant liveness. Both arms share one policy because they share
// one subject (the engine receiver) and one authority; the ATTACH SET is matched as a set, never one method
// name, so a third attach spelling on the same receiver is a loophole only until it joins.
//
// IDENTITY, NOT SPELLING: the legacy compared the receiver's TEXT to `chromium`/`firefox`/`webkit`. The
// receiver is now judged as Playwright's OWN engine export through
// `lib/project-home-origin.ts#readPackageExportOrigin` over the three doors that ship it (`@playwright/test`,
// `playwright`, `playwright-core` — the installed declaration on a real tree, the authored door in a proof
// workspace), so an aliased engine import is caught (mustFlag[4]) and a local object named `chromium` is
// provably different and passes (mustPass[1]); a receiver the readers cannot place is reported fail-closed
// (mustFlag[5]). DECLARED LIMIT, carried from the legacy: puppeteer's `connect` is the Lighthouse engine's
// own page seam and not a Playwright browser type — the arm keys on the engine RECEIVERS (mustPass[0]).
// FAMILY: a SINGLETON under its own id.
//
// `entire-population` because grant liveness is only sound after a complete run; a narrowed request DEFERS
// this policy (pinned in tests/tooling/verify/gates/tooling-plumbing-family.test.ts). POPULATION PORT:
// byte-identical (`@tooling`) — the legacy fenced arm H before `capability()` ever ran, which is what keeps
// test-owned browsers under `tests/**` out of the substrate (§2.1) and out of this population by derivation.
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arms B + H). No
// private marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at conversion.
import { SyntaxKind } from "ts-morph";
import { readMemberReference } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { readPackageExportOrigin } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

/** The doors that ship the engine objects; `@playwright/test` re-exports `playwright`, which re-exports
 *  `playwright-core`, and the canonical declaration lands in whichever the checker reaches. */
const PLAYWRIGHT_DOORS: readonly string[] = ["@playwright/test", "playwright", "playwright-core"];
const ENGINES: ReadonlySet<string> = new Set(["chromium", "firefox", "webkit"]);
const LAUNCH = "launch";
/** Playwright's two attach verbs on a browser type — matched as a SET, so a third spelling is a loophole
 *  only until it joins. */
const ATTACH: ReadonlySet<string> = new Set(["connect", "connectOverCDP"]);
const LAUNCH_OPERATION = "browser-launch";
const ATTACH_OPERATION = "browser-attach";

const MESSAGE =
  "a second Playwright door — a browser is LAUNCHED only by `launchProbeSession` and ATTACHED only by `attachProbeSession` (_shared/browser.ts); a `<engine>.launch(` elsewhere is a second bootstrap that misses the marked args/env and the run-marker, and a `<engine>.connect(`/`connectOverCDP(` elsewhere is a second ProbeSession shape reaching a session daemon's browser around the one door (docs/architecture/core/Core-Tooling-Law.md §4.4; docs/design/1208-instrument-substrate.md §3.4).";
const UNREADABLE =
  "a call spelled like a Playwright browser-type door whose receiver the shared readers cannot place, so whether it launches or attaches a Playwright browser CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).";
const FIX =
  "take the session from `launchProbeSession`/`attachProbeSession`/`withProbeSession` (_shared/browser.ts) instead of reaching a browser type directly; the home itself carries the two exact reviewed grants `(browser.ts, browser-launch)` and `(browser.ts, browser-attach)`.";

export const gate = defineGate({
  id: "tooling-browser-door",
  family: "tooling-browser-door",
  authority: "reviewed-grant",
  severity: "error",
  population: "@tooling",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.CallExpression)) {
              return;
            }
            const callee = node.getExpression();
            const member = readMemberReference(callee);
            if (member.kind === "unresolved") {
              return;
            }
            const method = member.value.name;
            if (method !== LAUNCH && !ATTACH.has(method)) {
              return;
            }
            const { verdict } = readPackageExportOrigin(member.value.receiver, PLAYWRIGHT_DOORS, ENGINES);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node,
              subject: ctx.relativePath(sourceFile),
              operation: method === LAUNCH ? LAUNCH_OPERATION : ATTACH_OPERATION,
              // The callee as written (`chromium.launch`) — the call's own leading slice.
              token: callee.getText(),
              offset: 0,
              ...(verdict === "unreadable" ? { unreadable: true } : {}),
            });
          },
        },
      ],
      evaluate: () => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "tooling/src/snap/ops/capture.ts", operation: "browser-launch" },
      files: { "tooling/src/snap/ops/capture.ts": 'import { chromium } from "@playwright/test";\nexport const b = chromium.launch({ headless: true });\n' },
      expect: { count: 1, token: "chromium.launch", messageIncludes: "Subject: tooling/src/snap/ops/capture.ts, operation: browser-launch" },
      why: "a second Playwright bootstrap outside _shared/browser.ts (arm B). The message names the LAUNCH operation, so this row proves the door resolved and the verb was classified, not fail-closed",
    },
    {
      mode: "types",
      files: {
        "tooling/src/ui-audit/ops/run.ts": 'import { chromium } from "@playwright/test";\nexport const b = chromium.connectOverCDP("http://127.0.0.1:9222");\n',
      },
      expect: { count: 1, token: "chromium.connectOverCDP", messageIncludes: "operation: browser-attach" },
      why: "a second CDP attach outside _shared/browser.ts — a sibling instrument reaching a session daemon's browser around attachProbeSession (arm H; docs/design/1208-instrument-substrate.md §3.4)",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/arms/motion.ts": 'import { chromium } from "@playwright/test";\nexport const b = chromium.connect("ws://127.0.0.1:9222/x");\n',
      },
      expect: { count: 1, token: "chromium.connect", messageIncludes: "operation: browser-attach" },
      why: "Playwright's websocket attach is the SAME door class — the design's refused alternative must not be a loophole (the attach SET, arm H)",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/browser.ts":
          'import { chromium } from "@playwright/test";\nexport const b = chromium.launch({ headless: true });\nexport const a = chromium.connectOverCDP("http://127.0.0.1:9222");\n',
      },
      expect: { count: 2, messageIncludes: "Subject: tooling/src/_shared/browser.ts, operation: browser-launch" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the home reds like any other site — TWO findings, one per licensed act, because a grant licenses one `(subject, operation)` and the home performs two — and is licensed by its two exact grant rows. The module witness uses synthetic authority; the family test proves both actual central rows consume exactly this",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/alias.ts": 'import { firefox as engine } from "playwright";\nexport const b = engine.launch();\n' },
      expect: { count: 1, token: "engine.launch", messageIncludes: "operation: browser-launch" },
      why: "AN IMPORT ALIAS of a second engine through the second door — the receiver resolves to Playwright's `firefox` export whatever it was spelled as, and the door set covers `playwright` itself. The legacy `getText()` receiver comparison passed this launch",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/written.ts":
          'import { chromium } from "@playwright/test";\nlet engine = chromium;\nengine = chromium;\nexport const b = engine.launch();\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944): a WRITTEN receiver binding might still hold the engine, so the readers refuse it as ambiguous and the policy reports under the disjoint UNREADABLE text instead of passing",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/arms/lighthouse.ts":
          'import puppeteer from "puppeteer-core";\nexport const b = puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });\n',
      },
      why: "THE DECLARED LIMIT, carried: puppeteer's `connect` is the Lighthouse engine's own page seam (the #1226 spike measured that snapshot mode needs the puppeteer handle) and is not a Playwright browser type — the receiver resolves to `puppeteer-core`'s door, which is not in the set. The name prefilter admits it (the method IS `connect`), so this row proves the DOOR comparison rather than the prefilter",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/local.ts": "const chromium = { launch: (): number => 0 };\nexport const b = chromium.launch();\n" },
      why: "THE IDENTITY COUNTERFACTUAL: a LOCAL object named `chromium` is provably a different declaration, so its `launch` is not Playwright's. The legacy text comparison red it; the readers refuse it as a proven non-module binding, which is `other`",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/lib/engine.ts": "export const chromium = { connect: (u: string): string => u };\n",
        "tooling/src/snap/ops/door.ts": 'import { chromium } from "../lib/engine.ts";\nexport const b = chromium.connect("ws://x");\n',
      },
      why: "THE DOOR COMPARISON, pinned: an object NAMED `chromium` imported from a project module enters a different door than the Playwright packages. Replacing the package comparison with a bare name match reds this row",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/settle.ts":
          "export async function settle(page: { waitForTimeout: (ms: number) => Promise<void> }): Promise<void> {\n  await page.waitForTimeout(1);\n}\n",
      },
      why: "the prefilter: a member call that is neither `launch` nor an attach verb is never carried to the identity readers — a page method on a parameter (which the readers could not place) stays silent",
    },
  ],
});
