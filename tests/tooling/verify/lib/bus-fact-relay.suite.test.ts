// The CONDITIONAL PUBLISHER: the live per-user bus reaches `bus.publish` two hops below the domain call
// sites, through a local `const event` whose initializer is a ConditionalExpression, and republishes a
// coarse form by indexing a totality table with the relayed discriminator. Each hop is a separate way for
// a producer fact to go silently blind, and the coarse table is a way for it to go falsely GREEN (indexing
// `Record<Union["type"], Union>` with an unnarrowed key types as EVERY member). These are fact-level
// controls: they read the shared fact's own census through a probe policy rather than any bus policy's
// verdict, so a change in either direction is visible here before it reaches a coverage id.
import { Project } from "ts-morph";
import type { BusFact } from "../../../../tooling/src/verify/contract/bus-fact.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { busDefinitionFact } from "../../../../tooling/src/verify/lib/bus-definition-fact.ts";
import { busProducerFact } from "../../../../tooling/src/verify/lib/bus-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/bus-fact-relay";

const UNION = `export type ProbeBusEvent =
  | { type: "chatsChanged"; chatId?: string }
  | { type: "settingsChanged" }
  | { type: "connectionsChanged" };
export const PROBE_BUS_EVENT_TYPES = {
  chatsChanged: true,
  settingsChanged: true,
  connectionsChanged: true,
} satisfies Record<ProbeBusEvent["type"], true>;
export const COARSE_PROBE_EVENT = {
  chatsChanged: { type: "chatsChanged" },
  settingsChanged: { type: "settingsChanged" },
  connectionsChanged: { type: "connectionsChanged" },
} satisfies Record<ProbeBusEvent["type"], ProbeBusEvent>;
`;

/** The live `bus-channel.ts` shape: an OVERLOADED exported factory whose returned object owns `publish`. */
const BUS_CHANNEL = `export interface BusChannel<Key, Event> {
  readonly publish: (key: Key, event: Event) => void;
  readonly subscribe: (key: Key) => AsyncIterable<Event>;
}
export interface FirehoseBusChannel<Key, Event> extends BusChannel<Key, Event> {
  readonly subscribeAll: (listener: (event: Event) => void) => () => void;
}
export function defineBusChannel<Key extends string, Event>(channelFor: (key: Key) => string): BusChannel<Key, Event>;
export function defineBusChannel<Key extends string, Event>(
  channelFor: (key: Key) => string,
  opts: { readonly firehose: true },
): FirehoseBusChannel<Key, Event>;
export function defineBusChannel<Key extends string, Event>(
  channelFor: (key: Key) => string,
  opts?: { readonly firehose: true },
): BusChannel<Key, Event> | FirehoseBusChannel<Key, Event> {
  const sinks: Record<string, ((event: Event) => void)[]> = {};
  const base: BusChannel<Key, Event> = {
    publish: (key, event) => {
      for (const sink of sinks[channelFor(key)] ?? []) {
        sink(event);
      }
    },
    subscribe: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }) as AsyncIterable<Event>,
  };
  if (opts?.firehose !== true) {
    return base;
  }
  return { ...base, subscribeAll: () => () => undefined };
}
`;

/** The live `user-events-bus.ts` shape, verbatim in structure: the conditional local event, the coarse
 *  republish through the totality table, and `publishUserEvent` forwarding its own parameter. */
const USER_EVENTS_BUS = `import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";
import { COARSE_PROBE_EVENT } from "../../../../contracts/src/user-bus/index.ts";
import { defineBusChannel } from "./bus-channel.ts";
import { silenceUserEvent } from "./quiet-fanout.ts";

const channelFor = (userId: string): string => \`user:\${userId}\`;
const bus = defineBusChannel<string, ProbeBusEvent>(channelFor);

export function publishUserEvent(userId: string, event: ProbeBusEvent): void {
  if (silenceUserEvent(userId, event.type, () => bus.publish(userId, COARSE_PROBE_EVENT[event.type]))) {
    return;
  }
  bus.publish(userId, event);
}

export function publishChatChanged(userId: string, chatId: string | undefined): void {
  const event: ProbeBusEvent = chatId === undefined ? { type: "chatsChanged" } : { type: "chatsChanged", chatId };
  publishUserEvent(userId, event);
}
`;

const QUIET_FANOUT = `export function silenceUserEvent(_userId: string, _type: string, _coalesce: () => void): boolean {
  return false;
}
`;

/** The two-hop domain caller: `emitChatChanged` never names the bus at all. */
const EMIT_CHAT_CHANGED = `import { publishChatChanged } from "../../transport/trpc/user-events-bus.ts";

export function createChatChangedEmitter(): (chatId: string, userIds: readonly string[]) => void {
  return (chatId, userIds) => {
    for (const userId of userIds) {
      publishChatChanged(userId, chatId);
    }
  };
}
`;

/** The ordinary injected-door producer, unchanged by any relay work — the control that the new reads do
 *  not replace the old ones. */
const SETTINGS_VERB = `import type { ProbeBusEvent } from "../../../../../contracts/src/user-bus/index.ts";

export function updateSettings(deps: { emitUserEvent: (userId: string, event: ProbeBusEvent) => void }, userId: string): void {
  deps.emitUserEvent(userId, { type: "settingsChanged" });
}
`;

const LIVE_FILES: Readonly<Record<string, string>> = {
  "packages/contracts/src/user-bus/index.ts": UNION,
  "packages/server/src/transport/trpc/bus-channel.ts": BUS_CHANNEL,
  "packages/server/src/transport/trpc/quiet-fanout.ts": QUIET_FANOUT,
  "packages/server/src/transport/trpc/user-events-bus.ts": USER_EVENTS_BUS,
  "packages/server/src/entry/compose/emit-chat-changed.ts": EMIT_CHAT_CHANGED,
  "packages/server/src/domain/settings/verbs/update.ts": SETTINGS_VERB,
};

function probePolicy(capture: (fact: BusFact) => void): GatePolicy {
  return defineGate({
    id: "bus-fact-relay-probe",
    family: "bus-fact",
    authority: "hard",
    severity: "error",
    population: { in: ["@contracts", "@server"], ext: ["ts", "tsx"] },
    analysis: "types",
    execution: "entire-population",
    facts: [busProducerFact],
    resources: [],
    message: "bus fact relay control",
    create: (ctx) => ({
      evaluate: () => {
        const fact = ctx.fact(busProducerFact);
        capture(fact);
        ctx.receipt({ kind: "population", source: "bus-fact-relay-probe", members: Math.max(fact.receipt.members, 1) });
      },
    }),
    mustFlag: [{ mode: "types", files: { "packages/server/src/flag.ts": "export const flag = 1;\n" }, why: "descriptor proof control" }],
    mustPass: [{ mode: "types", files: { "packages/server/src/pass.ts": "export const pass = 1;\n" }, why: "descriptor proof control" }],
  });
}

interface FactRun {
  readonly fact: BusFact;
  readonly result: ReturnType<typeof runPolicyPass>;
}

/** Fixture specifiers that reach NOTHING. A dangling relative import makes every identity read pass by
 *  fail-closure while the suite reports green, so this is asserted for EVERY fixture map the spec runs —
 *  not only the shared one. It has now caught two of this spec's own fixtures: five `../` from `trpc/`,
 *  and five from `domain/settings/`, the second of which made the homonym-door row hold under a
 *  name-check mutant of the door it exists to pin. */
function danglingSpecifiers(project: Project): readonly string[] {
  return project
    .getSourceFiles()
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

/** BUDGETS, audited 2026-09-06 with the sibling spec: every test here pays exactly ONE project and ONE
 *  policy pass, so adding a row adds a TEST (with its own budget) rather than more work inside an existing
 *  one. That is why these rows keep the scaled default while `bus-pair.suite.test.ts` must declare its own — its
 *  controls quantify over the whole family's proof set inside a single test, and growth there concentrates
 *  instead of spreading. If a row here ever loops over fixtures, it owes an explicit `scaledBudget` too. */
function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const dangling = danglingSpecifiers(project);
  if (dangling.length > 0) {
    throw new Error(`fixture import specifiers resolve to nothing: ${dangling.join("; ")}`);
  }
  return project;
}

function runFact(files: Readonly<Record<string, string>>): FactRun {
  let captured: BusFact | undefined;
  const policy = probePolicy((fact) => {
    captured = fact;
  });
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  if (captured === undefined) {
    throw new Error(`the bus fact was never delivered: ${JSON.stringify(result.factErrors)} ${JSON.stringify(result.toolErrors)}`);
  }
  return { fact: captured, result };
}

function emittedMembers(fact: BusFact, exportName: string): readonly string[] {
  const bus = fact.buses.find((record) => record.union.exportName === exportName);
  if (bus === undefined) {
    throw new Error(`the fact carries no bus named ${exportName}`);
  }
  return [...new Set(bus.emitters.map(({ member }) => member.name))].toSorted();
}

function emitterAnchors(fact: BusFact, exportName: string, member: string): readonly string[] {
  const bus = fact.buses.find((record) => record.union.exportName === exportName);
  return (bus?.emitters ?? []).filter((emitter) => emitter.member.name === member).map(({ anchor }) => `${anchor.path}:${anchor.line}`);
}

test("every fixture specifier resolves — and the check that says so REFUSES a planted dangling one", () => {
  // `runFact` applies this to every fixture map in the file; the shared map is asserted by name here.
  expect(() => projectOf(LIVE_FILES)).not.toThrow();
  // The positive control: the same reader must REFUSE a fixture whose specifier climbs above the root.
  // Without it, "zero dangling specifiers" could equally mean the reader stopped working.
  expect(() =>
    projectOf({
      ...LIVE_FILES,
      "packages/server/src/domain/settings/planted.ts":
        'import type { ProbeBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\nexport type Alias = ProbeBusEvent;\n',
    }),
  ).toThrow(/resolve to nothing/u);
});

test("the conditional publisher, the two-hop relay and the coarse republish all resolve to their real members", () => {
  const { fact, result } = runFact(LIVE_FILES);
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(fact.unresolved).toEqual([]);
  expect(fact.status).toBe("ready");
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual(["chatsChanged", "settingsChanged"]);
});

test("the coarse totality table is not read as a producer of every member", () => {
  const { fact } = runFact(LIVE_FILES);
  expect(emittedMembers(fact, "ProbeBusEvent")).not.toContain("connectionsChanged");
});

test("the conditional publisher's emission anchors at its own source call, never at the union or the table", () => {
  const { fact } = runFact(LIVE_FILES);
  expect(emitterAnchors(fact, "ProbeBusEvent", "chatsChanged")).toContain("packages/server/src/transport/trpc/user-events-bus.ts:18");
});

const BASE_FILES: Readonly<Record<string, string>> = {
  "packages/contracts/src/user-bus/index.ts": UNION,
  "packages/server/src/transport/trpc/bus-channel.ts": BUS_CHANNEL,
};

test("a same-named publish on a receiver the checker cannot read is not the bus door", () => {
  const { fact } = runFact({
    ...BASE_FILES,
    "packages/server/src/domain/settings/decoy.ts":
      'declare const loose: any;\nexport function go(userId: string): void {\n  loose.publish(userId, { type: "chatsChanged" });\n}\n',
  });
  expect(fact.unresolved).toEqual([]);
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual([]);
});

test("a homonym channel mint declared in another module is not the bus door", () => {
  const { fact } = runFact({
    ...BASE_FILES,
    "packages/server/src/domain/settings/local-channel.ts":
      "export interface BusChannel<Key, Event> {\n  readonly publish: (key: Key, event: Event) => void;\n}\nexport function defineBusChannel<Key, Event>(): BusChannel<Key, Event> {\n  return { publish: () => undefined };\n}\n",
    "packages/server/src/domain/settings/decoy.ts":
      'import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";\nimport { defineBusChannel } from "./local-channel.ts";\nconst bus = defineBusChannel<string, ProbeBusEvent>();\nexport function go(userId: string): void {\n  bus.publish(userId, { type: "chatsChanged" });\n}\n',
  });
  expect(fact.unresolved).toEqual([]);
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual([]);
});

test("an argument typed as the WHOLE union is a forward: it proves no member and reds no fact", () => {
  const { fact } = runFact({
    ...BASE_FILES,
    "packages/server/src/transport/trpc/forward.ts":
      'import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";\nimport { defineBusChannel } from "./bus-channel.ts";\nconst bus = defineBusChannel<string, ProbeBusEvent>((key) => key);\ndeclare const whole: ProbeBusEvent;\nexport function go(userId: string): void {\n  bus.publish(userId, whole);\n}\n',
  });
  expect(fact.unresolved).toEqual([]);
  expect(fact.status).toBe("ready");
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual([]);
});

test("an unreadable argument at the PROVEN door is a fail-closed unresolved identity, never a silent skip", () => {
  const { fact } = runFact({
    ...BASE_FILES,
    "packages/server/src/transport/trpc/opaque.ts":
      'import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";\nimport { defineBusChannel } from "./bus-channel.ts";\nconst bus = defineBusChannel<string, ProbeBusEvent>((key) => key);\ndeclare const opaque: any;\nexport function go(userId: string): void {\n  bus.publish(userId, opaque);\n}\n',
  });
  expect(fact.unresolved.map(({ stage, reason }) => `${stage}/${reason}`)).toEqual(["emitter/missing"]);
  expect(fact.status).not.toBe("ready");
});

test("the republish translation is READ from the table, never assumed to be the identity", () => {
  const { fact } = runFact({
    ...BASE_FILES,
    "packages/server/src/transport/trpc/skewed.ts":
      'import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";\nimport { defineBusChannel } from "./bus-channel.ts";\nconst bus = defineBusChannel<string, ProbeBusEvent>((key) => key);\nconst SKEWED = {\n  chatsChanged: { type: "settingsChanged" },\n  settingsChanged: { type: "settingsChanged" },\n  connectionsChanged: { type: "settingsChanged" },\n} satisfies Record<ProbeBusEvent["type"], ProbeBusEvent>;\nexport function republish(userId: string, event: ProbeBusEvent): void {\n  bus.publish(userId, SKEWED[event.type]);\n}\nexport function go(userId: string): void {\n  republish(userId, { type: "chatsChanged" });\n}\n',
  });
  expect(fact.unresolved).toEqual([]);
  // The caller proves `chatsChanged`; the table republishes `settingsChanged`. Assuming an identity table
  // would credit the wrong member — the exact false-green shape the coarse fan would hide.
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual(["settingsChanged"]);
});

// ── the ALIASED DOOR ──────────────────────────────────────────────────────────────────────────────────
// `emitterSink` used to RETURN at an Identifier callee, so a door held one binding later was a silent
// non-producer. The tree had a real one (`const emit = deps.emit` in domain/chat/verbs/edit.ts), but a
// live anchor is not a pin: refactor that call site and the door regresses green with nothing to say so.
// These four rows are the pin — one credit and three near-misses that share its exact spelling.

const ALIAS_CHANNEL = `import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";
import { defineBusChannel } from "./bus-channel.ts";
const bus = defineBusChannel<string, ProbeBusEvent>((key) => key);
const publish = bus.publish;
export function go(userId: string): void {
  publish(userId, { type: "chatsChanged" });
}
`;

test("a channel publisher held in a const alias credits the member — the door is the member, not the spelling", () => {
  const { fact } = runFact({ ...BASE_FILES, "packages/server/src/transport/trpc/aliased.ts": ALIAS_CHANNEL });
  expect(fact.unresolved).toEqual([]);
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual(["chatsChanged"]);
});

test("an alias of a same-named member on an unrelated receiver credits nothing", () => {
  const { fact } = runFact({
    ...BASE_FILES,
    "packages/server/src/domain/settings/logger-alias.ts":
      'import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";\ndeclare const logger: { publish: (key: string, event: ProbeBusEvent) => void };\nconst p = logger.publish;\nexport function go(userId: string): void {\n  p(userId, { type: "chatsChanged" });\n}\n',
  });
  expect(fact.unresolved).toEqual([]);
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual([]);
});

test("a local function named publish credits nothing", () => {
  const { fact } = runFact({
    ...BASE_FILES,
    "packages/server/src/domain/settings/local-fn.ts":
      'import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";\nfunction publish(_userId: string, _event: ProbeBusEvent): void {}\nexport function go(userId: string): void {\n  publish(userId, { type: "chatsChanged" });\n}\n',
  });
  expect(fact.unresolved).toEqual([]);
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual([]);
});

test("an EMPTY census is DELIVERED to its consumers — the provider receipt is not the accuser", () => {
  // THE #1955 REGRESSION ROW. The provider receipt used to carry the census counts, and
  // `factReceiptFailures` refuses `members === 0` / `unresolved > 0` and withholds every consumer BEFORE
  // `evaluate`. So the one corpus `bus-fact-health` exists to accuse — an authored tree with no bus union
  // at all — could never reach the policy that accuses it: its `mustFlag[0]` read as a FACT TOOL ERROR and
  // `pnpm check:policy-conformance` sat at exit 2, unusable as a commit bar. The census's emptiness is the
  // fact's own modelled VALUE; it is delivered, and `bus-fact-health` (hard/error) is what reports it.
  const { fact, result } = runFact({ "packages/server/src/domain/settings/plain.ts": "export const plain = 1;\n" });
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(fact.status).toBe("empty");
  expect(fact.receipt.members).toBe(0);
  expect(fact.unresolved.map(({ stage, reason }) => `${stage}/${reason}`)).toEqual(["union/missing"]);
});

test("a provider that can look at NOTHING still refuses — and withholds only ITS OWN consumers", () => {
  // THE PLANTED CONTROL for the row above: moving the census counts out of the receipt must not disarm
  // blindness. It does not — it moves the refusal one phase EARLIER. A corpus holding only a client file
  // admits zero paths for the producer fact's `@contracts`/`@server` population, so `bus-producers` refuses
  // at its population phase and every policy declaring it is withheld, while `bus-definitions` — whose
  // population does reach that file — runs to success and its consumer evaluates. Per-provider failure, not
  // a family-wide blackout.
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/packages/client/src/x.ts`, "export const x = 1;\n");
  const producerProbe = defineGate({
    id: "bus-producer-wide-probe",
    family: "bus-fact",
    authority: "hard",
    severity: "error",
    population: { in: ["@contracts", "@client", "@server"], ext: ["ts", "tsx"] },
    analysis: "types",
    execution: "entire-population",
    facts: [busProducerFact],
    resources: [],
    message: "bus producer wide probe",
    create: (ctx) => ({
      evaluate: () => {
        ctx.fact(busProducerFact);
        ctx.receipt({ kind: "population", source: "bus-producer-wide-probe", members: 1 });
      },
    }),
    mustFlag: [{ mode: "types", files: { "packages/server/src/flag.ts": "export const flag = 1;\n" }, why: "descriptor proof control" }],
    mustPass: [{ mode: "types", files: { "packages/server/src/pass.ts": "export const pass = 1;\n" }, why: "descriptor proof control" }],
  });
  const defProbe = defineGate({
    id: "bus-definition-probe",
    family: "bus-definition",
    authority: "hard",
    severity: "error",
    population: { in: ["@contracts", "@client", "@server"], ext: ["ts", "tsx"] },
    analysis: "types",
    execution: "entire-population",
    facts: [busDefinitionFact],
    resources: [],
    message: "bus definition probe",
    create: (ctx) => ({
      evaluate: () => {
        ctx.fact(busDefinitionFact);
        ctx.receipt({ kind: "population", source: "bus-definition-probe", members: 1 });
      },
    }),
    mustFlag: [{ mode: "types", files: { "packages/server/src/flag.ts": "export const flag = 1;\n" }, why: "descriptor proof control" }],
    mustPass: [{ mode: "types", files: { "packages/server/src/pass.ts": "export const pass = 1;\n" }, why: "descriptor proof control" }],
  });
  const result = runPolicyPass({
    knownPolicies: [producerProbe, defProbe],
    policies: [producerProbe, defProbe],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.factErrors.map(({ factId, phase }) => `${factId}/${phase}`)).toEqual(["bus-producers/population"]);
  expect(result.facts.map(({ id, status }) => `${id}/${status}`)).toEqual(["bus-definitions/success", "bus-producers/incomplete"]);
  expect(result.policies.map(({ id, owner }) => `${id}/${owner.status}`)).toEqual(["bus-definition-probe/success", "bus-producer-wide-probe/incomplete"]);
  expect(result.toolErrors[0]?.message).toContain("declared fact failed: bus-producers");
});

test("a local arrow bound to the name publish credits nothing", () => {
  const { fact } = runFact({
    ...BASE_FILES,
    "packages/server/src/domain/settings/local-arrow.ts":
      'import type { ProbeBusEvent } from "../../../../contracts/src/user-bus/index.ts";\nconst publish = (_userId: string, _event: ProbeBusEvent): void => undefined;\nexport function go(userId: string): void {\n  publish(userId, { type: "chatsChanged" });\n}\n',
  });
  expect(fact.unresolved).toEqual([]);
  expect(emittedMembers(fact, "ProbeBusEvent")).toEqual([]);
});
