// Policy: warning-code-coverage (Core-Path-Registry.md D41) — the emit-coverage ratchet for two warning-code
// vocabularies. A declared-never-emitted code is silently dead wire, which D41 bans.
//
// TWO CHANNELS, TWO INDEPENDENT DENOMINATORS, never summed: `WARNING_CODES`
// (server/infra/providers/contract/resolve.ts, emitted anywhere under server/infra/providers) and
// `CHAT_WARNING_CODES` (contracts/chat/bus.ts, emitted under server/domain/chat). Each vocabulary is read
// through the shared `tupleVocabularyFact`, which resolves the sanctioned spreads, and is then BOUND TO ITS
// DECLARING MODULE: a tuple of the right name declared anywhere else is a different vocabulary and refuses
// the channel rather than being adopted. A vocabulary that stops resolving takes its receipt to zero members
// and withholds this policy — the rename tripwire, owned by the runtime rather than by a finding.
//
// An EMIT is an executable warning record, not a matching literal: a `{ code, message }` pushed onto the
// warnings accumulator (through immutable aliases of it), a `{ type: "warning", code }` carried by the chat
// emitters, a returned warning payload, or a code returned by the canonical infra-to-chat mapper. The
// mapper is keyed by name in ONE place on purpose: a rename empties this reader, and the failure mode is a
// loud false ACCUSATION on every code it owns, never a false clean (#1440).
//
// The legacy per-channel DEFERRED tables are DELETED. Both were empty, and their stale/orphan arms were
// unprovable while they stayed empty; a real deferral is a warning work item or an exact reviewed grant.
import type { CallExpression, Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { TupleVocabularyFact } from "../contract/tuple-vocabulary-fact.ts";
import { readStaticAuthoredScalar } from "../lib/static-authored-value.ts";
import { tupleVocabularyFact, tupleVocabularyReceipt } from "../lib/tuple-vocabulary-fact.ts";

/** The local accumulator a provider warning record is pushed onto. */
const SINK = "warnings";
/** The ONE name of the infra-to-chat warning translation; a rename REDs loudly instead of going quiet. */
const CHAT_MAPPER = "toChatWarning";
/** A readonly tuple, not a module-scope `Set`: nothing in a policy module may be mutable at module scope. */
const CHAT_EMITTERS = ["emit", "emitQuiet"] as const;

interface Channel {
  readonly tuple: string;
  /** The ONE module that declares the vocabulary. */
  readonly home: string;
  /** Where an executable warning record counts as an emit site. */
  readonly emitScope: string;
  /** Does this channel admit the chat bus emitters and the infra-to-chat mapper? */
  readonly chat: boolean;
}

const CHANNELS: readonly Channel[] = [
  {
    tuple: "WARNING_CODES",
    home: "packages/server/src/infra/providers/contract/resolve.ts",
    emitScope: "packages/server/src/infra/providers/",
    chat: false,
  },
  {
    tuple: "CHAT_WARNING_CODES",
    home: "packages/contracts/src/chat/bus.ts",
    emitScope: "packages/server/src/domain/chat/",
    chat: true,
  },
];

const MESSAGE =
  "a warning-code tuple member has NO emit site — a declared-never-emitted warning code is silently dead " +
  "(D41 bans speculative codes). See Core-Path-Registry.md D41.";
const FIX = "wire the executable emit site in the channel's scope, or delete the code.";

function stringOf(node: MorphNode | undefined): string | undefined {
  if (node === undefined) {
    return;
  }
  const scalar = readStaticAuthoredScalar(node);
  return scalar.kind === "resolved" && typeof scalar.value === "string" ? scalar.value : undefined;
}

function propertyValue(object: ObjectLiteralExpression, name: string): MorphNode | undefined {
  const property = object.getProperty(name);
  return property !== undefined && Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
}

/** Does this receiver denote the warnings accumulator, through immutable aliases of it? */
function isWarningsSink(node: MorphNode, seen: Set<object> = new Set()): boolean {
  if (!Node.isIdentifier(node)) {
    return false;
  }
  if (node.getText() === SINK) {
    return true;
  }
  const declaration = node.getSymbol()?.getDeclarations()[0];
  if (declaration === undefined || seen.has(declaration.compilerNode) || !Node.isVariableDeclaration(declaration)) {
    return false;
  }
  seen.add(declaration.compilerNode);
  const initializer = declaration.getInitializer();
  return initializer !== undefined && isWarningsSink(initializer, seen);
}

function calleeName(call: CallExpression): string | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  return Node.isPropertyAccessExpression(expression) ? expression.getName() : undefined;
}

function isPushedWarning(object: ObjectLiteralExpression, call: CallExpression): boolean {
  const expression = call.getExpression();
  const receiver = Node.isPropertyAccessExpression(expression) ? expression.getExpression() : undefined;
  return receiver !== undefined && isWarningsSink(receiver) && object.getProperty("message") !== undefined;
}

/** An EXECUTABLE warning record — never an arbitrary object that happens to carry a `code`. */
function isExecutableWarningRecord(object: ObjectLiteralExpression, channel: Channel): boolean {
  const call = object.getFirstAncestorByKind(SyntaxKind.CallExpression);
  const returned = object.getFirstAncestorByKind(SyntaxKind.ReturnStatement);
  const name = call === undefined ? undefined : calleeName(call);
  if (call !== undefined && name === "push") {
    return isPushedWarning(object, call);
  }
  if (channel.chat && CHAT_EMITTERS.some((emitter) => emitter === name)) {
    return stringOf(propertyValue(object, "type")) === "warning";
  }
  return returned !== undefined && call === undefined && object.getProperty("message") !== undefined;
}

/** The code a canonical mapper return carries: a bare literal, or the `code` of a returned payload. */
function mapperCode(statement: MorphNode): string | undefined {
  const expression = Node.isReturnStatement(statement) ? statement.getExpression() : undefined;
  if (expression === undefined) {
    return;
  }
  const direct = stringOf(expression);
  if (direct !== undefined) {
    return direct;
  }
  const owner = statement.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
  return owner?.getName() === CHAT_MAPPER && Node.isObjectLiteralExpression(expression) ? stringOf(propertyValue(expression, "code")) : undefined;
}

function isMapperReturn(statement: MorphNode): boolean {
  return statement.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)?.getName() === CHAT_MAPPER;
}

/** The vocabulary, bound to its declaring module: a same-named tuple elsewhere is a different vocabulary. */
function channelVocabulary(fact: TupleVocabularyFact, channel: Channel, relativePath: (file: SourceFile) => string): TupleVocabularyFact {
  if (fact.kind !== "resolved") {
    return fact;
  }
  const declared = relativePath(fact.symbol.declaration.getSourceFile());
  return declared === channel.home
    ? fact
    : {
        kind: "unresolved",
        exportedName: channel.tuple,
        reason: "ambiguous",
        detail: `${channel.tuple} is declared at ${declared}, not at its home ${channel.home}`,
        node: fact.symbol.declaration,
        declarations: fact.declarations,
      };
}

interface Candidate {
  readonly node: MorphNode;
  readonly path: string;
}

/** Everything one shared walk collects: warning-shaped records, and canonical mapper returns. */
interface Collected {
  readonly records: Candidate[];
  readonly mapperReturns: Candidate[];
}

function inEmitScope(candidate: Candidate, channel: Channel): boolean {
  return candidate.path.startsWith(channel.emitScope) && candidate.path !== channel.home;
}

function recordCode(candidate: Candidate, channel: Channel): string | undefined {
  const object = candidate.node;
  if (!Node.isObjectLiteralExpression(object)) {
    return;
  }
  return isExecutableWarningRecord(object, channel) ? stringOf(propertyValue(object, "code")) : undefined;
}

/** Every code this channel can prove is executably emitted. */
function emittedCodes(state: Collected, channel: Channel): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const candidate of state.records.filter((entry) => inEmitScope(entry, channel))) {
    const code = recordCode(candidate, channel);
    if (code !== undefined) {
      codes.add(code);
    }
  }
  for (const candidate of channel.chat ? state.mapperReturns.filter((entry) => inEmitScope(entry, channel)) : []) {
    const code = mapperCode(candidate.node);
    if (code !== undefined) {
      codes.add(code);
    }
  }
  return codes;
}

export const gate = defineGate({
  id: "warning-code-coverage",
  family: "warning-code-coverage",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@server", "@contracts"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [tupleVocabularyFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const state: Collected = { records: [], mapperReturns: [] };

    const judgeChannel = (channel: Channel, fact: TupleVocabularyFact): void => {
      const vocabulary = channelVocabulary(fact, channel, ctx.relativePath);
      ctx.receipt({ kind: "population", ...tupleVocabularyReceipt(vocabulary) });
      if (vocabulary.kind !== "resolved") {
        return;
      }
      const emitted = emittedCodes(state, channel);
      for (const entry of vocabulary.entries) {
        if (!emitted.has(entry.value)) {
          ctx.report.node(entry.node, {
            message: `${MESSAGE} Member: "${entry.value}" of ${channel.tuple}.`,
            fix: `${FIX} Scope: ${channel.emitScope}.`,
          });
        }
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.ObjectLiteralExpression, SyntaxKind.ReturnStatement],
          visit: (node, sourceFile: SourceFile) => {
            const path = ctx.relativePath(sourceFile);
            if (Node.isObjectLiteralExpression(node)) {
              if (node.getProperty("code") !== undefined) {
                state.records.push({ node, path });
              }
            } else if (isMapperReturn(node)) {
              state.mapperReturns.push({ node, path });
            }
          },
        },
      ],
      evaluate: () => {
        const vocabularies = ctx.fact(tupleVocabularyFact);
        for (const channel of CHANNELS) {
          judgeChannel(channel, vocabularies.read(channel.tuple));
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/provider-codes.ts": 'export const BASE_WARNING_CODES = ["never_emitted"] as const;\n',
        "packages/server/src/infra/providers/contract/resolve.ts":
          'import { BASE_WARNING_CODES } from "./provider-codes.ts";\nexport const WARNING_CODES = [...BASE_WARNING_CODES, "provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, messageIncludes: 'Member: "never_emitted"' },
      why: "THE SPREAD RED (provider channel): the dead code arrives through an imported spread and still owes an emit. A direct-element reader saw only the emitted local member",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/base-codes.ts": 'export const BASE_CHAT_WARNING_CODES = ["never_emitted"] as const;\n',
        "packages/contracts/src/chat/bus.ts":
          'import { BASE_CHAT_WARNING_CODES } from "./base-codes.ts";\nexport const CHAT_WARNING_CODES = [...BASE_CHAT_WARNING_CODES, "chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, messageIncludes: 'Member: "never_emitted"' },
      why: "THE SAME SPREAD RED on the CHAT channel — a different home, a different emit scope and its own reader path, so proving one channel says nothing about the other",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const audit: { code: string; message: string }[];\naudit.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, messageIncludes: 'Member: "provider_ok"' },
      why: "THE COUNTERFACTUAL: a warning-SHAPED record pushed onto an unrelated accumulator is not an emit. The record's shape is the same spelling; the sink identity is what differs",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const code = "chat_ok";\n',
      },
      expect: { count: 1, messageIncludes: 'Member: "chat_ok"' },
      why: "an arbitrary literal equal to a warning code is not an executable emit — a text census would count it and report the channel covered",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/other.ts": 'export function toChatWarningCode(): string {\n  return "chat_ok";\n}\n',
      },
      expect: { count: 1, messageIncludes: 'Member: "chat_ok"' },
      why: "THE MAPPER TRIPWIRE (#1440): the translation was renamed, so its returns stop proving emits and every code it owns REDs loudly. The failure mode is a false accusation, never a false clean",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const warnings: { code: string; message: string }[];\nconst sink = warnings;\nsink.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emitQuiet(event: unknown): void;\nemitQuiet({ type: "warning", code: "chat_ok" });\n',
      },
      why: "an ALIAS of the warnings accumulator is the same channel, and the quiet chat emitter carries a real warning — both emits count",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'export function build(): { code: string; message: string } {\n  return { code: "provider_ok", message: "visible" };\n}\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/warnings.ts": 'export function toChatWarning(): string {\n  return "chat_ok";\n}\n',
      },
      why: "a RETURNED warning payload is an emit on the provider channel, and the canonical mapper's returned code is an emit by proxy on the chat channel — the engine spreads it straight onto the bus event",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/warnings.ts":
          'export function toChatWarning(): { code: string; detail: string } {\n  return { code: "chat_ok", detail: "x" };\n}\n',
      },
      why: "the mapper answers with a PAYLOAD the moment one of its codes needs detail (#1440) — a string-only reader would see nothing and red three live codes",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts":
          'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\nexport const decoy = { code: "chat_ok", message: "the tuple home is excluded from its own emit corpus" };\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      why: "the tuple HOME is excluded from its own emit corpus, so a record sitting beside the vocabulary never counts as coverage — the emit here is the real one in the domain",
    },
  ],
});
