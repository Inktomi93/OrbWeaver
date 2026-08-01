// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TS/TSX fixture snippets, not secrets.
// Gate: context-definition-shape (client-architecture-lockdown.md §6b / §16 G3) — post-M3, the walls
// around the `defineContextTabs<S>` mint (`lib/registry-contracts.ts`). FOUR arms: (1) a hand-rolled
// `{ kind: "tabs", useResolved }` object literal outside the mint's own file — a badge-wearing tabs
// renderer bypassing the duplicate-id throw + the resolve/actions wiring; (2) a `defineContextTabs` call
// with `tabs: []` AND no `contributors` — a dead mint with no reachable content; (3) O5 strict — a
// `defineContextTabs` call or a `ContextTabDef<…>` type-ref whose type argument is not `void` and not an
// identifier resolving to a type EXPORTED from `registry-contracts.ts` (an inline literal/index
// signature/`any`/`unknown` escape re-opens the loose-projection hole O5 closed); (4) the dead
// CONTEXT_SLOTS↔bodies split resurrected — a `bodies: Record<string, ReactNode>`-shaped JSX attr or
// interface/type member under `client/src`.
//
// HUD-1 adds the WHOLE-PANE REGION CLAIM's walls (hud-home-spec §8): (5) region-mint-only — a hand-rolled
// `{ claims, render }` def or a hand-rolled `region:` renderer outside the mint's own file; (6) ONE pane,
// ONE owner — at most a single `defineContextRegion(` call site project-wide; (7) no feature paints shell
// chrome — the `shell-panel-header` / `ctx-tab-strip` class literals under `features/**` outside app-shell;
// (8) ONE region host — at most a single writer of the `data-context-region` probe attribute.
//
// Arms 6 and 8 are COUNT-based, not path-keyed: a path allowlist dies silently the day the file is renamed
// ([[path-keyed-gates-die-on-rename]]), while "at most one" survives any rename and enforces the same
// invariant. Both self-guard on `ctx.scope.kind === "project"` so a scoped/incremental run — which sees only
// part of the tree — can never report a false single-writer verdict.
//
// DECLARED BLIND SPOT: arms 5–8 read LITERAL shapes. A claim assembled through a variable, a re-export, or a
// computed property is invisible to them ([[gate-probe-literal-shapes]]) — the HUD-1 §10 CTs are the required
// second lens, not a nice-to-have.
import type { SourceFile, Node as TsNode, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const CLIENT_SRC = "packages/client/src/";
const REGISTRY_CONTRACTS_RE = /\/lib\/registry-contracts\.ts$/;
const BODIES_RECORD_RE = /^(?:readonly\s+)?(?:Partial<\s*)?Record<\s*string\s*,\s*ReactNode\s*>>?$/;
const FEATURES_RE = /\/packages\/client\/src\/features\//;
const APP_SHELL_RE = /\/packages\/client\/src\/features\/app-shell\//;
const SHELL_CHROME_CLASSES = ["shell-panel-header", "ctx-tab-strip"] as const;
const REGION_ATTR = "data-context-region";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Arm 1 — a `{ kind:"tabs", useResolved }` object literal outside `registry-contracts.ts`: the ONLY
 *  legal minter of this shape is `defineContextTabs` itself. */
function checkMintOnlyTabs(sf: SourceFile, out: (line: number, message: string) => void): void {
  if (REGISTRY_CONTRACTS_RE.test(sf.getFilePath())) {
    return;
  }
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const kind = obj.getProperty("kind");
    if (kind === undefined || !Node.isPropertyAssignment(kind)) {
      continue;
    }
    const init = kind.getInitializer();
    if (init === undefined || readStringValue(init) !== "tabs") {
      continue;
    }
    if (obj.getProperty("useResolved") !== undefined) {
      out(
        obj.getStartLineNumber(),
        'a hand-rolled `{ kind: "tabs", useResolved }` object literal outside `lib/registry-contracts.ts` — ' +
          "a tabs ContextDefinition is minted ONLY by `defineContextTabs` (the duplicate-id throw + the " +
          "resolve/actions wiring live there) — client-architecture-lockdown.md §6b.",
      );
    }
  }
}

/** Arm 2 — `defineContextTabs({ tabs: [], … })` with no `contributors`: a dead mint, zero reachable tabs. */
function checkZeroTabMint(sf: SourceFile, out: (line: number, message: string) => void): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "defineContextTabs") {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
      continue;
    }
    const tabs = arg.getProperty("tabs");
    if (tabs === undefined || !Node.isPropertyAssignment(tabs)) {
      continue;
    }
    const tabsInit = tabs.getInitializer();
    const isEmptyArray = tabsInit !== undefined && Node.isArrayLiteralExpression(tabsInit) && tabsInit.getElements().length === 0;
    if (isEmptyArray && arg.getProperty("contributors") === undefined) {
      out(
        call.getStartLineNumber(),
        "`defineContextTabs` called with `tabs: []` and no `contributors` — a dead mint with no reachable " +
          "content (an intentional contributors-only mint MUST pass a `contributors` registry) — " +
          "client-architecture-lockdown.md §16 G3.",
      );
    }
  }
}

/** True when a type arg is `void` or an identifier whose declaration resolves to a type EXPORTED from
 *  `lib/registry-contracts.ts` (O5 strict — no any/unknown/inline literal/index signature escape). */
function isStrictProjectionArg(typeArg: TypeNode): boolean {
  if (typeArg.getKind() === SyntaxKind.VoidKeyword) {
    return true;
  }
  if (Node.isTypeReference(typeArg) && typeArg.getTypeArguments().length === 0) {
    const nameNode = typeArg.getTypeName();
    if (Node.isIdentifier(nameNode)) {
      return nameNode.getDefinitionNodes().some((def) => REGISTRY_CONTRACTS_RE.test(def.getSourceFile().getFilePath()));
    }
  }
  return false;
}

/** Arm 3 — every `defineContextTabs<S>` call and `ContextTabDef<S>` type-ref must spell `S` EXPLICITLY as
 *  `void` or an identifier resolving to a `registry-contracts.ts`-exported type (O5 strict/publication).
 *  A `defineContextTabs` call with NO type arg (relying on inference from `useContextState`) is RED. */
function checkStrictProjection(sf: SourceFile, out: (line: number, message: string) => void): void {
  const flagTypeArg = (typeArg: TypeNode, siteName: string): void => {
    if (isStrictProjectionArg(typeArg)) {
      return;
    }
    out(
      typeArg.getStartLineNumber(),
      `${siteName}'s type argument "${typeArg.getText()}" is not \`void\` and not an identifier resolving ` +
        "to a type EXPORTED from `lib/registry-contracts.ts` (O5 strict/publication) — publish the real " +
        "projection type there rather than an inline literal/index-signature/any/unknown escape — " +
        "client-architecture-lockdown.md §16 G3.",
    );
  };
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "defineContextTabs") {
      continue;
    }
    const typeArg = call.getTypeArguments()[0];
    // A MISSING type arg lets tsc INFER `S` from `useContextState`'s return, so an inline/anonymous
    // projection sails through unpublished — O5 requires `S` be SPELLED against a published type, so the
    // explicit arg is mandatory (`<void>` or a registry-contracts export), never inference.
    if (typeArg === undefined) {
      out(
        call.getStartLineNumber(),
        "a `defineContextTabs` call has no explicit type argument — O5 requires the projection type be " +
          "SPELLED (`<CharacterContextState>` / `<void>`), never inferred from `useContextState` (an " +
          "inline/anonymous return would leak an unpublished shape) — client-architecture-lockdown.md §16 G3.",
      );
      continue;
    }
    flagTypeArg(typeArg, "a `defineContextTabs` call");
  }
  for (const tr of sf.getDescendantsOfKind(SyntaxKind.TypeReference)) {
    if (tr.getTypeName().getText() !== "ContextTabDef") {
      continue;
    }
    const typeArg = tr.getTypeArguments()[0];
    if (typeArg !== undefined) {
      flagTypeArg(typeArg, "a `ContextTabDef<…>` type reference");
    }
  }
}

/** Arm 4 — the dead CONTEXT_SLOTS↔bodies split resurrected: a `bodies` JSX attr, or a `bodies`
 *  interface/type-literal member typed `Record<string, ReactNode>` (readonly/Partial included). */
function checkBodiesSplit(sf: SourceFile, out: (line: number, message: string) => void): void {
  const flag = (line: number): void =>
    out(
      line,
      'a "bodies" member/attribute shaped `Record<string, ReactNode>` — the CONTEXT_SLOTS↔bodies split ' +
        "the mint killed structurally (tab id + label + when + body are ONE object; a route-injected " +
        "bodies map can silently miss an entry) — client-architecture-lockdown.md §6b.",
    );
  for (const sig of sf.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
    if (sig.getName() !== "bodies") {
      continue;
    }
    const typeNode = sig.getTypeNode();
    if (typeNode !== undefined && BODIES_RECORD_RE.test(typeNode.getText().replace(/\s+/g, " ").trim())) {
      flag(sig.getStartLineNumber());
    }
  }
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() === "bodies") {
      flag(attr.getStartLineNumber());
    }
  }
}

/** Arm 5 — the region mint's wall. A `{ claims, render }` object literal that is NOT the direct argument of
 *  a `defineContextRegion(` call is a hand-rolled `ContextRegionDef`; a `region:` property initialized to a
 *  function is a hand-rolled `ResolvedContextTabs`. Both bypass the ONE spelled home the ≤1-claimant arm
 *  counts, so both are RED outside `lib/registry-contracts.ts`. */
function checkMintOnlyRegion(sf: SourceFile, out: (line: number, message: string) => void): void {
  if (REGISTRY_CONTRACTS_RE.test(sf.getFilePath())) {
    return;
  }
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    flagHandRolledRegionRenderer(obj.getProperty("region"), out);
    flagHandRolledRegionDef(obj, out);
  }
}

function flagHandRolledRegionRenderer(region: TsNode | undefined, out: (line: number, message: string) => void): void {
  if (region === undefined || !Node.isPropertyAssignment(region)) {
    return;
  }
  const init = region.getInitializer();
  if (init === undefined || !(Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
    return;
  }
  out(
    region.getStartLineNumber(),
    "a hand-rolled `region:` renderer on an object literal outside `lib/registry-contracts.ts` — the " +
      "whole-pane claim is supplied by `resolveContextTabs` from a `defineContextRegion` def, never " +
      "hand-assembled onto a resolved shape (hud-home-spec §3.2).",
  );
}

function flagHandRolledRegionDef(obj: TsNode, out: (line: number, message: string) => void): void {
  if (!Node.isObjectLiteralExpression(obj) || obj.getProperty("claims") === undefined || obj.getProperty("render") === undefined) {
    return;
  }
  const parent = obj.getParent();
  if (parent !== undefined && Node.isCallExpression(parent) && parent.getExpression().getText() === "defineContextRegion") {
    return;
  }
  out(
    obj.getStartLineNumber(),
    "a hand-rolled `{ claims, render }` region def outside `lib/registry-contracts.ts` — a `ContextRegionDef` " +
      "is minted ONLY by `defineContextRegion` (the one spelled home the single-claimant arm counts) — " +
      "hud-home-spec §8.",
  );
}

/** Arm 7 — a FEATURE painting shell chrome. The `.shell-panel-header` band and the `.ctx-tab-strip` are the
 *  shell's own vocabulary; a claimant composes its pane from primitives + token utilities instead. Only
 *  STRING/TEMPLATE literals are read, so a comment naming the class (this file, and the HUD's own header)
 *  is not a violation. */
function checkNoFeatureShellChrome(sf: SourceFile, out: (line: number, message: string) => void): void {
  const path = sf.getFilePath();
  if (!FEATURES_RE.test(path) || APP_SHELL_RE.test(path)) {
    return;
  }
  const literals: TsNode[] = [
    ...sf.getDescendantsOfKind(SyntaxKind.StringLiteral),
    ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
    ...sf.getDescendantsOfKind(SyntaxKind.TemplateHead),
    ...sf.getDescendantsOfKind(SyntaxKind.TemplateMiddle),
    ...sf.getDescendantsOfKind(SyntaxKind.TemplateTail),
  ];
  for (const literal of literals) {
    const text = literal.getText();
    const hit = SHELL_CHROME_CLASSES.find((token) => text.includes(token));
    if (hit !== undefined) {
      out(
        literal.getStartLineNumber(),
        `the shell-chrome class \`${hit}\` in a feature outside \`features/app-shell/**\` — a feature never ` +
          "paints the shell's band or tab strip; a pane claimant composes its own chrome from `@orb/ui` " +
          "primitives + token utilities (hud-home-spec §3.6 fence 2).",
      );
    }
  }
}

// ── The COUNT arms (6 + 8) — accumulated across the walk, judged in `finalize` ──────────────────────
interface CountedSite {
  readonly file: string;
  readonly line: number;
}
let regionMintSites: CountedSite[] = [];
let regionHostSites: CountedSite[] = [];

/** Arm 6 — one pane, one owner: every `defineContextRegion(` call site, counted. */
function collectRegionMintSites(sf: SourceFile, path: string): void {
  if (REGISTRY_CONTRACTS_RE.test(sf.getFilePath())) {
    return;
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() === "defineContextRegion") {
      regionMintSites.push({ file: path, line: call.getStartLineNumber() });
    }
  }
}

/** Arm 8 — one region host: every writer of the `data-context-region` probe attribute, counted. */
function collectRegionHostSites(sf: SourceFile, path: string): void {
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() === REGION_ATTR) {
      regionHostSites.push({ file: path, line: attr.getStartLineNumber() });
    }
  }
}

function reportExtraSites(ctx: GateRunCtx, sites: readonly CountedSite[], message: string): void {
  if (sites.length <= 1) {
    return;
  }
  for (const site of sites) {
    ctx.report({ file: site.file, line: site.line, column: 0, message });
  }
}

export const gate: GateDescriptor = {
  name: "context-definition-shape",
  docRow: "client-architecture-lockdown.md §6b / §16 G3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a CONTEXT-definition shape violates the mint's walls (client-architecture-lockdown.md §6b · " +
    'hud-home-spec §8): a hand-rolled `{kind:"tabs",useResolved}` or `{claims,render}` outside the mint, a ' +
    "zero-tab mint with no contributors, a non-strict `S`, a resurrected `bodies: Record<string, ReactNode>` " +
    "split, a feature painting shell chrome, a second pane claimant, or a second region host.",
  fix: "mint tabs contexts via `defineContextTabs` and region claims via `defineContextRegion` only; give a contributors-only mint a real `contributors` registry; publish the projection type in `lib/registry-contracts.ts` and reference it by name; keep tab id+label+when+body as ONE object; compose a claimed pane from `@orb/ui` primitives instead of the shell's chrome classes; keep ONE claimant and ONE region host.",
  scanRoot: (p) => p.includes(CLIENT_SRC),
  begin: () => {
    regionMintSites = [];
    regionHostSites = [];
  },
  visitFile: (sf, ctx) => {
    const path = rel(sf.getFilePath());
    const report = (line: number, message: string): void => ctx.report({ file: path, line, column: 0, message });
    checkMintOnlyTabs(sf, report);
    checkZeroTabMint(sf, report);
    checkStrictProjection(sf, report);
    checkBodiesSplit(sf, report);
    checkMintOnlyRegion(sf, report);
    checkNoFeatureShellChrome(sf, report);
    collectRegionMintSites(sf, path);
    collectRegionHostSites(sf, path);
  },
  // The count arms only have a verdict when the whole tree was walked — a `--changed` run sees a fragment,
  // so it must stay silent rather than guess.
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return;
    }
    reportExtraSites(
      ctx,
      regionMintSites,
      "a SECOND `defineContextRegion(` call site — one CONTEXT pane has ONE owner (hud-home-spec §8 arm 6). " +
        "A second claimant makes 'which one wins' a declaration-order accident at the seam that decides what " +
        "an entire panel looks like.",
    );
    reportExtraSites(
      ctx,
      regionHostSites,
      `a SECOND writer of \`${REGION_ATTR}\` — the probe attribute has ONE writer (the region host), so a ` +
        "geometry probe can never resolve to two different elements (hud-home-spec §8 arm 8).",
    );
  },
  mustFlag: [
    {
      files: 'const badgeMint = { kind: "tabs", useResolved: () => null };\n',
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "hand-rolled" },
      why: 'arm 1 — a hand-rolled `{kind:"tabs",useResolved}` outside the mint file',
    },
    {
      files: 'const badgeMint = { kind: "tabs" as const, useResolved: () => null };\n',
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "hand-rolled" },
      why: 'arm 1 — `kind: "tabs" as const` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader silently PASSED before hardening',
    },
    {
      files:
        'import { defineContextTabs, type ChatContextState } from "#lib";\n' +
        "export const x = defineContextTabs<ChatContextState>({ useContextState: () => null, tabs: [] });\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      expect: { messageIncludes: "dead mint" },
      why: "arm 2 — a `defineContextTabs` call with `tabs: []` and no `contributors`",
    },
    {
      files:
        "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
        "export const x = defineContextTabs<any>({ useContextState: () => null, tabs: [] as any });\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "O5 strict" },
      why: "arm 3 — `defineContextTabs<any>` — the strict/publication arm rejects `any`",
    },
    {
      files:
        "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
        "export const x = defineContextTabs({\n" +
        "  useContextState: () => ({ leakedInlineShape: 1 }),\n" +
        '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
        "});\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "no explicit type argument" },
      why: "arm 3 — a `defineContextTabs` call with NO type arg — inference leaks an inline projection unpublished (O5)",
    },
    {
      files: "interface X {\n  readonly bodies: Record<string, ReactNode>;\n}\n",
      at: "packages/client/src/features/x/lib/x-types.ts",
      expect: { messageIncludes: "bodies" },
      why: "arm 4 — a `bodies: Record<string, ReactNode>` interface member — the resurrected split",
    },
    {
      files: 'export const hud = { id: "x.hud", claims: () => true, render: () => null };\n',
      at: "packages/client/src/features/x/lib/x-region.tsx",
      expect: { messageIncludes: "hand-rolled `{ claims, render }`" },
      why: "arm 5 — a hand-rolled region def bypassing `defineContextRegion`",
    },
    {
      files: "export const resolved = { tabs: [], region: (view) => view };\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "hand-rolled `region:` renderer" },
      why: "arm 5 — a hand-assembled `region:` renderer on a resolved shape",
    },
    {
      files: {
        "packages/client/src/features/rpg/lib/rpg-hud-region.tsx":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const a = defineContextRegion({ id: "a", claims: () => true, render: () => null });\n',
        "packages/client/src/features/crew/lib/crew-hud-region.tsx":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const b = defineContextRegion({ id: "b", claims: () => true, render: () => null });\n',
      },
      expect: { messageIncludes: "SECOND `defineContextRegion(` call site" },
      why: "arm 6 — two claimants project-wide; one pane has one owner",
    },
    {
      files: 'export const cell = <div className="ctx-tab-strip" />;\n',
      at: "packages/client/src/features/rpg/components/rpg-hud.tsx",
      expect: { messageIncludes: "ctx-tab-strip" },
      why: "arm 7 — a feature painting the shell's tab strip (deep path)",
    },
    {
      files: 'export const band = <header className="shell-panel-header" />;\n',
      at: "packages/client/src/features/x/x-band.tsx",
      expect: { messageIncludes: "shell-panel-header" },
      why: "arm 7 — a feature painting the shell's band (shallow path)",
    },
    {
      files: {
        "packages/client/src/features/app-shell/components/context-region-host.tsx": "export const a = <div data-context-region={true} />;\n",
        "packages/client/src/features/rpg/components/rpg-hud.tsx": "export const b = <div data-context-region={true} />;\n",
      },
      expect: { messageIncludes: `SECOND writer of \`${REGION_ATTR}\`` },
      why: "arm 8 — two writers of the region probe attribute",
    },
  ],
  mustPass: [
    {
      files:
        "declare const VOID_STATE: void;\n" +
        "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
        "export const x = defineContextTabs<void>({\n" +
        "  useContextState: () => VOID_STATE,\n" +
        '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
        "});\n",
      at: "packages/client/src/features/discovery/lib/corpus-section.tsx",
      why: "a `void`-projection mint with a real tab — passes",
    },
    {
      files: {
        "packages/client/src/lib/registry-contracts.ts": "export interface CharacterContextState { readonly characterId: string }\n",
        "packages/client/src/features/character/lib/characters-section.tsx":
          'import type { CharacterContextState } from "../../../lib/registry-contracts";\n' +
          "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
          "export const x = defineContextTabs<CharacterContextState>({\n" +
          "  useContextState: () => null,\n" +
          '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
          "});\n",
      },
      why: "a mint whose `S` is an identifier resolving to a registry-contracts export, with real tabs — passes",
    },
    {
      files:
        "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
        "declare const chatContextContributors: unknown;\n" +
        "export const x = defineContextTabs<void>({\n" +
        "  useContextState: () => undefined,\n" +
        "  tabs: [],\n" +
        "  contributors: chatContextContributors,\n" +
        "});\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      why: "a contributors-only mint (`tabs: []` + a real `contributors`) — passes arm 2",
    },
    {
      files: "interface X {\n  readonly bodies: Record<string, number>;\n}\n",
      at: "packages/client/src/features/x/lib/x-types.ts",
      why: "a `bodies` member typed `Record<string, number>` (not ReactNode) — the false-positive check, passes",
    },
    {
      files:
        "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
        'export const hud = defineContextRegion({ id: "rpg.hud", claims: () => true, render: () => null });\n',
      at: "packages/client/src/features/rpg/lib/rpg-hud-region.tsx",
      why: "arms 5+6 — THE single minted region claim: minted through `defineContextRegion`, exactly one call site — passes",
    },
    {
      files: "export const host = <div data-context-region={true} />;\n",
      at: "packages/client/src/features/app-shell/components/context-region-host.tsx",
      why: "arm 8 — the ONE region host writing the probe attribute — passes",
    },
    {
      files: "// the `.shell-panel-header` band and the `.ctx-tab-strip` are the shell's, not this feature's\nexport const x = 1;\n",
      at: "packages/client/src/features/rpg/components/rpg-hud.tsx",
      why: "arm 7 false-positive check — a COMMENT naming the shell-chrome classes is not painting them, passes",
    },
    {
      files: 'export const strip = <div className="ctx-tab-strip" />;\n',
      at: "packages/client/src/features/app-shell/components/context-tabs-panel.tsx",
      why: "arm 7 — app-shell IS the shell-tier painter; the class is legal there, passes",
    },
  ],
};
