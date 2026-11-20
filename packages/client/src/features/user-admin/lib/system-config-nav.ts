// The nav entries for the five sections the retired SYSTEM pane decomposed into (SET-SEAMS stage 4 / §10 Q2
// — `system` merged INTO `admin`). Each `ConfigSubcategory` is the ONE home shared by its contribution def
// and its `<Section>` anchor stamp, split out so neither imports the other (the rate-limits-nav precedent).
//
// A section keeps its `(category, subId)` pair across a move (§7.1/§7.2). The CATEGORY half necessarily changed with the
// pane merge — that is the one anchor break §10 Q2 authorises, and it is total: no `config-anchor-system-*`
// id survives anywhere.

import { CHARACTER_TRUST_BLOCK_LABEL, DEFAULT_HTML_STEP_SETTING_LABEL, LOAD_INTERNET_MEDIA_LABEL } from "#lib";
import type { ConfigSubcategory } from "#state";
import { DEFAULT_HTML_STEP_CONFIG_SETTING, FORBID_EXTERNAL_MEDIA_CONFIG_SETTING, MEDIA_TRUST_CONFIG_SUB, MULTI_USER_CONFIG_SUB } from "#state";

export const MEDIA_TRUST_SUBCATEGORY: ConfigSubcategory = {
  id: MEDIA_TRUST_CONFIG_SUB,
  label: CHARACTER_TRUST_BLOCK_LABEL,
  keywords: ["security", "privacy", "safety", "media", "trust", "images"],
  teach: {
    summary:
      "What characters' content may do and load by default: the HTML step for characters on Inherit default, and whether their content loads internet media.",
    affects: ["message rendering security, deployment-wide"],
  },
  settings: [
    {
      id: DEFAULT_HTML_STEP_CONFIG_SETTING,
      label: DEFAULT_HTML_STEP_SETTING_LABEL,
      keywords: ["html", "trust", "interactive", "cards", "scripts", "javascript", "sanitize"],
      teach: {
        summary:
          "The HTML step characters on Inherit default take: Plain text, Rich HTML or Interactive. Below Interactive, their cards and styled replies run no scripts. A character's own step wins over it.",
        affects: ["every account's message rendering and card scripts, deployment-wide"],
      },
    },
    {
      id: FORBID_EXTERNAL_MEDIA_CONFIG_SETTING,
      label: LOAD_INTERNET_MEDIA_LABEL,
      keywords: ["url", "image", "privacy", "ssrf", "tracking", "pixel"],
      teach: {
        summary: "Lets characters' content load images and media by internet URL. Off: no tracking pixels, no SSRF, no surprise fetches.",
        affects: ["every account's message rendering, deployment-wide"],
      },
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
      teach: { summary: "How verbose the server log is.", affects: ["server logging only: never user data"] },
    },
  ],
};
