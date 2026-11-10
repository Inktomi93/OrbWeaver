// The caps-voice cohort: each client `<Text>` or `<Heading>` set in a voice whose recipe sets `uppercase`, with whether its words are a
// label or prose. Prose never borrows a caps voice (docs/law/UI-Architecture-and-Layout.md, the voice table).
import { posix } from "node:path";
import ts from "typescript";
import type { ComponentTables, Elem, FileFacts } from "../eslint/index.ts";
import { attrString, childrenText, constInitializer, unwrap } from "../eslint/index.ts";
import type { Cohort, Member } from "../floor/verdict/cohort-compare.ts";

const TEXT_DOOR = "text";
const VOICE_AXIS = "voice";
const UPPERCASE = "uppercase";
const CHILDREN = "children";

const PROSE = "prose";
const LABEL = "label";
const DYNAMIC = "dynamic";

// A label names a thing in a few words; a sentence or a clause runs longer or closes with sentence punctuation. A `·`
// joins separate labels, so each part is counted on its own.
// Function words are not counted: "Fields in this rewrite" is a two-word label. A `label: gloss` pair is a clause in one voice.
const LABEL_MAX_WORDS = 3;
const CLAUSE_END = /[.!?]$/u;
const GLOSSED = /\p{L}:\s+\p{L}/u;
const FUNCTION_WORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "with", "from", "by", "at", "as", "this", "that", "your", "its"]);

const contentWords = (part: string): number => part.split(/\s+/u).filter((word) => /\p{L}/u.test(word) && !FUNCTION_WORDS.has(word.toLowerCase())).length;

// Whether written words read as a label or as prose.
function proseOf(text: string): string {
  const words = Math.max(...text.split("·").map(contentWords));
  return CLAUSE_END.test(text.trim()) || GLOSSED.test(text) || words > LABEL_MAX_WORDS ? PROSE : LABEL;
}

// Per component of the text door (Text, Heading), the voices whose arm sets uppercase, read from its table.
function capsVoices(components: ComponentTables): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map(
    [...(components.get(TEXT_DOOR) ?? new Map())].map(([component, recipe]) => {
      const voices = recipe.declared.get(VOICE_AXIS) ?? new Map();
      return [component, new Set([...voices].filter(([, arm]) => arm.tokens.includes(UPPERCASE)).map(([voice]) => voice))] as const;
    }),
  );
}

// The arms of a conditional, `??` or `||`: the element shows one of them.
function armsOf(node: ts.Expression): readonly ts.Expression[] | null {
  if (ts.isConditionalExpression(node)) {
    return [node.whenTrue, node.whenFalse];
  }
  const either = ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind);
  return either ? [node.left, node.right] : null;
}

// The written strings an expression shows: a literal, a same-file const, or either arm of a conditional or `??`/`||`.
function writtenStrings(expression: ts.Expression, sf: ts.SourceFile): readonly string[] | null {
  const node = unwrap(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text];
  }
  const arms = armsOf(node);
  if (arms !== null) {
    const read = arms.map((arm) => writtenStrings(arm, sf));
    return read.some((strings) => strings === null) ? null : read.flatMap((strings) => strings ?? []);
  }
  const init = ts.isIdentifier(node) ? constInitializer(sf, node.text) : null;
  return init === null ? null : writtenStrings(init, sf);
}

type Shown = { readonly kind: "written"; readonly strings: readonly string[] } | { readonly kind: "forwarded" } | { readonly kind: "dynamic" };

function shownBy(element: ts.JsxElement | ts.JsxSelfClosingElement, sf: ts.SourceFile): Shown {
  const written = childrenText(element);
  if (written !== null) {
    return { kind: "written", strings: [written] };
  }
  const expressions = ts.isJsxElement(element) ? element.children.filter((child) => !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces)) : [];
  const [only] = expressions;
  if (expressions.length !== 1 || only === undefined || !ts.isJsxExpression(only) || only.expression === undefined) {
    return { kind: "dynamic" };
  }
  const value = unwrap(only.expression);
  if ((ts.isIdentifier(value) && value.text === CHILDREN) || (ts.isPropertyAccessExpression(value) && value.name.text === CHILDREN)) {
    return { kind: "forwarded" };
  }
  const strings = writtenStrings(value, sf);
  return strings === null ? { kind: "dynamic" } : { kind: "written", strings };
}

// The component a forwarding `<Text>` sits in: a function declaration or a const holding a function, by its name.
function componentOf(node: ts.Node): string | null {
  for (let at: ts.Node = node.parent; !ts.isSourceFile(at); at = at.parent) {
    if (ts.isFunctionDeclaration(at) && at.name !== undefined) {
      return at.name.text;
    }
    if ((ts.isArrowFunction(at) || ts.isFunctionExpression(at)) && ts.isVariableDeclaration(at.parent) && ts.isIdentifier(at.parent.name)) {
      return at.parent.name.text;
    }
  }
  return null;
}

function verdictOf(shown: Shown): string {
  if (shown.kind !== "written") {
    return DYNAMIC;
  }
  return shown.strings.some((text) => proseOf(text) === PROSE) ? PROSE : LABEL;
}

const labelOf = (shown: Shown, fallback: string): string => (shown.kind === "written" ? shown.strings.join(" | ") : fallback);

// A call site renders the host component when it sits in the host's file with no import, or imports the host's file by a
// relative path. A barrel or alias import is not followed.
function rendersHost(callerPath: string, site: Elem, hostPath: string): boolean {
  if (site.imported === null) {
    return callerPath === hostPath;
  }
  const spec = site.imported.source;
  if (!spec.startsWith(".")) {
    return false;
  }
  const target = posix.join(posix.dirname(callerPath), spec);
  return target === hostPath || target === hostPath.replace(/\.tsx?$/u, "");
}

type ParsedFacts = FileFacts & { readonly source: FileFacts["source"] & { readonly sf: ts.SourceFile } };

const parsed = (facts: FileFacts): facts is ParsedFacts => facts.source.sf !== null;

interface Read {
  readonly facts: ParsedFacts;
  readonly line: number;
  readonly element: ts.JsxElement | ts.JsxSelfClosingElement;
  readonly voice: string;
  /** The component whose `children` the caps `<Text>` shows, when this is one of its call sites. */
  readonly via: string | null;
}

function memberOf({ facts, line, element, voice, via }: Read): Member {
  const shown = shownBy(element, facts.source.sf);
  const label = labelOf(shown, element.getText(facts.source.sf));
  return {
    path: facts.source.path,
    section: facts.source.section,
    label: via === null ? label : `${label} (via ${via})`,
    cells: { prose: { value: verdictOf(shown), line }, voice: { value: voice, line } },
  };
}

/**
 * One member per caps-voiced `<Text>` in the client, judged by the words it shows. A `<Text>` that shows its component's
 * own `children` is judged at each call site of that component, one hop out.
 */
export function buildCapsProseCohort(all: readonly FileFacts[], components: ComponentTables): Cohort {
  const caps = capsVoices(components);
  const client = all.filter((facts) => facts.source.layer === "client").filter(parsed);
  const seen = new Set<string>();
  const members = client
    .flatMap((facts) =>
      facts.elems.flatMap((elem) => {
        const voice = attrString(elem.attrs.get(VOICE_AXIS));
        const capsHere = elem.kind === "ui" && elem.door === TEXT_DOOR ? caps.get(elem.imported?.name ?? elem.tag) : undefined;
        if (capsHere === undefined || voice === undefined || !capsHere.has(voice)) {
          return [];
        }
        const host = shownBy(elem.element, facts.source.sf).kind === "forwarded" ? componentOf(elem.element) : null;
        if (host === null) {
          return [memberOf({ facts, line: elem.line, element: elem.element, voice, via: null })];
        }
        return client.flatMap((caller) =>
          caller.elems
            .filter((site) => site.tag === host && rendersHost(caller.source.path, site, facts.source.path))
            .map((site) => memberOf({ facts: caller, line: site.line, element: site.element, voice, via: host })),
        );
      }),
    )
    .filter((entry) => {
      // A component with several caps `<Text>` that show its children is one member per call site.
      const key = `${entry.path}:${entry.cells["prose"]?.line ?? 0}`;
      const fresh = !seen.has(key);
      seen.add(key);
      return fresh;
    });
  return {
    name: "caps-voice",
    what: "client Text and Heading elements set in a caps voice (a voice whose recipe sets uppercase), with whether their words are a label or prose",
    columns: [],
    info: ["prose", "voice"],
    // Prose never borrows a caps voice; a clause that needs both splits into a caps label and a sentence-case gloss.
    defects: { prose: [PROSE] },
    basis: { prose: "heuristic", voice: "measured" },
    members,
  };
}
