// The nav entries for the five sections the retired SYSTEM pane decomposed into (SET-SEAMS stage 4 / §10 Q2
// — `system` merged INTO `admin`). Each `ConfigSubcategory` is the ONE home shared by its contribution def
// and its `<Section>` anchor stamp, split out so neither imports the other (the rate-limits-nav precedent).
//
// The sub IDS and the search leaves are byte-identical to the retired `system-pane.tsx` (§7.1/§7.2 — a
// section keeps its `(category, subId)` pair across a move). The CATEGORY half necessarily changed with the
// pane merge — that is the one anchor break §10 Q2 authorises, and it is total: no `config-anchor-system-*`
// id survives anywhere.

import type { ConfigSubcategory } from "#state";
import { MULTI_USER_CONFIG_SUB } from "#state";

export const MEDIA_TRUST_SUBCATEGORY: ConfigSubcategory = {
  id: "media-trust",
  label: "Media & trust",
  keywords: ["security", "privacy", "safety"],
  teach: {
    summary: "Security and privacy controls for rendered content: block external media URLs, trust rich HTML, and cap generated-image download size.",
    affects: ["message rendering security and image generation, deployment-wide"],
  },
  settings: [
    {
      id: "forbid-external-media",
      label: "Block external media",
      keywords: ["url", "image", "privacy", "ssrf", "tracking", "pixel"],
      teach: {
        summary: "Blocks messages from loading media by external URL \u2014 no tracking pixels, no SSRF, no surprise fetches.",
        affects: ["every account's message rendering, deployment-wide"],
      },
    },
    {
      id: "trust-html",
      label: "Render rich HTML as trusted",
      keywords: ["html", "mermaid", "sanitize", "xss", "cards"],
      teach: {
        summary: "Renders rich HTML cards as trusted instead of sanitized \u2014 only for deployments where every author is trusted.",
        affects: ["every account's message rendering, deployment-wide"],
      },
    },
    {
      id: "max-image-bytes",
      label: "Max generated-image size",
      keywords: ["download", "megabytes", "bytes", "imagine", "cap"],
      teach: { summary: "The size cap on a generated image the server will download and store.", affects: ["image generation, deployment-wide"] },
    },
  ],
};

export const MULTI_USER_SUBCATEGORY: ConfigSubcategory = {
  id: MULTI_USER_CONFIG_SUB,
  label: "Multi-user",
  keywords: ["auth", "login", "invite", "accounts", "humans", "discreet"],
  teach: {
    summary: "Multi-human controls for local mode: allow additional accounts and hide handles on the login screen.",
    affects: ["sign-up availability and login-screen privacy, deployment-wide"],
  },
  settings: [
    {
      id: "local-multi-user",
      label: "Allow multiple humans (local mode)",
      teach: { summary: "Allows more than one human account in local mode.", affects: ["sign-up and rooms' member ceilings, deployment-wide"] },
    },
    { id: "discreet-login", label: "Discreet login", teach: { summary: "Hides account handles on the login screen.", affects: ["the login screen only"] } },
  ],
};

export const OPERATIONS_SUBCATEGORY: ConfigSubcategory = {
  id: "operations",
  label: "Operations",
  keywords: ["jobs", "logging", "diagnostics"],
  teach: {
    summary: "Background-operations switches: corpus auto-indexing and server log verbosity.",
    affects: ["background indexing load and server log output, deployment-wide"],
  },
  settings: [
    {
      id: "corpus-autoindex",
      label: "Background corpus indexing",
      keywords: ["index", "embeddings", "corpus", "background"],
      teach: { summary: "Keeps the corpus index warm in the background as content changes.", affects: ["background indexing load and search freshness"] },
    },
    {
      id: "log-level",
      label: "Log level",
      keywords: ["logging", "verbosity", "debug", "trace"],
      teach: { summary: "How verbose the server log is.", affects: ["server logging only \u2014 never user data"] },
    },
  ],
};
