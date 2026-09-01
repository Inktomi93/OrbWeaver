// Gate: agent-bridge-lock (#894) — `globalThis.__orb` has one production install door, and that door
// retains the compiler-owned exhaustive capability and ring registries. Runtime answerability belongs
// to the mounted CT; this gate deliberately does NOT classify observer-shaped modules (owner ruling).
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

const BRIDGE = "packages/client/src/lib/agent-bridge.ts";
const CT = "tests/client/lib/agent-bridge.ct.tsx";
const CAPABILITY_TYPE = "Record<keyof OrbDebugHandle, string>";
const RING_TYPE = 'Record<OrbRingName, Omit<OrbRingMetadata, "name">>';

interface AssignmentHit {
  readonly file: string;
  readonly line: number;
}

interface GateState {
  assignments: AssignmentHit[];
  bridgeSeen: boolean;
  capabilityRegistry: boolean;
  ringRegistry: boolean;
  memberProof: boolean;
  ringProof: boolean;
}

const state: GateState = {
  assignments: [],
  bridgeSeen: false,
  capabilityRegistry: false,
  ringRegistry: false,
  memberProof: false,
  ringProof: false,
};

function relOf(sf: SourceFile): string {
  const path = sf.getFilePath().replace(/\\/gu, "/");
  for (const anchor of ["/packages/", "/tests/"]) {
    const index = path.indexOf(anchor);
    if (index !== -1) {
      return path.slice(index + 1);
    }
  }
  return path;
}

function isOrbAssignment(node: Node): boolean {
  if (!Node.isBinaryExpression(node) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return false;
  }
  const left = node.getLeft();
  if (Node.isPropertyAccessExpression(left)) {
    return left.getName() === "__orb" && ["globalThis", "window"].includes(left.getExpression().getText());
  }
  if (!(Node.isElementAccessExpression(left) && ["globalThis", "window"].includes(left.getExpression().getText()))) {
    return false;
  }
  const argument = left.getArgumentExpression();
  return argument !== undefined && Node.isStringLiteral(argument) && argument.getLiteralText() === "__orb";
}

function hasRegistry(sf: SourceFile, name: string, typeText: string): boolean {
  const initializer = sf.getVariableDeclaration(name)?.getInitializer();
  if (initializer === undefined || !Node.isSatisfiesExpression(initializer)) {
    return false;
  }
  return initializer.getTypeNode()?.getText() === typeText;
}

function hasRegisteredProof(sf: SourceFile, marker: string): boolean {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== "test") {
      continue;
    }
    const statement = call.getParent();
    if (!(Node.isExpressionStatement(statement) && Node.isSourceFile(statement.getParent()))) {
      continue;
    }
    const [title, body] = call.getArguments();
    if (!(Node.isStringLiteral(title) && (Node.isArrowFunction(body) || Node.isFunctionExpression(body)))) {
      continue;
    }
    if (statement.getLeadingCommentRanges().some((comment) => comment.getText().match(new RegExp(`^// ${marker}:\\s*\\S.+$`, "u")) !== null)) {
      return true;
    }
  }
  return false;
}

function report(ctx: Parameters<NonNullable<GateDescriptor["run"]>>[0], message: string, file = BRIDGE, line = 1): void {
  ctx.report({ file, line, column: 0, message });
}

export const gate: GateDescriptor = {
  name: "agent-bridge-lock",
  docRow: "Core-Enforcement-Active-Gates.md (#894)",
  status: "active",
  scopeSafety: "whole-project",
  message: "the dev introspection bridge lost its one-door or exhaustive-registry lock (#894); packages/client/src/lib/agent-bridge.ts",
  fix: "install __orb only in agent-bridge.ts; retain the exhaustive capability/ring satisfies registries and both mounted CT proof markers",
  scanRoot: (path) => path.startsWith("packages/client/src/") || path === CT,
  begin: () => {
    state.assignments = [];
    state.bridgeSeen = false;
    state.capabilityRegistry = false;
    state.ringRegistry = false;
    state.memberProof = false;
    state.ringProof = false;
  },
  visitFile: (sf) => {
    const rel = relOf(sf);
    if (rel.startsWith("packages/client/src/")) {
      for (const node of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
        if (isOrbAssignment(node)) {
          state.assignments.push({ file: rel, line: node.getStartLineNumber() });
        }
      }
    }
    if (rel === BRIDGE) {
      state.bridgeSeen = true;
      state.capabilityRegistry = hasRegistry(sf, "ORB_DEBUG_CAPABILITIES", CAPABILITY_TYPE);
      state.ringRegistry = hasRegistry(sf, "ORB_RING_REGISTRY", RING_TYPE);
    }
    if (rel === CT) {
      state.memberProof = hasRegisteredProof(sf, "@agent-bridge-proof");
      state.ringProof = hasRegisteredProof(sf, "@agent-ring-proof");
    }
  },
  run: (ctx) => {
    if (!state.bridgeSeen) {
      report(ctx, `${BRIDGE} was not loaded — the sanctioned bridge door is absent`);
      return;
    }
    const sanctioned = state.assignments.filter((hit) => hit.file === BRIDGE);
    const rogue = state.assignments.filter((hit) => hit.file !== BRIDGE);
    if (sanctioned.length !== 1) {
      report(ctx, `expected exactly one globalThis.__orb assignment in ${BRIDGE}, found ${sanctioned.length.toString()}`);
    }
    for (const hit of rogue) {
      report(ctx, `production __orb assignment outside the sanctioned bridge door: ${hit.file}`, hit.file, hit.line);
    }
    if (!state.capabilityRegistry) {
      report(ctx, `ORB_DEBUG_CAPABILITIES must satisfy ${CAPABILITY_TYPE}`);
    }
    if (!state.ringRegistry) {
      report(ctx, `ORB_RING_REGISTRY must satisfy ${RING_TYPE}`);
    }
    if (!state.memberProof) {
      report(ctx, "the mounted CT owes a reasoned @agent-bridge-proof marker", CT);
    }
    if (!state.ringProof) {
      report(ctx, "the mounted CT owes a reasoned @agent-ring-proof marker", CT);
    }
  },
  mustFlag: [
    {
      files: {
        [BRIDGE]: `interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\n`,
        "packages/client/src/lib/rogue.ts": 'window["__orb"] = globalThis.__orb;\n',
        [CT]: '// @agent-bridge-proof: mounted members answer\ntest("members", () => {});\n// @agent-ring-proof: resets are isolated\ntest("rings", () => {});\n',
      },
      expect: { messageIncludes: "outside the sanctioned bridge door" },
      why: "a second production installer recreates the parallel-bridge drift this lock exists to prevent",
    },
    {
      files: {
        [BRIDGE]: `interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" };\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\n`,
        [CT]: '// @agent-bridge-proof: mounted members answer\ntest("members", () => {});\n// @agent-ring-proof: resets are isolated\ntest("rings", () => {});\n',
      },
      expect: { messageIncludes: "ORB_DEBUG_CAPABILITIES must satisfy" },
      why: "a hand-maintained capability object can omit a newly added bridge member without a compiler error",
    },
    {
      files: {
        [BRIDGE]: `interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} };\nglobalThis.__orb = {} as OrbDebugHandle;\n`,
        [CT]: '// @agent-bridge-proof: mounted members answer\ntest("members", () => {});\n// @agent-ring-proof: resets are isolated\ntest("rings", () => {});\n',
      },
      expect: { messageIncludes: "ORB_RING_REGISTRY must satisfy" },
      why: "a hand-maintained ring object can omit a newly added evidence source without a compiler error",
    },
    {
      files: {
        [BRIDGE]: `interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\n`,
        [CT]: "// @agent-bridge-proof: detached comment theater\n// @agent-ring-proof: detached comment theater\nexport const proof = 1;\n",
      },
      expect: { messageIncludes: "mounted CT owes a reasoned @agent-bridge-proof marker" },
      why: "proof-marker comments do not count unless they directly govern executable top-level CT registrations",
    },
  ],
  mustPass: [
    {
      files: {
        [BRIDGE]: `interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\n`,
        [CT]: '// @agent-bridge-proof: mounted members answer\ntest("members", () => {});\n// @agent-ring-proof: resets are isolated\ntest("rings", () => {});\n',
      },
      why: "the one sanctioned assignment, two exhaustive registries, and both runtime proof classes are present",
    },
  ],
};
