// Gate: warning-code-coverage — the emit-coverage ratchet for two warning-code tuples: WARNING_CODES
// (infra/providers/contract/resolve.ts, emitted in infra/providers/**) and CHAT_WARNING_CODES
// (@orb/contracts/chat, emitted in domain/chat/**). A declared-never-emitted code is silently dead; a
// stale DEFERRED entry (gained an emit) is RED too. COMMENT POSTURE: comment-SAFE — AST warning records only.
import type { CallExpression, ObjectLiteralExpression, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Check, Violation } from "../contract/harness.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";

/** One warning channel: where its tuple lives + where its emits live + the tracked-deferred allowlist. */
export interface WarningChannel {
  /** Diagnostic label (the tuple name). */
  readonly tuple: string;
  /** Locates the source file declaring the tuple (also EXCLUDED from the emit corpus). */
  readonly homeFile: RegExp;
  /** Files whose executable warning records count as emit sites. */
  readonly emitScope: RegExp;
  /** Declared-not-emitted members, each with its tracked citation (the self-cleaning ratchet). */
  readonly deferred: Readonly<Record<string, string>>;
}

const PKG_PREFIX_RE = /^.*\/packages\//u;
const PROVIDER_HOME = "packages/server/src/infra/providers/contract/resolve.ts";
const PROVIDER_EMIT = "packages/server/src/infra/providers/resolve-chat.ts";
const PROVIDER_HOME_FIXTURE = 'export const WARNING_CODES = ["provider_ok"] as const;\n';
const PROVIDER_EMIT_FIXTURE = 'warnings.push({ code: "provider_ok", message: "visible" });\n';

const CHANNELS: readonly WarningChannel[] = [
  {
    tuple: "WARNING_CODES",
    homeFile: /\/packages\/server\/src\/infra\/providers\/contract\/resolve\.ts$/u,
    emitScope: /\/packages\/server\/src\/infra\/providers\//u,
    deferred: {},
  },
  {
    tuple: "CHAT_WARNING_CODES",
    homeFile: /\/packages\/contracts\/src\/chat\/bus\.ts$/u,
    emitScope: /\/packages\/server\/src\/domain\/chat\//u,
    deferred: {},
  },
];

const missingMessage = (channel: WarningChannel, code: string): string =>
  `${channel.tuple} member "${code}" has NO emit site and no DEFERRED entry — a declared-never-emitted ` +
  "warning code is silently dead (D41 bans speculative codes). Wire the emit or add a cited DEFERRED " +
  "entry (tooling/src/verify/gates/warning-code-coverage.ts). See Core-Path-Registry.md D41.";
const staleMessage = (channel: WarningChannel, code: string): string =>
  `${channel.tuple} DEFERRED member "${code}" now HAS an emit site — delete its stale allowlist entry (tooling/src/verify/gates/warning-code-coverage.ts).`;

/** The string-literal member keys of a `[...] as const` tuple declaration. */
function tupleMembers(home: SourceFile, tuple: string): string[] {
  const decl = home.getVariableDeclaration(tuple);
  const arr = decl?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression);
  if (arr === undefined) {
    return [];
  }
  return arr.getElements().flatMap((el) => {
    const value = readStringValue(el);
    return value === undefined ? [] : [value];
  });
}

function localStringValue(node: Node): string | undefined {
  const direct = readStringValue(node);
  if (direct !== undefined || !Node.isIdentifier(unwrapExpression(node))) {
    return direct;
  }
  const identifier = unwrapExpression(node);
  if (!Node.isIdentifier(identifier)) {
    return;
  }
  const declaration = identifier.getSourceFile().getVariableDeclaration(identifier.getText());
  const initializer = declaration?.getInitializer();
  return initializer === undefined ? undefined : readStringValue(initializer);
}

function callName(node: CallExpression): string | undefined {
  const expression = unwrapExpression(node.getExpression());
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  return Node.isPropertyAccessExpression(expression) ? expression.getName() : undefined;
}

function isExecutableWarningRecord(object: ObjectLiteralExpression, channel: WarningChannel): boolean {
  const call = object.getFirstAncestorByKind(SyntaxKind.CallExpression);
  const returned = object.getFirstAncestorByKind(SyntaxKind.ReturnStatement);
  const name = call === undefined ? undefined : callName(call);
  if (name === "push") {
    return object.getProperty("message") !== undefined;
  }
  if (channel.tuple === "CHAT_WARNING_CODES" && (name === "emit" || name === "emitQuiet")) {
    const type = object.getProperty("type");
    return Node.isPropertyAssignment(type) && readStringValue(type.getInitializerOrThrow()) === "warning";
  }
  return returned !== undefined && call === undefined && object.getProperty("message") !== undefined;
}

function warningCodesInFile(sf: SourceFile, channel: WarningChannel): string[] {
  const codes: string[] = [];
  for (const object of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const property = object.getProperty("code");
    if (!(Node.isPropertyAssignment(property) && isExecutableWarningRecord(object, channel))) {
      continue;
    }
    const value = localStringValue(property.getInitializerOrThrow());
    if (value !== undefined) {
      codes.push(value);
    }
  }
  return codes;
}

function mapperCodes(sf: SourceFile, channel: WarningChannel): string[] {
  if (channel.tuple !== "CHAT_WARNING_CODES") {
    return [];
  }
  return (sf.getFunction("toChatWarningCode")?.getDescendantsOfKind(SyntaxKind.ReturnStatement) ?? []).flatMap((statement) => {
    const expression = statement.getExpression();
    const value = expression === undefined ? undefined : readStringValue(expression);
    return value === undefined ? [] : [value];
  });
}

/** Warning discriminators carried by executable warning records, not arbitrary literals. */
function emittedCodes(project: { getSourceFiles: () => SourceFile[] }, channel: WarningChannel): ReadonlySet<string> {
  const emitted = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!channel.emitScope.test(path) || channel.homeFile.test(path)) {
      continue;
    }
    for (const value of [...warningCodesInFile(sf, channel), ...mapperCodes(sf, channel)]) {
      emitted.add(value);
    }
  }
  return emitted;
}

function channelViolations(project: { getSourceFiles: () => SourceFile[] }, channel: WarningChannel): Violation[] {
  const home = project.getSourceFiles().find((sf) => channel.homeFile.test(sf.getFilePath()));
  if (home === undefined) {
    return [
      {
        file: "tooling/src/verify/gates/warning-code-coverage.ts",
        line: 1,
        message: `canonical warning tuple home is missing for ${channel.tuple}. Retarget the channel home in tooling/src/verify/gates/warning-code-coverage.ts.`,
      },
    ];
  }
  const members = tupleMembers(home, channel.tuple);
  if (members.length === 0) {
    return [
      {
        file: home.getFilePath().replace(PKG_PREFIX_RE, "packages/"),
        line: 1,
        message: `canonical warning tuple ${channel.tuple} is missing or empty. Restore the tuple declared by tooling/src/verify/gates/warning-code-coverage.ts.`,
      },
    ];
  }
  const emittedSet = emittedCodes(project, channel);
  const file = home.getFilePath().replace(PKG_PREFIX_RE, "packages/");
  const violations: Violation[] = [];
  for (const code of members) {
    const emitted = emittedSet.has(code);
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
    "a warning-code tuple member has NO emit site and no DEFERRED entry — a declared-never-emitted warning code is silently dead (D41 bans speculative codes). Wire the emit or add a cited DEFERRED entry in tooling/src/verify/gates/warning-code-coverage.ts. See Core-Path-Registry.md D41.",
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
        [PROVIDER_HOME]: PROVIDER_HOME_FIXTURE,
        [PROVIDER_EMIT]: PROVIDER_EMIT_FIXTURE,
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["never_emitted"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "something_else";\n',
      },
      expect: { messageIncludes: "NO emit site" },
      why: "a CHAT_WARNING_CODES member with no emit site + no DEFERRED entry — a silently dead warning code",
    },
    {
      // the tuple home file is EXCLUDED from its own emit corpus: the member string appears in the home
      // declaration but there is no separate emit site, so it still flags (the home copy doesn't count).
      files: {
        [PROVIDER_HOME]: PROVIDER_HOME_FIXTURE,
        [PROVIDER_EMIT]: PROVIDER_EMIT_FIXTURE,
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["home_only"] as const;\n',
      },
      expect: { messageIncludes: "NO emit site" },
      why: "the tuple home file is excluded from its own emit corpus — a home-only member has no emit, flags",
    },
    {
      files: {
        [PROVIDER_HOME]: PROVIDER_HOME_FIXTURE,
        [PROVIDER_EMIT]: PROVIDER_EMIT_FIXTURE,
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["literal_only"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "literal_only";\n',
      },
      expect: { messageIncludes: "NO emit site" },
      why: "an arbitrary matching literal is not a warning event emit — the code remains dead",
    },
  ],
  mustPass: [
    {
      files: {
        [PROVIDER_HOME]: PROVIDER_HOME_FIXTURE,
        [PROVIDER_EMIT]: PROVIDER_EMIT_FIXTURE,
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["emitted_code"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'emit({ type: "warning", code: "emitted_code" });\n',
      },
      why: "the code is carried by an emitted warning event in the channel scope — covered, passes",
    },
  ],
};
