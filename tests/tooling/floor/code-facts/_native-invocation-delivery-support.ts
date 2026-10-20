// The planted invocation corpus, plan and span helpers the native invocation delivery suites share.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node as MorphNode } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { InventoryInvocationPlan, InventorySpan, NativeInvocationEvidence } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { encodeInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

export const SOURCE = "tests/server/invocation.test.ts";

export const TEXT = `import {mintTypeId} from '../../packages/kit/src/ids/index.ts';
import {bound} from '../../vendor/bound.ts';
const seeded=(prefix:string):string=>prefix;
declare const maybe:((prefix:string)=>string)|undefined;
export const built=mintTypeId.bind(null,'chat');
const rebound=built.bind(null,seeded);
bound();rebound();
mintTypeId.call(null,'chat',seeded);
mintTypeId.apply(null,['chat',seeded]);
mintTypeId(...['chat',seeded] as const);
mintTypeId('chat',maybe);mintTypeId('chat',UPSTREAM);
const ambient=Math.random.bind(Math);mintTypeId('chat',ambient);mintTypeId('chat',Math.random);
let written=mintTypeId.bind(null,'chat');written=mintTypeId.bind(null,'chat');written();
const LEFT=RIGHT;const RIGHT=LEFT;LEFT();
declare function merged():void;declare function merged(value:string):void;merged();
const args=['chat',seeded] as const;declare function escape(value:object):void;escape(args);mintTypeId.apply(null,args);
`;

export const PLAN: InventoryInvocationPlan = {
  mode: "invocation",
  facets: ["module"],
  arguments: [
    { index: 0, facets: ["module", "global", "binding", "undefined", "string", "namespace", "stable"] },
    { index: 1, facets: ["module", "global", "binding", "undefined", "string", "namespace", "stable"] },
  ],
};

export function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

export function setup(root: string, repoRoot: string): void {
  const write = (file: string, text: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\nvendor/\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [], lib: ["es2022"] },
      files: [SOURCE, "globals.ts"],
    }),
  );
  write(SOURCE, TEXT);
  write("globals.ts", "const UPSTREAM=Math.random;");
  write(
    "packages/kit/src/ids/index.ts",
    "export function mintTypeId(prefix:string,generate?:(prefix:string)=>string):string{return generate?.(prefix)??prefix;}",
  );
  write("vendor/bound.ts", "import {mintTypeId} from '../packages/kit/src/ids/index.ts';const PREFIX='chat';export const bound=mintTypeId.bind(null,PREFIX);");
  execFixtureGit(root, ["init", "-q"]);
}

export function controls(root: string): {
  descriptor: ReturnType<typeof readCompilerPrograms>[number];
  source: import("ts-morph").SourceFile;
  calls: import("ts-morph").CallExpression[];
} {
  const descriptor = readCompilerPrograms(root).find(({ id }) => id === "tsconfig.json");
  const source = createSemanticWorkspace({ root }).program("tsconfig.json")?.sourceFile(SOURCE);
  if (descriptor === undefined || source === undefined) {
    throw new Error("native invocation fixture is missing");
  }
  return { descriptor, source, calls: source.getDescendantsOfKind(SyntaxKind.CallExpression) };
}

export function snapshot(node: MorphNode, evidence: NativeInvocationEvidence): object {
  return encodeInvocationEvidence(node, PLAN, { ...evidence, sources: [node.getSourceFile()] }, span);
}
