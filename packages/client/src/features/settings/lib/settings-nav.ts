// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + LucideIcon fine
// (the rail-slots.ts precedent).

// SETTINGS_CATEGORIES — the one home for the settings overlay's left-nav geography. A registry-as-data
// map so the shell renders the nav from it and adding/renaming a category is a data edit. Every category
// carries its own distinct teaching copy so a deferred pane reads as "this specific thing isn't built
// yet". Settings holds only user/app preferences — generation config lives in the Presets rail section.

import {
  CircleUser,
  Drama,
  Hash,
  Lock,
  MessagesSquare,
  Settings,
  SunMoon,
  Zap,
} from "@orb/ui/icons";
import { BACKUP_CATEGORY } from "./backup-nav";
import { CONNECTIONS_CATEGORY } from "./connections-nav";
import type { SETTINGS_GROUPS, SettingsCategory } from "./settings-nav-model";
import { SETTINGS_CATEGORY_IDS } from "./settings-nav-model";
import { WORKLOADS_CATEGORY } from "./workloads-nav";

/** Appearance pane subcategory ids — shared by the registry and the surface's `<Section>` anchor stamps. */
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

export const PERSONA_SUBCATEGORY_IDS = { personas: "personas" } as const;

export const TAGS_SUBCATEGORY_IDS = { tags: "tags" } as const;

/** System pane subcategory ids — shared by the registry and the surface's `<Section>` anchor stamps. */
export const SYSTEM_SUBCATEGORY_IDS = {
  mediaTrust: "media-trust",
  compute: "compute",
  sharedAccess: "shared-access",
  multiUser: "multi-user",
  operations: "operations",
} as const;

export const ADMIN_SUBCATEGORY_IDS = {
  users: "users",
  engines: "engines",
} as const;

export const SETTINGS_CATEGORIES: Record<(typeof SETTINGS_CATEGORY_IDS)[number], SettingsCategory> =
  {
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
    tags: {
      group: "user",
      label: "Tags",
      icon: Hash,
      description: "Rename, recolor, reorder, merge, and delete the labels across your library.",
      built: true,
      subcategories: [
        {
          id: TAGS_SUBCATEGORY_IDS.tags,
          label: "Tags",
          keywords: ["label", "folder", "color", "merge", "rename", "prune"],
        },
      ],
    },
    workloads: WORKLOADS_CATEGORY,
    backup: BACKUP_CATEGORY,
    "chat-behavior": {
      group: "user",
      label: "Chat behavior",
      icon: MessagesSquare,
      description: "How chats send, continue, and handle greetings.",
      built: false,
    },
    connections: CONNECTIONS_CATEGORY,
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
          id: SYSTEM_SUBCATEGORY_IDS.multiUser,
          label: "Multi-user",
          keywords: ["auth", "login", "invite", "accounts", "humans", "discreet"],
          settings: [
            { id: "local-multi-user", label: "Allow multiple humans (local mode)" },
            { id: "discreet-login", label: "Discreet login" },
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
      description: "Accounts, sessions, and the local inference engines on this deployment.",
      built: true,
      adminOnly: true,
      subcategories: [
        {
          id: ADMIN_SUBCATEGORY_IDS.users,
          label: "Users",
          keywords: ["accounts", "people", "members", "roles", "agents"],
          settings: [
            {
              id: "create-user",
              label: "Create user",
              keywords: ["add", "invite", "account", "handle", "password"],
            },
            {
              id: "user-roles",
              label: "Roles & access",
              keywords: ["role", "admin", "owner", "promote", "demote", "disable", "enable"],
            },
            {
              id: "user-sessions",
              label: "Sessions",
              keywords: ["devices", "revoke", "sign out", "kick", "password reset"],
            },
          ],
        },
        {
          id: ADMIN_SUBCATEGORY_IDS.engines,
          label: "Engines",
          keywords: ["vllm", "gpu", "inference", "restart", "supervisor", "health"],
          settings: [
            {
              id: "engine-restart",
              label: "Restart an engine",
              keywords: ["vllm", "bounce", "hung", "failed", "embed", "rerank"],
            },
          ],
        },
      ],
    },
  };

/** The category ids for one group, in the registry's declared order. */
export function categoryIdsForGroup(
  group: (typeof SETTINGS_GROUPS)[number],
): readonly (typeof SETTINGS_CATEGORY_IDS)[number][] {
  return SETTINGS_CATEGORY_IDS.filter((id) => SETTINGS_CATEGORIES[id].group === group);
}
