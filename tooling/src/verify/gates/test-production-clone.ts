// Policy: test-production-clone (docs/law/Spine-Testing.md §10, "Call production; never copy it") — a function in
// the test tree whose body has the shape of a function a production module exports is a copy: it keeps passing when
// the production rule changes. The shape is `floor/code-facts/function-shape.ts` (locals renamed, free names kept).
// A singleton: the reader is that floor module, which no other policy consumes. Existing copies are reviewed-grant
// rows in `lib/reviewed-grants-test-production-clone.ts` under their burn-down item.
import type { Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { FunctionShape } from "../../floor/code-facts/function-shape.ts";
import { functionShape, ownExportedFunctions } from "../../floor/code-facts/function-shape.ts";
import { defineGate } from "../contract/policy.ts";

const TESTS = "tests/";
const ANONYMOUS = "<anonymous>";
const OPERATION = "copies";
const LAW = "(docs/law/Spine-Testing.md §10)";
const MESSAGE = `a test-side function has the shape of an exported production function, so it keeps passing when the production rule changes ${LAW}.`;
const FIX =
  "import and call the production function; if it is private to a compose closure or a `.tsx` file, export it or move it to `@orb/contracts` or `@orb/kit` first. Existing copies are reviewed-grant rows naming their burn-down item; a new copy gets the call, not a row.";

const PRODUCTION_READS = "packages/contracts/src/inference/capability/reads.ts";
const GENERATION_BODY = (capability: string, generation: string, input: string): string =>
  `  if (${capability}.kind !== "generation") {\n    throw new Error(\`capability kind \${${capability}.kind} cannot generate\`);\n  }\n` +
  `  const ${generation} = ${capability}.generation;\n  for (const ${input} of ${generation}.inputs) {\n    if (${input}.length === 0) {\n      throw new Error("empty input");\n    }\n  }\n  return ${generation};\n`;

interface ProductionFunction {
  readonly file: string;
  readonly name: string;
}

interface TestFunction {
  readonly node: Node;
  readonly name: string;
  readonly file: string;
  readonly shape: FunctionShape;
}

function testFunctionName(fn: Node): string {
  if (N.isFunctionDeclaration(fn) || N.isMethodDeclaration(fn)) {
    return fn.getName() ?? ANONYMOUS;
  }
  const parent = fn.getParent();
  return parent !== undefined && (N.isVariableDeclaration(parent) || N.isPropertyAssignment(parent)) ? parent.getName() : ANONYMOUS;
}

function anchorOf(fn: Node): Node {
  return (N.isFunctionDeclaration(fn) || N.isMethodDeclaration(fn) ? fn.getNameNode() : undefined) ?? fn;
}

export const gate = defineGate({
  id: "test-production-clone",
  family: "test-production-clone",
  authority: "reviewed-grant",
  severity: "error",
  // Every authored root a test may copy from; scripts are operator programs, not product a test exercises.
  population: [
    "@tests",
    "@client",
    "@ui",
    "@server",
    "@db",
    "@contracts",
    "@kit",
    "@inference",
    "@showcase",
    "@plugin-toolchain",
    "@default-content",
    "@tooling",
  ],
  analysis: "types",
  // A copy is a relation between a test file and any production file; a scoped run cannot see the other side.
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const production = new Map<string, ProductionFunction[]>();
    const candidates: TestFunction[] = [];
    let indexed = 0;
    return {
      visitFile: (sourceFile) => {
        const file = ctx.relativePath(sourceFile);
        if (file.startsWith(TESTS)) {
          return;
        }
        for (const { name, node } of ownExportedFunctions(sourceFile)) {
          const shape = functionShape(node);
          if (shape !== undefined) {
            indexed += 1;
            production.set(shape.key, [...(production.get(shape.key) ?? []), { file, name }]);
          }
        }
      },
      visitors: [
        {
          kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression, SyntaxKind.MethodDeclaration],
          visit: (node, sourceFile) => {
            const file = ctx.relativePath(sourceFile);
            if (!file.startsWith(TESTS)) {
              return;
            }
            const shape = functionShape(node);
            if (shape !== undefined) {
              candidates.push({ node, name: testFunctionName(node), file, shape });
            }
          },
        },
      ],
      evaluate: () => {
        for (const candidate of candidates) {
          // One finding per copy: production can hold twins of its own, and the copy is one defect whichever it calls.
          const twins = (production.get(candidate.shape.key) ?? []).map(({ file, name }) => `${file}#${name}`).toSorted();
          const [first] = twins;
          if (first === undefined) {
            continue;
          }
          ctx.report.node(anchorOf(candidate.node), {
            message: `\`${candidate.name}\` has the shape of ${twins.map((twin) => `\`${twin}\``).join(", ")}. ${MESSAGE}`,
            subject: candidate.file,
            operation: `${OPERATION}:${candidate.name}=${first}`,
          });
        }
        ctx.receipt({
          kind: "population",
          source: `test-production-clone [indexed=${String(indexed)},candidates=${String(candidates.length)}]`,
          members: ctx.files.length,
        });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: `export function requireGeneration(capability: Capability): Generation {\n${GENERATION_BODY("capability", "generation", "input")}}\n`,
        "tests/inference/capability/synthesize.test.ts": `function generationOf(cap: { kind: string; generation: { inputs: string[] } }) {\n${GENERATION_BODY("cap", "gen", "entry")}}\nexport const used = generationOf;\n`,
      },
      expect: { count: 1, messageIncludes: "#requireGeneration`" },
      grant: { subject: "tests/inference/capability/synthesize.test.ts", operation: `copies:generationOf=${PRODUCTION_READS}#requireGeneration` },
      why: "THE FOUNDING COPY: a test re-declares an exported production guard under another name, with other local names and another parameter type. Renamed locals and dropped annotations are the same rule",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: `export const requireGeneration = (capability: Capability): Generation => {\n${GENERATION_BODY("capability", "generation", "input")}};\n`,
        "tests/support/iso/generation.ts": `export const generationOf = (cap: Capability): Generation => {\n${GENERATION_BODY("cap", "gen", "entry")}};\n`,
      },
      expect: { count: 1, messageIncludes: "#requireGeneration`" },
      why: "an arrow bound to an exported const on both sides, the second copy living in a support module rather than a test",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: `function requireGeneration(capability: Capability): Generation {\n${GENERATION_BODY("capability", "generation", "input")}}\nexport { requireGeneration as generationOrThrow };\n`,
        "tests/inference/capability/synthesize.test.ts": `export function generationOf(cap: Capability): Generation {\n${GENERATION_BODY("cap", "gen", "entry")}}\n`,
      },
      expect: { count: 1, messageIncludes: "#generationOrThrow`" },
      why: "EXPORTED THROUGH THE EXPORT LIST: the production function carries no `export` keyword and leaves under another name. The module's export table is the evidence, not the declaration's modifier",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: `export function requireGeneration(capability: Capability): Generation {\n${GENERATION_BODY("capability", "generation", "input")}}\n`,
        "tests/inference/capability/synthesize.test.ts": `export function generationOf(cap?: Capability): Generation {\n${GENERATION_BODY("cap", "gen", "entry")
          .replace("cap.kind !==", "(cap as Capability).kind !==")
          .replace("gen.inputs", "gen!.inputs")
          .replace("return gen;", "return gen satisfies Generation;")}}\n`,
      },
      expect: { count: 1, messageIncludes: "#requireGeneration`" },
      why: "TYPE-LEVEL SYNTAX IS NOT A DIFFERENCE: the copy adds `as`, `!`, `satisfies` and an optional parameter, none of which changes what runs",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: "export const pick = (row: Row): number => (row.ok ? compute(row.a) : fallback(row.b));\n",
        "tests/inference/capability/synthesize.test.ts": "export function choose(r: Row): number {\n  return r.ok ? compute(r.a) : fallback(r.b);\n}\n",
      },
      expect: { count: 1, messageIncludes: "#pick`" },
      why: "A BLOCK THAT ONLY RETURNS is the expression body it returns: switching between the two spellings is no copy-proofing",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: "export const depth = (node: Tree): number => (node.parent === undefined ? 0 : depth(node.parent) + 1);\n",
        "tests/inference/capability/synthesize.test.ts": "export const levelOf = (n: Tree): number => (n.parent === undefined ? 0 : levelOf(n.parent) + 1);\n",
      },
      expect: { count: 1, messageIncludes: "#depth`" },
      why: "A RENAMED RECURSIVE ARROW calls itself under its own new name; the name a function calls itself by is its own binding, not a free name",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: `export function requireGeneration(capability: Capability): Generation {\n${GENERATION_BODY("capability", "generation", "input")}}\n`,
        "tests/inference/capability/synthesize.test.ts": `export function generationOf(cap: Capability): Generation {\n${GENERATION_BODY("cap", "gen", "entry").replace("cap.kind !==", 'cap["kind"] !==')}}\n`,
      },
      expect: { count: 1, messageIncludes: "#requireGeneration`" },
      why: 'THE BRACKET SPELLING: `cap["kind"]` reads the same member as `cap.kind`, so a copy that respells the access is the same copy',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]:
          "export function totals(rows: readonly number[]): object {\n  const id = rows.length;\n  const total = sum(rows);\n  return { id, total };\n}\n",
        "tests/inference/capability/synthesize.test.ts":
          "export function totalsOf(rows: readonly number[]): object {\n  const name = rows.length;\n  const total = sum(rows);\n  return { name, total };\n}\n",
      },
      why: "A SHORTHAND KEY IS A PROPERTY NAME: `{ id, total }` and `{ name, total }` build different objects, so the key stays a free name while its value is a slot",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]:
          "export const ids = (rows: readonly Row[]): readonly string[] => rows.map((row) => row.id);\nexport const aad = (owner: string, provider: string): string => `${owner}|${provider}|${owner.length}`;\n",
        "tests/inference/capability/synthesize.test.ts":
          "export const idsOf = (list: readonly Row[]): readonly string[] => list.map((item) => item.id);\nexport const claimKey = (user: string, source: string): string => `${user}|${source}|${user.length}`;\n",
      },
      why: "BELOW THE SUBSTANCE FLOOR: one projection or one template is an idiom two authors write alike; a copied rule calls, branches or throws more than once",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: `export function requireGeneration(capability: Capability): Generation {\n${GENERATION_BODY("capability", "generation", "input")}}\n`,
        "tests/inference/capability/synthesize.test.ts": `export function generationOf(cap: Capability): Generation {\n${GENERATION_BODY("cap", "gen", "entry").replace("new Error", "new RangeError")}}\n`,
      },
      why: "A FREE NAME IS IDENTITY: the same body throwing another error class computes something else, so renaming every identifier would accuse it. Only the names the function binds itself are erased",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: `function requireGeneration(capability: Capability): Generation {\n${GENERATION_BODY("capability", "generation", "input")}}\nexport const used = requireGeneration;\n`,
        "tests/inference/capability/synthesize.test.ts": `export function generationOf(cap: Capability): Generation {\n${GENERATION_BODY("cap", "gen", "entry")}}\n`,
      },
      why: "a module-private production function is not a door a test can call; the export table, not the body, decides what a test must import",
    },
    {
      mode: "types",
      files: {
        [PRODUCTION_READS]: "export function kindOf(capability: Capability): string {\n  return capability.kind;\n}\n",
        "tests/inference/capability/synthesize.test.ts": "export function kindOfCap(cap: Capability): string {\n  return cap.kind;\n}\n",
      },
      why: "below the token floor a body is an idiom (a getter), not copied logic",
    },
    {
      mode: "types",
      files: {
        "tests/support/iso/generation.ts": `export function requireGeneration(capability: Capability): Generation {\n${GENERATION_BODY("capability", "generation", "input")}}\n`,
        "tests/inference/capability/synthesize.test.ts": `export function generationOf(cap: Capability): Generation {\n${GENERATION_BODY("cap", "gen", "entry")}}\n`,
      },
      why: "THE INDEX IS PRODUCTION ONLY: two test-tree twins are a shared-helper question for review, not a copy of the product",
    },
  ],
});
