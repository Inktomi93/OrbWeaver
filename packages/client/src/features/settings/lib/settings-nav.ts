// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + LucideIcon fine
// (the rail-slots.ts precedent).

// SETTINGS_CATEGORIES — the ONE home for the settings overlay's left-nav geography (ux-flow-revamp J11 ·
// UI-Arch §4.2 region map: the `settings` modal's USER/APP groups). A registry-as-data map so the shell
// renders the nav from it (never bespoke JSX per row) and adding/renaming a category is a data edit. The
// category-id + group unions are DERIVED INLINE from the tuples (`(typeof …)[number]`) — NOT exported as
// `type` aliases (a feature-lib type leak the `types-in-contract` plugin flags; the rail-slots.ts pattern:
// export the tuple + interface, derive the union inline). Every category carries its own DISTINCT teaching
// copy (the same honesty discipline as the section placeholders, J10) so a deferred pane reads as "this
// specific thing isn't built yet", never a generic sparkle.
//
// SCOPE (J11 — the governing split): settings holds ONLY user/app PREFERENCES. Generation config is NOT
// here — it is the Presets rail section (a later lane); do not add a generation/preset category.
// TODAY: Appearance is the one REAL pane (the #31 surface migrates in as the exemplar, `built: true`);
// every other category is an honest "not built yet" pane that lands with its own feature lane.

import type { LucideIcon } from "@orb/ui/icons";
import {
  CircleUser,
  Drama,
  ExternalLink,
  Lock,
  MessagesSquare,
  Settings,
  SunMoon,
  Zap,
} from "@orb/ui/icons";

/** The two nav GROUPS (UI-Arch §4.2 — the settings region's USER + APP micro-caps labels). The union is
 *  derived inline where needed (`(typeof SETTINGS_GROUPS)[number]`), never an exported alias. */
export const SETTINGS_GROUPS = ["user", "app"] as const;

/** Every settings category, in render order (grouped below). Adding one = a tuple member + a map entry;
 *  the `Record<…, SettingsCategory>` then forces the copy (a missing category is a tsc error). */
export const SETTINGS_CATEGORY_IDS = [
  "account",
  "personas",
  "appearance",
  "chat-behavior",
  "connections",
  "automation",
  "system",
  "admin",
] as const;

export interface SettingsCategory {
  /** Which nav group this category renders under (drives the USER/APP micro-caps grouping). */
  readonly group: (typeof SETTINGS_GROUPS)[number];
  readonly label: string;
  /** The nav-row glyph (a lucide icon from the icons barrel). */
  readonly icon: LucideIcon;
  /** Distinct teaching copy for the pane — real panes ignore it; deferred panes render it (J11/J10). */
  readonly description: string;
  /** `true` when a real surface exists for this pane (only Appearance today); false ⇒ teaching placeholder. */
  readonly built: boolean;
}

export const SETTINGS_CATEGORIES: Record<(typeof SETTINGS_CATEGORY_IDS)[number], SettingsCategory> =
  {
    // ── USER group ──
    account: {
      group: "user",
      label: "Account",
      icon: CircleUser,
      description: "Your identity and sign-out land here when auth is wired.",
      built: false,
    },
    personas: {
      group: "user",
      label: "Personas",
      icon: Drama,
      description: "Notifications + restore-from-backup. Edit personas from the rail-foot panel.",
      built: true,
    },
    appearance: {
      group: "user",
      label: "Appearance",
      icon: SunMoon,
      description: "Theme, message style, and display density.",
      built: true,
    },
    "chat-behavior": {
      group: "user",
      label: "Chat behavior",
      icon: MessagesSquare,
      description: "How chats send, continue, and handle greetings.",
      built: false,
    },
    // ── APP group ──
    connections: {
      group: "app",
      label: "Connections",
      icon: ExternalLink,
      description: "Provider credentials and model connections.",
      built: false,
    },
    automation: {
      group: "app",
      label: "Automation",
      icon: Zap,
      description: "Scheduled and triggered actions across your library.",
      built: false,
    },
    system: {
      group: "app",
      label: "System",
      icon: Settings,
      description: "Background jobs, engines, and storage.",
      built: false,
    },
    admin: {
      group: "app",
      label: "Admin",
      icon: Lock,
      description: "User administration — available on multi-user deployments.",
      built: false,
    },
  };

/** The category ids for one group, in the registry's declared order (the nav renders per-group). */
export function categoryIdsForGroup(
  group: (typeof SETTINGS_GROUPS)[number],
): readonly (typeof SETTINGS_CATEGORY_IDS)[number][] {
  return SETTINGS_CATEGORY_IDS.filter((id) => SETTINGS_CATEGORIES[id].group === group);
}

/** The human label for each group's micro-caps nav heading. */
export const SETTINGS_GROUP_LABELS: Record<(typeof SETTINGS_GROUPS)[number], string> = {
  user: "User",
  app: "App",
};
