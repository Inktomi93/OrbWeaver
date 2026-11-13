// The label census's judged sites: each row is a reader's verdict that a site in a home class (a production home exists
// and the test types the text anyway) is not a name production renders for the control the site targets.
//
// The rule a row applies: a name the mounted component renders is never judged; the test imports it, or production
// first moves it to its names leaf and renders it from there. A row records only a value that is no such name, for one
// of the reasons below.
//
// A row keys on the test file the literal is written in, the case it sits in (as `judged-oracles.ts` keys a case) and
// the literal's value, so it survives line drift. One row covers every site of that value in its case. The census
// prints every home-class site no row covers, and every row that covers no home-class site: a row goes stale when its
// site is rebound or deleted, or when a story starts to author the value.
//
// The reasons, a closed list:
// - `production-id`: the value is an identifier production keeps in state, such as a modal slot id or a section id,
//   that a story prints for the case to read. No user reads it as a name.
// - `test-authored`: the test, its story or its own helper module wrote the value: a story prop, a payload, a tracker
//   it defines, a document it serves, text it typed. Production spells the same word for another control.
// - `guest-authored`: a guest plugin's markup wrote the value, and the host renders it as the guest's content.
// - `data`: the value is content or syntax a control shows, not the control's name: a macro token, a card fence, a
//   wire enum value printed as a badge, an entry the first-boot seed writes into a user's own library.
// - `fragment`: the value is part of a text the assertion matches by substring, not a whole name.

/** Why a home-class site is no name the targeted control renders; each member is defined in the header. */
export const SITE_REASONS = ["production-id", "test-authored", "guest-authored", "data", "fragment"] as const;
export type SiteReason = (typeof SITE_REASONS)[number];

/** One verdict: the site's value is no rendered name, for `reason`; `note` names the evidence a reader checks. */
export interface SiteJudgement {
  readonly file: string;
  readonly scope: string;
  readonly value: string;
  readonly reason: SiteReason;
  readonly note: string;
}

export const JUDGED_SITES: readonly SiteJudgement[] = [
  {
    file: "tests/client/components/_described-menu-item-labels.ts",
    scope: "(module)",
    value: "Archive",
    reason: "test-authored",
    note: "the described-menu story renders these item labels from this helper; no production menu mounts",
  },
  {
    file: "tests/client/components/_described-menu-item-labels.ts",
    scope: "(module)",
    value: "Duplicate",
    reason: "test-authored",
    note: "the described-menu story renders these item labels from this helper; no production menu mounts",
  },
  {
    file: "tests/client/components/_described-menu-item-labels.ts",
    scope: "(module)",
    value: "Export",
    reason: "test-authored",
    note: "the described-menu story renders these item labels from this helper; no production menu mounts",
  },
  {
    file: "tests/client/components/form-dialog-footer.ct.tsx",
    scope: "a body's state starts fresh on each open, Enter commits and the opener takes focus back",
    value: "second",
    reason: "test-authored",
    note: "the text the case types into the story's field and reads back",
  },
  {
    file: "tests/client/components/list-pane-header.ct.tsx",
    scope: "back is keyboard operable and the host renders one optional action and its resulting overlay",
    value: "Chats",
    reason: "test-authored",
    note: "the title the case passes through component.update and reads back from the heading",
  },
  {
    file: "tests/client/data/session-freshness.ct.tsx",
    scope: "an unreachable visibility read retries, while a real signed-out verdict opens recovery without discarding the workspace",
    value: "reauth",
    reason: "production-id",
    note: "the session prompt's modal slot id, which the story prints in a status probe",
  },
  {
    file: "tests/client/features/app-shell/surfaces/list-band-title.ct.tsx",
    scope: "widestBand",
    value: " of ",
    reason: "fragment",
    note: "the census joiner inside a band title the case matches by substring",
  },
  {
    file: "tests/client/features/app-shell/surfaces/list-band-title.ct.tsx",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the case's title template as the source spells it.
    scope: "the ${collection.id} band prints its census whole or not at all, and its value stays in the heading's name, with Context docked",
    value: " of ",
    reason: "fragment",
    note: "the census joiner inside a band title the case matches by substring",
  },
  {
    file: "tests/client/features/app-shell/surfaces/list-band-title.ct.tsx",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the case's title template as the source spells it.
    scope: "the ${collection.id} screen name prints its census whole or not at all, and its value stays in the name",
    value: " of ",
    reason: "fragment",
    note: "the census joiner inside a screen name the case matches by substring",
  },
  {
    file: "tests/client/features/chat/components/ghost-macro.ct.tsx",
    scope: "a streaming reply resolves {{char}} to the speaker's name, as the settled row does",
    value: "{{char}}",
    reason: "data",
    note: "the macro token the scripted reply streams, which the case proves resolves away",
  },
  {
    file: "tests/client/features/databank/hooks/databank-list-header.ct.tsx",
    scope: "each owner-wide sweep waits for its confirm before sending its mode, and Add opens the ingest slot",
    value: "addDocument",
    reason: "production-id",
    note: "the ingest modal slot id, which the story prints in a status probe",
  },
  {
    file: "tests/client/features/discovery/components/corpus-context-tabs-boundary.ct.tsx",
    scope: "a room pair's button name contains the relation badge it shows",
    value: "forked",
    reason: "data",
    note: "a wire relation value the pair row prints as its badge",
  },
  {
    file: "tests/client/features/persona/components/platform-persona-editor-footprint.suite.ct.tsx",
    scope: "the persona editor keeps keyboard completion, popup footprint and helper description on its actual macro control",
    value: "{{user}}",
    reason: "data",
    note: "the macro token the case completes and reads in the macro field",
  },
  {
    file: "tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx",
    scope:
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the case's title template as the source spells it.
      'Atlas whole filter controls ${viewport.sharedLine ? "stay inline and horizontally contained" : "stay horizontally contained"} in a ${viewport.host}px host at ${viewport.width}×${viewport.height}',
    value: "Sort",
    reason: "guest-authored",
    note: "the Card Atlas guest bundle names its own select; the host renders the guest's markup",
  },
  {
    file: "tests/client/features/refinery/components/payload-inherited-keys.ct.tsx",
    scope: "an omitted field named like an inherited object member renders as absent at every payload depth",
    value: "present",
    reason: "test-authored",
    note: "a payload field the case serves and reads back",
  },
  {
    file: "tests/client/features/refinery/components/payload-inherited-keys.ct.tsx",
    scope: "an omitted field named like an inherited object member renders as absent at every payload depth",
    value: "constructor",
    reason: "test-authored",
    note: "the inherited-member key the case serves as a payload field",
  },
  {
    file: "tests/client/features/regex/surfaces/regex-editor-reflow.ct.tsx",
    scope: "a long find pattern wraps at 300% text and the editor does not scroll sideways",
    value: "narration",
    reason: "test-authored",
    note: "text the case's seeded script carries",
  },
  {
    file: "tests/client/features/rpg/components/own-key-panels.ct.tsx",
    scope: "(module)",
    value: "Mood",
    reason: "test-authored",
    note: "the text tracker the case defines on the game",
  },
  {
    file: "tests/client/lib/use-focus-on-mount-names.ts",
    scope: "(module)",
    value: "Dismiss",
    reason: "test-authored",
    note: "the focus-on-mount story renders this button label from this helper",
  },
  {
    file: "tests/client/state/durable-local-binding.ct.tsx",
    scope: "verified binding preserves returning-user bytes and rejects another user's boot hint",
    value: "home",
    reason: "production-id",
    note: "the bound workspace id, which the story prints in a status probe",
  },
  {
    file: "tests/e2e/live-parity-plus-capstone.spec.ts",
    scope: "P4 immersive HTML: a planted :::card settles routed under the D294 grant, view-raw shows source, archive lists it, no DOM leak",
    value: ":::card",
    reason: "data",
    note: "the card fence syntax the raw view shows",
  },
  {
    file: "tests/e2e/live-settings-render-truth.spec.ts",
    scope: "(module)",
    value: "Charlotte's study",
    reason: "data",
    note: "a background entry the first-boot seed writes into the user's own library",
  },
  {
    file: "tests/e2e/rpg-lite-loop.spec.ts",
    scope: "rpg-lite: born-default empty state + every hand-plane write is FE=BE=DB consistent",
    value: "Trust",
    reason: "test-authored",
    note: "a tracker the spec defines on the game",
  },
  {
    file: "tests/e2e/rpg-lite-loop.spec.ts",
    scope: "rpg-lite: born-default empty state + every hand-plane write is FE=BE=DB consistent",
    value: "Mana",
    reason: "test-authored",
    note: "a tracker the spec defines on the game",
  },
  {
    file: "tests/ui/content/sandbox-frame/sandbox-frame-navigation.ct.tsx",
    scope: "a card form submission is blocked even when the embedder's frame-src is open",
    value: "send",
    reason: "test-authored",
    note: "the button in the card markup the case serves",
  },
  {
    file: "tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx",
    scope: "the srcdoc floor is script-dead: its sandbox grants nothing and an authored script never runs",
    value: "card",
    reason: "test-authored",
    note: "text in the card markup the case serves",
  },
  {
    file: "tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx",
    scope: "a card-authored script is refused by the served policy and cannot drive the height",
    value: "card",
    reason: "test-authored",
    note: "text in the card markup the case serves",
  },
  {
    file: "tests/ui/primitives/log-viewer/named-logs.ct.tsx",
    scope: "(module)",
    value: "Static prefix",
    reason: "test-authored",
    note: "the subject the named-logs story passes each log viewer",
  },
  {
    file: "tests/ui/primitives/log-viewer/named-logs.ct.tsx",
    scope: "(module)",
    value: "Dynamic suffix",
    reason: "test-authored",
    note: "the subject the named-logs story passes each log viewer",
  },
];
