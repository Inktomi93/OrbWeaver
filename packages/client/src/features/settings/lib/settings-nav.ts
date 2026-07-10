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

/** One searchable/jumpable setting inside a subcategory (Discord/VS-Code grammar — the leaf of the
 *  SETTINGS_INDEX). `keywords` widen fuzzy search past the label (synonyms the user might type). */
export interface SettingsSetting {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
}

/** A subcategory = one anchored SECTION inside a pane (the Appearance pane's `<Section>`s). The nav
 *  renders these as indented rows under the active category; each stamps a stable anchor node
 *  (`settingsAnchorId(categoryId, id)`) the search jumps to. */
export interface SettingsSubcategory {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly settings?: readonly SettingsSetting[];
}

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
  /** The pane's anchored sections, in render order. Empty for teaching placeholders (nothing to jump
   *  to). The nav renders these as indented subcategory rows; the surface stamps each `<Section>` with
   *  `settingsAnchorId(categoryId, sub.id)`. */
  readonly subcategories?: readonly SettingsSubcategory[];
}

/** Appearance pane subcategory ids — the ONE home shared by the registry AND the surface's `<Section>`
 *  anchor stamps, so a typo/rename is a `tsc` error, never a stale anchor (registry-as-data). */
export const APPEARANCE_SUBCATEGORY_IDS = {
  messageStyle: "message-style",
  avatars: "avatars",
  sizing: "sizing",
  motion: "motion",
  messageDetails: "message-details",
  messageActions: "message-actions",
  background: "background",
  reading: "reading-typography",
  effects: "effects",
} as const;

/** Persona pane subcategory ids (same one-home discipline as the appearance map). */
export const PERSONA_SUBCATEGORY_IDS = { personas: "personas" } as const;

/** System pane subcategory ids (Task #37) — the ONE home shared by the registry AND the surface's
 *  `<Section>` anchor stamps (a typo/rename is a `tsc` error, never a stale anchor). */
export const SYSTEM_SUBCATEGORY_IDS = {
  mediaTrust: "media-trust",
  compute: "compute",
  sharedAccess: "shared-access",
  operations: "operations",
} as const;

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
      subcategories: [
        {
          id: PERSONA_SUBCATEGORY_IDS.personas,
          label: "Personas",
          settings: [
            {
              id: "persona-notifications",
              label: "Persona change notifications",
              keywords: ["notify", "notification", "alert"],
            },
            {
              id: "persona-restore",
              label: "Restore personas from a backup",
              keywords: ["import", "backup", "restore", "json"],
            },
          ],
        },
      ],
    },
    appearance: {
      group: "user",
      label: "Appearance",
      icon: SunMoon,
      description: "Theme, message style, and display density.",
      built: true,
      subcategories: [
        {
          id: APPEARANCE_SUBCATEGORY_IDS.messageStyle,
          label: "Message style",
          settings: [
            {
              id: "chat-style",
              label: "Chat display",
              keywords: ["bubble", "flat", "document", "immersive", "echo", "whisper", "ripple"],
            },
            { id: "density", label: "Density", keywords: ["compact", "comfortable", "spacing"] },
            {
              id: "elevation",
              label: "Surface elevation",
              keywords: ["layered", "depth", "shadow", "flat"],
            },
            {
              id: "auto-fix-markdown",
              label: "Auto-fix unfinished formatting",
              keywords: ["markdown", "italic", "bold", "asterisk"],
            },
          ],
        },
        {
          id: APPEARANCE_SUBCATEGORY_IDS.avatars,
          label: "Avatars",
          keywords: ["portrait", "picture"],
          settings: [
            { id: "show-avatars", label: "Show avatars in chat" },
            { id: "avatar-size", label: "Avatar size" },
            { id: "avatar-shape", label: "Avatar shape" },
            { id: "avatar-aspect", label: "Avatar aspect" },
            { id: "avatar-ring", label: "Avatar ring" },
          ],
        },
        {
          id: APPEARANCE_SUBCATEGORY_IDS.sizing,
          label: "Sizing",
          settings: [
            {
              id: "chat-width",
              label: "Chat width",
              keywords: ["width", "column", "reading"],
            },
            { id: "font-scale", label: "Text size", keywords: ["font", "scale", "zoom"] },
          ],
        },
        {
          id: APPEARANCE_SUBCATEGORY_IDS.motion,
          label: "Motion",
          settings: [
            {
              id: "reduced-motion",
              label: "Reduce motion",
              keywords: ["animation", "transition", "accessibility"],
            },
          ],
        },
        {
          id: APPEARANCE_SUBCATEGORY_IDS.messageDetails,
          label: "Message details",
          keywords: ["metadata"],
          settings: [
            { id: "show-timestamps", label: "Show timestamps", keywords: ["time", "date"] },
            { id: "show-message-id", label: "Show message ID" },
            { id: "show-model", label: "Show model" },
            { id: "show-token-count", label: "Show token count", keywords: ["tokens", "usage"] },
            {
              id: "show-reasoning",
              label: "Show reasoning icon",
              keywords: ["thinking", "reasoning"],
            },
          ],
        },
        {
          id: APPEARANCE_SUBCATEGORY_IDS.messageActions,
          label: "Message actions",
          settings: [
            {
              id: "message-actions",
              label: "Action cluster",
              keywords: ["edit", "delete", "fork", "copy", "hide", "hover"],
            },
          ],
        },
        {
          id: APPEARANCE_SUBCATEGORY_IDS.background,
          label: "Background",
          keywords: ["wallpaper", "photo", "image"],
          settings: [
            { id: "background-image", label: "Background image", keywords: ["photo", "wallpaper"] },
            { id: "background-dim", label: "Scrim opacity", keywords: ["darken", "overlay"] },
            { id: "background-blur", label: "Image blur" },
          ],
        },
        {
          id: APPEARANCE_SUBCATEGORY_IDS.reading,
          label: "Reading typography",
          keywords: ["text", "prose", "font"],
          settings: [
            { id: "line-height", label: "Line height", keywords: ["leading", "spacing"] },
            { id: "letter-spacing", label: "Letter spacing", keywords: ["tracking", "kerning"] },
            { id: "paragraph-spacing", label: "Paragraph spacing" },
            { id: "name-scale", label: "Speaker name size" },
            { id: "body-scale", label: "Message text size" },
            { id: "justify", label: "Justify message text", keywords: ["align", "manuscript"] },
          ],
        },
        {
          id: APPEARANCE_SUBCATEGORY_IDS.effects,
          label: "Effects",
          settings: [
            {
              id: "frosted-glass",
              label: "Frosted glass",
              keywords: ["blur", "glass", "backdrop"],
            },
            { id: "glass-blur", label: "Glass blur radius" },
            { id: "prose-shadow", label: "Prose shadow", keywords: ["halo", "readability"] },
            {
              id: "accent-tint",
              label: "Tint the UI with the accent color",
              keywords: ["accent", "color", "border", "hairline"],
            },
          ],
        },
      ],
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
      description: "Deployment-wide media safety, compute, shared access, and operations.",
      built: true,
      subcategories: [
        {
          id: SYSTEM_SUBCATEGORY_IDS.mediaTrust,
          label: "Media & trust",
          keywords: ["security", "privacy", "safety"],
          settings: [
            {
              id: "forbid-external-media",
              label: "Block external media",
              keywords: ["url", "image", "privacy", "ssrf", "tracking", "pixel"],
            },
            {
              id: "trust-html",
              label: "Render rich HTML as trusted",
              keywords: ["html", "mermaid", "sanitize", "xss", "cards"],
            },
            {
              id: "max-image-bytes",
              label: "Max generated-image size",
              keywords: ["download", "megabytes", "bytes", "imagine", "cap"],
            },
          ],
        },
        {
          id: SYSTEM_SUBCATEGORY_IDS.compute,
          label: "Compute",
          keywords: ["vllm", "gpu", "batch", "inference"],
          settings: [
            {
              id: "vllm-embed-concurrency",
              label: "Embedding concurrency",
              keywords: ["vllm", "embed", "batch", "index"],
            },
            {
              id: "vllm-summarize-concurrency",
              label: "Summarize concurrency",
              keywords: ["vllm", "summarize", "batch", "memory"],
            },
          ],
        },
        {
          id: SYSTEM_SUBCATEGORY_IDS.sharedAccess,
          label: "Shared access",
          keywords: ["members", "owner", "governance", "sharing"],
          settings: [
            {
              id: "allow-non-owner-local",
              label: "Members may use shared local compute",
              keywords: ["local", "vllm", "onnx", "members", "share"],
            },
            {
              id: "non-owner-local-budget",
              label: "Per-member local-compute budget",
              keywords: ["budget", "limit", "count", "quota"],
            },
            {
              id: "allow-non-owner-max-pro-sub",
              label: "Members may use the hosted subscription",
              keywords: ["max", "pro", "subscription", "hosted", "claude"],
            },
          ],
        },
        {
          id: SYSTEM_SUBCATEGORY_IDS.operations,
          label: "Operations",
          keywords: ["jobs", "logging", "diagnostics"],
          settings: [
            {
              id: "corpus-autoindex",
              label: "Background corpus indexing",
              keywords: ["index", "embeddings", "corpus", "background"],
            },
            {
              id: "log-level",
              label: "Log level",
              keywords: ["logging", "verbosity", "debug", "trace"],
            },
          ],
        },
      ],
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

/** The DOM id of a subcategory's anchor node — derived from the registry keys, never a scattered
 *  string literal. The surface stamps this on the `<Section>`; the nav/search `scrollIntoView`s it. */
export function settingsAnchorId(
  categoryId: (typeof SETTINGS_CATEGORY_IDS)[number],
  subId: string,
): string {
  return `settings-anchor-${categoryId}-${subId}`;
}
