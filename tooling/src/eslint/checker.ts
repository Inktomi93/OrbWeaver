import type { ParserServicesWithTypeInformation } from "@typescript-eslint/utils";
import type ts from "typescript";
import type { OrbRuleContext } from "./syntax.ts";

/** The parser's owning compiler context; syntax-only parsing cannot enforce a typed rule. */
export type TypeServices = Pick<ParserServicesWithTypeInformation, "program" | "esTreeNodeToTSNodeMap" | "tsNodeToESTreeNodeMap"> & {
  readonly checker: ts.TypeChecker;
};

/** Refuse incomplete parser services before a typed rule installs any listeners. */
export function requireTypeServices(context: OrbRuleContext): TypeServices {
  const services = context.sourceCode.parserServices;
  if (
    services?.program === undefined ||
    services.program === null ||
    services.esTreeNodeToTSNodeMap === undefined ||
    services.tsNodeToESTreeNodeMap === undefined
  ) {
    throw new Error(`${context.id} requires the parser's owning TypeScript Program and node maps`);
  }
  return {
    program: services.program,
    checker: services.program.getTypeChecker(),
    esTreeNodeToTSNodeMap: services.esTreeNodeToTSNodeMap,
    tsNodeToESTreeNodeMap: services.tsNodeToESTreeNodeMap,
  };
}
