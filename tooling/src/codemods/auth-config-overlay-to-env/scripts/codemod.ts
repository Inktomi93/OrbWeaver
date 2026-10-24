// Rewrites a test root's `authConfig` overlay into raw `env` keys when the env parse accepts the pairing, so one record
// drives the auth seam and every reader of it. A refused pairing, a computed value or an unmapped field stays as written.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const POSTURE_KEYS = new Set(["AUTH_MODE", "AUTH_FALLBACK"]);
// A root without a stated fallback ran on the default record, whose `single-user` mode resolves it to `owner`.
const DEFAULT_RECORD_FALLBACK = '"owner"';
const REFUSED_MODE = '"single-user"';
const REFUSED_FALLBACK = '"deny"';
const OIDC_MODE = '"oidc"';
// Under `oidc` the parse requires the client keys, which only the root's `oidc` option lays into the record.
const OIDC_OPTION = "oidc";

const AUTH_CONFIG_PAIR: RuleConfig<TS> = {
  rule: {
    kind: "pair",
    all: [{ has: { field: "key", regex: "^authConfig$" } }, { has: { field: "value", kind: "object" } }],
  },
};

// The overlay bound to a `const authConfig` first, then handed over as the shorthand `{ authConfig }`.
const AUTH_CONFIG_CONST: RuleConfig<TS> = {
  rule: { kind: "variable_declarator", has: { field: "name", regex: "^authConfig$" } },
};
// The renamed binding, so it never shadows an `env` already in scope.
const ENV_BINDING = "authEnv";
const OVERLAY_TYPE_SUFFIX = '["authConfig"]';
const ENV_TYPE_SUFFIX = '["env"]';

export const getSelector: GetSelector<TS> = () => ({ rule: { any: [AUTH_CONFIG_PAIR.rule, AUTH_CONFIG_CONST.rule] } });

function keyOf(pair: SgNode<TS>): string | undefined {
  const key = pair.field("key");
  return key?.is("property_identifier") === true ? key.text() : undefined;
}

function named(node: SgNode<TS>): SgNode<TS>[] {
  return node.children().filter((child) => child.isNamed() && !child.is("comment"));
}

// A literal or a name passes through, `as const` dropped; a computed expression is a judgment edit.
function scalarText(value: SgNode<TS>): string | undefined {
  const [inner] = named(value);
  if (value.is("as_expression") && value.text().endsWith("as const") && inner !== undefined) {
    return scalarText(inner);
  }
  return value.is("string") || value.is("identifier") || value.is("member_expression") ? value.text() : undefined;
}

// `null` is an empty list: the key's unset value parses to the same empty list, so the entry is omitted.
function listText(value: SgNode<TS>): string | null | undefined {
  if (!value.is("array")) {
    return;
  }
  const items = named(value);
  if (items.length === 0) {
    return null;
  }
  if (items.every((item) => item.is("string"))) {
    return JSON.stringify(items.map((item) => item.text().slice(1, -1)).join(","));
  }
  const [only] = items;
  return items.length === 1 && only !== undefined ? scalarText(only) : undefined;
}

function booleanText(value: SgNode<TS>): string | undefined {
  return value.is("true") || value.is("false") ? JSON.stringify(value.text()) : undefined;
}

interface FieldRewrite {
  readonly key: string;
  readonly read: (value: SgNode<TS>) => string | null | undefined;
}

// Each overlay field, the env key `authConfigFromEnv` reads it from and the value's raw spelling. `defaultHandle` is
// absent on purpose: its key also feeds the role policy, so moving it changes more than the auth seam.
const FIELDS: Readonly<Record<string, FieldRewrite>> = {
  mode: { key: "AUTH_MODE", read: scalarText },
  fallback: { key: "AUTH_FALLBACK", read: scalarText },
  jwtIssuer: { key: "FORWARD_AUTH_JWT_ISSUER", read: scalarText },
  jwtAudience: { key: "FORWARD_AUTH_JWT_AUDIENCE", read: scalarText },
  forwardUserHeader: { key: "FORWARD_AUTH_USER_HEADER", read: scalarText },
  forwardGroupsHeader: { key: "FORWARD_AUTH_GROUPS_HEADER", read: scalarText },
  forwardUidHeader: { key: "FORWARD_AUTH_UID_HEADER", read: scalarText },
  forwardEmailHeader: { key: "FORWARD_AUTH_EMAIL_HEADER", read: scalarText },
  forwardTrustedProxies: { key: "FORWARD_AUTH_TRUSTED_PROXIES", read: listText },
  fallbackTrustedPeers: { key: "AUTH_FALLBACK_TRUSTED_PEERS", read: listText },
  jwksAllowlist: { key: "FORWARD_AUTH_JWKS_ALLOWLIST", read: listText },
  verifyForwardJwt: { key: "FORWARD_AUTH_VERIFY_JWT", read: booleanText },
};

// The field's env entry, `null` for a field whose value is the key's unset default, undefined for no rewrite.
function entryOf(field: SgNode<TS>): readonly [string, string] | null | undefined {
  const name = field.is("pair") ? keyOf(field) : undefined;
  const value = field.field("value");
  const mapped = name === undefined ? undefined : FIELDS[name];
  const text = mapped === undefined || value === null ? undefined : mapped.read(value);
  if (mapped === undefined || text === undefined) {
    return;
  }
  return text === null ? null : [mapped.key, text];
}

// The env entries the overlay states, in its own order, or undefined when any field is no mechanical rewrite.
function entriesOf(overlay: SgNode<TS>): Map<string, string> | undefined {
  const entries = new Map<string, string>();
  for (const field of named(overlay)) {
    const entry = entryOf(field);
    if (entry === undefined) {
      return;
    }
    if (entry !== null) {
      entries.set(...entry);
    }
  }
  return entries;
}

function siblingPair(container: SgNode<TS>, name: string): SgNode<TS> | undefined {
  return named(container).find((child) => child.is("pair") && keyOf(child) === name);
}

// The parse refuses an explicit `deny` under `single-user`, and `oidc` without its client keys.
function parseAccepts(entries: ReadonlyMap<string, string>, container: SgNode<TS>): boolean {
  const mode = entries.get("AUTH_MODE");
  if (mode === undefined) {
    return false;
  }
  if (mode === REFUSED_MODE && entries.get("AUTH_FALLBACK") === REFUSED_FALLBACK) {
    return false;
  }
  return mode !== OIDC_MODE || siblingPair(container, OIDC_OPTION) !== undefined;
}

function renderEntries(entries: ReadonlyMap<string, string>): string {
  return [...entries].map(([key, text]) => `["${key}"]: ${text}`).join(", ");
}

// The pair and the comma that separates it from its neighbour, so the object keeps one separator per gap.
function deletion(pair: SgNode<TS>): Edit {
  const siblings = pair.parent()?.children() ?? [];
  const index = siblings.findIndex((child) => child.id() === pair.id());
  const after = siblings.slice(index + 1);
  const comma = after.find((child) => child.is(","));
  const nextNamed = after.find((child) => child.isNamed());
  if (comma !== undefined && nextNamed !== undefined) {
    return { startPos: pair.range().start.index, endPos: nextNamed.range().start.index, insertedText: "" };
  }
  // The last pair: a trailing comma stays for the pair before it, else the leading comma goes with the pair.
  const leading = siblings
    .slice(0, index)
    .reverse()
    .find((child) => child.is(","));
  if (comma !== undefined) {
    return { startPos: leading?.range().end.index ?? pair.range().start.index, endPos: comma.range().end.index, insertedText: "" };
  }
  return { startPos: leading?.range().start.index ?? pair.range().start.index, endPos: pair.range().end.index, insertedText: "" };
}

function rewrite(pair: SgNode<TS>): Edit[] | undefined {
  const overlay = pair.field("value");
  const container = pair.parent();
  if (overlay === null || container === null || !container.is("object")) {
    return;
  }
  const entries = entriesOf(overlay);
  if (entries === undefined || !parseAccepts(entries, container)) {
    return;
  }
  return rewriteWith(pair, container, withFallback(entries));
}

// The fallback follows the mode so the record reads the way its parse resolves it.
function withFallback(entries: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  if (entries.has("AUTH_FALLBACK")) {
    return entries;
  }
  return new Map([...entries].flatMap((entry) => (entry[0] === "AUTH_MODE" ? [entry, ["AUTH_FALLBACK", DEFAULT_RECORD_FALLBACK] as const] : [entry])));
}

function rewriteWith(pair: SgNode<TS>, container: SgNode<TS>, entries: ReadonlyMap<string, string>): Edit[] | undefined {
  const env = siblingPair(container, "env");
  if (env === undefined) {
    return [pair.replace(`env: { ${renderEntries(entries)} }`)];
  }
  const record = env.field("value");
  if (record?.is("object") !== true) {
    return;
  }
  const stated = named(record);
  const statesPosture = stated.some((entry) => {
    const key = entry.field("key");
    return key?.is("computed_property_name") === true && POSTURE_KEYS.has(key.text().slice(2, -2));
  });
  if (statesPosture) {
    return;
  }
  const last = stated.at(-1);
  const merged: Edit =
    last === undefined
      ? record.replace(`{ ${renderEntries(entries)} }`)
      : { startPos: last.range().end.index, endPos: last.range().end.index, insertedText: `, ${renderEntries(entries)}` };
  return [merged, deletion(pair)];
}

// The object a `const` binds, bare or under `satisfies <type>["authConfig"]`, with the type rewritten to `["env"]`.
function boundOverlay(declarator: SgNode<TS>): { readonly overlay: SgNode<TS>; readonly typeText: string } | undefined {
  const value = declarator.field("value");
  if (value?.is("object") === true) {
    return { overlay: value, typeText: "" };
  }
  const [overlay, type] = value?.is("satisfies_expression") === true ? named(value) : [];
  if (overlay?.is("object") !== true || type?.text().endsWith(OVERLAY_TYPE_SUFFIX) !== true) {
    return;
  }
  return { overlay, typeText: ` satisfies ${type.text().slice(0, -OVERLAY_TYPE_SUFFIX.length)}${ENV_TYPE_SUFFIX}` };
}

// Every use of the binding must be a shorthand `{ authConfig }` in an object with no `env` of its own; any other
// read of the binding is a judgment edit.
function shorthandUses(declarator: SgNode<TS>): SgNode<TS>[] | undefined {
  const scope = declarator.ancestors().find((node) => node.is("statement_block") || node.is("program"));
  if (scope === undefined) {
    return;
  }
  const shorthands = scope.findAll({ rule: { kind: "shorthand_property_identifier", regex: "^authConfig$" } });
  const otherReads = scope.findAll({ rule: { kind: "identifier", regex: "^authConfig$" } }).filter((node) => node.id() !== declarator.field("name")?.id());
  const ownEnv = shorthands.some((use) => {
    const container = use.parent();
    return container === null || siblingPair(container, "env") !== undefined;
  });
  return shorthands.length === 0 || otherReads.length > 0 || ownEnv ? undefined : shorthands;
}

function rewriteConst(declarator: SgNode<TS>): Edit[] | undefined {
  const bound = boundOverlay(declarator);
  const entries = bound === undefined ? undefined : entriesOf(bound.overlay);
  const mode = entries?.get("AUTH_MODE");
  // A bound `oidc` overlay cannot show the use sites' client keys, so it stays a judgment edit.
  if (bound === undefined || entries === undefined || mode === undefined || mode === OIDC_MODE) {
    return;
  }
  if (mode === REFUSED_MODE && entries.get("AUTH_FALLBACK") === REFUSED_FALLBACK) {
    return;
  }
  const uses = shorthandUses(declarator);
  if (uses === undefined) {
    return;
  }
  return [
    declarator.replace(`${ENV_BINDING} = { ${renderEntries(withFallback(entries))} }${bound.typeText}`),
    ...uses.map((use) => use.replace(`env: ${ENV_BINDING}`)),
  ];
}

const codemod: Codemod<TS> = (root, options) => {
  const skipped = new Set((options.params["skip"] ?? "").split(",").filter((path) => path.length > 0));
  if (skipped.has(root.relativeFilename())) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const pairs = rootNode.findAll(AUTH_CONFIG_PAIR).flatMap((pair) => rewrite(pair) ?? []);
  const consts = rootNode.findAll(AUTH_CONFIG_CONST).flatMap((declarator) => rewriteConst(declarator) ?? []);
  const edits = [...pairs, ...consts];
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
