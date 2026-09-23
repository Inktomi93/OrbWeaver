// The Personas group's nav entries — the ONE `ConfigSubcategory` per
// registered section, shared by the contribution def and the section body's anchor stamp (the
// workloads-jobs-nav precedent), so a LIST row can never address an anchor no section renders.
//
// FIVE reachable parts, THREE sections: the notification switch, the list and the this-chat picker
// register as sections; the EDITOR (a row's own inline expansion — persona-panel-row.tsx) and the PINNED row
// (one row inside the this-chat section) structurally cannot be sections without moving where a persona is
// edited or re-anchored, which is owner-sacred. They are search LEAVES of the section that contains them: a
// hit lands on the owning section's anchor (fork F-14, default taken).
//
// The LABELS are what the LIST row and the heading both read, so the row and the section it scrolls to can
// never say two different things (side-eye 2026-08-03 P2 — the pane and its one subcategory used to both
// read "Personas", two identical buttons 40px apart).

import type { ConfigSubcategory } from "#state";

export const PERSONA_NOTIFICATIONS_SUBCATEGORY: ConfigSubcategory = {
  id: "notifications",
  label: "Notifications",
  teach: {
    summary: "Whether the app confirms persona changes with a toast when you switch who you play as or a restamp lands.",
    affects: ["persona-switch confirmations, on this account everywhere"],
  },
  settings: [
    {
      id: "persona-notifications",
      label: "Persona change notifications",
      keywords: ["notify", "notification", "alert"],
      teach: {
        summary: "A confirming toast when your persona changes in a chat \u2014 switching who you play as, or a restamp landing.",
        affects: ["persona-switch confirmations, on this account everywhere"],
      },
    },
  ],
};

export const PERSONA_LIST_SUBCATEGORY: ConfigSubcategory = {
  id: "your-personas",
  label: "Your personas",
  keywords: ["persona", "new persona", "import", "restore", "current", "default", "avatar"],
  teach: {
    summary:
      "Your persona collection: each row expands into an editor for title, description, injection depth and lore book. The description is what the model reads as you.",
    affects: ["how the model sees you wherever a persona plays"],
  },
  settings: [
    {
      id: "editor",
      label: "Editing a persona",
      keywords: ["title", "description", "starred", "injection", "depth", "lore book", "duplicate", "export"],
      teach: {
        summary:
          "A persona row expands into its editor: title, description and where it injects, plus its lore book. The description is what the model reads as you.",
        affects: ["how the model sees you wherever this persona plays"],
      },
    },
  ],
};

export const PERSONA_THIS_CHAT_SUBCATEGORY: ConfigSubcategory = {
  id: "this-chat",
  label: "This chat",
  keywords: ["playing as", "switch", "restamp", "reattribute", "chat"],
  teach: {
    summary: "Which persona you are playing as in this chat, and the pinned persona every chat without an override resolves to.",
    affects: ["what {{user}} resolves to in this chat and the global default"],
  },
  settings: [
    {
      id: "pinned",
      label: "Pinned as {{user}}",
      keywords: ["anchor", "pin", "re-pin", "card sees you as", "{{user}}"],
      teach: {
        summary: "The pinned persona is your default \u2014 what {{user}} resolves to unless a chat overrides it. One persona is pinned at a time.",
        affects: ["every chat without a this-chat override"],
      },
    },
  ],
};
