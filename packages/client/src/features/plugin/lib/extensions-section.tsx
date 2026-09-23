// The EXTENSIONS rail section as ONE co-located definition (client-architecture-lockdown.md §6a 
// #679 U5, §4.5b, seam 16) — the platform's full-page home, and the TENTH `SECTION_IDS` member.
//
// ONE RAIL ENTRY FOR THE PLATFORM, NEVER ONE PER PLUGIN (§4.5b). Two reasons, and both are load-bearing: rail
// bloat (a rail that grows per install stops being navigable), and impersonation — a plugin holding its own
// top-level rail affordance is the app telling a person that this thing is house furniture. Per-plugin rail
// promotion is a RECORDED later owner knob, deliberately not built.
//
// `icon: Blocks` — the same glyph the plugin-labelled shell stamps on every plugin surface, so the rail entry
// and the attribution band a person lands on say the same thing with the same mark. Distinct from `Puzzle`
// (unused) and from `Settings` (the Plugins management pane, which is where you INSTALL rather than where you
// USE).
//
// `panelDefaults` — LIST docked (the switcher IS how you pick a page) and CONTEXT collapsed: a plugin page owns
// its whole CONTENT region and has no host-drawn inspector, which is also why `context` is `{kind:"none"}`
// rather than a tabs mint. There is no plugin-controlled CONTEXT pane in this design and there should not be:
// the context panel is host grammar (§4.3's unspellable list), and giving a page a second pane would hand a
// plugin two of the shell's three regions.
//
// `mobile: "sheet"` — reached through You, like every other non-everyday section; the four-tab bottom bar is a
// curation and it is already full. A phone renders the page in the CONTENT region under the one-shell law; no
// new viewport `@media` exists anywhere in this change.

import { Blocks } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";
import { pluginPageSectionSelection } from "#state";
import { ExtensionsListHeader } from "../components/extensions-list-header.tsx";
import { ExtensionsPageSurface } from "../surfaces/extensions-page-surface.tsx";
import { ExtensionsSwitcherSurface } from "../surfaces/extensions-switcher-surface.tsx";
import { EXTENSIONS_PLACEHOLDER } from "./extensions-copy.ts";
import { EXTENSIONS_SECTION_LABEL } from "./extensions-section-label.ts";
import { useExtensionsSelectionTitle } from "./use-extensions-selection-title.ts";

export const extensionsSection: SectionDefinition = {
  id: "extensions",
  rail: { label: EXTENSIONS_SECTION_LABEL, icon: Blocks, group: "authoring", mobile: "sheet" },
  // The DECLARED SHADOW of `context: {kind:"none"}` below (#1223). The shell derives "has a context pane"
  // from `panels.context` alone (`use-shell-layout.ts`), never from the context slot, so a section that
  // declares no context CONTENT but omits this ships a live topbar toggle onto the generic placeholder —
  // exactly the door H3/arm L-b removed for home. Interim: the design's §3.4b would DERIVE availability
  // from `kind:"none"`, and until it lands the two statements are spelled separately and must agree.
  panels: { context: "unavailable" },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: EXTENSIONS_PLACEHOLDER,
  list: () => <ExtensionsSwitcherSurface />,
  // The LIST chrome-band content (#1190): "Extensions" title + a live page count. Browse-shaped, no create
  // action — a page is registered by a plugin, not made from this band (see the header's own note).
  listHeader: () => <ExtensionsListHeader />,
  // How the SHELL reads "is a page open?" — the mobile ONE-SHELL rule's input and its back affordance.
  selection: pluginPageSectionSelection,
  // …and what the MOBILE topbar calls the open page: the page's own name, never the section's.
  useSelectionTitle: useExtensionsSelectionTitle,
  content: () => <ExtensionsPageSurface />,
  // A plugin page has no host-drawn inspector, and that is a decision rather than an omission — see the header.
  context: { kind: "none" },
};
