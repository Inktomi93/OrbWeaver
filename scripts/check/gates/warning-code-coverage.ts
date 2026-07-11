// Gate: warning-code-coverage (D41 resolve-chat warnings + D45/D48 the vision/tool codes + D51 the
// domain-vs-infra warning split) — the emit-coverage RATCHET for BOTH warning-code tuples, the
// bus-coverage/user-bus-coverage twin for the two structured warning channels:
//   • WARNING_CODES (infra/providers/contract/resolve.ts) — the strict resolve/runner-emit set; a member
//     is EMITTED where its code string appears as a `{ code: "…" }` literal in `infra/providers/**` (the
//     home file itself is excluded — the tuple declaration is not an emit site).
//   • CHAT_WARNING_CODES (@orb/contracts/chat) — the DOMAIN-side capability-gate set (D51: the engine, not
//     the runner, drops content); a member is EMITTED where its code string appears in `domain/chat/**`.
// The `WARNING_CODES` home banning speculative codes (D41 — "one code per DISTINCT site resolve-chat
// actually emits") is exactly what this makes machine-permanent: a declared-never-emitted warning code is
// silently dead, and a stale DEFERRED entry (a code that GAINED an emit) is RED too. Both channels are
// compile-exhaustive on the CONSUMER side (`{ code }` is typed to the tuple, so every emit uses a member —
// tsc owns that direction); this gate owns the PRODUCER direction the type system can't see.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
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
    // `verbosity_dropped` (D68-B) is now WIRED (W2): the funnel `resolveVerbosity` pass drops it when the
    // model lists no verbosity vocab, and the chat-completions runner drops it a SECOND time (the wire has
    // no field) — both in the emit scope, so the ratchet counts it emitted (its W1 deferred entry is gone).
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
  "entry (scripts/check/gates/warning-code-coverage.ts). See Core-Path-Registry-D35-D43.md D41.";
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

export const warningCodeCoverage: Check = createWarningCodeCoverage(CHANNELS);
