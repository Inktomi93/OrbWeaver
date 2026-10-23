// Device-local persistence decisions constrain the real factory doors; synced preferences are not admitted.
interface DeviceLocalClassification {
  readonly why: string;
}

const DEVICE_LOCAL_REGISTRY = {
  "rule-creations": {
    why: "Per-device pending automation birth request and acknowledged target identities, isolated by verified owner so interrupted creation resumes without another rule.",
  },
  "automation-rule-editor": {
    why: "Unsubmitted automation prose and incomplete actions; a per-user crash-survival cache baseline-gated against the authoritative server row.",
  },
  shell: { why: "panel dock/collapse + active section — per-device layout chrome (§12.1 carve-out)" },
  "active-chat": {
    why:
      "the room currently open in this browser — per-device navigation continuity across reloads, never " +
      "shared chat state or a preference that should move another device's screen",
  },
  "composer-draft": {
    why:
      "unsent composer text per room, so a refresh/crash/tab-restore does not eat a message the user typed " +
      "(owner pick 2026-08-09). DEVICE-local on purpose: a half-written line is a THIS-tab artifact, and " +
      "syncing it would make two open devices fight over one composer — the user_settings blob is for " +
      "settled preferences, not for keystrokes (it also writes on every keypress, traffic that blob must " +
      "never carry). Bounded + sanitized at the persist seam (empty drafts dropped, MRU-capped) because a " +
      "scopeKey→text map is unbounded by construction",
  },
  "character-library": {
    why:
      "library sort/view/filter-chip/bulk-mode/spoiler-blur browse prefs — per-device LIST/editor chrome, " +
      "not a synced setting (a returning user on another device does not expect their tag-filter OR their " +
      "screen-share spoiler-blur to follow; FINAL-Character §4/§6.1/§12.1)",
  },
  "surface-box": {
    why:
      "the last SETTLED body height of each SURFACE (home's tiles first, the rpg HUD's waystone band since " +
      "#149 — it was keyed `home-tile-box` until #258 renamed it to what it holds), so a loading skeleton " +
      "reserves the box its content will occupy on the next boot (F14 boot-CLS: the tiles grew out of a " +
      "fixed 3-row skeleton and pushed the grid down +189px). A measurement of THIS device's viewport, " +
      "never a user preference — syncing one device's pixel heights to another would reserve the wrong " +
      "box (§12.1)",
  },
  "home-tile-memory": {
    why:
      "how THIS device last saw Home's gated and moving tiles settle (a gate that settled hidden, the column a " +
      "moving tile settled in), so the first paint reserves and places them where they will land. A measurement " +
      "of this device's boot, beside `surface-box`, never a user preference (§12.1)",
  },
  "appearance-boot": {
    why:
      "the BOOT HINT for the four synced appearance axes a first paint needs — `appearance.reducedMotion` " +
      "(#188 N-1), `appearance.fontScale`, `appearance.density` and the selected theme's `[data-theme]` value " +
      "(#231). A CACHE over the confirmed server rows, the `character-card`/`preset-config` precedent, never " +
      "their home: the prefs stay in the user_settings blob and the server value always wins. It exists only " +
      "because none of them can be stamped until `getUserSettings` (and, for the theme, the CHAINED " +
      "`getTheme`) resolves, while the boot veil animates (two over-budget frames) and the shell takes its " +
      "first layout ~1.2s earlier — measured: the veil drops frames the motion pref would have silenced, " +
      "`--font-scale` re-flows every rem-derived shell dimension for a boot CLS of 0.20-0.34 at scale 1.25, " +
      "and a Light user cold-loads the dark palette then swaps. Read synchronously before React mounts, " +
      "written back only from the authoritative read, and an axis this device has never been told stamps " +
      "NOTHING (a fresh device boots exactly as it does today)",
  },
  "deployment-boot": {
    why:
      "the BOOT HINT for the deployment CAPABILITIES a first paint must answer — `multiHumanCapable` today " +
      "(#476). Device-local because it is not a preference at all: it is this browser's memory of what THIS " +
      "deployment last served at `/api/auth/config`, a CACHE over a server-derived per-request value (the " +
      "`appearance-boot` precedent), and it could not live in the synced user_settings blob even in " +
      "principle — that blob is read through tRPC, strictly later than the fetch this hint exists to cover. " +
      "It exists because `/api/auth/config` is fetched at app-root MOUNT, so a capability-gated slot reads " +
      "FALSE for the first frames of every boot and then mounts INTO the layout (measured on the topbar-trail " +
      "bell: 0.00015 layout shift, under the `[cls]` flagger's own reporting floor — that bell lost its gate " +
      "with #1627, and its two surviving readers are the /join dialog and the cast bar's People section). " +
      "A RENDER hint only, never an " +
      "authorization input: it decides whether a slot is drawn, while every read and verb behind that slot " +
      "still answers to the real config and the server's gates. The server value always wins the instant it " +
      "lands (so a capability flip corrects rather than being masked), and a device that has never been told " +
      "holds null — the pre-existing floor, i.e. exactly today's first-ever-visit behavior",
  },
  "config-group-open": {
    why: "which Configuration-roster GROUPS are expanded — a per-device working posture (a wide screen holds two libraries open where a laptop holds one), never a preference a user expects to follow them across devices; the `character-library` browse-prefs precedent (§12.1). Groups start COLLAPSED by owner ruling, so an absent entry is the honest default, not a lost setting",
  },
  "chat-context-sections": {
    why:
      "which sections of the 'This chat' CONTEXT tab are expanded (#830) — a per-device working posture " +
      "on THIS screen, exactly the `config-group-open` precedent (§12.1): a phone's fold is 300px shorter " +
      "than a desktop's, so 'Lorebooks open, Host controls closed' must not follow a user across devices. " +
      "Sparse by construction (only sections the user explicitly toggled), so an absent entry is the " +
      "section's own default, not a lost setting",
  },
  "tag-library": {
    why:
      "the tag roster's SORT MODE (most-used / A–Z / manual) in the Configuration workspace — a browse " +
      "posture on THIS screen, the `character-library` browse-prefs precedent (§12.1). It is not a synced " +
      "preference: 'I'm scanning alphabetically right now' does not follow a user to another device, and it " +
      "writes on every dropdown change, which is traffic the user_settings blob should not carry",
  },
  "recent-models": {
    why:
      "the per-provider Recent-models MRU in the connections model picker — 'what I recently picked on THIS " +
      "machine' is a convenience affordance, never synced routing truth (the model a connection uses is its own " +
      "server-side column, written by connection.create/update)",
  },
  "character-card": {
    why:
      "the character-card editor's crash-survival draft (#73, CRITICAL tier) — an in-progress edit to " +
      "long free-text prose is THIS device's unsaved keystrokes, never a synced preference; it is CACHE " +
      "over the confirmed server row (baseline-hash-gated, cleared on save), not settled state",
  },
  "preset-config": {
    why:
      "the preset editor's crash-survival draft (#73, HIGH tier) — an in-progress multi-section prompt " +
      "edit is THIS device's unsaved keystrokes, never a synced preference; CACHE over the confirmed " +
      "server row (baseline-hash-gated, cleared on save), not settled state",
  },
  "world-info-entry": {
    why:
      "the lorebook entry editor's crash-survival draft (#73, HIGH tier) — an in-progress entry edit is " +
      "THIS device's unsaved keystrokes, never a synced preference; CACHE over the confirmed server row " +
      "(baseline-hash-gated, cleared on save), not settled state",
  },
} as const satisfies Readonly<Record<string, DeviceLocalClassification>>;

export type DeviceLocalStoreName = keyof typeof DEVICE_LOCAL_REGISTRY;
