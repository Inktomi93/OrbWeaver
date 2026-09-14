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
//
// FAMILY: SINGLETON under its own id. `tupleVocabularyFact` is a shared PRIMITIVE, not a family key — three
// unrelated families read it (`registry-definitions` via chrome, `role-vocabulary` via the two role
// policies, and this one) — and no sibling policy judges whether a warning code is EMITTED, which is this
// policy's subject.
// POPULATION PORT: the legacy descriptor was `scopeSafety: "whole-project"` and walked `ctx.project`
// entirely (ed8b96aef), narrowing to the channels inside its own reader. The final population is
// `in: ["@server", "@contracts"]` — an INTENTIONAL narrowing, and lossless: both tuple homes live there
// (server/infra/providers, contracts/chat) and both emit scopes are under `packages/server/src/`, so no
// admitted file the legacy walk judged is dropped.
// SUPERSEDED 2026-09-13 (lane cb-b-header-residue), the citation above kept: the `(ed8b96aef)` is NOT this
// conversion's legacy source. `git rev-parse` gives a different `warning-code-coverage.ts` blob at `ed8b96aef` than
// at the conversion parent `307640dae` (= `e18bce01e^`), which is the replayable descriptor. "lossless" holds
// (legacy − final = ∅), and the population is a superset of what the reader judges (final − legacy = 1,347; the
// sets at the end of this header).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `warning-code-coverage` descriptor at 307640dae36a13f5c21e08cbd24a8e24633adb92, the parent of the conversion
// `e18bce01e` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `ed8b96aef`
// cited above is NOT this blob — `git rev-parse` gives a different blob there than at the conversion parent, which is
// the replayable legacy source. The legacy descriptor had no `scanRoot`, so its effective population is its in-run
// path filter — channels: homeFile `/packages/server/src/infra/providers/contract/resolve.ts` + emitScope
// `/packages/server/src/infra/providers/`; homeFile `/packages/contracts/src/chat/bus.ts` + emitScope
// `/packages/server/src/domain/chat/`. Over the SAME 7,144 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`) it admits 238 and the final `population` admits 1,585 (the bare harness
// dispatch was 7,144). legacy − final = ∅. final − legacy = 1,347 — every `@contracts` source but the chat bus home
// (104) and every `@server` source outside `infra/providers` and `domain/chat` (1,243): the two channel emit scopes
// stay inside the reader, so the population is a superset of what it judges. Controls: inside: the real shared member
// `packages/contracts/src/chat/bus.ts` admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` rejected by both.
import type { CallExpression, Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveStableExpression } from "../../_shared/reference-fact.ts";
import type { GateFactContext } from "../contract/fact.ts";
import { defineGate } from "../contract/policy.ts";
import type { TupleVocabularyFact } from "../contract/tuple-vocabulary-fact.ts";
import { declarationHome } from "../lib/declaration-home.ts";
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
const FIX =
  "wire the executable emit site in the channel's scope, or delete the code. For a deliberate exception, write an adjacent `@orb-waive warning-code-coverage(<position>): <why + end condition>` — the finding is anchored on the TUPLE MEMBER, so the position is the quoted literal INCLUDING its quotes (`\"never_emitted\"`), and the marker goes on the line above the tuple's own declaration.";

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

/** The local accumulator's authored name, never a member or an imported export-name lookalike. */
function namesAccumulator(node: MorphNode): boolean {
  if (Node.isIdentifier(node)) {
    return node.getText() === SINK;
  }
  return (Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node)) && node.getName() === SINK;
}

/** The shared trace owns alias hops. Reaching the named accumulator proves the sink even when its
 *  own initializer is runtime data; a member merely named `warnings` does not prove that local binding. */
function isWarningsSink(node: MorphNode): boolean {
  if (!Node.isIdentifier(node)) {
    return false;
  }
  // Inspect the binding before its spelling: an unrenamed import is not the local accumulator.
  const binding = resolveStableExpression(node);
  for (const declaration of binding.trace.declarations) {
    if (Node.isImportSpecifier(declaration)) {
      return false;
    }
    if (namesAccumulator(declaration)) {
      return true;
    }
  }
  return binding.kind === "unresolved" && namesAccumulator(binding.node);
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

/** The vocabulary, bound to its declaring module: a same-named tuple elsewhere is a different vocabulary.
 *
 *  The home is read through {@link declarationHome} and NOT through `ctx.relativePath`. The tuple index is a
 *  SHARED provider whose population (`@client` + `@server` + `@contracts`) is strictly wider than this
 *  policy's (`@server` + `@contracts`), so the declaration this binding check exists to catch — the tuple
 *  that moved out of its home — is exactly the one `ctx.relativePath` refuses. It would have THROWN and
 *  withheld the policy instead of reporting the move (guide §3).
 *
 *  NO CONFORMANCE ROW CAN HOLD THIS, and that is a property of the arm rather than a missing proof: a home
 *  mismatch returns `unresolved`, `tupleVocabularyReceipt` scores that `members: 0, unresolved: 1`, and the
 *  policy's own receipt then refuses — `toolFailure` fails BOTH arms on a non-success owner status
 *  (`ops/policy-conformance.ts`), so the row can be neither `mustFlag` (no finding is reported) nor
 *  `mustPass` (the owner did not succeed). Both sides were measured instead, on the same fixture (a
 *  `WARNING_CODES` planted at `packages/client/src/state/provider-warnings.ts`, inside the shared tuple
 *  index's population and outside this policy's), 2026-09-12:
 *    · before — `PASS TOOL ERROR [evaluate] source file is outside the effective population: …`
 *    · after  — `PASS TOOL ERROR [receipt] policy receipt refused: population "WARNING_CODES" resolved zero members; population "WARNING_CODES" left 1 unresolved`
 *  Same blast radius, but the second names the vocabulary and the reason — it is the designed blindness
 *  tripwire firing, not the runtime breaking. */
function channelVocabulary(context: GateFactContext, fact: TupleVocabularyFact, channel: Channel): TupleVocabularyFact {
  if (fact.kind !== "resolved") {
    return fact;
  }
  const declared = declarationHome(context, fact.symbol.declaration.getSourceFile());
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
  population: { in: ["@server", "@contracts"] },
  analysis: "types",
  execution: "entire-population",
  facts: [tupleVocabularyFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const state: Collected = { records: [], mapperReturns: [] };

    const judgeChannel = (channel: Channel, fact: TupleVocabularyFact): void => {
      const vocabulary = channelVocabulary(ctx, fact, channel);
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
      expect: { count: 1, token: '"never_emitted"', messageIncludes: 'Member: "never_emitted"' },
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
      expect: { count: 1, token: '"never_emitted"', messageIncludes: 'Member: "never_emitted"' },
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
      expect: { count: 1, token: '"provider_ok"', messageIncludes: 'Member: "provider_ok"' },
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
      expect: { count: 1, token: '"chat_ok"', messageIncludes: 'Member: "chat_ok"' },
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
      expect: { count: 1, token: '"chat_ok"', messageIncludes: 'Member: "chat_ok"' },
      why: "THE MAPPER TRIPWIRE (#1440): the translation was renamed, so its returns stop proving emits and every code it owns REDs loudly. The failure mode is a false accusation, never a false clean",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts":
          'export const WARNING_CODES = ["provider_ok"] as const;\nexport function describe(): { code: string; message: string } {\n  return { code: "provider_ok", message: "beside the vocabulary" };\n}\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, token: '"provider_ok"', messageIncludes: 'Member: "provider_ok"' },
      why: "THE HOME FENCE, pinned: the provider tuple's own module sits INSIDE the provider emit scope, so a real executable warning record there is the vocabulary describing itself rather than a provider emitting. Deleting `candidate.path !== channel.home` counts it and REDS this row (the chat channel cannot pin this — its home is in @contracts, outside its emit scope entirely)",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts":
          'declare function emit(event: unknown): void;\ndeclare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "wrong channel" });\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, token: '"provider_ok"', messageIncludes: 'Member: "provider_ok"' },
      why: "THE SCOPE FENCE, pinned: a textbook provider emit sitting in the CHAT domain is not a provider emit — the two channels own disjoint emit scopes, which is what `TWO INDEPENDENT DENOMINATORS` means operationally. Deleting `startsWith(channel.emitScope)` counts it and REDS this row",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "provider_ok" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, token: '"provider_ok"', messageIncludes: 'Member: "provider_ok"' },
      why: 'THE PER-CHANNEL CHAT-EMITTER ADMISSION, pinned (§4.1). `chat` is a per-channel field and the PROVIDER channel is `chat: false`, so a bus `emit({type:"warning"})` sited inside the provider emit scope is NOT a provider emit — the provider vocabulary reaches the bus only through the canonical `toChatWarning` mapper. THIS FENCE MAKES THE POLICY FLAG **MORE**, so its falsifier is a `mustFlag` the cut turns GREEN, not a `mustPass` it reds: delete `channel.chat &&` and the provider channel adopts the chat emitters, `provider_ok` reads as covered, and this row goes 1 → 0',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts": 'declare const warnings: { code: string }[];\nwarnings.push({ code: "provider_ok" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { count: 1, token: '"provider_ok"', messageIncludes: 'Member: "provider_ok"' },
      why: 'THE PUSHED-RECORD `message` REQUIREMENT, pinned (§4.1). A `{ code }` with no `message` pushed onto the real `warnings` sink is not an EXECUTABLE warning record — nothing reaches a human — so it cannot discharge a code\'s emit obligation. Same reversed direction as the row above: deleting `object.getProperty("message") !== undefined` from `isPushedWarning` makes the bare record count as an emit and this row goes 1 → 0. Its twin is mustFlag[2], which holds the OTHER half of the same recogniser (the sink identity) with the message present',
    },
  ],
  // THE REFUSAL ARM (§4.5b, #1977 worked case, migrated onto the bar by #2109 item 2 / #2111). Until now the two
  // measured messages in the header above were the only record of this behaviour; a row cannot `mustFlag` it (no
  // finding) or `mustPass` it (the owner does not succeed), so it lived nowhere `pnpm check` runs. The needle names
  // the policy's OWN receipt source — the tuple's authored name — never the runner's wrapper (the loader refuses a
  // needle inside the generic envelope, `lib/policy-refusal-envelope.ts`).
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/provider-warnings.ts": 'export const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const warnings: { code: string; message: string }[];\nwarnings.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      expect: { messageIncludes: 'population "WARNING_CODES" resolved zero members' },
      why: "THE BLINDNESS TRIPWIRE FIRING: `WARNING_CODES` planted INSIDE the shared tuple index's population (`@client`) and OUTSIDE this policy's home — `channelVocabulary` answers `unresolved`, the tuple receipt scores `members: 0 / unresolved: 1`, and the policy's own receipt REFUSES rather than rendering a clean corpus. The needle is the receipt SOURCE (the tuple's authored name), which no other refusal emits",
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
          'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\nexport const decoy = { code: "chat_ok", message: "an inert record is not an emit" };\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      why: "a warning-SHAPED CONST that is neither pushed, returned, nor carried by an emitter is inert, so it never counts as coverage — the emit here is the real one in the domain. (This row does NOT prove the tuple-home exclusion, which the `THE HOME FENCE` mustFlag row above pins; the record's inertness alone decides this one, measured 2026-09-11)",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/resolve.ts":
          '// @orb-waive warning-code-coverage("provider_ok"): pinned identity arm; ends when the provider emits this code.\nexport const WARNING_CODES = ["provider_ok"] as const;\n',
        "packages/server/src/infra/providers/resolve-chat.ts":
          'declare const audit: { code: string; message: string }[];\naudit.push({ code: "provider_ok", message: "visible" });\n',
        "packages/contracts/src/chat/bus.ts": 'export const CHAT_WARNING_CODES = ["chat_ok"] as const;\n',
        "packages/server/src/domain/chat/x.ts": 'declare function emit(event: unknown): void;\nemit({ type: "warning", code: "chat_ok" });\n',
      },
      why: 'THE IDENTITY ARM (§4.2): the twin of the unrelated-accumulator counterfactual, which produces EXACTLY ONE finding (the chat channel is covered), waived at the position this policy reports — the TUPLE MEMBER literal WITH its quotes, `"provider_ok"`, because the finding is anchored on the member node and the sink derives the token from it',
    },
  ],
});
