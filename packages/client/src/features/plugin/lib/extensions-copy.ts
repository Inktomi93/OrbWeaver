// The Extensions section's COPY, in one place (plugin-ui-plane #679 U5, §4.5b) — the section placeholder, the
// teaching empty, and the switcher's own labels.
//
// THE EMPTY STATE IS THE ADVERTISEMENT, and that is the argued position, not a default. The rail section ships
// VISIBLE with an honest empty rather than hidden-until-populated: a hidden entry makes the whole platform
// undiscoverable — a person who has never installed a plugin with pages would never learn that pages exist. The
// byte-identical-when-off law governs CONTRIBUTIONS (zero registrants ⇒ the host renders its own default); a
// rail SECTION is house chrome, and the house ships visible sections in honest empty states by law (the
// three-states law: EMPTY teaches, with an action). The hide-when-empty variant is a RECORDED owner knob, priced
// with per-plugin rail promotion — deliberately NOT built here.
//
// "NO PAGES" IS FIVE DIFFERENT FACTS AND THIS FILE USED TO COLLAPSE THEM (#924, fifth arm #1865). One string —
// "No extension pages yet / Install a plugin with page surfaces and it will appear here." — was rendered for
// every zero-page state, including the one a FRESH BOOT lands in: nine example plugins ARE installed, each
// disabled with an empty grant and a standing consent ask (`entry/boot/seed-example-plugins.ts`), so
// `listSurfaces` collects nothing and the pane told the person to install what they already had. Per-user
// emptiness is about the ASKER, and this pane's job is to say WHICH emptiness. The reasons are ordered by
// what the person must do next, and `EXTENSIONS_EMPTY_COPY` below is the ONE home for all four:
//   · `none-installed`   — nothing to draw from. Go install one.
//   · `awaiting-consent` — installed, standing on YOUR answer. Go read the ask. (The fresh-boot state.)
//   · `all-off`          — granted, but nothing is switched on, so nothing registers. Go turn one on.
//   · `some-errored`     — a plugin FAILED to start. Go read why. (#1865 — the arm the four could not spell:
//                          an `errored` row is not `enabled`, so a box whose only page-bringing plugin died
//                          fell through to `all-off`'s "you turned them off" or `no-pages`' "go install one",
//                          and both blamed the person for a failure that was the software's. It sits ABOVE
//                          `all-off` deliberately: not turning a plugin on is a choice, a plugin dying is not,
//                          and the louder fact goes first.)
//   · `no-pages`         — running plugins, none of which bring a page. The original copy, now honest.
// Each arm names a DIFFERENT next step and lands at a DIFFERENT config anchor, which is the whole reason
// they exist separately — the sibling defect this file already argues against for "pick one" vs "there are
// none" (see the no-selection copy below), applied to its own empty.

import { PLUGIN_PERMISSIONS_SETTING_ID, PLUGINS_INSTALL_SUBCATEGORY, PLUGINS_INSTALLED_SUBCATEGORY } from "./plugins-nav.ts";

/** The section's placeholder (title, description) — DISTINCT from every sibling's by the
 *  `placeholder-copy-registry` gate, and it doubles as the home-tile gloss, so it says what the section IS
 *  rather than pointing at a pane the tile has no left rail for. */
export const EXTENSIONS_PLACEHOLDER = {
  title: "Extensions",
  description: "Full-page surfaces the plugins you installed provide — browsers, dashboards, whatever they bring, drawn by the app.",
} as const;

/** One reason's teaching empty: what is true, what to do about it, and WHERE that is done. */
export interface ExtensionsEmptyCopy {
  readonly title: string;
  /** The arm's own COUNT: how many plugins are standing on the caller's consent (`awaiting-consent`), or how
   *  many failed to start (`some-errored`). The other three ignore it — the signature stays uniform so the map
   *  is one shape and the call sites never branch on which arm they drew. */
  readonly description: (count: number) => string;
  readonly action: string;
  /** Where the action lands inside the Plugins config group — a different anchor per reason, because
   *  "install one" and "answer the ask" are not the same screen. */
  readonly sub: string;
  /** The setting row to FOCUS on arrival, when the next act is a specific control rather than a section. */
  readonly setting: string | null;
}

/** The generic label for "take me to the plugins screen" — shared by the arms whose next act is the section
 *  itself, and by the CONTENT pane's GONE state. */
export const EXTENSIONS_OPEN_PLUGINS_ACTION = "Open Plugins";

/**
 * The teaching EMPTIES (§4.5b) — one per reason, each naming its own next step, which is why every arm
 * carries an action (`empty-state-has-action`).
 *
 * THIS MAP IS THE AXIS ITSELF, not a lookup beside a separately-declared union: the reason type is
 * `keyof typeof EXTENSIONS_EMPTY_COPY`, derived at every consumer (`use-extensions-empty.ts`). One home, and
 * a fifth reason cannot exist without copy — which is the failure mode a parallel union would allow. The
 * `satisfies` (rather than a `Record<Reason, …>` annotation) is what keeps the keys narrow enough to derive
 * from while still checking every value against the shape; a declared-and-exported union here would also be
 * `no-inline-types` RED, since a client feature is not a type home.
 */
export const EXTENSIONS_EMPTY_COPY = {
  "none-installed": {
    title: "No plugins installed yet",
    description: (): string => "Extensions are full pages a plugin brings — browsers, dashboards, whatever it adds. Install one and its pages open here.",
    action: "Add a plugin",
    sub: PLUGINS_INSTALL_SUBCATEGORY.id,
    setting: null,
  },
  "awaiting-consent": {
    title: "Your plugins are waiting on you",
    description: (awaiting: number): string =>
      `${awaiting === 1 ? "One plugin is" : `${awaiting} plugins are`} installed but not allowed to do anything yet. Read what each one asks for and choose what to allow — pages they bring open here once they run.`,
    action: "Review what they ask for",
    sub: PLUGINS_INSTALLED_SUBCATEGORY.id,
    setting: PLUGIN_PERMISSIONS_SETTING_ID,
  },
  "some-errored": {
    title: "A plugin failed to start",
    description: (count: number): string =>
      `${count === 1 ? "One plugin" : `${count} plugins`} could not start, so whatever ${count === 1 ? "it brings is" : "they bring are"} missing here. Each one records why it failed on the Plugins screen.`,
    action: "See what went wrong",
    sub: PLUGINS_INSTALLED_SUBCATEGORY.id,
    setting: null,
  },
  "all-off": {
    title: "Your plugins are turned off",
    description: (): string => "Nothing is running, so nothing has registered a page. Turn a plugin on and whatever it brings opens here.",
    action: EXTENSIONS_OPEN_PLUGINS_ACTION,
    sub: PLUGINS_INSTALLED_SUBCATEGORY.id,
    setting: null,
  },
  "no-pages": {
    title: "No extension pages yet",
    description: (): string => "Install a plugin with page surfaces and it will appear here.",
    action: EXTENSIONS_OPEN_PLUGINS_ACTION,
    sub: PLUGINS_INSTALLED_SUBCATEGORY.id,
    setting: null,
  },
} satisfies Record<string, ExtensionsEmptyCopy>;

/** The CONTENT pane's no-selection state — a switcher with rows but nothing picked. Distinct copy from the
 *  empty above: "pick one" and "there are none" are different facts and collapsing them is the generic-filler
 *  defect the house sweeps for. */
export const EXTENSIONS_NO_SELECTION_TITLE = "Pick an extension page";
export const EXTENSIONS_NO_SELECTION_BODY = "Choose a page on the left to open it here.";

/** The CONTENT pane's DANGLING state — the selected page's plugin was disabled or removed while it was open. */
export const EXTENSIONS_GONE_TITLE = "That page is no longer available";
export const EXTENSIONS_GONE_BODY = "Its plugin was disabled or removed. Pick another page, or turn it back on in Plugins.";
