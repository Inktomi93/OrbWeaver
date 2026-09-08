// Home the bug-report browser/POST adapter with the app-shell affordance that owns it. The DOM-free bundle
// builder stays in client/lib; only the app-shell button consumes the capture adapter, so the adapter remains
// a private feature leaf instead of becoming another public barrel surface.
//
// Preview:  pnpm codemod:run scripts/codemods/type-worlds-bug-report-capture.ts
// Apply:    pnpm codemod:run scripts/codemods/type-worlds-bug-report-capture.ts --apply

import { join } from "node:path";
import process from "node:process";
import { assert, findImporters, moveFiles, repoRelative, routeSymbolsByMap, runCodemod } from "@orb/tooling/codemod";

const SOURCE = "packages/client/src/lib/bug-report-capture.ts";
const DESTINATION = "packages/client/src/features/app-shell/lib/bug-report-capture.ts";
const LIB_INDEX = "packages/client/src/lib/index.ts";
const BUTTON = "packages/client/src/features/app-shell/components/bug-report-button.tsx";
const AGENT_BRIDGE = "packages/client/src/lib/agent-bridge.ts";
const CAPTURE_SYMBOLS = new Set(["captureBugReportBundle", "submitBugReport"]);

const LIB_EXPORT_BLOCK = `// The dev bug-report capture (#1095). The BUNDLE builder and the CONSOLE-ERROR RING are deliberately NOT
// re-exported here — they are dev-instrument internals the bridge installs (the \`motion-flaggers.ts\` rule);
// what a feature needs is exactly the capture + the submit.
export type { BugReportSubmission } from "./bug-report-capture.ts";
export { captureBugReportBundle, submitBugReport } from "./bug-report-capture.ts";
`;

const OLD_AGENT_BRIDGE_COMMENT = "that never pulls this file (the tests-dom closure reached `bug-report-capture.ts` through the lib barrel)";
const NEW_AGENT_BRIDGE_COMMENT = "that never pulls this file (the tests-dom closure reaches it through app-shell's bug-report capture)";

await runCodemod(
  "type-worlds-bug-report-capture",
  (ctx) => {
    const libIndex = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, LIB_INDEX));
    const agentBridge = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, AGENT_BRIDGE));
    const exportText = libIndex.getFullText();
    const exportStart = exportText.indexOf(LIB_EXPORT_BLOCK);
    assert(
      exportStart >= 0 && exportStart === exportText.lastIndexOf(LIB_EXPORT_BLOCK),
      "The reviewed bug-report lib export block no longer exists exactly once.",
    );

    const bridgeText = agentBridge.getFullText();
    const bridgeCommentStart = bridgeText.indexOf(OLD_AGENT_BRIDGE_COMMENT);
    assert(
      bridgeCommentStart >= 0 && bridgeCommentStart === bridgeText.lastIndexOf(OLD_AGENT_BRIDGE_COMMENT),
      "The reviewed agent-bridge type-world comment no longer exists exactly once.",
    );

    const consumers = ["#lib", "@orb/client/lib"].flatMap((moduleSpecifier) =>
      findImporters(ctx.project, moduleSpecifier).filter((declaration) =>
        declaration.getNamedImports().some((specifier) => CAPTURE_SYMBOLS.has(specifier.getName())),
      ),
    );
    const consumer = consumers[0];
    assert(
      consumers.length === 1 &&
        consumer !== undefined &&
        consumer.getModuleSpecifierValue() === "#lib" &&
        repoRelative(consumer.getSourceFile().getFilePath(), ctx.repoRoot) === BUTTON,
      `Expected ${BUTTON} to be the only capture consumer; found ${consumers.map((declaration) => repoRelative(declaration.getSourceFile().getFilePath(), ctx.repoRoot)).join(", ") || "none"}.`,
    );

    ctx.plan({
      description: "Remove the capture from the generic lib surface and repair its type-world comment",
      touchedFiles: [libIndex.getFilePath(), agentBridge.getFilePath()],
      transform() {
        libIndex.replaceText([exportStart, exportStart + LIB_EXPORT_BLOCK.length], "");
        agentBridge.replaceText([bridgeCommentStart, bridgeCommentStart + OLD_AGENT_BRIDGE_COMMENT.length], NEW_AGENT_BRIDGE_COMMENT);
      },
    });
    ctx.plan(
      routeSymbolsByMap(ctx, "#lib", {
        captureBugReportBundle: "../lib/bug-report-capture.ts",
        submitBugReport: "../lib/bug-report-capture.ts",
      }),
    );
    ctx.plan(moveFiles(ctx, [[SOURCE, DESTINATION]]));
  },
  { argv: process.argv.slice(2), maxOutputLines: 300 },
);
