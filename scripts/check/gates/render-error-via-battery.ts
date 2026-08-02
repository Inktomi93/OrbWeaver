// Gate: render-error-via-battery (derive-modernization-audit.md §W4, G29 — the read-error battery
// sealed). QueryBoundary's `renderError` renders the failed-read surface; `QueryErrorState`
// (packages/client/src/data/query-error-state.tsx) IS that surface (a "Couldn't load X." + a real
// refetch Retry), and QueryBoundary already DEFAULTS to it. A hand-rolled `renderError={() => <Text>…
// </Text>}` re-grows the 28-arm drift QueryErrorState was built to end (its own header records it; D72:
// a machine ships WITH its seal). RED when a `renderError` JSX attr in packages/client/src/** is not
// QueryErrorState-rooted — neither a reference to it nor an arrow/function returning it. A genuinely-
// custom error surface (a Composer fallback, an avatar placeholder, a silent null) earns an allowlist
// entry with a cited reason; post-migration the set is the four below.
//
// TWO-SIDED (gate-hub #10): the ALLOWLIST is scanRoot-EXCLUSION, so a rotten row is worse than noise — it
// silently un-scans a whole file. A row is RED when its file is gone from the project OR when the file
// carries no `renderError` arm any more (the sanction is unused: ratchet down). Its first live catch was
// its own `chat-room-surface.tsx` row, deleted at the retrofit. The arm self-guards on a REAL-TREE ANCHOR
// (gate-hub #11) — the battery's own source file — so the conformance mini-projects, which hold 1-2 files,
// never "prove" the whole allowlist had vanished.
import { Node, SyntaxKind } from "ts-morph";
import { unwrapExpression } from "../ast-read.ts";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const CLIENT_SRC = "packages/client/src/";
const ATTR = "renderError";
const BATTERY = "QueryErrorState";
// QueryBoundary's own home plumbs `renderError={renderError}` through to its internal catch — the prop
// passthrough at the machine's source, never a consumer arm. Excluded like every gate excludes its mint.
const BATTERY_HOME = `${CLIENT_SRC}data/query-boundary.tsx`;

// The sanctioned NON-battery `renderError` species, each a genuine custom surface (NOT a Couldn't-load
// + Retry): the persona avatar degrades to its own loading placeholder; the command-palette threads group
// goes silently empty (CommandEmpty covers it). A new custom arm adds a cited entry here — expect it to
// stay tiny. (`features/chat/surfaces/chat-room-surface.tsx` used to sit here for the composer-fallback
// arm; the file carries no `renderError` at all any more, so the stale arm caught it at birth and the row
// was deleted.)
const ALLOWLIST = new Set([
  `${CLIENT_SRC}features/chat/surfaces/command-palette-surface.tsx`,
  `${CLIENT_SRC}features/persona/surfaces/persona-panel-surface.tsx`,
  // The rpg CONTEXT pane suspends on TWO seams (the HUD's BAND + the game-tab BODY) and needs a
  // CONSOLIDATED, ANNOUNCED failure (Context-Panel-Program §4.4; the side-eye a11y finding): the panel's own
  // live region reports "Loaded chat." on success, so an unannounced error tells an SR user the opposite of
  // the truth. `QueryErrorState` is a plain `<Stack>` with NO `role="alert"` — it cannot satisfy that intent.
  // So the BODY renders `RpgErrorState` (the SINGLE `role="alert"` region) and the decorative BAND collapses
  // to `() => null` so there is exactly one announced surface. Both arms are the sanctioned custom species —
  // and they are two ENTRIES because HUD-1 moved the band out of the tab contribution into the HUD's own
  // composition (the pane claimant paints its own band now).
  `${CLIENT_SRC}features/rpg/lib/rpg-context-section.tsx`,
  `${CLIENT_SRC}features/rpg/components/rpg-hud.tsx`,
]);

const GATE_SELF = "scripts/check/gates/render-error-via-battery.ts";
/** Real-tree anchor (gate-hub #11): the battery's own source. Loaded on every real run; an example only has
 *  it when it materializes it deliberately (which is how the stale arm's own proof works). */
const ANCHOR = `${CLIENT_SRC}data/query-error-state.tsx`;
const STALE_GONE_PREFIX = "stale ALLOWLIST row — the file is no longer in the project (ratchet down): ";
const STALE_UNUSED_PREFIX =
  "stale ALLOWLIST row — the file carries NO `renderError` arm any more, so the custom-surface sanction is " +
  "unused AND the row silently un-scans the whole file (the allowlist is a scanRoot exclusion). Ratchet down: ";

const MESSAGE =
  "a hand-rolled `renderError` arm — QueryBoundary's read-error surface is `QueryErrorState` " +
  "(packages/client/src/data/query-error-state.tsx: `Couldn't load <label>.` + a real refetch Retry), and " +
  "QueryBoundary DEFAULTS to it. Render `renderError={(_error, retry) => <QueryErrorState label=… onRetry={retry} />}` " +
  "or drop the prop for the default. A genuinely-custom error surface earns a cited allowlist entry " +
  "(derive-modernization-audit.md §W4, G29; D72 — a machine ships WITH its seal).";

/** A returned expression roots in `<QueryErrorState …>` (self-closing or with children). */
function jsxRootsInBattery(node: Node): boolean {
  const n = unwrapExpression(node);
  if (Node.isJsxSelfClosingElement(n)) {
    return n.getTagNameNode().getText() === BATTERY;
  }
  if (Node.isJsxElement(n)) {
    return n.getOpeningElement().getTagNameNode().getText() === BATTERY;
  }
  return false;
}

/** The renderError expression is battery-rooted: a bare reference to `QueryErrorState`, or an
 *  arrow/function whose body (concise or via any return) roots in `<QueryErrorState>`. */
function isBatteryRooted(expr: Node): boolean {
  const e = unwrapExpression(expr);
  if (Node.isIdentifier(e) && e.getText() === BATTERY) {
    return true;
  }
  if (Node.isArrowFunction(e) || Node.isFunctionExpression(e)) {
    const body = e.getBody();
    if (Node.isBlock(body)) {
      const returns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
      return returns.some((r) => {
        const rx = r.getExpression();
        return rx !== undefined && jsxRootsInBattery(rx);
      });
    }
    return jsxRootsInBattery(body);
  }
  return false;
}

export const gate: GateDescriptor = {
  name: "render-error-via-battery",
  docRow: "history/derive-modernization-audit.md §W4 (G29)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "render `<QueryErrorState label=… onRetry={retry} />` from the arm (or omit the prop for the default); a genuine custom error surface earns a cited ALLOWLIST entry in render-error-via-battery.ts.",
  // Every client file except the allowlisted custom-error surfaces (scanRoot-excluded so their sanctioned
  // custom arms never flag — a plain-Set allowlist, the G27 shape).
  scanRoot: (p) => p.startsWith(CLIENT_SRC) && p !== BATTERY_HOME && !ALLOWLIST.has(p),
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, _sf, ctx) => {
    if (!Node.isJsxAttribute(node) || node.getNameNode().getText() !== ATTR) {
      return;
    }
    const init = node.getInitializer();
    if (init === undefined || !Node.isJsxExpression(init)) {
      return;
    }
    const expr = init.getExpression();
    if (expr === undefined || isBatteryRooted(expr)) {
      return;
    }
    ctx.report(node, { token: ATTR, offset: 0 });
  },
  // The allowlisted files are scanRoot-EXCLUDED, so the walk never sees them — the stale arm reads them off
  // the shared project directly.
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    for (const rel of ALLOWLIST) {
      const sf = ctx.project.getSourceFile(`${ctx.root}/${rel}`);
      if (sf === undefined) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_GONE_PREFIX}"${rel}" — delete the row in scripts/check/gates/render-error-via-battery.ts`,
        });
        continue;
      }
      const hasArm = sf.getDescendantsOfKind(SyntaxKind.JsxAttribute).some((a) => a.getNameNode().getText() === ATTR);
      if (!hasArm) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_UNUSED_PREFIX}"${rel}" — delete the row in scripts/check/gates/render-error-via-battery.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: "export const G = <B renderError={() => <Text>failed</Text>} />;\n",
      at: "packages/client/src/features/a/x.tsx",
      why: "an inline arm rendering a hand-rolled `<Text>failed</Text>` — the drift QueryErrorState ends",
    },
    {
      files: {
        [ANCHOR]: "export const QueryErrorState = null;\n",
        [`${CLIENT_SRC}features/chat/surfaces/command-palette-surface.tsx`]: "export const G = <B renderError={() => null} />;\n",
        [`${CLIENT_SRC}features/persona/surfaces/persona-panel-surface.tsx`]: "export const G = <B renderError={() => null} />;\n",
        [`${CLIENT_SRC}features/rpg/lib/rpg-context-section.tsx`]: "export const G = <B renderError={() => null} />;\n",
        [`${CLIENT_SRC}features/rpg/components/rpg-hud.tsx`]: "export const G = null;\n",
      },
      expect: { count: 1, messageIncludes: "carries NO `renderError` arm any more" },
      why: "THE STALE ARM, at row grain: the anchor is loaded so the allowlist is judged; three rows still carry their custom arm and pass, the fourth (rpg-hud) has none — its sanction is dead AND it is silently un-scanning the file, so exactly that row ratchets down",
    },
    {
      files: {
        [ANCHOR]: "export const QueryErrorState = null;\n",
        [`${CLIENT_SRC}features/chat/surfaces/command-palette-surface.tsx`]: "export const G = <B renderError={() => null} />;\n",
        [`${CLIENT_SRC}features/persona/surfaces/persona-panel-surface.tsx`]: "export const G = <B renderError={() => null} />;\n",
        [`${CLIENT_SRC}features/rpg/components/rpg-hud.tsx`]: "export const G = <B renderError={() => null} />;\n",
      },
      expect: { count: 1, messageIncludes: "no longer in the project" },
      why: "the other staleness: a row whose FILE is gone entirely (rpg-context-section) — path rot ratchets down too",
    },
  ],
  mustPass: [
    {
      files: "export const G = <B fallback={null} />;\n",
      at: "packages/client/src/features/a/x.tsx",
      why: "no renderError prop — QueryBoundary defaults to QueryErrorState, so the omission is the ideal case",
    },
    {
      files: 'export const G = <B renderError={({ retry }) => <QueryErrorState label="x" onRetry={retry} />} />;\n',
      at: "packages/client/src/features/a/y.tsx",
      why: "an arm rooting in <QueryErrorState> — the sanctioned battery shape",
    },
    {
      files: "export const G = <B renderError={() => null} />;\n",
      at: "packages/client/src/features/chat/surfaces/command-palette-surface.tsx",
      why: "an allowlisted custom-error surface (silent null) — scanRoot-excluded, so its custom arm is never visited",
    },
    {
      files: "export const G = (renderError: unknown) => <B renderError={renderError} />;\n",
      at: "packages/client/src/data/query-boundary.tsx",
      why: "the battery's own home plumbs the renderError prop through — scanRoot-excluded, so the passthrough never flags",
    },
    {
      files: {
        [`${CLIENT_SRC}features/a/x.tsx`]: "export const G = <B fallback={null} />;\n",
      },
      why: "THE ANCHOR GUARD: a project without the battery's own source is not the real tree — the stale arm stays silent instead of 'proving' every allowlisted file had vanished",
    },
  ],
};
