// Gate: warning-code-coverage — the emit-coverage ratchet for two warning-code tuples: WARNING_CODES
// (infra/providers/contract/resolve.ts, emitted in infra/providers/**) and CHAT_WARNING_CODES
// (@orb/contracts/chat, emitted in domain/chat/**). A declared-never-emitted code is silently dead; a
// stale DEFERRED entry (gained an emit) is RED too. tsc owns the consumer side; this owns the producer.
import type { Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

/** One warning channel: where its tuple lives + where its emits live + the tracked-deferred allowlist. */
export interface WarningChannel {
  /** Diagnostic label (the tuple name). */
  readonly tuple: string;
  /** Locates the source file declaring the tuple (also EXCLUDED from the emit corpus). */
  readonly homeFile: RegExp;
  /** Files whose code literals count as emit sites. */
  readonly emitScope: RegExp;
  /** Declared-not-emitted members, each with its tracked citation (the self-cleaning ratchet). */
  readonly deferred: Readonly<Record<string, string>>;
}

const PKG_PREFIX_RE = /^.*\/packages\//u;

const CHANNELS: readonly WarningChannel[] = [
  {
    tuple: "WARNING_CODES",
    homeFile: /\/packages\/server\/src\/infra\/providers\/contract\/resolve\.ts$/u,
    emitScope: /\/packages\/server\/src\/infra\/providers\//u,
    deferred: {},
  },
  {
    tuple: "CHAT_WARNING_CODES",
    homeFile: /\/packages\/contracts\/src\/chat\/index\.ts$/u,
    emitScope: /\/packages\/server\/src\/domain\/chat\//u,
    deferred: {},
  },
];

const missingMessage = (channel: WarningChannel, code: string): string =>
  `${channel.tuple} member "${code}" has NO emit site and no DEFERRED entry — a declared-never-emitted ` +
  "warning code is silently dead (D41 bans speculative codes). Wire the emit or add a cited DEFERRED " +
  "entry (scripts/check/gates/warning-code-coverage.ts). See Core-Path-Registry.md D41.";
const staleMessage = (channel: WarningChannel, code: string): string =>
  `${channel.tuple} DEFERRED member "${code}" now HAS an emit site — delete its stale allowlist entry ` +
  "(scripts/check/gates/warning-code-coverage.ts).";

/** The string-literal member keys of a `[...] as const` tuple declaration. */
function tupleMembers(home: SourceFile, tuple: string): string[] {
  const decl = home.getVariableDeclaration(tuple);
  const arr = decl?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression);
  if (arr === undefined) {
    return [];
  }
  return arr
    .getElements()
    .flatMap((el) => (el.isKind(SyntaxKind.StringLiteral) ? [el.getLiteralText()] : []));
}

/** Every string-ish literal in the emit scope (minus the home file), concatenated (comments excluded). */
function emitCorpus(
  project: { getSourceFiles: () => SourceFile[] },
  channel: WarningChannel,
): string {
  const parts: string[] = [];
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!channel.emitScope.test(path) || channel.homeFile.test(path)) {
      continue;
    }
    for (const kind of [
      SyntaxKind.StringLiteral,
      SyntaxKind.NoSubstitutionTemplateLiteral,
    ] as const) {
      for (const lit of sf.getDescendantsOfKind(kind)) {
        parts.push(lit.getLiteralText());
      }
    }
  }
  return ` ${parts.join(" ")} `;
}

function channelViolations(
  project: { getSourceFiles: () => SourceFile[] },
  channel: WarningChannel,
): Violation[] {
  const home = project.getSourceFiles().find((sf) => channel.homeFile.test(sf.getFilePath()));
  if (home === undefined) {
    return []; // tuple home not in the project (placeholder tree) — vacuous
  }
  const members = tupleMembers(home, channel.tuple);
  if (members.length === 0) {
    return [];
  }
  const corpus = emitCorpus(project, channel);
  const file = home.getFilePath().replace(PKG_PREFIX_RE, "packages/");
  const violations: Violation[] = [];
  for (const code of members) {
    const emitted = corpus.includes(` ${code} `);
    const deferred = code in channel.deferred;
    if (!(emitted || deferred)) {
      violations.push({ file, line: 1, message: missingMessage(channel, code) });
    }
    if (emitted && deferred) {
      violations.push({ file, line: 1, message: staleMessage(channel, code) });
    }
  }
  return violations;
}

export function createWarningCodeCoverage(channels: readonly WarningChannel[]): Check {
  return {
    name: "warning-code-coverage",
    run: ({ project }): Violation[] => channels.flatMap((c) => channelViolations(project, c)),
  };
}

function reconcileWarningCoverage(project: Project): Violation[] {
  return CHANNELS.flatMap((c) => channelViolations(project, c));
}

export const gate: GateDescriptor = {
  name: "warning-code-coverage",
  docRow: "Core-Path-Registry.md D41 (D45/D48/D51)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a warning-code tuple member has NO emit site and no DEFERRED entry — a declared-never-emitted warning code is silently dead (D41 bans speculative codes). Wire the emit or add a cited DEFERRED entry in scripts/check/gates/warning-code-coverage.ts. See Core-Path-Registry.md D41.",
  fix: "wire the `{ code: '…' }` emit site in the channel's scope, or add a cited DEFERRED entry in warning-code-coverage.ts.",
  run: (ctx) => {
    for (const v of reconcileWarningCoverage(ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  // NOTE: the DEFERRED-member arms (a DEFERRED member with no emit passes; a DEFERRED member that GAINS an
  // emit is stale/RED) need an INJECTED channel with a non-empty `deferred` map via createWarningCodeCoverage
  // — the LIVE CHANNELS this descriptor runs both declare `deferred: {}`, so those arms cannot be driven from
  // an example (which runs the live descriptor). Their coverage is retained in
  // tests/tooling/warning-code-coverage.residual.test.ts + the live `pnpm check:structure` run.
  mustFlag: [
    {
      files: {
        "packages/contracts/src/chat/index.ts":
          'export const CHAT_WARNING_CODES = ["never_emitted"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "something_else";\n',
      },
      expect: { messageIncludes: "NO emit site" },
      why: "a CHAT_WARNING_CODES member with no emit site + no DEFERRED entry — a silently dead warning code",
    },
    {
      // the tuple home file is EXCLUDED from its own emit corpus: the member string appears in the home
      // declaration but there is no separate emit site, so it still flags (the home copy doesn't count).
      files: {
        "packages/contracts/src/chat/index.ts":
          'export const CHAT_WARNING_CODES = ["home_only"] as const;\n',
      },
      expect: { messageIncludes: "NO emit site" },
      why: "the tuple home file is excluded from its own emit corpus — a home-only member has no emit, flags",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/contracts/src/chat/index.ts":
          'export const CHAT_WARNING_CODES = ["emitted_code"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "emitted_code";\n',
      },
      why: "the code's discriminator appears as an emit literal in the channel scope — covered, passes",
    },
  ],
};
