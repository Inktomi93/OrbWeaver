// Matching for the templates ./held.ts answers with (`Text.parts`): each text compiles to a small automaton over
// characters, linear in the template's lists, so a name is tested against a template, and two templates against each
// other, without building the product of their lists. A head (an open text) is a prefix any name may continue.
import type { Text } from "./held.ts";

/** The characters that end an attribute name inside a selector: `]`, or a value operator. */
const SELECTOR_END: readonly string[] = ["]", "=", "~", "|", "^", "$", "*"];
const SELECTOR_START: readonly string[] = ["["];

// An edge consumes one character among `chars`, or any character when `chars` is null.
interface Edge {
  readonly chars: readonly string[] | null;
  readonly to: number;
}

interface Automaton {
  readonly edges: readonly (readonly Edge[])[];
  readonly empty: readonly (readonly number[])[];
  readonly start: number;
  readonly accept: number;
}

class Builder {
  readonly edges: Edge[][] = [];
  readonly empty: number[][] = [];

  node(): number {
    this.edges.push([]);
    this.empty.push([]);
    return this.edges.length - 1;
  }

  edge(from: number, chars: readonly string[] | null, to: number): void {
    this.edges[from]?.push({ chars, to });
  }

  skip(from: number, to: number): void {
    this.empty[from]?.push(to);
  }

  word(from: number, word: string): number {
    let at = from;
    for (const char of word) {
      const next = this.node();
      this.edge(at, [char], next);
      at = next;
    }
    return at;
  }

  // The automaton of a text from `from`; its end node.
  text(text: Text, from: number): number {
    if (text.parts === undefined) {
      const end = this.word(from, text.text);
      if (text.open) {
        this.edge(end, null, end);
      }
      return end;
    }
    let at = from;
    for (const part of text.parts) {
      if (typeof part === "string") {
        at = this.word(at, part);
        continue;
      }
      const end = this.node();
      for (const alternative of part) {
        this.skip(this.text(alternative, at), end);
      }
      at = end;
    }
    return at;
  }

  done(start: number, accept: number): Automaton {
    return { edges: this.edges, empty: this.empty, start, accept };
  }
}

const compiled = new WeakMap<Text, Automaton>();

function compile(text: Text): Automaton {
  const known = compiled.get(text);
  if (known !== undefined) {
    return known;
  }
  const builder = new Builder();
  const start = builder.node();
  const made = builder.done(start, builder.text(text, start));
  compiled.set(text, made);
  return made;
}

// A selector a template spells reads a name when it can hold `[`, the name, then a character that ends the name.
function inSelector(name: Text): Automaton {
  const builder = new Builder();
  const start = builder.node();
  builder.edge(start, null, start);
  const open = builder.node();
  builder.edge(start, SELECTOR_START, open);
  const named = builder.text(name, open);
  const accept = builder.node();
  builder.edge(named, SELECTOR_END, accept);
  builder.edge(accept, null, accept);
  return builder.done(start, accept);
}

function closure(machine: Automaton, nodes: Iterable<number>): Set<number> {
  const out = new Set(nodes);
  const todo = [...out];
  for (let node = todo.pop(); node !== undefined; node = todo.pop()) {
    for (const next of machine.empty[node] ?? []) {
      if (!out.has(next)) {
        out.add(next);
        todo.push(next);
      }
    }
  }
  return out;
}

// The characters two edges both take: null for any, an empty list for none.
function shared(a: readonly string[] | null, b: readonly string[] | null): readonly string[] | null {
  if (a === null) {
    return b;
  }
  return b === null ? a : a.filter((char) => b.includes(char));
}

// Whether some string takes both automata from start to accept: a search over pairs of their nodes.
function meet(a: Automaton, b: Automaton): boolean {
  const seen = new Set<string>();
  const todo: [number, number][] = [];
  const visit = (x: number, y: number): void => {
    for (const p of closure(a, [x])) {
      for (const r of closure(b, [y])) {
        const key = `${String(p)}:${String(r)}`;
        if (!seen.has(key)) {
          seen.add(key);
          todo.push([p, r]);
        }
      }
    }
  };
  visit(a.start, b.start);
  for (let pair = todo.pop(); pair !== undefined; pair = todo.pop()) {
    const [x, y] = pair;
    if (x === a.accept && y === b.accept) {
      return true;
    }
    for (const left of a.edges[x] ?? []) {
      for (const right of b.edges[y] ?? []) {
        if (shared(left.chars, right.chars)?.length !== 0) {
          visit(left.to, right.to);
        }
      }
    }
  }
  return false;
}

/** Whether `text` can be the name `name`: a template takes it part by part, a head as a prefix. */
export function holds(text: Text, name: string): boolean {
  if (text.parts === undefined) {
    return text.open ? name.startsWith(text.text) : name === text.text;
  }
  return meet(compile(text), compile({ text: name, open: false }));
}

/** Whether two texts can be one name. */
export function meets(a: Text, b: Text): boolean {
  if (a.parts === undefined && b.parts === undefined) {
    if (a.open || b.open) {
      return a.text.startsWith(b.text) || b.text.startsWith(a.text);
    }
    return a.text === b.text;
  }
  return meet(compile(a), compile(b));
}

/** Whether a selector text can name `name` in an attribute selector. */
export function selects(selector: Text, name: Text): boolean {
  return meet(compile(selector), inSelector(name));
}

/** How many names a text can be; a head can be any number. */
export function nameCount(text: Text): number {
  if (text.parts === undefined) {
    return text.open ? Number.POSITIVE_INFINITY : 1;
  }
  return text.parts.reduce(
    (product, part) => (typeof part === "string" ? product : product * part.reduce((sum, alternative) => sum + nameCount(alternative), 0)),
    1,
  );
}
