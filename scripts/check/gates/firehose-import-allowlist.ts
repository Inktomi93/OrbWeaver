// Gate: firehose-import-allowlist (ledger D79 — the ROOM plane's one unclamped source) — the all-chats
// firehose `subscribeAllChatEvents` is importable ONLY by the composition root.
//
// WHY. `subscribeChatEvents` is per-chat and every yield passes the member-scoped `chatEventBounds` probe
// (which carries the caller's `historyFloorSeq`). `subscribeAllChatEvents` has NO chatId and NO caller — it
// fans EVERY room's events, including canon `view` payloads and raw `delta` transcript text, to a process-wide
// listener. That is correct exactly once: a server-side rule engine running under HOST authority
// (`entry/compose/automation-watcher.ts`). It is a leak the moment a per-USER surface tails it, because the
// per-member verdict (`substrate/auth::isBelowHistoryFloor`) is applied at the per-chat SSE seam this stream
// bypasses entirely. The chat-events-bus header already SAYS "authz lives outside this module" — a comment is
// not a guarantee, so this is the guarantee.
//
// WHY A ts-morph GATE AND NOT DEP-CRUISER. The symbol is re-exported through the `transport/trpc` barrel, and
// dep-cruiser reasons about MODULES, not named exports: a `to: chat-events-bus` rule cannot fire because the
// barrel absorbs the resolution. Same reasoning (and same shape) as `no-direct-users-read` /
// `discovery-no-stats-rollups`.
//
// THREE ARMS — the two laundering routes plus a rename tripwire:
//  • a named `import { subscribeAllChatEvents }` outside the allowlist
//  • a `export { subscribeAllChatEvents } from …` RE-EXPORT outside the allowlist (laundering the symbol into
//    a new module so the import lands on an innocuous specifier)
//  • FAIL-LOUD: the symbol is not declared anywhere in the tree → it was renamed past this gate, which would
//    otherwise leave the gate silently green forever
//
// A path allowlist here is the fail-LOUD direction: if the compose root moves, its import becomes RED (it
// does not silently pass), which is the opposite of the path-keyed-gate rot pattern.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const FIREHOSE = "subscribeAllChatEvents";

/** Production code only — the firehose is a runtime egress concern, and a test harness driving it is not a
 *  per-member delivery path. */
const SCANNED = /(?:^|\/)packages\/server\/src\//u;

/** The sanctioned homes: the composition root (the one host-authority consumer), the module that DEFINES the
 *  firehose, and the transport barrel that re-exports it to reach compose. */
const ALLOWED = [
  /(?:^|\/)packages\/server\/src\/entry\/compose\//u, // the ONE consumer: the automation watcher, host authority
  /(?:^|\/)packages\/server\/src\/transport\/trpc\/chat-events-bus\.ts$/u, // the definition
  /(?:^|\/)packages\/server\/src\/transport\/trpc\/index\.ts$/u, // the barrel re-export the compose root imports through
];

const MESSAGE =
  `the all-chats firehose \`${FIREHOSE}\` is importable ONLY by the composition root (entry/compose). It is ` +
  "UNCLAMPED BY TYPE: no chatId, no caller, no per-member history-floor verdict — it fans every room's canon " +
  "`view` payloads and raw `delta` transcript text process-wide. Any per-USER surface fed from it ships a " +
  "join-history leak (D79 — the plugin fan-out precedent).";
const FIX =
  "tail the per-chat stream (`subscribeChatEvents`) behind the member-gated `chatEventBounds` probe, or " +
  "consume the firehose in `entry/compose` and hand your subscriber a HOST-authority injected op. If a new " +
  "server-side, host-authority consumer is genuinely right, add its compose-root wiring there — not a direct import.";

function rel(ctx: GateRunCtx, sf: SourceFile): string {
  return sf.getFilePath().replace(`${ctx.root}/`, "");
}

function isAllowed(path: string): boolean {
  return ALLOWED.some((re) => re.test(path));
}

export const gate: GateDescriptor = {
  name: "firehose-import-allowlist",
  docRow: "ledger D79 (chat read-visibility — the firehose is compose-root-only)",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => SCANNED.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.ExportSpecifier],
  visit: (node, sf, ctx) => {
    const spec = node.asKind(SyntaxKind.ImportSpecifier) ?? node.asKind(SyntaxKind.ExportSpecifier);
    if (spec === undefined || spec.getName() !== FIREHOSE || isAllowed(rel(ctx, sf))) {
      return;
    }
    ctx.report(node, { token: FIREHOSE, offset: 0 });
  },
  // Fail-loud: if nothing declares the symbol any more it was renamed, and every arm above is dead.
  finalize: (ctx) => {
    const declared = ctx.project
      .getSourceFiles()
      .filter((sf) => SCANNED.test(sf.getFilePath()))
      .some((sf) => sf.getFunction(FIREHOSE) !== undefined);
    if (!declared) {
      ctx.report({
        file: "packages/server/src/transport/trpc/chat-events-bus.ts",
        line: 0,
        column: 0,
        message: `\`${FIREHOSE}\` is no longer declared under packages/server/src — this gate keys on that exact name, so it is now blind. Retarget scripts/check/gates/firehose-import-allowlist.ts at the renamed firehose.`,
      });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE}(): void {}\n`,
        "packages/server/src/domain/buddy/observer.ts": `import { ${FIREHOSE} } from "../../transport/trpc";\nexport const o = ${FIREHOSE};\n`,
      },
      expect: { messageIncludes: "composition root" },
      why: "a domain tailing the unclamped all-chats firehose — the per-member floor is never applied on that path",
    },
    {
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE}(): void {}\n`,
        "packages/server/src/infra/relay.ts": `export { ${FIREHOSE} } from "../transport/trpc";\n`,
      },
      expect: { messageIncludes: "composition root" },
      why: "a RE-EXPORT laundering the symbol into a new module — the import would then land on an innocuous specifier",
    },
    {
      files: {
        // The symbol exists nowhere: the rename tripwire, which is the only thing between a rename and a
        // permanently, silently green gate.
        "packages/server/src/entry/compose/automation-watcher.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "now blind" },
      why: "the firehose renamed out from under the gate — must be RED, never silently green",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE}(): void {}\n`,
        "packages/server/src/entry/compose/automation-watcher.ts": `import { ${FIREHOSE} } from "../../transport/trpc";\nexport const w = ${FIREHOSE};\n`,
      },
      why: "the sanctioned consumer: the compose root wiring the server-side rule engine under host authority",
    },
    {
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE}(): void {}\n`,
        "packages/server/src/transport/trpc/index.ts": `export { ${FIREHOSE} } from "./chat-events-bus";\n`,
      },
      why: "the barrel re-export the compose root imports through — the allowlisted definition/barrel pair",
    },
    {
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE}(): void {}\n`,
        "packages/server/src/domain/buddy/observer.ts": 'import { subscribeChatEvents } from "../../transport/trpc";\nexport const o = subscribeChatEvents;\n',
      },
      why: "the PER-CHAT stream is the correct seam (member-gated per yield) — the gate must not fire on it",
    },
  ],
};
