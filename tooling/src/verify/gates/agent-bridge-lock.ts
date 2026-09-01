// Gate: agent-bridge-lock (#894/#995) — `globalThis.__orb` has one install door, and production imports
// only the lean readiness home. The bridge shares that exact Promise/query and retains the compiler-owned
// exhaustive capability and ring registries. Runtime answerability belongs to the mounted CT.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

const BRIDGE = "packages/client/src/lib/agent-bridge.ts";
const READY = "packages/client/src/lib/app-ready-signal.ts";
const MAIN = "packages/client/src/main.tsx";
const ROUTER = "packages/client/src/routes/router.tsx";
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
  bridgeSharesReady: boolean;
  capabilityRegistry: boolean;
  mainSeen: boolean;
  mainUsesReadyHome: boolean;
  mainImportsBridge: boolean;
  readyImportsLean: boolean;
  readySeen: boolean;
  ringRegistry: boolean;
  routerSeen: boolean;
  routerUsesReadyHome: boolean;
  memberProof: boolean;
  ringProof: boolean;
}

const state: GateState = {
  assignments: [],
  bridgeSeen: false,
  bridgeSharesReady: false,
  capabilityRegistry: false,
  mainSeen: false,
  mainUsesReadyHome: false,
  mainImportsBridge: false,
  readyImportsLean: false,
  readySeen: false,
  ringRegistry: false,
  routerSeen: false,
  routerUsesReadyHome: false,
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

function hasNamedImports(sf: SourceFile, moduleSpecifier: string, names: readonly string[]): boolean {
  const imported = new Set(
    sf
      .getImportDeclarations()
      .filter((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier)
      .flatMap((declaration) => declaration.getNamedImports().map((named) => named.getName())),
  );
  return names.every((name) => imported.has(name));
}

function hasModuleImport(sf: SourceFile, moduleSpecifier: string): boolean {
  return sf.getImportDeclarations().some((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);
}

const READY_STATIC_IMPORTS = new Set(["@tanstack/react-query", "./boot-reads.ts", "./perf-marks.ts"]);

function hasLeanReadyImports(sf: SourceFile): boolean {
  const staticImports = sf.getImportDeclarations().every((declaration) => READY_STATIC_IMPORTS.has(declaration.getModuleSpecifierValue()));
  const reexportsNothing = sf.getExportDeclarations().every((declaration) => declaration.getModuleSpecifierValue() === undefined);
  const dynamicImportsNothing = sf.getDescendantsOfKind(SyntaxKind.CallExpression).every((call) => call.getExpression().getKind() !== SyntaxKind.ImportKeyword);
  return staticImports && reexportsNothing && dynamicImportsNothing;
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

const VALID_BOUNDARY_FIXTURES = {
  [READY]:
    'import type { QueryClient } from "@tanstack/react-query";\nimport { bootReads } from "./boot-reads.ts";\nimport { perfMeasureFromLoad } from "./perf-marks.ts";\nexport const appReady = Promise.resolve();\nexport const isAppReady = (): boolean => true;\nexport function installAppReadySignal(_client: QueryClient): void { void bootReads; void perfMeasureFromLoad; }\nexport interface RouteResolution {}\n',
  [MAIN]: 'import { installAppReadySignal } from "./lib/app-ready-signal.ts";\nvoid installAppReadySignal;\n',
  [ROUTER]: 'import type { RouteResolution } from "../lib/app-ready-signal.ts";\nexport const routeResolution = {} as RouteResolution;\n',
} as const;
const VALID_BRIDGE_IMPORT = 'import { appReady, isAppReady } from "./app-ready-signal.ts";\n';
const VALID_CT_FIXTURE =
  '// @agent-bridge-proof: mounted members answer\ntest("members", () => {});\n// @agent-ring-proof: resets are isolated\ntest("rings", () => {});\n';

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
    state.bridgeSharesReady = false;
    state.capabilityRegistry = false;
    state.mainSeen = false;
    state.mainUsesReadyHome = false;
    state.mainImportsBridge = false;
    state.readyImportsLean = false;
    state.readySeen = false;
    state.ringRegistry = false;
    state.routerSeen = false;
    state.routerUsesReadyHome = false;
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
      state.bridgeSharesReady = hasNamedImports(sf, "./app-ready-signal.ts", ["appReady", "isAppReady"]);
      state.capabilityRegistry = hasRegistry(sf, "ORB_DEBUG_CAPABILITIES", CAPABILITY_TYPE);
      state.ringRegistry = hasRegistry(sf, "ORB_RING_REGISTRY", RING_TYPE);
    }
    if (rel === READY) {
      state.readySeen = true;
      state.readyImportsLean = hasLeanReadyImports(sf);
    }
    if (rel === MAIN) {
      state.mainSeen = true;
      state.mainUsesReadyHome = hasNamedImports(sf, "./lib/app-ready-signal.ts", ["installAppReadySignal"]);
      state.mainImportsBridge = hasModuleImport(sf, "./lib/agent-bridge.ts");
    }
    if (rel === ROUTER) {
      state.routerSeen = true;
      state.routerUsesReadyHome = hasNamedImports(sf, "../lib/app-ready-signal.ts", ["RouteResolution"]);
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
    if (!(state.readySeen && state.readyImportsLean)) {
      report(ctx, `${READY} must keep its static imports to QueryClient, boot reads, and perf marks, with no re-export or dynamic debug door`, READY);
    }
    if (!(state.mainSeen && state.mainUsesReadyHome) || state.mainImportsBridge) {
      report(ctx, `${MAIN} must import installAppReadySignal only from app-ready-signal.ts and must not import agent-bridge.ts`, MAIN);
    }
    if (!(state.routerSeen && state.routerUsesReadyHome)) {
      report(ctx, `${ROUTER} must import RouteResolution from app-ready-signal.ts`, ROUTER);
    }
    if (!state.bridgeSharesReady) {
      report(ctx, `${BRIDGE} must import the shared appReady Promise and isAppReady query from app-ready-signal.ts`);
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
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        "packages/client/src/lib/rogue.ts": 'window["__orb"] = globalThis.__orb;\n',
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { messageIncludes: "outside the sanctioned bridge door" },
      why: "a second production installer recreates the parallel-bridge drift this lock exists to prevent",
    },
    {
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" };\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { messageIncludes: "ORB_DEBUG_CAPABILITIES must satisfy" },
      why: "a hand-maintained capability object can omit a newly added bridge member without a compiler error",
    },
    {
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} };\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { messageIncludes: "ORB_RING_REGISTRY must satisfy" },
      why: "a hand-maintained ring object can omit a newly added evidence source without a compiler error",
    },
    {
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: "// @agent-bridge-proof: detached comment theater\n// @agent-ring-proof: detached comment theater\nexport const proof = 1;\n",
      },
      expect: { messageIncludes: "mounted CT owes a reasoned @agent-bridge-proof marker" },
      why: "proof-marker comments do not count unless they directly govern executable top-level CT registrations",
    },
    {
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [MAIN]: 'import { installAppReadySignal } from "./lib/agent-bridge.ts";\nvoid installAppReadySignal;\n',
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { messageIncludes: "must import installAppReadySignal only from app-ready-signal.ts" },
      why: "a production import of agent-bridge.ts reconnects the entire dev instrumentation graph to the boot entry",
    },
    {
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [READY]: `${VALID_BOUNDARY_FIXTURES[READY]}import "./agent-bridge-appearance.ts";\n`,
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { messageIncludes: "must keep its static imports" },
      why: "a debug import through the readiness home evades the main-entry spelling check while recreating the same production graph",
    },
    {
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst appReady = Promise.resolve(); const isAppReady = (): boolean => true;\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { messageIncludes: "must import the shared appReady Promise" },
      why: "a bridge-local readiness Promise or query can diverge from the marker production actually settles",
    },
  ],
  mustPass: [
    {
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      why: "the one sanctioned assignment, two exhaustive registries, and both runtime proof classes are present",
    },
  ],
};
