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
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

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
  readonly line: number;
  readonly init: ObjectLiteralExpression;
};

function checkChromeEntry(def: ChromeDef, out: Violation[], seenIds: Map<string, Seen>): void {
  const id = chromeId(def.init);
  if (id !== undefined) {
    const firstOwner = seenIds.get(id);
    if (firstOwner === undefined) {
      seenIds.set(id, { name: def.name, file: rel(def.path) });
    } else {
      out.push({
        file: rel(def.path),
        line: def.line,
        message: `ChromeEntry "${def.name}" declares id "${id}", already claimed by "${firstOwner.name}" (${firstOwner.file}) — two entries for one id is a shadow def the contributor registry's dupe-id throw only catches at RUNTIME — shell-chrome-unification.md §A.`,
      });
    }
  }
  const zone = chromeZone(def.init);
  if (zone !== undefined && !CHROME_ZONES.has(zone)) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `ChromeEntry "${def.name}" declares zone "${zone}", not one of CHROME_ZONES (rail.nav/rail.end/topbar.trail) — shell-chrome-unification.md §A.`,
    });
  }
  // The mobile-curation axis is RAIL-ONLY: a rail.* widget must declare its mobile-tab-vs-You-sheet fate
  // (`mobile: "tab"|"sheet"`), a topbar.* widget must NOT (there is no mobile bar for it). §D.
  const hasMobile = def.init.getProperty("mobile") !== undefined;
  if (zone !== undefined && zone.startsWith("rail.") && !hasMobile) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `ChromeEntry "${def.name}" is a rail widget (zone "${zone}") but declares no \`mobile\` — a rail.* widget's tab-vs-You-sheet fate is EXPLICIT (mobile: "tab"|"sheet") — shell-chrome-unification.md §D.`,
    });
  }
  if (zone !== undefined && zone.startsWith("topbar.") && hasMobile) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `ChromeEntry "${def.name}" is a topbar widget (zone "${zone}") but declares \`mobile\` — mobile curation is a rail-only axis — shell-chrome-unification.md §D.`,
    });
  }
}

function checkChromeDefs(sf: SourceFile, out: Violation[], seenIds: Map<string, Seen>): void {
  const path = sf.getFilePath();
  const coLocated = CHROME_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("ChromeEntry")) {
      continue;
    }
    const line = decl.getStartLineNumber();
    if (!coLocated) {
      out.push({
        file: rel(path),
        line,
        message: `ChromeEntry "${decl.getName()}" is not co-located — a chrome widget definition lives only in a feature's lib chrome file (features/*/lib/*-chrome.tsx) — shell-chrome-unification.md §A.`,
      });
      continue;
    }
    const init = decl.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      continue;
    }
    checkChromeEntry({ name: decl.getName(), path, line, init }, out, seenIds);
  }
}

export const gate: GateDescriptor = {
  name: "chrome-registry-completeness",
  docRow: "shell-chrome-unification.md §A/§D",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a chrome widget is dishonest: a ChromeEntry not co-located in a feature chrome file, a duplicate id across defs, a zone outside CHROME_ZONES, a rail.* widget missing `mobile`, or a topbar.* widget declaring `mobile` — shell-chrome-unification.md §A/§D.",
  fix: "co-locate the definition at features/<owner>/lib/<id>-chrome.tsx; give every ChromeEntry a unique id; use a real CHROME_ZONES member; declare `mobile` on rail.* widgets only.",
  run: (ctx) => {
    const out: Violation[] = [];
    const seenIds = new Map<string, Seen>();
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkChromeDefs(sf, out, seenIds);
    }
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: "export const xChrome: ChromeEntry = { id: 'x', zone: 'topbar.trail' };\n",
      at: "packages/client/src/features/x/lib/not-a-chrome-file.ts",
      expect: { messageIncludes: "not co-located" },
      why: "a ChromeEntry outside a `*-chrome` file — the co-location arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-chrome.tsx": "export const aChrome: ChromeEntry = { id: 'dup', zone: 'topbar.trail' };\n",
        "packages/client/src/features/b/lib/b-chrome.tsx": "export const bChrome: ChromeEntry = { id: 'dup', zone: 'topbar.trail' };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "two co-located ChromeEntry defs declaring the SAME id — the shadow-def duplicate-id arm",
    },
    {
      files: "export const xChrome: ChromeEntry = { id: 'x', zone: 'sidebar.top' };\n",
      at: "packages/client/src/features/x/lib/x-chrome.tsx",
      expect: { messageIncludes: "not one of CHROME_ZONES" },
      why: "a zone string outside CHROME_ZONES — the zone arm",
    },
    {
      files: "export const xChrome: ChromeEntry = { id: 'x', zone: 'sidebar.top' as never };\n",
      at: "packages/client/src/features/x/lib/x-chrome.tsx",
      expect: { messageIncludes: "not one of CHROME_ZONES" },
      why: "a bad zone written `'sidebar.top' as never` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader passed before hardening",
    },
    {
      files: "export const railChrome: ChromeEntry = { id: 'r', zone: 'rail.nav', label: 'R', behavior: { kind: 'widget', body: () => null } };\n",
      at: "packages/client/src/features/x/lib/rail-chrome.tsx",
      expect: { messageIncludes: "declares no `mobile`" },
      why: "a rail.* widget with no `mobile` — the rail-mobile-required arm (§D)",
    },
    {
      files:
        "export const barChrome: ChromeEntry = { id: 'b', zone: 'topbar.trail', label: 'B', mobile: 'tab', behavior: { kind: 'widget', body: () => null } };\n",
      at: "packages/client/src/features/x/lib/bar-chrome.tsx",
      expect: { messageIncludes: "mobile curation is a rail-only axis" },
      why: "a topbar.* widget declaring `mobile` — the topbar-no-mobile arm (§D)",
    },
  ],
  mustPass: [
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
