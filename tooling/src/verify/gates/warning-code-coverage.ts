// Gate: warning-code-coverage — the emit-coverage ratchet for two warning-code tuples: WARNING_CODES
// (infra/providers/contract/resolve.ts, emitted in infra/providers/**) and CHAT_WARNING_CODES
// (@orb/contracts/chat, emitted in domain/chat/**). A declared-never-emitted code is silently dead; a
// stale DEFERRED entry (gained an emit) is RED too. COMMENT POSTURE: comment-SAFE — AST warning records only.
// EACH TUPLE IS RESOLVED, NOT READ FLAT (#947): both channels read their tuple through `lib/tuple-read.ts`,
// so a code that moves behind `[...BASE_CODES, "local"]` keeps its emit obligation — a direct-element reader
// dropped every spread member while the tuple still parsed and the channel still reported members. Members
// keep their declaring source, the scan line prints each channel's member count + contributing declarations,
// and any composition shape the source law does not sanction refuses loudly instead of shrinking the set.
import type { CallExpression, ObjectLiteralExpression, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Check, Violation } from "../contract/harness.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";
import { readTupleDeclaration } from "../lib/tuple-read.ts";

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

/** The resolved member keys of a `[...] as const` tuple declaration, following the sanctioned spreads of
 *  local/imported sibling tuples (#947) — with the declarations that contributed them. */
function tupleMembers(home: SourceFile, tuple: string): { readonly members: string[]; readonly sources: readonly string[] } {
  const decl = home.getVariableDeclaration(tuple);
  if (decl === undefined || decl.getInitializer() === undefined) {
    return { members: [], sources: [] };
  }
  const vocabulary = readTupleDeclaration(decl);
  return { members: [...vocabulary.members], sources: vocabulary.sources };
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

function isWarningsReceiver(node: Node, seen = new Set<string>()): boolean {
  const expression = unwrapExpression(node);
  if (!Node.isIdentifier(expression)) {
    return false;
  }
  const name = expression.getText();
  if (name === "warnings") {
    return true;
  }
  const key = `${expression.getSourceFile().getFilePath()}:${name}`;
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  const declaration = expression
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((candidate) => candidate.getName() === name);
  const initializer = declaration?.getInitializer();
  return initializer !== undefined && isWarningsReceiver(initializer, seen);
}

function isExecutableWarningRecord(object: ObjectLiteralExpression, channel: WarningChannel): boolean {
  const call = object.getFirstAncestorByKind(SyntaxKind.CallExpression);
  const returned = object.getFirstAncestorByKind(SyntaxKind.ReturnStatement);
  const name = call === undefined ? undefined : callName(call);
  if (call !== undefined && name === "push") {
    const expression = unwrapExpression(call.getExpression());
    const receiver = Node.isPropertyAccessExpression(expression) ? expression.getExpression() : undefined;
    return receiver !== undefined && isWarningsReceiver(receiver) && object.getProperty("message") !== undefined;
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

/** What each channel's tuple resolved to THIS run — printed on the gate's scan line so a channel whose
 *  members moved behind a spread shows a smaller count instead of a clean ✓ (#947). */
interface ChannelPopulation {
  readonly tuple: string;
  readonly members: number;
  readonly sources: readonly string[];
}
let population: ChannelPopulation[] = [];

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
  const { members, sources } = tupleMembers(home, channel.tuple);
  population.push({ tuple: channel.tuple, members: members.length, sources });
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
  population = [];
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
    const violations = reconcileWarningCoverage(ctx.project);
    const lines = population.map((c) => `${c.tuple}=${c.members} from ${c.sources.length === 0 ? "<none>" : c.sources.join("+")}`);
    const sourceCount = population.reduce((n, c) => n + c.sources.length, 0);
    ctx.scan({ unit: `warning tuple source [${lines.join(" · ")}]`, candidates: sourceCount, scanned: sourceCount });
    for (const v of violations) {
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
      // THE #947 SPLIT, provider channel: the dead code arrives through an imported spread, beside one
      // locally-written code that IS emitted. A direct-element reader saw only the emitted local member.
      files: {
        "packages/server/src/infra/providers/contract/provider-codes.ts": 'export const BASE_WARNING_CODES = ["never_emitted"] as const;\n',
        [PROVIDER_HOME]:
          'import { BASE_WARNING_CODES } from "./provider-codes.ts";\nexport const WARNING_CODES = [...BASE_WARNING_CODES, "provider_ok"] as const;\n',
        [PROVIDER_EMIT]: PROVIDER_EMIT_FIXTURE,
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'emit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, messageIncludes: "never_emitted" },
      why: 'THE #947 SPLIT RED (provider channel): `[...BASE_WARNING_CODES, "provider_ok"]` — the spread member is still a declared code and still owes an emit. Before the resolver the tuple reported a healthy non-empty member list while every spread-in code left the denominator',
    },
    {
      // THE SAME SPLIT on the CHAT channel — a different home, a different emit scope, and its own reader
      // path, so proving one channel says nothing about the other.
      files: {
        [PROVIDER_HOME]: PROVIDER_HOME_FIXTURE,
        [PROVIDER_EMIT]: PROVIDER_EMIT_FIXTURE,
        "packages/contracts/src/chat/base-codes.ts": 'export const BASE_CHAT_WARNING_CODES = ["never_emitted"] as const;\n',
        "packages/contracts/src/chat/bus.ts":
          'import { BASE_CHAT_WARNING_CODES } from "./base-codes.ts";\nexport const CHAT_WARNING_CODES = [...BASE_CHAT_WARNING_CODES, "chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'emit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, messageIncludes: "never_emitted" },
      why: "THE #947 SPLIT RED (chat channel): the second channel resolves its own home and emit scope, so it carries its own split proof rather than inheriting the provider channel's",
    },
    {
      files: {
        [PROVIDER_HOME]: 'export const WARNING_CODES = ["wrong_receiver"] as const;\n',
        [PROVIDER_EMIT]: 'audit.push({ code: "wrong_receiver", message: "not a provider warning" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'emit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { messageIncludes: "NO emit site" },
      why: "a code/message record pushed into an unrelated accumulator is not a warning-channel emission",
    },
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
        "packages/server/src/infra/providers/contract/provider-codes.ts": 'export const BASE_WARNING_CODES = ["base_emitted"] as const;\n',
        [PROVIDER_HOME]:
          'import { BASE_WARNING_CODES } from "./provider-codes.ts";\nexport const WARNING_CODES = [...BASE_WARNING_CODES, "provider_ok"] as const;\n',
        [PROVIDER_EMIT]: 'warnings.push({ code: "base_emitted", message: "visible" });\nwarnings.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'emit({ type: "warning", code: "chat_ok" });\n',
      },
      why: "the SPLIT's green half: the spread-in code HAS its emit site — resolving the spread widens the coverage obligation without widening the accusation",
    },
    {
      files: {
        [PROVIDER_HOME]: 'export const WARNING_CODES = ["aliased_warning"] as const;\n',
        [PROVIDER_EMIT]: 'const warningSink = warnings;\nwarningSink.push({ code: "aliased_warning", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'emit({ type: "warning", code: "chat_ok" });\n',
      },
      why: "a local alias of the canonical warnings accumulator preserves warning-channel identity",
    },
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
