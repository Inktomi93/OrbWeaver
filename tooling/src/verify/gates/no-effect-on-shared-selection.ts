// Gate: no-effect-on-shared-selection (UI-Architecture-and-Layout.md §5.1) — §5.1 sanctions three
// render-only reader shapes for the shared selection stores; what it bans is subscribe-and-EFFECT — a
// `useEffect`/`useLayoutEffect` in features/** (app-shell exempt) keyed on an identifier TAINTED by a
// shared-selection hook (seed: initialized from a SELECTION_HOOK_RE call; transitive: same-file
// name-level fixpoint) — a surface reacting to ambient selection with side effects, the neo chase
// reborn. Does not flag props/query-data deps or lifecycle-store hooks (chat-stream/draft-store).
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): app-shell is SCANNED and exempted by a cited row
// plus the shared RENAME TRIPWIRE, not scoped out of scanRoot — an excluded home carries its exemption
// silently through a rename, and "app-shell" is exactly the kind of feature dir that gets restructured.
import type { ArrayLiteralExpression, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const GATE_SELF = "tooling/src/verify/gates/no-effect-on-shared-selection.ts";

/** The ONE feature dir that may react to shared selection with an effect. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/client/src/features/app-shell/": {
    why: "the shell OWNS the shared-selection pointers (UI-Architecture-and-Layout.md §5.1) — routing, panels and modal state are the shell's own lifecycle, not an ambient chase. Ends when the shell moves or the pointers re-home: the rename tripwire reds the row at its dead path",
  },
};

/** The shared-selection pointer hooks (the state/ selection stores' read APIs — NOT the
 *  lifecycle/draft stores). Kept in sync with state/index.ts by the fixture in
 *  tests/tooling/check-gates.int.test.ts; a rename lands here in the same commit. */
const SELECTION_HOOK_RE =
  /^use(?:Active(?:ChatHandle|ChatId|DraftSeed|SessionKey|Section)|SelectedCharacterId|OpenModal|ContextTab|MobileSheet|PanelOverride)$/u;

const EFFECT_HOOK_RE = /^use(?:Effect|LayoutEffect|InsertionEffect)$/u;

const MESSAGE =
  "effect keyed on a shared-selection pointer — the neo `this_chid` chase (UI-Architecture-and-Layout.md " +
  "§5.1: selection readers are RENDER-only). Derive in render instead, or use `useEffectEvent` for a " +
  "non-reactive read inside an unrelated effect; if this surface genuinely can't be render-driven, " +
  "that's a §5.1 amendment conversation, not a workaround.";

/** All identifier names bound by a declaration's name node (plain or destructured). */
function boundNames(decl: VariableDeclaration): string[] {
  const nameNode = decl.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return [nameNode.getText()];
  }
  // Object/array binding patterns: every BindingElement's own name identifier.
  return nameNode
    .getDescendantsOfKind(SyntaxKind.BindingElement)
    .map((b) => b.getNameNode())
    .filter(Node.isIdentifier)
    .map((n) => n.getText());
}

/** `node` is, or contains, an identifier whose text is in `names`. */
function touchesName(node: Node, names: ReadonlySet<string>): boolean {
  if (Node.isIdentifier(node)) {
    return names.has(node.getText());
  }
  return node.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => names.has(id.getText()));
}

/** Does this initializer (sub)tree call one of the selection hooks? */
function callsSelectionHook(init: Node): boolean {
  const calls = Node.isCallExpression(init)
    ? [init, ...init.getDescendantsOfKind(SyntaxKind.CallExpression)]
    : init.getDescendantsOfKind(SyntaxKind.CallExpression);
  return calls.some((c) => {
    const callee = c.getExpression();
    return Node.isIdentifier(callee) && SELECTION_HOOK_RE.test(callee.getText());
  });
}

/** Seed taint: every name bound from an initializer that calls a selection hook. */
function seedTaint(decls: readonly VariableDeclaration[]): Set<string> {
  const tainted = new Set<string>();
  for (const decl of decls) {
    const init = decl.getInitializer();
    if (init !== undefined && callsSelectionHook(init)) {
      for (const name of boundNames(decl)) {
        tainted.add(name);
      }
    }
  }
  return tainted;
}

/** One propagation pass: taint names whose initializer references a tainted name. True if it grew. */
function propagateTaint(decls: readonly VariableDeclaration[], tainted: Set<string>): boolean {
  let grew = false;
  for (const decl of decls) {
    const init = decl.getInitializer();
    if (init === undefined || !touchesName(init, tainted)) {
      continue;
    }
    for (const name of boundNames(decl)) {
      if (!tainted.has(name)) {
        tainted.add(name);
        grew = true;
      }
    }
  }
  return grew;
}

/** File-level name taint: seeds = selection-hook call results; fixpoint over initializer references. */
function taintedNames(sf: SourceFile): Set<string> {
  const decls = sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
  const tainted = seedTaint(decls);
  while (tainted.size > 0 && propagateTaint(decls, tainted)) {
    // fixpoint loop — bounded by the file's declaration count.
  }
  return tainted;
}

/** The dep-array of a `useEffect`-family call, or undefined (no deps → exhaustive-deps owns it). */
function effectDepsOf(call: Node): ArrayLiteralExpression | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  if (!(Node.isIdentifier(callee) && EFFECT_HOOK_RE.test(callee.getText()))) {
    return;
  }
  const deps = call.getArguments()[1];
  if (deps === undefined || !Node.isArrayLiteralExpression(deps)) {
    return;
  }
  return deps;
}

// A useEffect-family call whose dep array touches a shared-selection-tainted name. Taint is FILE-scoped
// (seed = selection-hook results + a name-level fixpoint), memoized per source file. The memo is cleared
// in `begin` (the pass may run more than once).
const taintMemo = new Map<string, ReadonlySet<string>>();

function taintFor(sf: SourceFile): ReadonlySet<string> {
  const key = sf.getFilePath();
  const cached = taintMemo.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const tainted = taintedNames(sf);
  taintMemo.set(key, tainted);
  return tainted;
}

export const gate: GateDescriptor = {
  name: "no-effect-on-shared-selection",
  docRow: "UI-Architecture-and-Layout.md §5.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "derive in render instead, or use `useEffectEvent` for a non-reactive read inside an unrelated effect.",
  scanRoot: (p) => p.includes("packages/client/src/features/"),
  kinds: [SyntaxKind.CallExpression],
  begin: () => {
    taintMemo.clear();
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "selection-owning shell" });
  },
  visit: (node, sf, ctx) => {
    const deps = effectDepsOf(node);
    if (deps === undefined) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    const tainted = taintFor(sf);
    if (tainted.size > 0 && deps.getElements().some((el) => touchesName(el, tainted))) {
      ctx.report(node, { token: "useEffect(shared-selection)", offset: 0 });
    }
  },
  mustFlag: [
    {
      files:
        "declare function useActiveChatId(): string;\ndeclare function useEffect(f: () => void, d: unknown[]): void;\nexport function C() {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n",
      at: "packages/client/src/features/chat/hooks/x.ts",
      why: "an effect keyed on a shared-selection pointer — the neo this_chid chase (§5.1)",
    },
    {
      files:
        "declare function useActiveChatId(): string | null;\ndeclare function useEffect(f: () => void, d: unknown[]): void;\nexport function C() {\n  const chatId = useActiveChatId();\n  const gated = chatId !== null;\n  useEffect(() => {}, [gated]);\n}\n",
      at: "packages/client/src/features/chat/hooks/transitive.ts",
      why: "TRANSITIVE taint — `gated` derives from the tainted `chatId`; the name-level fixpoint still chases (§5.1)",
    },
    {
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
        "packages/client/src/features/chat/hooks/ok.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the shared anchor is loaded but features/app-shell/ resolves to no file — the shell moved, and the old scanRoot exclusion would keep exempting a path that no longer exists",
    },
  ],
  mustPass: [
    {
      files:
        "declare function useActiveChatId(): string;\ndeclare function useEffect(f: () => void, d: unknown[]): void;\nexport function C() {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n",
      at: "packages/client/src/features/app-shell/shell.ts",
      why: "THE ALLOWLIST ITSELF: the shell OWNS the pointers (§5.1) — now scanned, and passing only because a cited SANCTIONED_HOMES row covers features/app-shell/",
    },
    {
      files:
        "declare function useEffect(f: () => void, d: unknown[]): void;\nexport function C(props: { chatId: string }) {\n  useEffect(() => {}, [props.chatId]);\n}\n",
      at: "packages/client/src/features/chat/hooks/ok.ts",
      why: "an effect depping a PROP (selection threaded by the route) is the composition shape — passes",
    },
    {
      files:
        "declare function useActiveChatId(): string;\ndeclare function useEffect(f: () => void): void;\nexport function C() {\n  const chatId = useActiveChatId();\n  useEffect(() => {\n    void chatId;\n  });\n}\n",
      at: "packages/client/src/features/chat/hooks/no-deps.ts",
      why: "an effect with NO dep array — effectDepsOf returns undefined (exhaustive-deps owns it), passes",
    },
  ],
};
