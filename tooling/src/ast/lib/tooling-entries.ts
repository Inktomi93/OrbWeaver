// Runtime/tool entry conventions shared by file reachability and symbol liveness.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { semanticReferenceNodes } from "../../_shared/ts-workspace.ts";
import type { ExternalConsumption } from "../contract/types.ts";
import { declKey } from "./keys.ts";
import { AstToolError } from "./ledger.ts";
import { isTestPath } from "./root.ts";

/** Package-root build-tool configs are loaded by filename convention. A config nested below `src/`
 *  is an ordinary module and must not inherit that external consumer. */
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
  throw new AstToolError(`ast external-consumption: ${message}`);
}

/** The exact checked source-reader grammar: `"Export" satisfies keyof typeof import("module")`.
 *  The import type makes a renamed/removed export compiler-red; resolving its property symbol through an
 *  alias makes the fact key the origin declaration, including through a barrel. */
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
  const exported = imported.getType().getProperty(name);
  if (exported === undefined) {
    return refuseWitness(
      `the witness for ${name} at ${externalSite(satisfies.getSourceFile().getFilePath(), satisfies.getStartLineNumber())} resolves no export`,
    );
  }
  const origin = exported.getAliasedSymbol() ?? exported;
  const declarations = origin.getDeclarations();
  if (declarations.length !== 1 || declarations[0] === undefined) {
    return refuseWitness(`the witness for ${name} resolves ${String(declarations.length)} origin declarations; exactly one is required`);
  }
  return { name, targetKey: declKey(declarations[0]) };
}

function configConsumptions(sf: SourceFile): ExternalConsumption[] {
  const facts: ExternalConsumption[] = [];
  if (!isPackageRootToolingConfig(sf.getFilePath())) {
    return facts;
  }
  for (const declaration of sf.getExportedDeclarations().get("default") ?? []) {
    const targetKey = declKey(declaration);
    facts.push({
      targetKey,
      consumerSite: externalSite(sf.getFilePath(), 1, "tool config entry"),
      consumerFile: sf.getFilePath(),
      consumerClass: "tooling",
      kind: "value",
      rootConsumerKey: targetKey,
    });
  }
  return facts;
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
    return outsideDeclaration && !isTestPath(reference.getSourceFile().getFilePath());
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
    rootConsumerKey: declKey(carrier),
  };
}

/** Normalize checked, source-native consumers that sit outside the ordinary import graph. A witness is
 *  evidence only while its carrier participates in non-test code; a detached declaration refuses instead
 *  of becoming a marker-shaped parking permit. */
export function collectExternalConsumptions(project: SourceCorpus): readonly ExternalConsumption[] {
  const facts: ExternalConsumption[] = [];
  for (const sf of project.getSourceFiles()) {
    if (isTestPath(sf.getFilePath())) {
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
