// Test determinism includes testkit: ambient clocks/entropy and unseeded business mints are forbidden.
// Canonical floor origin readers distinguish aliases and seeded production mints from lookalikes.
// Singleton: timer and seeded-business-mint provenance share this population and authority.
// Native restrictions own source-string spellings and dotted fixed waits; semantic defaults and provenance remain here.

import { AMBIENT_SOURCE_PATTERNS as BANNED } from "@orb/tooling/floor/testing/ambient-source-patterns";
import type { CallExpression, Node as MorphNode, NewExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { CallableInvocation, ReferenceFact, ReferenceOrigin } from "../../floor/code-facts/reference-fact-contract.ts";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { SealedOriginVerdict } from "../contract/sealed-origin.ts";
import { invocationOriginServices, requiredInvocationFact } from "../lib/native-invocation.ts";
import { bindsProvenNonModuleDeclarations, classifyOriginRefusal, originRefusalDeclarations, referenceNamesExport } from "../lib/origin-verdict.ts";
import { readPackageExportOrigin } from "../lib/project-home-origin.ts";
import { readSealedOrigin } from "../lib/sealed-origin.ts";

const INVOCATION_PLAN: InventoryInvocationPlan = {
  mode: "invocation",
  facets: ["module"],
  arguments: [
    { index: 0, facets: ["module", "global", "binding", "undefined"] },
    { index: 1, facets: ["module", "global", "binding", "undefined"] },
  ],
};
const MEMBER_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["global"], arguments: [] };

const KIT_MINTS = new Set(["mintTypeId", "newId", "createIdSource"]);
const VENDOR_MINTS = new Set(["typeid", "typeidUnboxed"]);
const CRYPTO_MINTS = new Set(["randomUUID"]);

function ambientOriginToken(origin: ReferenceOrigin): string | undefined {
  if (origin.kind !== "global") {
    return;
  }
  const { globalName, memberPath } = origin;
  const path = [globalName, ...memberPath].join(".");
  return ["Date.now", "Math.random", "crypto.randomUUID", "performance.now", "performance.timeOrigin", "process.hrtime", "process.hrtime.bigint"].includes(path)
    ? path.replace(".bigint", "")
    : undefined;
}

function ambientToken(node: MorphNode, evidence: NativeInvocationEvidence): string | undefined {
  const origin = requiredInvocationFact(evidence.globals, node);
  return origin.kind === "resolved" ? ambientOriginToken(origin.value) : undefined;
}

function canUseAmbientGenerator(node: MorphNode, evidence: NativeInvocationEvidence): boolean {
  const binding = requiredInvocationFact(evidence.callableBindings, node);
  const services = invocationOriginServices(evidence);
  if (binding.kind === "unresolved" && ["write", "cycle", "ambiguous"].includes(binding.reason)) {
    throw new Error(`test-determinism cannot prove id generator capture: ${binding.detail}`);
  }
  const boundAmbient =
    binding.kind === "resolved" &&
    (ambientOriginToken(binding.value.target) !== undefined ||
      readPackageExportOrigin(binding.value.callee, ["typeid-js"], VENDOR_MINTS, services).verdict === "home");
  return (
    requiredInvocationFact(evidence.undefinedMembers, node) ||
    readPackageExportOrigin(node, ["typeid-js"], VENDOR_MINTS, services).verdict === "home" ||
    ambientToken(node, evidence) !== undefined ||
    boundAmbient
  );
}

function rejectUnreadableMint(callee: MorphNode, kit: SealedOriginVerdict, evidence: NativeInvocationEvidence): void {
  if (
    kit.kind === "unresolved" &&
    [...KIT_MINTS].some((name) => referenceNamesExport(callee, name, invocationOriginServices(evidence))) &&
    classifyOriginRefusal(kit.fact.reason, callee, evidence.declarations) === "unreadable"
  ) {
    throw new Error("test-determinism cannot establish the canonical id mint behind this invocation");
  }
}

function mintToken(invocation: CallableInvocation, evidence: NativeInvocationEvidence): string | undefined {
  const { target, callee } = invocation;
  const services = invocationOriginServices(evidence);
  if (target.kind !== "module") {
    return;
  }
  const kit = readSealedOrigin(callee, { pathInfix: "/packages/kit/src/ids/", exportedNames: KIT_MINTS }, services.moduleOrigin);
  rejectUnreadableMint(callee, kit, evidence);
  const nativeKit =
    target.canonical.kind === "project" &&
    target.canonical.sourceFile.getFilePath().includes("/packages/kit/src/ids/") &&
    KIT_MINTS.has(target.canonical.exportedName) &&
    target.memberPath.length === 0;
  if (nativeKit) {
    if (invocation.arguments.kind === "unresolved") {
      throw new Error(`test-determinism cannot prove id mint arguments: ${invocation.arguments.detail}`);
    }
    const name = target.canonical.exportedName;
    const generator = invocation.arguments.value[name === "mintTypeId" ? 1 : 0];
    return generator === undefined || canUseAmbientGenerator(generator, evidence) ? name : undefined;
  }
  const vendor = readPackageExportOrigin(callee, ["typeid-js"], VENDOR_MINTS, services);
  if (vendor.verdict === "home") {
    return vendor.exportedName ?? undefined;
  }
  return readPackageExportOrigin(callee, ["node:crypto", "crypto"], CRYPTO_MINTS, services).verdict === "home" ? "randomUUID" : undefined;
}

function invocationToken(node: CallExpression | NewExpression, evidence: NativeInvocationEvidence): string | undefined {
  const callee = node.getExpression();
  const invocation = evidence.invocation;
  if (invocation === undefined) {
    throw new Error("test-determinism native invocation capture is unavailable");
  }
  if (invocation.kind === "unresolved" && "capture" in invocation) {
    throw new Error(`test-determinism cannot prove native bound callable capture: ${invocation.detail}`);
  }
  if (Node.isNewExpression(node)) {
    return dateClockToken(invocation);
  }
  const token =
    invocation.kind === "resolved" && invocation.value.invocation !== "bind"
      ? (dateClockToken(invocation) ??
        ambientOriginToken(invocation.value.target) ??
        mintToken(invocation.value, evidence) ??
        fakeTimerToken(invocation.value, evidence))
      : undefined;
  if (token !== undefined) {
    return token;
  }
  const fakeTimers = readPackageExportOrigin(callee, ["vitest"], new Set(["useFakeTimers"]), invocationOriginServices(evidence));
  if (fakeTimers.verdict === "home") {
    return "vi.useFakeTimers";
  }
  // Syntax-only fixture references have no ambient declarations; keep their existing refusal surface.
  const syntax = `${callee.getText()}(`;
  const banned = BANNED.find(({ re, invocationFallback }) => invocationFallback !== "native" && re.test(syntax));
  return banned !== undefined &&
    (!bindsProvenNonModuleDeclarations(originRefusalDeclarations(callee, evidence.declarations)) || banned.invocationFallback === "always")
    ? banned.re.exec(syntax)?.[0].replace(/[()]+$/u, "")
    : undefined;
}

function dateClockToken(invocation: ReferenceFact<CallableInvocation>): string | undefined {
  if (invocation.kind !== "resolved") {
    return;
  }
  const origin = invocation.value.target;
  if (origin.kind !== "global" || origin.globalName !== "Date" || origin.memberPath.length > 0) {
    return;
  }
  if (invocation.value.invocation === "call") {
    return "Date";
  }
  const arguments_ = invocation.value.arguments;
  if (arguments_.kind === "unresolved") {
    throw new Error(`test-determinism cannot prove Date constructor arguments: ${arguments_.detail}`);
  }
  return arguments_.value.length === 0 ? "new Date" : undefined;
}

function fakeTimerToken(invocation: CallableInvocation, evidence: NativeInvocationEvidence): string | undefined {
  return readPackageExportOrigin(invocation.callee, ["vitest"], new Set(["useFakeTimers"]), invocationOriginServices(evidence)).verdict === "home"
    ? "vi.useFakeTimers"
    : undefined;
}

function nodeToken(node: MorphNode, evidence: NativeInvocationEvidence): string | undefined {
  if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    return ambientToken(node, evidence) === "performance.timeOrigin" ? "performance.timeOrigin" : undefined;
  }
  return Node.isCallExpression(node) || Node.isNewExpression(node) ? invocationToken(node, evidence) : undefined;
}

function reportInvocationNode(node: MorphNode, evidence: NativeInvocationEvidence, ctx: GatePolicyContext): void {
  const token = nodeToken(node, evidence);
  if (token !== undefined) {
    const offset = node.getText().indexOf(token);
    const position = offset < 0 ? {} : { token, offset };
    ctx.report.node(node, {
      ...position,
      message: `ambient nondeterminism: ${token === "new Date" ? "new Date()" : token} — inject the frozen clock / seeded ids via the fixture seam (Spine-Testing.md §3).`,
    });
  }
}

export const gate = defineGate({
  id: "test-determinism",
  family: "test-determinism",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@tests"], notUnder: ["tests/e2e/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    "ambient nondeterminism in a test (Date.now/new Date()/Math.random/randomUUID/unseeded mintTypeId/newId/typeid/performance.now/process.hrtime/performance.timeOrigin/vi.useFakeTimers) — inject the frozen clock + seeded ids via the fixture seam (docs/law/Spine-Testing.md §3).",
  fix:
    "inject the frozen clock (tests/support/iso/clock.ts) + seeded ids (tests/support/iso/ids.ts) through the " +
    "composition seam production uses. A deliberate site (a test whose SUBJECT is elapsed real time) is " +
    "waived with `@orb-waive test-determinism(<position>): <reason>` on the line IMMEDIATELY above the " +
    "call, where <position> is the matched banned spelling trimmed of its call parens (`Date.now`, " +
    "`process.hrtime`, `performance.timeOrigin`).",
  create: (ctx) => {
    const pending: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression, SyntaxKind.NewExpression, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node) => {
            pending.push(node);
            if (ctx.nativeTypes === undefined) {
              throw new Error("native invocation context is unavailable");
            }
            ctx.nativeTypes.request({
              kind: "invocation-evidence",
              nodes: [node],
              plan: Node.isCallExpression(node) || Node.isNewExpression(node) ? INVOCATION_PLAN : MEMBER_PLAN,
            });
          },
        },
      ],
      evaluate: (): void => {
        if (pending.length === 0) {
          return;
        }
        if (ctx.nativeTypes === undefined) {
          throw new Error("native invocation context is unavailable");
        }
        for (const node of pending) {
          const plan = Node.isCallExpression(node) || Node.isNewExpression(node) ? INVOCATION_PLAN : MEMBER_PLAN;
          const evidence = requiredInvocationFact(ctx.nativeTypes.invocationEvidence([node], plan), node);
          reportInvocationNode(node, evidence, ctx);
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/kit/src/ids/index.ts": "export function mintTypeId(prefix: string, generate?: (prefix: string) => string): string { return ''; }",
        "node_modules/typeid-js/index.d.ts": "export declare function typeidUnboxed(prefix: string): string;",
        "tests/support/iso/ambient-generator.ts":
          "import { mintTypeId } from '../../../packages/kit/src/ids/index.ts'; import { typeidUnboxed as generate } from 'typeid-js'; export const value = mintTypeId('chat', generate);",
      },
      expect: { count: 1, messageIncludes: "mintTypeId" },
      why: "an explicit generator that is canonically ambient is not a seeded mint",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/ids/index.ts":
          "export function newId(generate?: (prefix: string) => string): string { return ''; } export function createIdSource(generate?: (prefix: string) => string): object { return {}; }",
        "tests/support/iso/mints.ts":
          "import * as ids from '../../../packages/kit/src/ids/index.ts'; export const one = ids.newId(); export const two = ids.createIdSource(undefined);",
      },
      expect: { count: 2, messageIncludes: "ambient nondeterminism" },
      why: "prefixless mints and default id sources are ambient even through a namespace and explicit undefined",
    },
    {
      mode: "types",
      files: { "tests/support/iso/ambient.ts": "export const value = Date['now']();" },
      expect: { count: 1, messageIncludes: "Date.now" },
      why: "testkit is judged and bracket access retains ambient identity",
    },
    {
      mode: "types",
      files: { "tests/support/iso/alias.ts": "const { random: draw } = Math; export const value = draw();" },
      expect: { count: 1, messageIncludes: "Math.random" },
      why: "a renamed destructured ambient function has the same identity",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/ids/index.ts": "export function mintTypeId(prefix: string, generate?: (prefix: string) => string): string { return ''; }",
        "tests/support/iso/mint.ts": "import { mintTypeId as mint } from '../../../packages/kit/src/ids/index.ts'; export const value = mint('chat');",
      },
      expect: { count: 1, messageIncludes: "mintTypeId" },
      why: "a renamed canonical business mint without its generator is ambient",
    },
    {
      mode: "types",
      files: {
        "node_modules/typeid-js/index.d.ts": "export declare function typeid(prefix?: string): string;",
        "tests/support/iso/vendor.ts": "import { typeid as mint } from 'typeid-js'; export const value = mint('chat');",
      },
      expect: { count: 1, messageIncludes: "typeid" },
      why: "a renamed vendor mint reads ambient entropy despite the local spelling",
    },
    {
      mode: "types",
      files: { "tests/server/x.test.ts": "export const t = Date.now();\n" },
      expect: { count: 1, messageIncludes: "Date.now" },
      why: "an ambient Date.now() in a test — inject the frozen clock (§3)",
    },
    {
      mode: "types",
      files: { "tests/server/newdate.test.ts": "export const t = new Date();\n" },
      expect: { count: 1, messageIncludes: "new Date()" },
      why: "a no-arg new Date() — its own BANNED entry, distinct message + regex arm",
    },
    {
      mode: "types",
      files: { "tests/server/rand.test.ts": "export const r = Math.random();\n" },
      expect: { count: 1, messageIncludes: "Math.random" },
      why: "Math.random() — its own BANNED entry (member call biome can't ban)",
    },
    {
      mode: "types",
      files: { "tests/server/uuid.test.ts": "export const id = crypto.randomUUID();\n" },
      expect: { count: 1, messageIncludes: "randomUUID" },
      why: "a .randomUUID() call — its own BANNED entry (unseeded id)",
    },
    {
      mode: "types",
      files: { "tests/server/perf.test.ts": "export const p = performance.now();\n" },
      expect: { count: 1, messageIncludes: "performance.now" },
      why: "performance.now() — its own BANNED entry (ambient clock)",
    },
    {
      mode: "types",
      files: { "tests/server/parked.test.ts": "// export const t = Date.now();\nexport const t = Date.now();\n" },
      expect: { count: 1, line: 2 },
      why: "the LINE arithmetic after blanking: only the real call on line 2 fires, and it still reports line 2 (blanking preserves length + newlines, so a comment above a violation cannot shift it). The PARKED call on line 1 is not this gate's business — `commented-code` owns it and REDs it, receipted on a planted tests/ probe 2026-08-17",
    },
    {
      mode: "types",
      files: { "tests/server/hrtime.test.ts": "export const t = process.hrtime();\n" },
      expect: { count: 1, messageIncludes: "process.hrtime" },
      why: "#831 — process.hrtime() is an ambient monotonic clock the old regex did not recognise; four real sites routed around the gate through this spelling before the class was widened",
    },
    {
      mode: "types",
      files: { "tests/server/hrtime-bigint.test.ts": "export const t = process.hrtime.bigint();\n" },
      expect: { count: 1, messageIncludes: "process.hrtime" },
      why: "#831 — process.hrtime.bigint() is the same ambient clock family; one member match (\\bprocess\\.hrtime\\b) covers both call forms, no separate BANNED entry needed",
    },
    {
      mode: "types",
      files: { "tests/server/time-origin.test.ts": "export const t = performance.timeOrigin;\n" },
      expect: { count: 1, messageIncludes: "performance.timeOrigin" },
      why: "#831 — performance.timeOrigin is an ambient clock property (not a call); the old performance.now()-only regex missed it and a guest-realm probe string spelled it undetected",
    },
    {
      mode: "types",
      files: { "tests/server/faketimers.test.ts": "vi.useFakeTimers();\nexport const t = 1;\n" },
      expect: { count: 1, messageIncludes: "vi.useFakeTimers" },
      why: "#2384 — vi.useFakeTimers() replaces the ambient clock globally rather than injecting through the composition seam; 9 post-law drifters found by the Qwen audit",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/kit/src/ids/index.ts": "export function mintTypeId(prefix: string, generate?: (prefix: string) => string): string { return ''; }",
        "tests/support/iso/wrapper.ts":
          "import { mintTypeId } from '../../../packages/kit/src/ids/index.ts'; declare const args:[string]; export const value = mintTypeId.apply(null, args);",
      },
      expect: { messageIncludes: "test-determinism cannot prove id mint arguments" },
      why: "native apply identity does not supply an unknown argument tuple; unreadability withholds rather than silently passing",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/kit/src/ids/index.ts":
          "export function newId(generate?: (prefix: string) => string): string { return ''; } export function createIdSource(generate?: (prefix: string) => string): object { return {}; }",
        "tests/support/iso/mints.ts":
          "import * as ids from '../../../packages/kit/src/ids/index.ts'; const next = (prefix: string): string => prefix; export const one = ids.newId(next); export const two = ids.createIdSource(next);",
      },
      why: "the same canonical prefixless and bound-source mints with an explicit deterministic generator are lawful",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/ids/index.ts": "export function mintTypeId(prefix: string, generate?: (prefix: string) => string): string { return ''; }",
        "tests/support/iso/bound.ts": "import { mintTypeId } from '../../../packages/kit/src/ids/index.ts'; export const mint = mintTypeId.bind(null);",
      },
      why: "bind construction does not mint an id",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/ids/index.ts": "export function mintTypeId(prefix: string, generate?: (prefix: string) => string): string { return ''; }",
        "tests/support/iso/bound-seeded.ts":
          "import { mintTypeId } from '../../../packages/kit/src/ids/index.ts'; const mint = mintTypeId.bind(null); const next = (prefix: string): string => prefix; export const value = mint('chat', next);",
      },
      why: "a later seeded bound invocation retains its native target and effective generator slot",
    },
    {
      mode: "types",
      files: { "tests/support/iso/lookalike.ts": "const mintTypeId = (): string => 'seed'; export const value = mintTypeId();" },
      why: "a deterministic local lookalike is not the canonical mint",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/ids/index.ts": "export function mintTypeId(prefix: string, generate?: (prefix: string) => string): string { return ''; }",
        "tests/support/iso/seeded.ts":
          "import { mintTypeId as mint } from '../../../packages/kit/src/ids/index.ts'; const next = (prefix: string): string => prefix; export const value = mint('chat', next);",
      },
      why: "the canonical production mint with an explicit generator is the lawful seeded seam",
    },
    {
      mode: "types",
      files: { "tests/support/iso/local.ts": "const Date = { now: (): number => 1 }; export const value = Date.now();" },
      why: "an authored deterministic lookalike is not the ambient clock",
    },
    {
      mode: "types",
      files: {
        "tests/server/marked.test.ts":
          "// @orb-waive test-determinism(performance.now): the SUBJECT is elapsed real time — ends when the assertion stops measuring wall-clock\nexport const p = performance.now();\n",
      },
      why: "#828 — the per-site escape this gate had no way to express: an ordinary finding now consumes the one central `@orb-waive <policy>(<position>): <reason>` marker on the line IMMEDIATELY above. Before #828 a test whose subject IS elapsed real time had to contort or change instrument; the marker is two-sided (central grant/marker reconciliation reds it the day the call goes away)",
    },
    {
      mode: "types",
      files: {
        "tests/server/marked-hrtime.test.ts":
          "// @orb-waive test-determinism(process.hrtime): monotonic elapsed-ms for a real-timer race; no frozen clock to inject\nexport const t = process.hrtime.bigint();\n",
      },
      why: "#831 — the same per-site escape for the newly-recognised process.hrtime family, proving the marker reaches it identically to performance.now()",
    },
    {
      mode: "types",
      files: { "tests/server/y.test.ts": "export const t = clock.now();\n" },
      why: "the injected clock (clock.now()) — no ambient nondeterminism, passes",
    },
    {
      mode: "types",
      files: {
        "tests/e2e/flow.test.ts": "export const t = Date.now();\n",
        "tests/server/companion.test.ts": "export const t = clock.now();\n",
      },
      why: "a banned call under e2e/ — real-browser full-stack is population-excluded, passes",
    },
    {
      mode: "types",
      files: { "tests/client/line-comment.ct.tsx": "// The frozen clock stands in for Date.now() here.\nexport const t = clock.now();\n" },
      why: "ISSUE #132, the founding defect: a LINE comment explaining the determinism fix names the banned call. Two home CTs were reworded to 'wall-clock read' to dodge this — the gate was wrong, not the comments",
    },
    {
      mode: "types",
      files: {
        "tests/client/block-comment.ct.tsx":
          "/** Seeded, never Math.random() / crypto.randomUUID().\n *  performance.now() is ambient too. */\nexport const id = seededId();\n",
      },
      why: "#132's block-comment half — a JSDoc naming three banned calls is prose, and ts-morph's leading-comment ranges cover it",
    },
    {
      mode: "types",
      files: { "tests/server/trailing-comment.test.ts": "export const t = clock.now(); // not Date.now(), which the gate bans\n" },
      why: "a TRAILING comment on a violation-free line — the blanker is span-based, not line-based, so the code half of the line is still scanned while the prose half is not",
    },
    {
      mode: "types",
      files: {
        "tests/server/faketimers-waived.test.ts":
          "// @orb-waive test-determinism(vi.useFakeTimers): legacy test not yet migrated to the composition seam; ends when this test adopts the frozen clock\nvi.useFakeTimers();\nexport const t = 1;\n",
      },
      why: "#2384 — the per-site escape for vi.useFakeTimers proving the marker reaches it identically to the other BANNED entries",
    },
  ],
});
