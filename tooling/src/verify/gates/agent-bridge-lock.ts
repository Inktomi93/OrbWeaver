// Policy: agent-bridge-lock (#894/#995) — `globalThis.__orb` has one install door, and production imports
// only the lean readiness home. The bridge shares that exact Promise/query and retains the compiler-owned
// exhaustive capability and ring registries. Runtime answerability belongs to the mounted CT.
//
// FAMILY `agent-bridge-lock` — a declared SINGLETON, and the reason is that its subject is a set of FIVE
// NAMED FILES, not a repeated shape: the bridge door, the readiness home, the boot entry, the router and
// the mounted CT. There is no sibling policy judging that boundary and no `lib/` computation two policies
// share; the only shared machinery it touches is the runtime's own visitor dispatch. A theme ("client
// instrumentation") is not a family (guide §2), so it declares itself rather than inventing one.
//
// POPULATION PORT: byte-identical. The legacy descriptor's `scanRoot` was
// `path.startsWith("packages/client/src/") || path === CT` (pre-conversion SHA 250c9eb60); the final
// population is `{ in: ["@client", "@tests"], under: ["packages/client/src/**", CT] }` — `@client` IS
// `packages/client/src/`, and the CT is admitted by its exact path rather than by a `tests/` root that
// would widen the walk to 2,702 files.
//
// AUTHORITY `hard`, and it is a claim about the DOOR, not a field (guide §2). Every arm is a
// FILE-anchored verdict about a named home — "the bridge door is absent", "main imports the bridge",
// "the CT owes a marker" — and an ordinary finding's position must be authored text at the finding's exact
// line and column (`lib/ordinary-waiver.ts` `locateFinding`). A file finding has no such token, so these
// arms have no ordinary door by construction. The legacy descriptor carried no marker, no exemption table
// and no baseline, so nothing is lost: hard is what it already was in every operational sense.
//
// ANCHOR MOVE, recorded (guide §6.4's ANCHOR MOVE classification). The legacy module reported an ABSENT file AT that file
// (`report(ctx, …, READY)` with `READY` not loaded). The final report sink refuses a finding outside the
// effective population (`lib/policy-pass-context.ts:314`), so an absence verdict cannot anchor on the thing
// that is absent. Each verdict now anchors on its own subject WHEN PRESENT and on the shared
// `lib/absent-subject-anchor.ts` `subjectAnchor` resolver — the first present of the five named subjects,
// else the first admitted client file — when it is not. Nothing orphans: a hard policy has no marker to
// bind, which is exactly why the move is safe here and would not be in an ordinary module.
//
// DECLARED LIMIT, with the row that holds it: when ALL FIVE named subjects are gone the fallback anchor is
// the first admitted population path, and the finding still names the missing file in its MESSAGE
// (`mustFlag[7]`). The alternative — throwing — would turn "the client readiness boundary was deleted" into
// a tool error nobody reads as a product verdict.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";

const BRIDGE = "packages/client/src/lib/agent-bridge.ts";
const READY = "packages/client/src/lib/app-ready-signal.ts";
const MAIN = "packages/client/src/main.tsx";
const ROUTER = "packages/client/src/routes/router.tsx";
const CT = "tests/client/lib/agent-bridge.ct.tsx";
/** Anchor preference order: the door first, then the entry points, then the proof surface. */
const SUBJECTS = [BRIDGE, MAIN, ROUTER, READY, CT] as const;
const CLIENT_SOURCE = "packages/client/src/";
const CAPABILITY_TYPE = "Record<keyof OrbDebugHandle, string>";
const RING_TYPE = 'Record<OrbRingName, Omit<OrbRingMetadata, "name">>';
const READY_STATIC_IMPORTS = new Set(["@tanstack/react-query", "./boot-reads.ts", "./perf-marks.ts"]);
const BRIDGE_PROOF = "@agent-bridge-proof";
const RING_PROOF = "@agent-ring-proof";

const MESSAGE = "the dev introspection bridge lost its one-door or exhaustive-registry lock (#894); packages/client/src/lib/agent-bridge.ts";
const FIX = "install __orb only in agent-bridge.ts; retain the exhaustive capability/ring satisfies registries and both mounted CT proof markers";

/** `globalThis.__orb = …` / `window["__orb"] = …` — the install door, in either member spelling. */
function isOrbAssignment(node: MorphNode): boolean {
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

/** The STATIC half of the lean-readiness rule: sanctioned specifiers only, and no re-export door. The
 *  dynamic half is a `CallExpression` visitor, because the legacy `getDescendantsOfKind` walk is forbidden. */
function hasLeanStaticShape(sf: SourceFile): boolean {
  const staticImports = sf.getImportDeclarations().every((declaration) => READY_STATIC_IMPORTS.has(declaration.getModuleSpecifierValue()));
  const reexportsNothing = sf.getExportDeclarations().every((declaration) => declaration.getModuleSpecifierValue() === undefined);
  return staticImports && reexportsNothing;
}

/** A top-level `test("…", fn)` registration whose leading comment carries a REASONED proof marker. The
 *  reason is required: a bare `// @agent-bridge-proof:` is comment theater, not evidence. */
function registeredProofMarker(call: MorphNode, marker: string): boolean {
  const statement = call.getParent();
  if (!(Node.isExpressionStatement(statement) && Node.isSourceFile(statement.getParent()) && Node.isCallExpression(call))) {
    return false;
  }
  if (call.getExpression().getText() !== "test") {
    return false;
  }
  const [title, body] = call.getArguments();
  if (!(Node.isStringLiteral(title) && (Node.isArrowFunction(body) || Node.isFunctionExpression(body)))) {
    return false;
  }
  return statement.getLeadingCommentRanges().some((comment) => comment.getText().match(new RegExp(`^// ${marker}:\\s*\\S.+$`, "u")) !== null);
}

const VALID_BOUNDARY_FIXTURES = {
  [READY]:
    'import type { QueryClient } from "@tanstack/react-query";\nimport { bootReads } from "./boot-reads.ts";\nimport { perfMeasureFromLoad } from "./perf-marks.ts";\nexport const appReady = Promise.resolve();\nexport const isAppReady = (): boolean => true;\nexport function installAppReadySignal(_client: QueryClient): void { void bootReads; void perfMeasureFromLoad; }\nexport interface RouteResolution {}\n',
  [MAIN]: 'import { installAppReadySignal } from "./lib/app-ready-signal.ts";\nvoid installAppReadySignal;\n',
  [ROUTER]: 'import type { RouteResolution } from "../lib/app-ready-signal.ts";\nexport const routeResolution = {} as RouteResolution;\n',
} as const;
const VALID_BRIDGE_IMPORT = 'import { appReady, isAppReady } from "./app-ready-signal.ts";\n';
const VALID_BRIDGE_BODY =
  'interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n';
const VALID_BRIDGE = `${VALID_BRIDGE_IMPORT}${VALID_BRIDGE_BODY}`;
const VALID_CT_FIXTURE = `// ${BRIDGE_PROOF}: mounted members answer\ntest("members", () => {});\n// ${RING_PROOF}: resets are isolated\ntest("rings", () => {});\n`;

export const gate = defineGate({
  id: "agent-bridge-lock",
  family: "agent-bridge-lock",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@tests"], under: ["packages/client/src/**", CT] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const assignments: { readonly path: string; readonly node: MorphNode }[] = [];
    const proofs = new Set<string>();
    let readyDynamicImport = false;
    let bridgeSharesReady = false;
    let capabilityRegistry = false;
    let ringRegistry = false;
    let readyStaticShape = false;
    let mainUsesReadyHome = false;
    let mainImportsBridge = false;
    let routerUsesReadyHome = false;

    type Report = (subject: string, detail: string) => void;

    /** The three production HOMES: the readiness module stays lean, and neither entry reaches past it. */
    const judgeHomes = (present: ReadonlySet<string>, report: Report): void => {
      if (!(present.has(READY) && readyStaticShape && !readyDynamicImport)) {
        report(READY, `${READY} must keep its static imports to QueryClient, boot reads, and perf marks, with no re-export or dynamic debug door`);
      }
      if (!(present.has(MAIN) && mainUsesReadyHome) || mainImportsBridge) {
        report(MAIN, `${MAIN} must import installAppReadySignal only from app-ready-signal.ts and must not import agent-bridge.ts`);
      }
      if (!(present.has(ROUTER) && routerUsesReadyHome)) {
        report(ROUTER, `${ROUTER} must import RouteResolution from app-ready-signal.ts`);
      }
    };

    /** The DOOR itself: one install site, the shared readiness pair, and the two compiler-owned registries. */
    const judgeBridge = (report: Report): void => {
      if (!bridgeSharesReady) {
        report(BRIDGE, `${BRIDGE} must import the shared appReady Promise and isAppReady query from app-ready-signal.ts`);
      }
      const sanctioned = assignments.filter((hit) => hit.path === BRIDGE);
      if (sanctioned.length !== 1) {
        report(BRIDGE, `expected exactly one globalThis.__orb assignment in ${BRIDGE}, found ${sanctioned.length.toString()}`);
      }
      for (const hit of assignments.filter((candidate) => candidate.path !== BRIDGE)) {
        ctx.report.node(hit.node, { message: `${MESSAGE} production __orb assignment outside the sanctioned bridge door: ${hit.path}`, fix: FIX });
      }
      if (!capabilityRegistry) {
        report(BRIDGE, `ORB_DEBUG_CAPABILITIES must satisfy ${CAPABILITY_TYPE}`);
      }
      if (!ringRegistry) {
        report(BRIDGE, `ORB_RING_REGISTRY must satisfy ${RING_TYPE}`);
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.BinaryExpression],
          visit: (node, sourceFile: SourceFile) => {
            const path = ctx.relativePath(sourceFile);
            // The CT is admitted so its proof markers can be read; it is NOT production, so an `__orb`
            // assignment in a mounted test is not a second install door.
            if (path.startsWith(CLIENT_SOURCE) && isOrbAssignment(node)) {
              assignments.push({ path, node });
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile: SourceFile) => {
            const path = ctx.relativePath(sourceFile);
            if (path === READY && Node.isCallExpression(node) && node.getExpression().getKind() === SyntaxKind.ImportKeyword) {
              readyDynamicImport = true;
            }
            if (path !== CT) {
              return;
            }
            for (const marker of [BRIDGE_PROOF, RING_PROOF]) {
              if (registeredProofMarker(node, marker)) {
                proofs.add(marker);
              }
            }
          },
        },
      ],
      visitFile: (sourceFile) => {
        const path = ctx.relativePath(sourceFile);
        if (path === BRIDGE) {
          bridgeSharesReady = hasNamedImports(sourceFile, "./app-ready-signal.ts", ["appReady", "isAppReady"]);
          capabilityRegistry = hasRegistry(sourceFile, "ORB_DEBUG_CAPABILITIES", CAPABILITY_TYPE);
          ringRegistry = hasRegistry(sourceFile, "ORB_RING_REGISTRY", RING_TYPE);
        }
        if (path === READY) {
          readyStaticShape = hasLeanStaticShape(sourceFile);
        }
        if (path === MAIN) {
          mainUsesReadyHome = hasNamedImports(sourceFile, "./lib/app-ready-signal.ts", ["installAppReadySignal"]);
          mainImportsBridge = hasModuleImport(sourceFile, "./lib/agent-bridge.ts");
        }
        if (path === ROUTER) {
          routerUsesReadyHome = hasNamedImports(sourceFile, "../lib/app-ready-signal.ts", ["RouteResolution"]);
        }
      },
      evaluate: () => {
        const present = new Set(ctx.files.map((file) => ctx.relativePath(file)));
        ctx.receipt({ kind: "population", source: "agent-bridge-boundary", members: ctx.files.length, unresolved: 0 });
        const anchor = subjectAnchor(present, SUBJECTS);
        const report = (subject: string, detail: string): void =>
          ctx.report.file(anchor(subject), { line: 1, column: 1, message: `${MESSAGE} ${detail}`, fix: FIX });

        if (!present.has(BRIDGE)) {
          report(BRIDGE, `${BRIDGE} was not loaded — the sanctioned bridge door is absent`);
          return;
        }
        judgeHomes(present, report);
        judgeBridge(report);
        for (const marker of [BRIDGE_PROOF, RING_PROOF]) {
          if (!proofs.has(marker)) {
            report(CT, `the mounted CT owes a reasoned ${marker} marker`);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: VALID_BRIDGE,
        "packages/client/src/lib/rogue.ts": 'window["__orb"] = globalThis.__orb;\n',
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, token: "window", messageIncludes: "outside the sanctioned bridge door" },
      why: "a second production installer recreates the parallel-bridge drift this lock exists to prevent — and the ELEMENT-ACCESS spelling, which a property-access-only reader misses",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" };\nconst ORB_RING_REGISTRY = { flags: {} } satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "ORB_DEBUG_CAPABILITIES must satisfy" },
      why: "a hand-maintained capability object can omit a newly added bridge member without a compiler error",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `${VALID_BRIDGE_IMPORT}interface OrbDebugHandle { readonly snap: () => unknown }\ntype OrbRingName = "flags"; interface OrbRingMetadata { readonly name: OrbRingName }\nconst ORB_DEBUG_CAPABILITIES = { snap: "read" } satisfies Record<keyof OrbDebugHandle, string>;\nconst ORB_RING_REGISTRY = { flags: {} };\nglobalThis.__orb = {} as OrbDebugHandle;\nvoid appReady; void isAppReady;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "ORB_RING_REGISTRY must satisfy" },
      why: "a hand-maintained ring object can omit a newly added evidence source without a compiler error",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: VALID_BRIDGE,
        [CT]: `// ${BRIDGE_PROOF}: detached comment theater\n// ${RING_PROOF}: detached comment theater\nexport const proof = 1;\n`,
      },
      expect: { count: 2, messageIncludes: `owes a reasoned ${BRIDGE_PROOF} marker` },
      why: "proof-marker comments do not count unless they directly govern executable top-level CT registrations — and BOTH classes are owed, so one finding per class, never a single verdict that a present sibling could hide",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [MAIN]: 'import { installAppReadySignal } from "./lib/agent-bridge.ts";\nvoid installAppReadySignal;\n',
        [BRIDGE]: VALID_BRIDGE,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "must import installAppReadySignal only from app-ready-signal.ts" },
      why: "a production import of agent-bridge.ts reconnects the entire dev instrumentation graph to the boot entry",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [READY]: `${VALID_BOUNDARY_FIXTURES[READY]}import "./agent-bridge-appearance.ts";\n`,
        [BRIDGE]: VALID_BRIDGE,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "must keep its static imports" },
      why: "a debug import through the readiness home evades the main-entry spelling check while recreating the same production graph",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: VALID_BRIDGE_BODY.replace("void appReady;", "const appReady = Promise.resolve(); const isAppReady = (): boolean => true;\nvoid appReady;"),
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "must import the shared appReady Promise" },
      why: "a bridge-local readiness Promise or query can diverge from the marker production actually settles",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: `${VALID_BRIDGE}globalThis.__orb = {} as OrbDebugHandle;\n`,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "expected exactly one globalThis.__orb assignment" },
      why: "THE FOUNDING CARDINALITY ARM, and the legacy suite never pinned it: two installers INSIDE the sanctioned door are the same parallel-bridge drift as one outside it, and the rogue arm cannot see them because both live at the sanctioned path. Replacing the `sanctioned.length !== 1` test with a never-true condition leaves every other row green and REDS only this one",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "the sanctioned bridge door is absent" },
      why: "THE ABSENT-DOOR ARM, unpinned by the legacy suite and the one this conversion had to re-anchor: a deleted or renamed agent-bridge.ts cannot make the lock evaporate quietly. The finding anchors on the first present named subject (here main.tsx) because the report sink refuses a finding outside the effective population, and the MESSAGE carries the missing path — planted break: forcing `present.has(BRIDGE)` true makes this row report the registry/assignment arms instead and the count goes to 3",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [READY]: `${VALID_BOUNDARY_FIXTURES[READY]}export * from "./agent-bridge.ts";\n`,
        [BRIDGE]: VALID_BRIDGE,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "no re-export or dynamic debug door" },
      why: "THE RE-EXPORT DOOR, unpinned by the legacy suite: `export * from` adds no ImportDeclaration at all, so the static-specifier clause alone reads this lean and the whole bridge graph rides into production through the readiness home",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [READY]: `${VALID_BOUNDARY_FIXTURES[READY]}export async function peek(): Promise<unknown> { return import("./agent-bridge.ts"); }\n`,
        [BRIDGE]: VALID_BRIDGE,
        [CT]: VALID_CT_FIXTURE,
      },
      expect: { count: 1, messageIncludes: "no re-export or dynamic debug door" },
      why: "THE DYNAMIC DOOR, unpinned by the legacy suite and the clause the conversion had to move out of a descendant walk into a CallExpression visitor: a lazy `import()` of the bridge is invisible to both the static-specifier and the re-export clauses",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: VALID_BRIDGE,
        [CT]: `// ${BRIDGE_PROOF}:\ntest("members", () => {});\n// ${RING_PROOF}: resets are isolated\ntest("rings", () => {});\n`,
      },
      expect: { count: 1, messageIncludes: `owes a reasoned ${BRIDGE_PROOF} marker` },
      why: "A REASONLESS MARKER IS NOT A PROOF: the bare `@agent-bridge-proof:` fails the `\\s*\\S.+` reason clause while its reasoned sibling passes, so exactly one class is owed — the row that dies if the reason requirement is dropped",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: VALID_BRIDGE,
        [CT]: `describe("bridge", () => {\n  // ${BRIDGE_PROOF}: nested registration\n  test("members", () => {});\n  // ${RING_PROOF}: nested registration\n  test("rings", () => {});\n});\n`,
      },
      expect: { count: 2, messageIncludes: `owes a reasoned ${RING_PROOF} marker` },
      why: "THE TOP-LEVEL FENCE, pinned: a marker governing a registration nested inside a `describe` callback is not the statement the runner registers at module scope, so it proves nothing about what actually runs. Dropping the `Node.isSourceFile(statement.getParent())` clause greens both classes and REDS this row",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: VALID_BRIDGE,
        [CT]: VALID_CT_FIXTURE,
      },
      why: "the one sanctioned assignment, two exhaustive registries, and both runtime proof classes are present",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: VALID_BRIDGE,
        "packages/client/src/lib/lookalike.ts":
          'const holder: Record<string, unknown> = {};\nholder.__orb = 1;\nholder["__orb"] = 2;\nglobalThis.other = 3;\nwindow["orb"] = 4;\n',
        [CT]: VALID_CT_FIXTURE,
      },
      why: "THE INSTALL-DOOR IDENTITY FENCE, pinned: a local object whose KEY is spelled `__orb`, and a global assignment to some other member, are not the install door. Widening `isOrbAssignment` to any `__orb` write — or to any global assignment — flags three sites here and REDS this row",
    },
    {
      mode: "source",
      files: {
        ...VALID_BOUNDARY_FIXTURES,
        [BRIDGE]: VALID_BRIDGE,
        [CT]: `${VALID_CT_FIXTURE}globalThis.__orb = {} as never;\n`,
      },
      why: "THE PRODUCTION CARRIER FENCE, pinned: the CT is admitted so its proof markers can be read, and a mounted test installing its own handle is not a second PRODUCTION door. Deleting the `path.startsWith(CLIENT_SOURCE)` guard on the assignment visitor reports this as a rogue installer and REDS this row",
    },
  ],
});
