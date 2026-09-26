import { Node } from "ts-morph";

const CUSTOM_PROPERTY = "--[a-zA-Z_][a-zA-Z0-9_-]*";
const CUSTOM_PROPERTY_NAME_RE = new RegExp(`^${CUSTOM_PROPERTY}$`, "u");
const VAR_START_RE = new RegExp(`var\\(\\s*(${CUSTOM_PROPERTY})`, "gu");
const ARBITRARY_VAR_RE = new RegExp(`(?:^|[^a-zA-Z0-9_-])[-a-zA-Z0-9_[\\].:/]+-\\((${CUSTOM_PROPERTY})\\)`, "gu");

export interface CssVariableSite {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly name: string;
  readonly fallback: boolean;
  readonly node?: Node;
  readonly offset?: number;
}

function lineColumn(text: string, offset: number): { readonly line: number; readonly column: number } {
  const before = text.slice(0, offset);
  const lastNewline = before.lastIndexOf("\n");
  return { line: before.split(/\r?\n/u).length, column: offset - lastNewline };
}

function quotedStep(text: string, index: number, quote: "'" | '"'): { readonly index: number; readonly quote: "'" | '"' | undefined } {
  const char = text[index];
  return char === "\\" ? { index: index + 1, quote } : { index, quote: char === quote ? undefined : quote };
}

function closingParen(text: string, open: number): number | undefined {
  let depth = 0;
  let quote: "'" | '"' | undefined;
  let result: number | undefined;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== undefined) {
      const step = quotedStep(text, index, quote);
      index = step.index;
      quote = step.quote;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        result = index;
        break;
      }
    }
  }
  return result;
}

function hasTopLevelComma(text: string, start: number, end: number): boolean {
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return true;
    }
  }
  return false;
}

export function cssVariableReferenceSites(text: string, file: string, node?: Node, sourceOffset = 0): CssVariableSite[] {
  const sites: CssVariableSite[] = [];
  for (const match of text.matchAll(VAR_START_RE)) {
    const name = match[1];
    const at = match.index;
    if (name === undefined) {
      continue;
    }
    const open = text.indexOf("(", at);
    const close = closingParen(text, open);
    const position = node === undefined ? lineColumn(text, at) : node.getSourceFile().getLineAndColumnAtPos(sourceOffset + at);
    const fallback = close !== undefined && hasTopLevelComma(text, at + match[0].length, close);
    sites.push(
      node === undefined ? { file, ...position, name, fallback } : { file, ...position, name, fallback, node, offset: sourceOffset + at - node.getStart() },
    );
  }
  return sites;
}

export function arbitraryCssVariableSites(text: string, file: string, node: Node, sourceOffset: number): CssVariableSite[] {
  const sites: CssVariableSite[] = [];
  for (const match of text.matchAll(ARBITRARY_VAR_RE)) {
    const name = match[1];
    const at = match.index;
    if (name === undefined) {
      continue;
    }
    const nameAt = at + match[0].lastIndexOf(name);
    const position = node.getSourceFile().getLineAndColumnAtPos(sourceOffset + nameAt);
    sites.push({ file, ...position, name, fallback: false, node, offset: sourceOffset + nameAt - node.getStart() });
  }
  return sites;
}

function isClassFragment(node: Node): boolean {
  return node.getAncestors().some((ancestor) => {
    if (Node.isJsxAttribute(ancestor)) {
      return ancestor.getNameNode().getText() === "className";
    }
    if (Node.isVariableDeclaration(ancestor)) {
      return /^[A-Z][A-Z0-9_]*$/u.test(ancestor.getName());
    }
    return Node.isCallExpression(ancestor) && /^(?:tv|cva)$/u.test(ancestor.getExpression().getText());
  });
}

function literalSites(node: Node, value: string, sourceStart: number, file: string): CssVariableSite[] {
  const references = cssVariableReferenceSites(value, file, node, sourceStart);
  return isClassFragment(node) ? [...references, ...arbitraryCssVariableSites(value, file, node, sourceStart)] : references;
}

function hasCssPropertiesContract(node: Node): boolean {
  return node.getAncestors().some((ancestor) => {
    if (Node.isVariableDeclaration(ancestor)) {
      return ancestor.getTypeNode()?.getText() === "CSSProperties";
    }
    if (Node.isAsExpression(ancestor) || Node.isSatisfiesExpression(ancestor)) {
      return ancestor.getTypeNode()?.getText() === "CSSProperties";
    }
    return Node.isJsxAttribute(ancestor) && ancestor.getNameNode().getText() === "style";
  });
}

export interface CssVariableSourceState {
  readonly definitions: Set<string>;
  readonly definitionSites: CssVariableSite[];
  readonly references: CssVariableSite[];
}

export function inventoryCssVariableSourceNode(node: Node, file: string, state: CssVariableSourceState): void {
  if (Node.isPropertyAssignment(node)) {
    const nameNode = node.getNameNode();
    if (Node.isStringLiteral(nameNode) && CUSTOM_PROPERTY_NAME_RE.test(nameNode.getLiteralValue()) && hasCssPropertiesContract(node)) {
      const name = nameNode.getLiteralValue();
      const position = nameNode.getSourceFile().getLineAndColumnAtPos(nameNode.getStart());
      state.definitions.add(name);
      state.definitionSites.push({ file, ...position, name, fallback: false, node: nameNode, offset: 1 });
    }
  }
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    state.references.push(...literalSites(node, node.getLiteralValue(), node.getStart() + 1, file));
  }
  if (Node.isTemplateExpression(node)) {
    const head = node.getHead();
    if (isClassFragment(head)) {
      state.references.push(...arbitraryCssVariableSites(head.getLiteralText(), file, head, head.getStart() + 1));
    }
    for (const span of node.getTemplateSpans()) {
      const literal = span.getLiteral();
      if (isClassFragment(literal)) {
        state.references.push(...arbitraryCssVariableSites(literal.getLiteralText(), file, literal, literal.getStart() + 1));
      }
    }
  }
}
