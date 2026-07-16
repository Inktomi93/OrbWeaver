// Gate: settings-section-anchored (derive-modernization-audit.md §W5 item 9 — the G4 arm). A
// heading-bearing `<Section>` in a `*-settings-surface.tsx` is a settings-pane section: the settings host
// scroll-spy + the command-palette search jump to it by its `settingsAnchorId(category, sub)` DOM id. A
// heading-bearing Section with NO `id` attribute is INVISIBLE to nav and search — you can't deep-link it,
// the scroll-spy skips it, and search can't surface it. RED it so every anchored section is reachable.
//
// The rule keys on `heading`-bearing Sections only (a bare `<Section>` used for pure layout is not a nav
// target — regex-settings-surface stamps its anchor on a `<Stack id=…>`, not a Section). A spread
// attribute (`{...props}`) that MIGHT carry `id` is given the benefit of the doubt (empty-state-has-action
// precedent). The complement to settings-pane-completeness/placeholder-copy-registry.
import type { JsxAttributeLike, JsxOpeningElement, JsxSelfClosingElement } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const TAG_NAME = "Section";
const SETTINGS_SURFACE_RE = /packages\/client\/src\/.*-settings-surface\.tsx$/;

/** Does this `<Section …>` carry a JSX attribute named `name`, or a spread that MIGHT (a conditional
 *  prop the gate can't statically resolve, so it's given the benefit of the doubt)? */
function hasAttr(el: JsxOpeningElement | JsxSelfClosingElement, name: string): boolean {
  return el.getAttributes().some((attr: JsxAttributeLike) => {
    if (attr.getKind() === SyntaxKind.JsxSpreadAttribute) {
      return true;
    }
    return attr.getKind() === SyntaxKind.JsxAttribute && attr.getFirstChild()?.getText() === name;
  });
}

const MESSAGE =
  "heading-bearing <Section> in a *-settings-surface.tsx with no `id` — an anchored settings section must " +
  "stamp `id={settingsAnchorId(category, sub)}` (register the sub in the pane's `subcategories`) or it is " +
  "invisible to the settings scroll-spy + command-palette search (derive-modernization-audit.md §W5).";

export const gate: GateDescriptor = {
  name: "settings-section-anchored",
  docRow: "derive-modernization-audit.md §W5 (G4 arm)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "stamp `id={settingsAnchorId(category, sub)}` on the heading-bearing <Section> and register `sub` in the owning pane's `subcategories` (connections-pane.tsx / admin-pane.tsx / …) so nav + search can reach it.",
  scanRoot: (p) => SETTINGS_SURFACE_RE.test(p),
  kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
  visit: (node, _sf, ctx) => {
    const el = node.asKind(SyntaxKind.JsxOpeningElement) ?? node.asKind(SyntaxKind.JsxSelfClosingElement);
    if (el === undefined || el.getTagNameNode().getText() !== TAG_NAME) {
      return;
    }
    // Only a heading-bearing Section is a nav target; a bare layout Section needs no anchor.
    if (!hasAttr(el, "heading") || hasAttr(el, "id")) {
      return;
    }
    ctx.report(node, { token: `<${TAG_NAME}`, offset: 0 });
  },
  mustFlag: [
    {
      files: 'export const G = <Section heading="Host Claude"><Text>x</Text></Section>;\n',
      at: "packages/client/src/features/credentials/surfaces/connections-settings-surface.tsx",
      expect: { messageIncludes: "no `id`" },
      why: "a heading-bearing <Section> with no id in a *-settings-surface.tsx — invisible to nav/search",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <Section heading="Host Claude" id={anchor("host-claude")}><Text>x</Text></Section>;\n',
      at: "packages/client/src/features/credentials/surfaces/connections-settings-surface.tsx",
      why: "a heading-bearing <Section> WITH an id anchor — reachable, passes",
    },
    {
      files: "export const G = <Section><Text>x</Text></Section>;\n",
      at: "packages/client/src/features/settings/surfaces/x-settings-surface.tsx",
      why: "a bare layout <Section> (no heading) is not a nav target — needs no anchor, passes",
    },
    {
      files: 'export const G = <Section heading="Host Claude" {...rest}><Text>x</Text></Section>;\n',
      at: "packages/client/src/features/settings/surfaces/x-settings-surface.tsx",
      why: "a spread attribute might carry id (a conditional prop the gate can't statically resolve) — treated as present",
    },
    {
      files: 'export const G = <Section heading="Host Claude"><Text>x</Text></Section>;\n',
      at: "packages/client/src/features/credentials/surfaces/role-slot-row.tsx",
      why: "scope: a heading-bearing <Section> OUTSIDE a *-settings-surface.tsx is not scanned — passes",
    },
  ],
};
