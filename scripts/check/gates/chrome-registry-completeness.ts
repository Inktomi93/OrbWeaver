// Gate: chrome-registry-completeness (shell-chrome-unification.md §A/§D) — the chrome registry's
// structural walls tsc can't see (a `ChromeEntry` is a plain object literal, not a total door Record, so
// tsc catches nothing here on its own). Mirrors `modal-registry-completeness`: (1) CO-LOCATION — a
// `ChromeEntry` lives only in `features/<owner>/lib/<id>-chrome.tsx`; (2) DUPLICATE ID — two co-located
// defs declaring the same `id` (the contributor registry's own dupe-id throw is a RUNTIME catch; this is
// the static one, so a violation is caught at `pnpm check`, before it ever executes); (3) the ZONE arm —
// `zone` must be one of `CHROME_ZONES` (a typo'd zone silently renders nowhere, since no consumer reads an
// unknown zone string).
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const CLIENT_SRC = "/packages/client/src/";
/** A co-located chrome-widget definition file: `features/<owner>/lib/<id>-chrome.tsx`. */
const CHROME_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-chrome\.tsx?$/;
/** The closed zone vocabulary (`state/chrome-registry.ts` `CHROME_ZONES`) — kept in sync by hand since
 *  the gate reads source text, not the runtime tuple; a real zone-typo is still caught structurally. */
const CHROME_ZONES = new Set(["rail.nav", "rail.end", "topbar.trail"]);

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

function chromeId(entry: ObjectLiteralExpression): string | undefined {
  const id = objProp(entry, "id");
  return id === undefined ? undefined : readStringValue(id);
}

function chromeZone(entry: ObjectLiteralExpression): string | undefined {
  const zone = objProp(entry, "zone");
  return zone === undefined ? undefined : readStringValue(zone);
}

type Seen = { readonly name: string; readonly file: string };

type ChromeDef = {
  readonly name: string;
  readonly path: string;
  readonly init: ObjectLiteralExpression;
};

// Node-anchored: every arm reports the OBJECT LITERAL directly (`ctx.report(node, {token, offset})`), never
// an explicit `Finding` — that overload bypasses `hasGateIgnore` (GATE-AUTHORING.md §1). The per-arm prose
// that used to ride the Finding's `message` field is folded into the gate's ONE `message` below; the
// dynamic identity (id / zone / name / prior claimant) moves into `token`.
function checkChromeEntry(def: ChromeDef, ctx: GateRunCtx, seenIds: Map<string, Seen>): void {
  const id = chromeId(def.init);
  if (id !== undefined) {
    const firstOwner = seenIds.get(id);
    if (firstOwner === undefined) {
      seenIds.set(id, { name: def.name, file: rel(def.path) });
    } else {
      ctx.report(def.init, {
        token: `duplicate id "${id}" (${def.name}) — first claimed by "${firstOwner.name}" (${firstOwner.file})`,
        offset: 0,
      });
    }
  }
  const zone = chromeZone(def.init);
  if (zone !== undefined && !CHROME_ZONES.has(zone)) {
    ctx.report(def.init, { token: `zone "${zone}" (${def.name})`, offset: 0 });
  }
  // The mobile-curation axis: a rail.* widget MUST declare its mobile-tab-vs-You-sheet fate
  // (`mobile: "tab"|"sheet"`); a topbar.* widget MAY.
  //
  // ⚑ THE RAIL-ONLY HALF IS RETIRED (2026-08-07), and the premise is what died: this gate used to RED a
  // topbar widget that declared `mobile`, reasoning "there is no mobile bar for it". There is now a mobile
  // HOME for it — the You sheet projects `topbar.trail` widgets curated `"sheet"` in their own sheet lens
  // (you-sheet.tsx), which is how the notifications inbox leaves a 320px topbar whose row is spent saying
  // where you are (side-eye 2026-08-07 P2). A phone-fate declaration is chrome-wide vocabulary now.
  // It stays OPTIONAL on topbar.*: the default (stay on the row) is the right one for a section's own
  // controls, and forcing every trail widget to spell it would be ceremony, not a decision.
  const hasMobile = def.init.getProperty("mobile") !== undefined;
  if (zone?.startsWith("rail.") && !hasMobile) {
    ctx.report(def.init, { token: `missing mobile (${def.name}, zone "${zone}")`, offset: 0 });
  }
}

function checkChromeDefs(sf: SourceFile, ctx: GateRunCtx, seenIds: Map<string, Seen>): void {
  const path = sf.getFilePath();
  const coLocated = CHROME_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("ChromeEntry")) {
      continue;
    }
    if (!coLocated) {
      ctx.report(decl, { token: `not co-located: ${decl.getName()}`, offset: 0 });
      continue;
    }
    const init = decl.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      continue;
    }
    checkChromeEntry({ name: decl.getName(), path, init }, ctx, seenIds);
  }
}

export const gate: GateDescriptor = {
  name: "chrome-registry-completeness",
  docRow: "shell-chrome-unification.md §A/§D",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a chrome widget is dishonest: a ChromeEntry not co-located in a feature chrome file, a duplicate id across defs, a zone outside CHROME_ZONES, or a rail.* widget missing `mobile` — shell-chrome-unification.md §A/§D.",
  fix: 'co-locate the definition at features/<owner>/lib/<id>-chrome.tsx; give every ChromeEntry a unique id; use a real CHROME_ZONES member; declare `mobile` on every rail.* widget (topbar.* may declare it too — the You sheet projects `"sheet"`-curated trail widgets).',
  run: (ctx) => {
    const seenIds = new Map<string, Seen>();
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkChromeDefs(sf, ctx, seenIds);
    }
  },
  mustFlag: [
    {
      files: "export const xChrome: ChromeEntry = { id: 'x', zone: 'topbar.trail' };\n",
      at: "packages/client/src/features/x/lib/not-a-chrome-file.ts",
      expect: { token: "not co-located: xChrome" },
      why: "a ChromeEntry outside a `*-chrome` file — the co-location arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-chrome.tsx": "export const aChrome: ChromeEntry = { id: 'dup', zone: 'topbar.trail' };\n",
        "packages/client/src/features/b/lib/b-chrome.tsx": "export const bChrome: ChromeEntry = { id: 'dup', zone: 'topbar.trail' };\n",
      },
      expect: { token: 'duplicate id "dup" (bChrome) — first claimed by "aChrome" (packages/client/src/features/a/lib/a-chrome.tsx)' },
      why: "two co-located ChromeEntry defs declaring the SAME id — the shadow-def duplicate-id arm",
    },
    {
      files: "export const xChrome: ChromeEntry = { id: 'x', zone: 'sidebar.top' };\n",
      at: "packages/client/src/features/x/lib/x-chrome.tsx",
      expect: { token: 'zone "sidebar.top" (xChrome)' },
      why: "a zone string outside CHROME_ZONES — the zone arm",
    },
    {
      files: "export const xChrome: ChromeEntry = { id: 'x', zone: 'sidebar.top' as never };\n",
      at: "packages/client/src/features/x/lib/x-chrome.tsx",
      expect: { token: 'zone "sidebar.top" (xChrome)' },
      why: "a bad zone written `'sidebar.top' as never` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader passed before hardening",
    },
    {
      files: "export const railChrome: ChromeEntry = { id: 'r', zone: 'rail.nav', label: 'R', behavior: { kind: 'widget', body: () => null } };\n",
      at: "packages/client/src/features/x/lib/rail-chrome.tsx",
      expect: { token: 'missing mobile (railChrome, zone "rail.nav")' },
      why: "a rail.* widget with no `mobile` — the rail-mobile-required arm (§D)",
    },
  ],
  mustPass: [
    {
      files:
        "export const barChrome: ChromeEntry = { id: 'b', zone: 'topbar.trail', label: 'B', mobile: 'sheet', behavior: { kind: 'widget', body: () => null } };\n",
      at: "packages/client/src/features/x/lib/bar-chrome.tsx",
      why: "a topbar.* widget declaring `mobile` — LEGAL since the You sheet projects `sheet`-curated trail widgets in their own lens (the rail-only half retired 2026-08-07, §D)",
    },
    {
      files: "export const xChrome: ChromeEntry = { id: 'x', zone: 'topbar.trail', label: 'X', behavior: { kind: 'widget', body: () => null } };\n",
      at: "packages/client/src/features/x/lib/x-chrome.tsx",
      why: "a FULL co-located topbar.trail widget (real zone, unique id, no mobile) — passes",
    },
    {
      files:
        "export const navChrome: ChromeEntry = { id: 'nav', zone: 'rail.nav', label: 'Nav', mobile: 'sheet', behavior: { kind: 'widget', body: () => null } };\n",
      at: "packages/client/src/features/x/lib/nav-chrome.tsx",
      why: "a `rail.nav` widget declaring `mobile` — a real CHROME_ZONES member with the required rail axis (§E-1/§D)",
    },
    {
      files:
        "export const endChrome: ChromeEntry = { id: 'end', zone: 'rail.end', label: 'End', mobile: 'sheet', behavior: { kind: 'widget', body: () => null } };\n",
      at: "packages/client/src/features/x/lib/end-chrome.tsx",
      why: "a `rail.end` widget declaring `mobile` — a real CHROME_ZONES member with the required rail axis (§E-1/§D)",
    },
  ],
};
