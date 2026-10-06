// SQL aliases belong to a SELECT scope. A json_each row can flow through an explicit CTE projection;
// neither a coincident alias in another query nor an arbitrary CTE expression proves virtual lineage.

interface Token {
  readonly word: string;
  readonly start: number;
  readonly end: number;
  readonly quotedIdentifier: boolean;
  readonly stringLiteral: boolean;
}

interface Scope {
  readonly start: number;
  readonly end: number;
  readonly parent: Scope | undefined;
  readonly aliases: Map<string, Relation>;
  readonly ctes: Map<string, Scope>;
  ambiguous: boolean;
}

type Scopes = readonly [Scope, ...Scope[]];

interface Relation {
  readonly table: string;
  readonly projection: Scope | undefined;
}

export interface SqlAliasBindings {
  readonly tableOf: (alias: string, column: string, offset: number) => string | undefined;
}

export const SQL_VIRTUAL_TABLE = ":json_each";
const DIRECT_PROJECTION_TOKENS = 3;
const RENAMED_PROJECTION_TOKENS = 5;
const RESERVED = new Set(["where", "join", "left", "right", "inner", "outer", "cross", "on", "group", "order", "limit", "union", "having", "using", "offset"]);
const FROM_END = new Set(["where", "group", "order", "limit", "union", "having", "offset", "window", "intersect", "except", "returning"]);

/** Quoted names are tokens only; relation positions own their interpretation, never SQL structure. */
function tokensOf(text: string): Token[] {
  const out: Token[] = [];
  const token = /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]|--[^\n]*|\/\*[\s\S]*?\*\/|«[^»]*»|[a-z_][a-z0-9_]*|[(),.]/giu;
  for (const match of text.matchAll(token)) {
    const word = match[0].toLowerCase();
    const quotedIdentifier = /^["`[]/u.test(word);
    const stringLiteral = word.startsWith("'");
    if (/^[a-z_(.),]/u.test(word) || quotedIdentifier || stringLiteral) {
      out.push({ word, start: match.index, end: match.index + word.length, quotedIdentifier, stringLiteral });
    }
  }
  return out;
}

function relationIdentifier(token: Token | undefined): string | undefined {
  if (token === undefined) {
    return;
  }
  if (token.stringLiteral) {
    throw new Error("open-json parity: cannot prove string-quoted SQL relation identifier");
  }
  const name = token.quotedIdentifier ? token.word.slice(1, -1) : token.word;
  if (token.quotedIdentifier && !/^[a-z_][a-z0-9_]*$/u.test(name)) {
    throw new Error("open-json parity: cannot prove complex quoted SQL relation identifier");
  }
  return /^[a-z_][a-z0-9_]*$/u.test(name) ? name : undefined;
}

function scopesOf(tokens: readonly Token[], end: number): Scopes {
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (const token of tokens) {
    if (token.word === "(") {
      stack.push(token.start);
    } else if (token.word === ")") {
      const start = stack.pop();
      if (start !== undefined) {
        pairs.set(start, token.end);
      }
    }
  }
  const bounds = new Map<number, number>([[0, end]]);
  for (const token of tokens.filter((candidate) => candidate.word === "select")) {
    const nearest = [...pairs].filter(([start, finish]) => start < token.start && finish > token.end).sort(([a], [b]) => b - a)[0];
    if (nearest !== undefined) {
      bounds.set(nearest[0], nearest[1]);
    }
  }
  const scopes: [Scope, ...Scope[]] = [{ start: 0, end, parent: undefined, aliases: new Map(), ctes: new Map(), ambiguous: false }];
  for (const [start, finish] of [...bounds].sort(([a], [b]) => a - b)) {
    if (start === 0) {
      continue;
    }
    const parent = scopes.filter((scope) => scope.start < start && scope.end >= finish).at(-1);
    scopes.push({ start, end: finish, parent, aliases: new Map(), ctes: new Map(), ambiguous: false });
  }
  for (const scope of scopes) {
    scope.ambiguous = tokens.filter((token) => token.word === "select" && scopeAt(scopes, token.start) === scope).length > 1;
  }
  return scopes;
}

function scopeAt(scopes: Scopes, offset: number): Scope {
  return scopes.filter((scope) => scope.start <= offset && scope.end > offset).at(-1) ?? scopes[0];
}

function cteOf(scope: Scope | undefined, name: string): Scope | undefined {
  let found: Scope | undefined;
  for (let current = scope; current !== undefined && found === undefined; current = current.parent) {
    found = current.ctes.get(name);
  }
  return found;
}

function relationOf(scope: Scope | undefined, alias: string): Relation | undefined {
  let found: Relation | undefined;
  for (let current = scope; current !== undefined && found === undefined; current = current.parent) {
    if (current.ambiguous) {
      throw new Error("open-json parity: cannot prove SQL aliases across compound SELECT branches");
    }
    found = current.aliases.get(alias);
  }
  return found;
}

function cteBindings(scopes: Scopes, tokens: readonly Token[]): void {
  for (let i = 0; i < tokens.length; i += 1) {
    const name = tokens[i];
    const open = tokens[i + 2];
    if (name === undefined || tokens[i + 1]?.word !== "as" || open?.word !== "(") {
      continue;
    }
    const child = scopes.find((scope) => scope.start === open.start);
    if (child !== undefined) {
      scopeAt(scopes, name.start).ctes.set(name.word, child);
    }
  }
}

function afterArguments(tokens: readonly Token[], start: number): number | undefined {
  let after: number | undefined;
  let depth = 0;
  if (tokens[start]?.word === "(") {
    for (let i = start; i < tokens.length && after === undefined; i += 1) {
      const word = tokens[i]?.word;
      if (word === "(") {
        depth += 1;
      }
      if (word === ")") {
        depth -= 1;
        if (depth === 0) {
          after = i + 1;
        }
      }
    }
  }
  return after;
}

function bindRelation(scopes: Scopes, tokens: readonly Token[], sourceIndex: number): void {
  const source = tokens[sourceIndex];
  const sourceName = relationIdentifier(source);
  if (source === undefined || sourceName === undefined) {
    return;
  }
  const scope = scopeAt(scopes, source.start);
  const virtual = sourceName === "json_each" || sourceName === "json_tree";
  let next = virtual ? afterArguments(tokens, sourceIndex + 1) : sourceIndex + 1;
  if (next === undefined) {
    return;
  }
  if (tokens[next]?.word === "as") {
    next += 1;
  }
  const alias = tokens[next];
  const declaredAlias = relationIdentifier(alias);
  const aliasName = declaredAlias !== undefined && (alias?.quotedIdentifier === true || !RESERVED.has(declaredAlias)) ? declaredAlias : sourceName;
  scope.aliases.set(aliasName, { table: virtual ? SQL_VIRTUAL_TABLE : sourceName, projection: virtual ? undefined : cteOf(scope, sourceName) });
}

interface ScopedToken {
  readonly token: Token;
  readonly index: number;
  readonly depth: number;
}

function scopedTokens(scope: Scope, scopes: Scopes, tokens: readonly Token[]): readonly ScopedToken[] {
  const own: ScopedToken[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined || scopeAt(scopes, token.start) !== scope) {
      continue;
    }
    if (token.word === "(") {
      depth += 1;
    }
    if (token.word === ")") {
      depth -= 1;
    }
    own.push({ token, index: i, depth });
  }
  return own;
}

function scopeRelationStarts(scope: Scope, scopes: Scopes, tokens: readonly Token[]): readonly number[] {
  const starts: number[] = [];
  let selectDepth: number | undefined;
  let fromDepth: number | undefined;
  let fromSeen = false;
  for (const { token, index, depth } of scopedTokens(scope, scopes, tokens)) {
    if (token.word === "select") {
      selectDepth = depth;
    }
    if (token.word === "from" && depth === selectDepth && !fromSeen) {
      fromSeen = true;
      fromDepth = depth;
      starts.push(index + 1);
    } else if (FROM_END.has(token.word) && depth === selectDepth) {
      fromDepth = undefined;
    } else if ((token.word === "join" || token.word === ",") && depth === fromDepth) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function bindingsOf(scopes: Scopes, tokens: readonly Token[]): void {
  cteBindings(scopes, tokens);
  for (const scope of scopes) {
    for (const index of scopeRelationStarts(scope, scopes, tokens)) {
      bindRelation(scopes, tokens, index);
    }
  }
}

function directProjection(projection: readonly Token[], column: string): readonly [string, string] | undefined {
  const [alias, dot, field, as, renamed] = projection;
  if (alias === undefined || dot?.word !== "." || field === undefined || (renamed?.word ?? field.word) !== column) {
    return;
  }
  return projection.length === DIRECT_PROJECTION_TOKENS || (projection.length === RENAMED_PROJECTION_TOKENS && as?.word === "as")
    ? [alias.word, field.word]
    : undefined;
}

function projectedSource(scope: Scope, column: string, tokens: readonly Token[], scopes: Scopes): readonly [string, string] | undefined {
  const own = tokens.filter((token) => scopeAt(scopes, token.start) === scope);
  const select = own.findIndex((token) => token.word === "select");
  const from = own.findIndex((token, i) => i > select && token.word === "from");
  if (select < 0 || from < 0) {
    return;
  }
  const projections: Token[][] = [[]];
  let depth = 0;
  for (const token of own.slice(select + 1, from)) {
    if (token.word === "(") {
      depth += 1;
    }
    if (token.word === ")") {
      depth -= 1;
    }
    if (token.word === "," && depth === 0) {
      projections.push([]);
    } else {
      projections.at(-1)?.push(token);
    }
  }
  return projections.map((projection) => directProjection(projection, column)).find((projected) => projected !== undefined);
}

/** Resolve only demonstrated virtual columns; unsupported CTE projections keep the conservative column reader. */
export function sqlAliasBindings(text: string): SqlAliasBindings {
  const tokens = tokensOf(text);
  const scopes = scopesOf(tokens, text.length + 1);
  bindingsOf(scopes, tokens);
  const tableOf = (scope: Scope, alias: string, column: string, seen: ReadonlySet<Scope>): string | undefined => {
    const relation = relationOf(scope, alias);
    if (relation?.projection === undefined) {
      return relation?.table;
    }
    if (seen.has(relation.projection)) {
      return relation.table;
    }
    const projected = projectedSource(relation.projection, column, tokens, scopes);
    if (projected === undefined) {
      return relation.table;
    }
    const origin = tableOf(relation.projection, projected[0], projected[1], new Set([...seen, relation.projection]));
    return origin === SQL_VIRTUAL_TABLE ? origin : relation.table;
  };
  return { tableOf: (alias, column, offset) => tableOf(scopeAt(scopes, offset), alias, column, new Set()) };
}
