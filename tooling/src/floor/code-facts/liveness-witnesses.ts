// Checked consumers outside the import graph: package-root tool configs and typed source-reader witnesses.
// A witness counts only while its carrier participates in non-test code; a detached witness refuses.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../compiler/ts-workspace.ts";
import { semanticReferenceNodes } from "../compiler/ts-workspace.ts";
import { isInventoryTestPath } from "./inventory-consumers.ts";
import type { ExternalConsumption } from "./liveness-contract.ts";
import { LivenessRefusalError } from "./liveness-contract.ts";
import { inventoryDeclarationKey, inventoryExports, semanticInventoryOf } from "./semantic-inventory-reader.ts";

/** A package-root build-tool config is loaded by filename convention; one nested below `src/` is an ordinary module. */
const PACKAGE_ROOT_TOOLING_CONFIG_RE = /\/packages\/[^/]+\/[^/]+\.config\.ts$/u;

export function isPackageRootToolingConfig(filePath: string): boolean {
  return PACKAGE_ROOT_TOOLING_CONFIG_RE.test(filePath);
}

function externalSite(filePath: string, line: number, label = "typed source-reader witness"): string {
  const boundary = /\/(?:packages|scripts|tests|tooling)\//u.exec(filePath);
  const relative = boundary === null ? filePath : filePath.slice(boundary.index + 1);
  return `${relative}:${String(line)} (${label})`;
}

function refuseWitness(message: string): never {
  throw new LivenessRefusalError(`checked external consumption: ${message}`);
}

// The exact grammar is `"Export" satisfies keyof typeof import("module")`: the import type makes a renamed export
// compiler-red, and the alias-resolved property symbol keys the fact on the origin declaration through any barrel.
function sourceReaderWitness(satisfies: Node): { readonly name: string; readonly targetKey: string } | undefined {
  if (!Node.isSatisfiesExpression(satisfies)) {
    return;
  }
  const type = satisfies.getTypeNode();
  if (!(Node.isTypeOperatorTypeNode(type) && type.getOperator() === SyntaxKind.KeyOfKeyword)) {
    return;
  }
  const imported = type.getTypeNode();
  if (!(Node.isImportTypeNode(imported) && imported.compilerNode.isTypeOf && imported.getQualifier() === undefined)) {
    return;
  }
  const expression = satisfies.getExpression();
  if (!Node.isStringLiteral(expression)) {
    return refuseWitness(`the witness at ${externalSite(satisfies.getSourceFile().getFilePath(), satisfies.getStartLineNumber())} must name a literal export`);
  }
  const name = expression.getLiteralText();
  const inventory = semanticInventoryOf(satisfies.getProject());
  const exported = inventory === undefined ? imported.getType().getProperty(name) : undefined;
  const origin = exported?.getAliasedSymbol() ?? exported;
  const declarations = inventory === undefined ? (origin?.getDeclarations() ?? []) : inventory.witnessOrigins(satisfies);
  if (declarations.length === 0) {
    return refuseWitness(
      `the witness for ${name} at ${externalSite(satisfies.getSourceFile().getFilePath(), satisfies.getStartLineNumber())} resolves no export`,
    );
  }
  if (declarations.length !== 1 || declarations[0] === undefined) {
    return refuseWitness(`the witness for ${name} resolves ${String(declarations.length)} origin declarations; exactly one is required`);
  }
  return { name, targetKey: inventoryDeclarationKey(declarations[0]) };
}

function configConsumptions(sf: SourceFile): ExternalConsumption[] {
  if (!isPackageRootToolingConfig(sf.getFilePath())) {
    return [];
  }
  return (inventoryExports(sf).get("default") ?? []).map((declaration) => {
    const targetKey = inventoryDeclarationKey(declaration);
    return {
      targetKey,
      consumerSite: externalSite(sf.getFilePath(), 1, "tool config entry"),
      consumerFile: sf.getFilePath(),
      consumerClass: "tooling",
      kind: "value",
      rootConsumerKey: targetKey,
    };
  });
}

function sourceReaderConsumption(satisfies: Node): ExternalConsumption | undefined {
  const witness = sourceReaderWitness(satisfies);
  if (witness === undefined) {
    return;
  }
  const sf = satisfies.getSourceFile();
  const carrier = satisfies.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (carrier === undefined || carrier.getInitializer() !== satisfies) {
    refuseWitness(`the ${witness.name} witness must be the initializer of a named carrier`);
  }
  const liveCarrier = semanticReferenceNodes(carrier).some((reference) => {
    const outsideDeclaration = !(reference.getSourceFile() === sf && reference.getStart() >= carrier.getStart() && reference.getEnd() <= carrier.getEnd());
    return outsideDeclaration && !isInventoryTestPath(reference.getSourceFile().getFilePath());
  });
  if (!liveCarrier) {
    refuseWitness(`detached external-consumption witness ${carrier.getName()} at ${externalSite(sf.getFilePath(), carrier.getStartLineNumber())}`);
  }
  return {
    targetKey: witness.targetKey,
    consumerSite: externalSite(sf.getFilePath(), satisfies.getStartLineNumber()),
    consumerFile: sf.getFilePath(),
    consumerClass: "tooling",
    kind: "value",
    rootConsumerKey: inventoryDeclarationKey(carrier),
  };
}

/** Every checked external consumption in non-test sources of `project`. */
export function collectExternalConsumptions(project: SourceCorpus): readonly ExternalConsumption[] {
  const facts: ExternalConsumption[] = [];
  for (const sf of project.getSourceFiles()) {
    if (isInventoryTestPath(sf.getFilePath())) {
      continue;
    }
    facts.push(...configConsumptions(sf));
    for (const satisfies of sf.getDescendantsOfKind(SyntaxKind.SatisfiesExpression)) {
      const fact = sourceReaderConsumption(satisfies);
      if (fact !== undefined) {
        facts.push(fact);
      }
    }
  }
  return facts;
}
