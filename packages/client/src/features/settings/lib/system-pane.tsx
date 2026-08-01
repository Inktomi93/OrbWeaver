// The System settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. Registered at the door (main.tsx); settings owns this pane (O3).

import { Settings } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { SystemSettingsSurface } from "../surfaces/system-settings-surface";
import { SYSTEM_SUBCATEGORY_IDS } from "./system-nav";

export const systemPane: SettingsPaneDefinition = {
  id: "system",
  group: "app",
  label: "System",
  icon: Settings,
  description: "Deployment-wide media safety, compute, shared access, and operations.",
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
  body: { kind: "surface", render: () => <SystemSettingsSurface /> },
};
