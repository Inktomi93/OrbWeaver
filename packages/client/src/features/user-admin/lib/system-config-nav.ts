// The nav entries for the five sections the retired SYSTEM pane decomposed into (SET-SEAMS stage 4 / §10 Q2
// — `system` merged INTO `admin`). Each `SettingsSubcategory` is the ONE home shared by its contribution def
// and its `<Section>` anchor stamp, split out so neither imports the other (the rate-limits-nav precedent).
//
// The sub IDS and the search leaves are byte-identical to the retired `system-pane.tsx` (§7.1/§7.2 — a
// section keeps its `(category, subId)` pair across a move). The CATEGORY half necessarily changed with the
// pane merge — that is the one anchor break §10 Q2 authorises, and it is total: no `settings-anchor-system-*`
// id survives anywhere.

import type { SettingsSubcategory } from "#state";

export const MEDIA_TRUST_SUBCATEGORY: SettingsSubcategory = {
  id: "media-trust",
  label: "Media & trust",
  keywords: ["security", "privacy", "safety"],
  settings: [
    { id: "forbid-external-media", label: "Block external media", keywords: ["url", "image", "privacy", "ssrf", "tracking", "pixel"] },
    { id: "trust-html", label: "Render rich HTML as trusted", keywords: ["html", "mermaid", "sanitize", "xss", "cards"] },
    { id: "max-image-bytes", label: "Max generated-image size", keywords: ["download", "megabytes", "bytes", "imagine", "cap"] },
  ],
};

export const COMPUTE_SUBCATEGORY: SettingsSubcategory = {
  id: "compute",
  label: "Compute",
  keywords: ["vllm", "gpu", "batch", "inference"],
  settings: [
    { id: "vllm-embed-concurrency", label: "Embedding concurrency", keywords: ["vllm", "embed", "batch", "index"] },
    { id: "vllm-summarize-concurrency", label: "Summarize concurrency", keywords: ["vllm", "summarize", "batch", "memory"] },
  ],
};

export const SHARED_ACCESS_SUBCATEGORY: SettingsSubcategory = {
  id: "shared-access",
  label: "Shared access",
  keywords: ["members", "owner", "governance", "sharing"],
  settings: [
    { id: "allow-non-owner-local", label: "Members may use shared local compute", keywords: ["local", "vllm", "onnx", "members", "share"] },
    { id: "non-owner-local-budget", label: "Per-member local-compute budget", keywords: ["budget", "limit", "count", "quota"] },
    { id: "allow-non-owner-max-pro-sub", label: "Members may use the hosted subscription", keywords: ["max", "pro", "subscription", "hosted", "claude"] },
  ],
};

export const MULTI_USER_SUBCATEGORY: SettingsSubcategory = {
  id: "multi-user",
  label: "Multi-user",
  keywords: ["auth", "login", "invite", "accounts", "humans", "discreet"],
  settings: [
    { id: "local-multi-user", label: "Allow multiple humans (local mode)" },
    { id: "discreet-login", label: "Discreet login" },
  ],
};

export const OPERATIONS_SUBCATEGORY: SettingsSubcategory = {
  id: "operations",
  label: "Operations",
  keywords: ["jobs", "logging", "diagnostics"],
  settings: [
    { id: "corpus-autoindex", label: "Background corpus indexing", keywords: ["index", "embeddings", "corpus", "background"] },
    { id: "log-level", label: "Log level", keywords: ["logging", "verbosity", "debug", "trace"] },
  ],
};
