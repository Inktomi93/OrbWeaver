# Side-eye: phone pass over the main surfaces (board 0832)

Verdict: SHIP WITH FIXES. One P1 (the composer with the keyboard open) and a cluster of P2s, all about the vertical budget on a phone.

- Ref: `ebbbff99d3` on an isolated stage, band 0 (`:5273`/`:8888`).
- Device: `pnpm snap --mobile`, the iPhone 14 Pro Max descriptor. Touch, `pointer:coarse`, DPR 3, 430x740 CSS viewport. One extra case at `--viewport 375x667`.
- Data: the stage copy of the dev db (10 seed characters, 0 chats, no chat connection). I created one chat with Kohaku through the UI with `--tap`.
- The owner's container DB was not used: snap cannot attach a copied DB to a stage (board 0833).
- Account appearance state: `data-reduced-motion=false`, `elevation=flat`, blur on panels, composer and modals.
- All slots are under `reports/runs/snap/agent-a921d74c8a14e4d2e-<slot>/`. Only the slot suffix is given below.

## Per-target verdicts (rank order of the brief)

| Target | Verdict |
| - | - |
| Chat: composer | Broken with the keyboard open (P1). Cramped at rest (P2). |
| Chat: message list | Works. Swipe strip costs too much height (P2). Greeting swap marks the message "edited" (P3). |
| Chat: swipe control | Works by tap. Oversized separate panel (P2). The variant-label variant was not reached: no connection, so no committed swipes. |
| Chat: message actions | Works by tap; Escape returns focus to the kebab. Menu overloaded (P3). |
| Left rail / list drawer | Works. Gutter inconsistency (P3). |
| Right rail / context drawer | Works; Escape closes it. Chip inconsistency (P3). `listEffectiveRegex` errors with no connection (P2). |
| Dialog: character edit | Works. Suggested tags push the card fields down (P3, see 0613). Vocabulary split with chat (P3). |
| Dialog: add document | Footer scrolls out of the dialog (P2). Desktop-only dropzone copy (P3). |
| Settings panes | 10.5px teaching text on a phone (P2). Triple heading (P3). |
| Connection / model picker | Connection role picker and provider picker work. Model list NOT REACHED (see below). |
| Home | Fine. Double empty state (P3). |

Not reached: the model list in the connection picker. It needs a key or a reachable server. The local vLLM ports `:8701`-`:8703` were down, and I did not enter a real key. The "Model" field plus "List models" (disabled) rendered correctly (slot `…2869848-2026-10-10T22-46-15-955Z`).

## Composer findings (for the cb-mobile lane, items 0830/0831)

### P1: with the keyboard open, the transcript disappears

What I measured:

- Simulated keyboard of 336px, with a three-sentence line typed. The shell is 404px tall.
- Transcript (`[aria-label="Conversation messages"]`): 15px tall. Composer: 260px. Tab bar: 56px.
- The textarea grew to 132px, and its cap is `max-h-48` = 192px.
- Without the stage-only "no connection" line, the transcript would be about 70px.

Why it hurts: the user cannot see the line they are replying to while typing. That is the core phone task.

Owners:

- The tab bar stays on its own row above the keyboard by design: `packages/client/src/features/app-shell/surfaces/shell.css:44-57`.
- The guided action row is a second full-height row: `packages/client/src/features/chat/components/composer-guided-cluster.tsx:159-205`.
- The textarea cap: `packages/client/src/features/chat/components/composer.tsx:398`.

Fix:

- At a coarse pointer with the keyboard inset above 0, hide the bottom tab bar. It is navigation, and nobody navigates mid-sentence.
- Collapse or hide the guided row while the textarea has focus.
- Cap the textarea at about 4 lines while the keyboard is up.

Evidence:

- Slot `…2790367-2026-10-10T22-39-20-379Z`, `snaps/phone-kbsim-typed.png`, EVAL\[1].
- Method: I injected `:root{--orb-keyboard-inset:336px !important}` (the variable `use-keyboard-inset-var.ts` writes), then `--tap` and `--fill` on the textarea.
- Snap cannot open a real keyboard. This simulates the shell's own response to the inset; it is not a WebKit measurement.

Ruling note: the "tab bar stays on its own row" behaviour is a recorded design decision (#1869, shell.css comment). This finding contradicts it for the keyboard-up case only.

### P2: cramped at rest, with the input getting half the width

Measurements at 430x740:

- The composer is two rows of 48px controls, 114px tall.
- Row 1: "Draft your line" at the left, then retry/generate/continue at the right, with a 186px dead gap between them.
- Row 2: chat options and wand (108px together), the textarea at 230px (54% of the composer), then send.

Measurements at 375x667:

- The textarea is 175px wide (47%).
- The placeholder "Continue, or type a message…" wraps to two lines, so the empty composer is 60px.
- The transcript gets 350 of 667px (52%). Chrome takes the rest: topbar 49, composer 188, tab bar 56.

Owner: `composer-guided-cluster.tsx:159-229` (the two `Row`s).

Fix: on a coarse pointer, one row: one leading menu (chat options, tools and the four guided actions), the flexible textarea, then send. Or keep the guided icons but render them only when the textarea is empty and unfocused.

Evidence: slots `…2784041-2026-10-10T22-38-39-361Z` (EVAL geometry) and `…2917656-2026-10-10T22-50-44-032Z` (`phone-375-chat.png`).

### P2: the swipe pager is a separate 160x64 panel under the bubble

- `[data-slot=greeting-swipe-strip]` measured 160x64 at (252,408). It has its own card backing (`in-data-[has-bg-image]:bg-card`) and sits right-aligned below the message.
- That costs about 72px of transcript height per swipeable message on a phone.
- Its counter shows "1 / 3" with no variant label. The committed-swipe `SwipeStrip` with the variant label (item 0831) was not reachable without a connection.

Owners: `packages/client/src/features/chat/components/greeting-swipe-strip.tsx:103-117` and `packages/client/src/features/chat/lib/pager-chrome.ts:62`.

Fix: fold the pager into the bubble's footer row at chip height. Keep 44px hit areas through padding or pseudo-element extension, not box height.

Evidence: slot `…2796537-2026-10-10T22-40-01-682Z`, `phone-swipe-next.png`, EVAL\[1].

### Detector false positive, retracted

`--design-audit --mobile` on the chat reported 5 P2 `unreachable-hint` rows: the four guided buttons plus send, with "describedBy 2 id(s), 0 resolving".

In the settled session, each control's `aria-describedby` resolves to one id: the visible next-turn line. That is the coarse-pointer carrier the cluster's header promises. I read it as an audit captured before the line mounted, not a product defect.

Evidence: audit slot `…2886237-2026-10-10T22-47-33-456Z`; settled eval slot `…2910903-2026-10-10T22-50-00-334Z`.

## Other findings, ranked

### P2

1. **Dialog footers scroll out of view.**
   - In "Add a document", Cancel sits at y=742, below the 740 viewport. It is inside the dialog's scroll body (559px client, 678px scroll height), and the dialog leaves an empty band at its foot.
   - "Add a connection" shows the same thing: no footer in the viewport.
   - On a phone the user cannot see how to finish or leave without scrolling a nested scroller.
   - Owner: `packages/client/src/components/form-dialog.tsx:115-123`. The footer `Row` sits inside the scrolling `Stack`.
   - Fix: pin the footer outside the scroll body (a sticky footer slot on `DialogPopup`).
   - Slots: `…2843227-2026-10-10T22-43-52-401Z` (EVAL), `…2841172-2026-10-10T22-43-36-518Z/snaps/phone-add-document.png`, `…2869848-2026-10-10T22-46-15-955Z/snaps/phone-add-connection-openrouter.png`.

2. **Teaching copy at 10.5px.**
   - Where: the Settings list header block ("The parts every chat is built from", whose copy lives in `packages/client/src/features/config/lib/config-copy.ts`) and the Model roles glosses on Connections.
   - Computed `font-size: 10.5px; line-height: 13px`. Contrast passes at 8.71:1, but the size is too small to read on a phone for a low-vision reader (Sam).
   - Fix: phone floor of the body-small step for any paragraph of teaching copy. The micro voice is for labels, not sentences.
   - Slots: `…2859459-2026-10-10T22-45-22-683Z` (EVAL + CONTRAST), `…2856134-2026-10-10T22-45-04-530Z/snaps/phone-settings.png`.

3. **`chat.listEffectiveRegex` fails when no chat connection is bound.**
   - Opening the "This chat" context tab logs `✗ query chat.listEffectiveRegex … no connection is bound for "chat"`.
   - Listing regex scripts does not need a model.
   - Owner: `packages/server/src/transport/trpc/routers/chat.ts:747-750` (into `services.chat.listEffectiveRegex`).
   - Fix: drop the connection precondition from the regex read.
   - Slot: `…2837583-2026-10-10T22-43-12-482Z` (console error row).

### P3

1. **Choosing an alternate greeting stamps "edited".** `setSeededGreeting` writes `editedAt: now` (`packages/server/src/domain/chat/verbs/edit.ts:606`). Picking a card's own alternate is not an edit. Slot `…2800050-2026-10-10T22-40-31-930Z`, EVAL\[1] (`title="Edited at 04:40 PM"`).
2. **The message actions menu has 9 items** on a seed greeting: two disabled continuation items ("Undo last continuation", "Re-apply continuation") on a message never continued, plus "View wire trace…". That is over the working-memory limit. Hide inapplicable items, or group the debug item. Slot `…2803622-2026-10-10T22-40-54-116Z`.
3. **Context drawer chips are inconsistent.** "MEMORY — IDLE" is a caps bordered pill at 44px; "1 member" is a plain chip that grows an icon and border when switching from Members to This chat. Slots `…2834086-2026-10-10T22-42-53-839Z`, `…2837583-2026-10-10T22-43-12-482Z`.
4. **Inconsistent gutters.** The chat list, context drawer and Settings list sit 8px from the screen edge. Home, the character editor and Connections sit at 24px. Slots `…2811150-2026-10-10T22-41-33-748Z`, `…2856134-2026-10-10T22-45-04-530Z`.
5. **One concept, two names.** Chat says "greeting" (Previous/Next greeting); the editor says "Opening 1/2/3". Add-document says "Every chat" on the button and "Switch Everywhere off" in the gloss (`packages/client/src/features/databank/components/add-document-body.tsx:75` vs `:137`).
6. **Desktop-only dropzone copy.** The default instruction is "Drag and drop, or click to browse" (`packages/ui/src/primitives/file-dropzone/file-dropzone.tsx:196`, plus the overrides in the character, chat and preset import dialogs). At a coarse pointer, say "Tap to choose a file".
7. **Suggested tags push the card fields down.** Four suggested-tag pills stack at 48px each, about 250px, before the first card field on a phone. The first pill shares a row with the "SUGGESTED" kicker and the rest wrap flush left. Related to board 0613. Slot `…2846164-2026-10-10T22-44-12-362Z`.
8. **Triple heading on Connections.** Topbar "Connections", the h2 "Connections" and the section heading "Connections" stack up and burn about 130px. Slot `…2861725-2026-10-10T22-45-37-139Z`.
9. **Oversized switch with a tiny label.** The "Allow background work" switch is a 64x44 orange track with a 10.5px label beside it. Same slot.
10. **The empty role picker has no next step.** "Chat connection" opens a listbox with only "Not set". Add an "Add connection" row. Slot `…2882990-2026-10-10T22-47-19-371Z`.
11. **Home says the same empty thing twice.** "No chats yet. Start a room…" and then "No rooms yet. Your rooms appear here…", also mixing chats and rooms. Slot `…2743647-2026-10-10T22-35-28-972Z/snaps/root.png`.
12. **The transcript avatar gutter costs width.** It takes about 36px of the 430px width beside every assistant bubble. On a coarse pointer, put the avatar inline in the header. Slot `…2807591-2026-10-10T22-41-19-885Z`.
13. **Dead CSS class.** `shell-list-toggle` has no rule. Slot `…2811150-2026-10-10T22-41-33-748Z` (DEADCSS).

Ruling collision, not filed: in Settings the bar's third tab becomes "Settings" and "Characters" moves into the You sheet. This is the recorded #484 curation (`packages/client/src/features/app-shell/components/rail.tsx:9-10`). It moves a tab a user has learned the position of. The ruling stands; I list it only so the owner sees the cost on a phone.

## Suspicions (not proven; snap could not drive them)

- **Long-press is dead on iOS.** `member-row.tsx:81` and `character-filter-rail-parts.tsx:224` open menus from `onContextMenu`. iOS WebKit does not fire `contextmenu` on long-press, so on the owner's iPhone those long-press doors are probably dead. Each needs its visible ⋯ fallback, which member-row has. Unverified: no WebKit and no long-press in snap.
- **Autofocus in New chat.** The New chat dialog autofocuses the character search. On a real iPhone that may raise the keyboard over the list it filters.
- **iOS keyboard behaviour is unmeasured.** The real `visualViewport` resize behaviour on iOS Chrome (WebKit) was not measured.

## Snap gaps hit (feed for 0829)

1. **No keyboard.** Nothing in snap raises a soft keyboard or shrinks `visualViewport`. I worked around it by injecting `--orb-keyboard-inset` through a `<style>` eval. The result is fidelity to the shell's CSS response only.
2. **Session-mode `--mobile` has the wrong screen size.** The session reports `screen` as 430x740; one-shot reports 430x932.
   - Every session call ends `environment-fails=1` with "run failed with no structured problem row", and the mismatch text is persisted nowhere.
   - Session slot `…2774004-2026-10-10T22-37-50-900Z` EVAL vs one-shot slot `…2890472-2026-10-10T22-47-58-007Z` EVAL (`environment-fails=0`).
3. **The session call budget kills multi-step drives under load.** The limit is 5000ms times the load factor.
   - `--tap row --pause 1200 --tap "Show details" --pause 900 --map` got `ORB-LOAD-KILL`, and the session went terminal (`SESSION DEAD`). Slot `…2816292-2026-10-10T22-41-53-433Z`.
   - Phone drives need one action per call.
4. **No horizontal swipe, long-press or coordinate tap.** `--swipe` takes `selector=dy` only.
5. **Chromium only.** The owner's iOS Chrome is WebKit; snap ships a Safari UA on Blink, so WebKit-only behaviour is unmeasurable.
6. **No copied-DB stage.** Filed by the coordinator as 0833.
7. **Unexplained reload.** A session page fully reloaded (2135 requests, `__orb.nav` not published) after `--key Escape --key Escape` on the Add a connection dialog. I could not attribute it. Slot `…2876191-2026-10-10T22-46-45-765Z`.

## Taste and flow verdict

- **The chat room reads cramped, and the eye agrees with the ruler.** The composer is a heavy two-row slab with a dead middle on its top row. The pager is a second floating slab. The bottom tab bar stays in the room, so the transcript gets about half the screen at rest and nothing with the keyboard up.
- **The context drawer works but is busy.** It has its own five-tab bottom bar where the app tab bar was, so a phone user sees two different bottom bars in two minutes.
- **Settings opens with a wall of 10.5px prose** before the list, and the orange filter button is the loudest thing on that screen.
- **The dialogs look right but finish badly**: the way out is below the fold.
- **Home and the character editor look composed.** The editor's suggested-tags block is the only thing out of proportion.

## What is genuinely working

- Tap targets: the mobile design-audit judged 24/24 (chat) and 25/25 (home) controls with 0 under the floor. Every composer control is 48x48.
- The composer textarea computes `font-size: 16px`, so iOS will not zoom on focus. `enterKeyHint`, `autocorrect` and `autocapitalize` are set deliberately.
- Info buttons open a real popover on tap ("More info about Label" went `aria-expanded=true` with a visible positioner). Escape closes drawers and menus and returns focus to the trigger.
- Lighthouse mobile on the chat: 33 audits, 0 failed.

## The single biggest opportunity

Give the keyboard-up chat its height back: hide the tab bar while typing, and make the composer one row. That fixes the P1 and most of the cramped feel the owner reported.

## Instrument coverage

| Instrument | State | Evidence or reason |
| - | - | - |
| `--map --atlas` | RAN | `…2743647-2026-10-10T22-35-28-972Z` |
| `--map` per surface | RAN | slots cited per target above |
| `--tap` / `--swipe` drives | RAN | chat, drawers, dialogs, pickers |
| `--aria` | RAN | `…2796537-2026-10-10T22-40-01-682Z` (transcript), `…2859459-2026-10-10T22-45-22-683Z` (tab bar) |
| `--contrast` | RAN | opening tabs 6.16:1 / 17.14:1, settings gloss 8.71:1, greeting body 15.83:1 |
| `--design-audit --mobile` | RAN | chat `…2886237-2026-10-10T22-47-33-456Z` (complete, 5 P2 retracted above); home `…2913335-2026-10-10T22-50-12-725Z` (NO-VERDICT: maskedForeground×2; 1 P3 edge-flush on the quick-picks carousel, read as the intended scroller peek) |
| `--lighthouse mobile` | RAN | `…2920657-2026-10-10T22-51-09-251Z`, 0 failed audits |
| 375x667 case | RAN | `…2917656-2026-10-10T22-50-44-032Z` |
| Keyboard simulation | RAN (simulated) | `…2790367-2026-10-10T22-39-20-379Z` |
| `--motion` / `--perf` | SKIPPED | loadavg 20-51 on 24 cores all session (every run LOAD-SUSPECT); gesture motion has no instrument coverage |
| Appearance cases (`defaults`/`maximal`) | SKIPPED | layout findings are density-independent; time went to the phone drives |
| Keyboard `--key Tab` walk | SKIPPED | phone pass; Escape and focus return checked on menu and drawer instead |
| Pane-state cases | PARTIAL | list docked and collapsed, context overlay and collapsed, driven through real controls |
| Retained sections | SKIPPED | focused phone pass |
| WebKit / real device | NOT POSSIBLE | snap is Chromium-only (gap 5) |
