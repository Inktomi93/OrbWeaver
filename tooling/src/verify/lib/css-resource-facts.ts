// Policy-independent CSS syntax facts. Acquisition and refusal live in ResourceHost; judgments stay in gates.
import type {
  CssCustomPropertyDefinitionFact,
  CssCustomPropertyReferenceFact,
  CssDeclarationFact,
  CssFacts,
  CssSelectorFact,
  CssSelectorHookFact,
  CssSourcePosition,
  CssStatementAtRuleFact,
} from "../contract/resource-css.ts";
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import { blankCssComments } from "./comment-spans.ts";
import { selectorClassHooks, selectorDataAttributes } from "./css-family-selector-provenance.ts";
import type { CssDeclaration } from "./css-rules.ts";
import { splitSelectorListWithOffsets } from "./css-rules.ts";

function position(text: string, file: string, offset: number): CssSourcePosition {
  const before = text.slice(0, offset);
  const newline = before.lastIndexOf("\n");
  return { file, line: before.split("\n").length, column: offset - newline, offset };
}

function customPropertyNameAt(text: string, start: number): string | undefined {
  const prefixLength = "--".length;
  if (!(text.startsWith("--", start) && /[a-zA-Z_]/u.test(text[start + prefixLength] ?? ""))) {
    return;
  }
  let end = start + prefixLength + 1;
  while (/[a-zA-Z0-9_-]/u.test(text[end] ?? "")) {
    end += 1;
  }
  return text.slice(start, end);
}

interface QuoteState {
  quote: string;
  escaped: boolean;
}

function consumesQuoted(state: QuoteState, char: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\") {
    state.escaped = true;
    return true;
  }
  if (state.quote !== "") {
    if (char === state.quote) {
      state.quote = "";
    }
    return true;
  }
  if (char === '"' || char === "'") {
    state.quote = char;
    return true;
  }
  return false;
}

function closingParen(text: string, open: number): number | undefined {
  let depth = 0;
  let result: number | undefined;
  const state: QuoteState = { quote: "", escaped: false };
  for (let index = open; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (consumesQuoted(state, char)) {
      continue;
    }
    if (char === "(") {
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

function referencesInValue(text: string, file: string, value: string, valueOffset: number): readonly CssCustomPropertyReferenceFact[] {
  const out: CssCustomPropertyReferenceFact[] = [];
  const state: QuoteState = { quote: "", escaped: false };
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    if (consumesQuoted(state, char)) {
      continue;
    }
    if (!value.startsWith("var(", index)) {
      continue;
    }
    let nameStart = index + "var(".length;
    while (/\s/u.test(value[nameStart] ?? "")) {
      nameStart += 1;
    }
    const name = customPropertyNameAt(value, nameStart);
    if (name === undefined) {
      continue;
    }
    const open = index + "var".length;
    const close = closingParen(value, open);
    const fallback = close !== undefined && hasTopLevelComma(value, nameStart + name.length, close);
    out.push({ ...position(text, file, valueOffset + index), name, fallback });
    index = nameStart + name.length - 1;
  }
  return out;
}

function allDeclarations(file: AuthoredCssFile): readonly CssDeclaration[] {
  return [...file.atRules.flatMap((atRule) => atRule.declarations), ...file.rules.flatMap((rule) => rule.declarations)].toSorted(
    (left, right) => left.offset - right.offset,
  );
}

export function customPropertyDefinitions(file: AuthoredCssFile): readonly CssCustomPropertyDefinitionFact[] {
  return allDeclarations(file).flatMap((declaration) =>
    declaration.prop.startsWith("--") ? [{ ...position(file.text, file.path, declaration.offset), name: declaration.prop }] : [],
  );
}

export function customPropertyReferences(file: AuthoredCssFile): readonly CssCustomPropertyReferenceFact[] {
  return allDeclarations(file).flatMap((declaration) => referencesInValue(file.text, file.path, declaration.rawValue, declaration.valueOffset));
}

function selectorFacts(file: AuthoredCssFile): readonly CssSelectorFact[] {
  const code = blankCssComments(file.text);
  return file.rules.flatMap((rule) => {
    const prelude = code.slice(rule.preludeStart, rule.braceStart);
    return splitSelectorListWithOffsets(prelude).map((part) => {
      const offset = rule.preludeStart + part.offset;
      return { ...position(code, file.path, offset), authored: part.authored, selector: part.selector, selectorList: rule.selectorList };
    });
  });
}

function hookFacts(selector: CssSelectorFact, sourceText: string): readonly CssSelectorHookFact[] {
  const classes = selectorClassHooks(selector.authored).map((hook) => ({
    ...position(sourceText, selector.file, selector.offset + hook.offset),
    kind: "class" as const,
    name: hook.name,
  }));
  const data = selectorDataAttributes(selector.authored).map((hook) => ({
    ...position(sourceText, selector.file, selector.offset + hook.open),
    kind: "data" as const,
    name: hook.name,
    operator: hook.operator,
    value: hook.value,
  }));
  return [...classes, ...data];
}

function declarationFacts(file: AuthoredCssFile): readonly CssDeclarationFact[] {
  const styleDeclarations = file.rules.flatMap((rule) =>
    rule.declarations.map(
      (declaration): CssDeclarationFact => ({
        file: file.path,
        line: declaration.line,
        column: declaration.column,
        offset: declaration.offset,
        property: declaration.prop,
        value: declaration.value,
        owner: { kind: "style-rule", selectorList: rule.selectorList },
      }),
    ),
  );
  const atRuleDeclarations = file.atRules.flatMap((atRule) =>
    atRule.declarations.map(
      (declaration): CssDeclarationFact => ({
        file: file.path,
        line: declaration.line,
        column: declaration.column,
        offset: declaration.offset,
        property: declaration.prop,
        value: declaration.value,
        owner: { kind: "at-rule", prelude: atRule.prelude, line: atRule.line, offset: atRule.offset },
      }),
    ),
  );
  return [...styleDeclarations, ...atRuleDeclarations].toSorted((left, right) => left.offset - right.offset);
}

function statementFacts(file: AuthoredCssFile): readonly CssStatementAtRuleFact[] {
  return file.statements.map((statement) => ({
    ...position(file.text, file.path, statement.offset),
    name: statement.name,
    prelude: statement.prelude,
  }));
}

/** Flatten one loaded CSS corpus without re-reading paths or deciding policy. */
export function collectCssFacts(files: readonly AuthoredCssFile[]): CssFacts {
  const parsedDeclarations = files.flatMap(declarationFacts);
  const selectorRows = files.map((file) => ({ file, selectors: selectorFacts(file) }));
  const selectors = selectorRows.flatMap((row) => row.selectors);
  const selectorHookFacts = selectorRows.flatMap((row) => row.selectors.flatMap((selector) => hookFacts(selector, row.file.text)));
  const statements = files.flatMap(statementFacts);
  const definitions = files.flatMap(customPropertyDefinitions);
  const references = files.flatMap(customPropertyReferences);
  return {
    files,
    declarations: parsedDeclarations,
    selectors,
    selectorHooks: selectorHookFacts,
    statements,
    customPropertyDefinitions: definitions,
    customPropertyReferences: references,
    population: {
      files: files.length,
      rules: files.reduce((count, file) => count + file.rules.length, 0),
      declarations: parsedDeclarations.length,
      selectors: selectors.length,
      selectorHooks: selectorHookFacts.length,
      statements: statements.length,
      customPropertyDefinitions: definitions.length,
      customPropertyReferences: references.length,
    },
  };
}
