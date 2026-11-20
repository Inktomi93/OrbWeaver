---
kind: plan
status: active
updated: 2026-11-20
rank: 17
---

# Imported presets and HTML in chat draw as their authors meant, safely

## Goal

A SillyTavern preset or card that styles its replies works after import with no setup: display scripts, model-written panels, styled greetings and cards draw in the row's sandboxed frame in every chat style, and every row a setting holds plain says why. The first outside user's Sola preset is the reference case; her reports opened this plan.

## Shape

One reader in the kit decides what is markup. One sandboxed frame per row draws it under the character's trust step, with the server rechecking each grant at mint and at serve. One shared notice names the setting that holds content back and opens it for whoever may change it. Work lands in this order: correctness of what draws, then what explains itself, then streaming and history cost, then the trust settings model.

## Rejected

Rendering model HTML in the app page as SillyTavern does: no isolation and no scripts. Translating a card's stylesheet into theme tokens: the matching would be fragile. Drawing half-written markup while a reply streams.

## Coupled sites

packages/kit/src/content/, packages/kit/src/card-frame/, packages/ui/src/markdown/frame/, packages/ui/src/content/sandbox-frame/, packages/client/src/features/chat/, packages/contracts/src/chat/roster.ts, packages/server/src/entry/http/card-frame.ts

## Test plan

Component tests mount the real row through the test data providers; kit readers have seeded differential rows; the preset probe in tests/server/domain/import/persistence/ runs any preset file by path; a rendered review covers every chat style in light and dark on desktop and phone.

## Trust settings model (ruled)

This section is the trust model for item 3532, ruled by the owner as written. It also answers items 3604, 3606, 3607, 3537, 3349, 3527 and 3345. The ruled table lives in `docs/law/UI-Theming-and-Content.md` §12.2, and D294 holds the decision. The sections on today's chain describe the code before the model.

The owner's bar: community presets and cards draw as their authors meant. Hardening goes only where content can leak or leave the sandbox, sized to a roleplay app.

### Today's chain, from the code

Who may change each setting:

- Install settings: an admin, in System, Media and trust (`packages/client/src/features/user-admin/components/media-trust-section.tsx`).
- A character's trust step and external media: the character's owner, on its Trust tab (`packages/client/src/features/character/components/character-trust-tab.tsx:145-151`). A character seated in a room is the host's (D64).
- The room's immersive HTML switch: the game's host, in the host console (`packages/client/src/features/rpg/components/rpg-host-scalars.tsx:185-190`). It exists only in game rooms and defaults on (`packages/contracts/src/rpg/config.ts:59`).
- The viewer's script switch: each viewer, for their own browser (`packages/client/src/features/chat/lib/chat-behavior-message-handling-model.ts:158-163`).

The resolver is `resolveRenderPolicy` (`packages/contracts/src/chat/roster.ts:252-261`). The row tier is `resolveRowRenderPolicy` (`packages/client/src/lib/render-trust.ts:366-407`). The frame grant is `resolvePolicy` in the card-frame route (`packages/server/src/entry/http/card-frame.ts:141-187`). A frame mints with the row's `characterId` as its selector (`packages/client/src/features/chat/components/message-row-parts.tsx:126`, `packages/client/src/features/chat/components/message-train.tsx:61`).

| Author | Install default (`trustHtml`) | Install ceiling (`allowInteractiveCards`) | Character step | Room immersive switch | Viewer script switch | External media |
| - | - | - | - | - | - | - |
| Character with its own step | No effect: its own step wins (`roster.ts:253`) | Interactive needs it; off, Interactive draws as Rich HTML (`roster.ts:256-258`, rechecked `card-frame.ts:180`) | Plain text: inert Tier A. Rich HTML: frame, static posture. Interactive: frame, scripts run (`render-trust.ts:374-378`, `card-frame.ts:179-185`) | On frames every card and styled reply, Plain text included; scripts still follow the step (`render-trust.ts:378`) | Off: static posture for this viewer (`card-frame.ts:182`) | Install forbid OR character forbid (`roster.ts:259`); frame `https:` only then (`card-frame.ts:166`). Independent of the step |
| Inheriting character, imported cards included | Applies only while the ceiling is off (`roster.ts:253-258`) | On: resolves to Interactive (`roster.ts:255-256`). Off: takes `trustHtml`, whose floor is Plain text | Inherit default | As above | As above | As above |
| Narrator row | Through its seats | Through its seats | The lowest step among present character seats; media forbidden when any seat forbids (`roster.ts:333-352`). Its selector is the host's group character (`packages/server/src/domain/chat/verbs/read.ts:1203-1209`). No consenting host: fail-closed floor (`render-trust.ts:29`, `render-trust.ts:370`) | As above | As above | As its binding seats |
| Viewer's own message | No effect | No effect | None: always trusted, so a card or styled run frames (`render-trust.ts:372-374`) | No effect | No effect: a user row has no character (`messages_attribution_shape`, `packages/db/src/migrations/0000_baseline.sql:525`), so its frame mints with a null selector and gets the static floor (`card-frame.ts:146-147`) | Always click-to-load, whatever the install says (`render-trust.ts:29`, `render-trust.ts:370`, `render-trust.ts:382`) |
| Another member's message | No effect | No effect | None: always Tier A (`render-trust.ts:374`) | On: its cards frame, static floor (`render-trust.ts:378`) | No effect | Always click-to-load |
| Model-written panel in a reply | As its character | As its character | As its character: a panel the model wrote frames on Tier B (D354, `packages/client/src/features/chat/hooks/use-drawn-message.ts:94-95`) | As its character | As its character | As its character |
| Reply a display script styled | As its character | As its character | As its character. The scripts are the host's room tiers, shared with members by default, then the viewer's own globals (`read.ts:1273-1290`, `packages/contracts/src/chat/metadata.ts:387-389`) | As its character | As its character | As its character |
| Greeting | As its character | As its character | A greeting is the character's own assistant row | As its character | As its character | As its character |

A seat whose card cannot be read, or a room with no consenting host, resolves through `resolveRenderPolicy(deployment, null)`: Rich HTML while `trustHtml` is on, else Plain text, and never Interactive (`roster.ts:306-311`, `packages/server/src/domain/character/verbs/room-projections.ts:39-50`).

### Where a setting does not mean what its label says

| Setting or text | What it says | What the code does |
| - | - | - |
| Media and trust intro (item 3537) | "A per-character override may TIGHTEN these, never loosen them" (`media-trust-section.tsx:110`) | A character set to Rich HTML draws styled while the install default is off (`roster.ts:253`). Only external media is tighten-only |
| "Render rich HTML as trusted" (`packages/client/src/features/user-admin/lib/system-config-nav.ts:19`) | A rich HTML switch | It is the inherit default only while the ceiling is off. It also decides seats with no readable card and rooms with no host. It never applies to a message a person wrote |
| "Let interactive cards run their own scripts" (`system-config-nav.ts:21`) | A script switch. Its hint says off stops scripts (`media-trust-section.tsx:135`) | It is also the default step of every inheriting character. Off drops those characters to `trustHtml`, Plain text by default, so every imported card and preset draws plain, not only script-free |
| "Run story-card scripts" (`chat-behavior-message-handling-model.ts:160`) | Story cards only | It also holds a styled reply's own scripts. An unreadable settings blob reads it as on (item 3606) |
| Trust tab "Plain text: safest, no styling" (`character-trust-tab.tsx:159`) | No styling | In a game room with immersive cards on, that character's cards and styled replies still draw in the frame with their CSS |
| "Immersive HTML cards" hint (`rpg-host-scalars.tsx:187-189`) | Teaches the model; off keeps earlier cards drawing | It is also a render consent. Off drops the naked-HTML wrap and the frame grant for rows below Rich HTML, so those cards stop drawing as cards (`packages/client/src/features/chat/surfaces/message-list-surface.tsx:187-188`) |
| "Block external media" hint (`media-trust-section.tsx:115`) | Off lets chat content load internet media | Off loads media only in characters' content. A person's message, the viewer's own included, stays click-to-load |
| `resolveCardScriptVerdict` doc (`roster.ts:147-149`) | The notice and the frame always agree | A serve narrows to the grant minted earlier (`card-frame.ts:297-305`), and the client memo keys on the request body only (`packages/client/src/data/use-card-frame.ts:24-34`). A viewer who turns scripts on keeps a static frame while the notice says they run (item 3607) |
| Card-frame route header (`card-frame.ts:16-18`) | A failed settings read fails the request | The read now runs for every named-character card, eligible or not (`card-frame.ts:182`), so one failed read blanks every such card in the room (item 3607) |
| `UI-Theming-and-Content.md` §12.2 | A human seat and an agent-voiced row take the deployment floor | The client gives any row with no seated character the fail-closed floor, whatever the install says (`render-trust.ts:356-370`) |

The vocabulary drifts too. The Trust tab says Plain text, Rich HTML and Interactive. The admin switch says "rich HTML as trusted". D294 says "Render HTML" and "Untrusted". The proposal uses the Trust tab's words everywhere.

### The model

One install control replaces the two install switches. It is a ladder select named "Default for characters": Plain text, Rich HTML, Interactive. An inheriting character takes it. It is also the script ceiling: below Interactive, no card or styled reply runs scripts, whatever a character says. A character's own Plain text or Rich HTML still wins over it, as today.

The room switch and the character step stay two consents, and the difference is stated on both surfaces. The character step decides what that character's content may do: scripts, and `data:` images. The room switch decides whether card markup in a game draws as a card at all. Every card it draws sits in the sandbox, static unless the speaker's step allows scripts.

| Author | Default for characters | Character step | Room immersive switch | Viewer script switch | External media |
| - | - | - | - | - | - |
| Character with its own step | Interactive is the only value it needs: below it, an Interactive character draws as Rich HTML | Decides the tier and, at Interactive, scripts | On: its cards draw in the frame even at Plain text, static unless its step is Interactive | Off or unreadable: static for this viewer | Install forbid OR character forbid, through one verdict function |
| Inheriting character | Its step | Inherit default | As above | As above | As above |
| Narrator row | Through its seats | The lowest present seat, unchanged | As above | As above | As its seats |
| Seat with no readable card, or no consenting host | Not consulted | Always Plain text | As above | No scripts ever | The install setting, unchanged |
| Viewer's own message | Not consulted | None: trusted, static frame | No effect | No effect | Follows the install switch |
| Another member's message | Not consulted | None: Tier A | On: static frame | No effect | Click-to-load |
| Model-written panel or display-styled reply | As its character | As its character | As its character | As its character | As its character |
| Greeting | As its character | As its character | As its character | As its character | As its character |

Settings and their new text:

- "Default for characters" (Plain text, Rich HTML, Interactive). Hint: characters on Inherit default use this, and below Interactive no card or styled reply runs scripts. Stored as one key, `AppSettings.defaultHtmlStep`, floor `interactive`. The v11 to v12 lift in `APP_SETTINGS_LIFTS` maps a stored row: `allowInteractiveCards: true` is Interactive, `allowInteractiveCards: false` is Rich HTML with `trustHtml: true` and Plain text otherwise, and an unset ceiling stays unset.
- Media and trust intro: "A character's own HTML setting wins over the default, except Interactive, which needs the default at Interactive. External media can only be tightened."
- Viewer switch: "Run scripts in cards and styled replies". A blob that cannot be read reads as off.
- Trust tab, Plain text: "No styling. In a game with immersive cards on, its cards still draw in the sandbox, without scripts."
- Room switch: "Draws card markup in this game as cards in the sandbox, for every speaker. Scripts still follow each character's setting. Off: card markup from a speaker below Rich HTML shows as text."
- "Block external media": off loads media in characters' content and in your own messages. Messages other people write stay click-to-load.

One function per verdict, in `@orb/contracts/chat`, called by the card-frame route and by the client notice:

- Scripts: `resolveCardScriptVerdict`, unchanged.
- Media (item 3604): a new verdict over the install's external-media ceiling and the author's `RenderPolicy`. It returns whether external media loads, the holder when it does not (install or character), and whether `data:` images open. `resolvePolicy` builds `CardFrameMediaPolicy` from it, and `resolveFramedMediaVerdict` in `render-trust.ts` names its holder. The inline copies go.
- Viewer consent (item 3606): a contracts reader over `UserSettingsView` returns `runCardScripts` only when `configUnreadable` is null, and false otherwise. Both the card-frame wiring (`packages/server/src/entry/app.ts:443`, today `loadUserSettings`, which drops the flag at `packages/server/src/domain/settings/verbs/load-user-settings.ts:11`) and the notice (`packages/client/src/features/chat/components/plain-content-notice.tsx:231`) call it.

Read scope (item 3607): the route reads the viewer's settings only when the install and the step allow scripts. A failed read gives the static posture for that document, never an error. The notice reads the mint's `granted.interactive` (`card-frame.ts:271`) for whether scripts run, and calls the verdict only to name the holder. The client mint key carries the three script consents, so a change to any of them mints again.

### Item 3349: a display script's own script blocks in a reply frame

Yes, they run, under the same rule as a card. A reply frame mints through the same route, the same `resolvePolicy` and the same `buildCardFrameCsp` as a card frame. Only its height cap (`packages/kit/src/card-frame/index.ts:256`) and its link hand-off inside the reply body differ. The gate keys on the speaking character's step, never on the preset.

In a shared room, a member's browser runs the host's display scripts while the host shares them, which is the default. So a host who leaves a character on Inherit default lets the host's preset scripts run in every member's browser, under each member's own script switch. A member's own global display scripts run in that member's browser only.

The threat this guards: a script in the frame can reach no session, storage, app page or other frame, and has no HTTP channel. It can send a WebRTC beacon that reveals the viewer's IP and that the viewer saw the reply (residual R1 in `packages/kit/src/card-frame/index.ts:82-94`). It can also load external media where the install and character allow it. A preset script adds no reach that a model-written script on the same character lacks. The controls stay the install default, the character step and each viewer's switch.

### Item 3527: a panel draws when it closes, while the reply streams

The threat: the forming row holds bytes the room has not kept yet. A save-pass regex script (`packages/server/src/domain/chat/engine/pipeline.ts:627`), a stop string or an abort can remove them before they are stored. Every member watching the stream would run that panel's scripts and fetch its media for bytes the room never keeps. The ghost row pins the srcdoc floor for that reason (`packages/client/src/features/chat/components/ghost-message-row.tsx:6-28`). The srcdoc floor cannot carry a reply: it runs no script, so it cannot measure height or hand over a link (D354).

Options:

- Mint at the row's full grant while streaming: pre-save bytes run scripts and load media in every member's browser. Rejected.
- Keep the chip until settle: fails the owner's ruling.
- Ruled: a forming mint, not yet built. The mint body carries a forming flag that can only narrow. The server caps that handle at the static posture with external media off, and keeps the cap on every serve through the stored grant. `data:` images still follow the step, because they fetch nothing. A closed panel draws in a routed frame that measures itself and hands over links, runs no card script, and makes no request off the box.

At settle the row mints at its real grant and remounts the panel once under it. To skip that remount, the client may keep the forming frame for a panel with no script and no external source, because the static document draws it the same. That scan can only skip a remount, never grant anything, so a wrong answer leaves a panel static until its next mount. Each panel close mints at most once, plus once at settle. The per-account in-flight gate and the handle store bound the count.

What changes: no change to `CARD_FRAME_HEIGHT_SCRIPT` or its hash, and no new frame channel. The ghost's reply panels move from the chip to the routed delivery. The ghost header and D294 change to say a forming mint is static with no external media. The mint schema gains one narrowing field, and the server test proves the flag cannot widen a grant. Real presets: the reference preset files need no script and no external media, so their panels draw whole while the reply streams.

### Item 3345: a panel keeps its open state across scroll-out and swipe

Options:

- A host-to-frame restore channel: the pinned script listens for a restore message and sets `open`. It adds the first listener inside the frame document. Under the interactive posture, card scripts share that document and can forge the message to it, and a parse defect in that listener would run in every frame. Not recommended.
- Keep every framed row mounted: the existing keep-mounted list could include reply rows. It helps scroll-out for recent rows only and does nothing for a swipe. Useful alongside, not a fix.
- Ruled: report out, restore at build. The pinned script posts the indexes of the open `details` elements on each `toggle`, in the direction it already posts height and links. The host takes the report only from the frame's own window (`packages/ui/src/content/sandbox-frame/sandbox-frame.tsx:244-249`), bounded by `readCardFramePanels`. It keeps the list per run's bytes in memory (`packages/client/src/data/frame-panels.ts`). The next mint for that run carries the list in the root attribute `CARD_FRAME_OPEN_PANELS_ATTRIBUTE`, and the pinned script sets `open` from it at load. The state is read at mount, so a toggle never mints while the frame shows.

The threat stays bounded. A hostile frame can only lie about its own panels, which changes how its own document opens next time. The payload is a capped list of indexes, never markup or selectors. A sibling frame cannot write another frame's state, because the host checks the sender's window.

What changes: `CARD_FRAME_HEIGHT_SCRIPT` and its pinned hash change (`packages/kit/src/card-frame/index.ts:198-205`), and `tests/kit/card-frame/index.test.ts` fails until the digest is recomputed. No host-to-frame channel, and the srcdoc floor is unchanged: it runs no script, so a floor frame restores nothing. A restored document has different bytes, so a remount after a toggle mints once.

### Threats and the controls that stop them

| Threat | Control |
| - | - |
| A frame script reads the session, storage or the app page | `sandbox allow-scripts` and never `allow-same-origin`, on the attribute and as a CSP directive (`packages/kit/src/card-frame/index.ts:136`, `index.ts:621`, `sandbox-frame.tsx:413`). The `SameSite=Lax` session cookie is withheld from the opaque origin |
| A frame script sends data over HTTP | `default-src 'none'` with no `connect-src`; `script-src` admits no host and no eval (`index.ts:231-234`, `index.ts:603-623`) |
| A tracking pixel or media load | `img-src` and `media-src` stay `'self'`, add `data:` from Rich HTML up, and add `https:` only while the install allows and the character does not forbid (`index.ts:575-588`, `card-frame.ts:166`). The app CSP carries the same install ceiling (`packages/server/src/entry/http/security-headers.ts:201-208`) |
| A WebRTC beacon (R1) | No CSP directive closes it. The install default, the character step and the viewer's switch are the controls (`index.ts:82-94`) |
| A frame navigates the app or opens a page | No `allow-top-navigation`, popups or forms; `form-action 'none'`; the app's `frame-src 'self'`. A link opens only after a live activation in an admitted frame and a confirm (`sandbox-frame.tsx:257-273`) |
| A client mint names a policy | The body is a selector only, parsed strict; the server resolves the step from the membership-gated roster (`card-frame.ts:141-187`). Naming a sibling character attacks only the viewer's own session (`card-frame.ts:35-45`) |
| A revoked grant survives in a memoized handle | Every serve re-resolves the selector and narrows to the smaller grant (`card-frame.ts:291-305`) |
| Another user loads a handle | A random handle bound to the minting user, in process only, with a sliding expiry (`card-frame.ts:47-55`, `card-frame.ts:287`) |
| A direct visit to the frame URL lands in the app origin | The CSP `sandbox` directive makes the document opaque at top level; `frame-ancestors 'self'` |
| A frame resizes, links or reports for another frame | The host checks `event.source` against the frame's own window and clamps every height (`sandbox-frame.tsx:244-256`) |
| A member's text runs under a character's consent | A character's row is written by a turn or its host only (`requireAuthorOrHost` in `packages/server/src/domain/chat/verbs/edit.ts`), and a user row mints with a null selector |
| A frame script takes keyboard focus | The focus gate returns stolen focus and stops a grab loop (D294) |
| A damaged settings blob runs scripts for a viewer who said no | The consent reader above |

Real escapes in the current code: none. The one consent fault is item 3606, confirmed P2. A blob with `runCardScripts: false` and one non-string auto-swipe blacklist entry parses as `schema-rejected`, and the read hands the card-frame wiring `runCardScripts: true`. Its reach is small, because a settings write refuses an unreadable blob. Such a blob comes from another build or a hand edit.

A P3 note, not an escape: the card's `css` sits in `<style>` ahead of the pinned script in `<head>` (`index.ts:698-699`). A `css` value holding `</style>` can comment the script out, so that frame never reports and falls to its own floor. The reply reader never sends a closing style tag. The kit header's claim that card content cannot reach the script is wrong for `css`. Fix the header, or refuse `</style` in `css` at the mint.

### Each change on an existing install

| Change | What a user sees | Stored settings | Real presets |
| - | - | - | - |
| One "Default for characters" select | An admin sees one select in place of two switches. The default install reads Interactive, as today | The v11 to v12 lift folds the two keys into `defaultHtmlStep`; every character draws at the step it drew at before | None by default. An admin who wants no scripts picks Rich HTML, and presets keep their styling. Today the same admin gets plain text |
| Seats with no readable card, and hostless rooms, always Plain text | Such rows draw plain where `trustHtml` is on; the notice offers no remedy | The deployment `trustHtml` key goes; the lift drops it | None: the default install already draws them plain |
| Unreadable blob reads scripts off | A viewer with a damaged blob sees card scripts held, with the notice naming their switch | No migration | Only for such a viewer |
| Settings read only when scripts could run; a failed read draws static | Cards no longer blank across a room when one read fails | None | None |
| Notice reads the mint grant; consents in the mint key | Turning scripts on reloads framed cards with scripts | None | None |
| One media verdict function | None; the notice and the frame cannot drift | None | None |
| Own messages follow "Block external media" | A viewer's own image links load while the install allows media | None | None |
| Copy for the Trust tab, the room switch and the viewer switch | Text only | None | None |
| Forming mint (3527) | Panels draw while a reply streams; a script panel starts its scripts at settle | Mint schema gains one narrowing field | Reference panels draw whole during the stream |
| Panel state report (3345) | An opened panel stays open across scroll-out and swipe | None; state is in memory | A preset's panels keep the state the reader gave them |

The staged community preset files, Freaky Frankenstein 5.6 and 6.0, are read here as data. Every enabled display script targets AI output only. Their templates hold inline styles and `details` panels, with no script, no event handler, no external source and no `data:` URI. Their prompts ask the model for raw HTML with inline styles. They therefore need only a step at or above Rich HTML. The model gives an inheriting character Interactive on a default install, and Rich HTML whenever an admin picks it. `tests/client/features/chat/components/heavy-preset-render.ct.tsx` passes under the model against both files and against Sola Flame V4.

### Rulings

1. The two install switches merge into one "Default for characters" select, which is also the script ceiling.
2. A seat with no readable card, or a room with no consenting host, always draws as Plain text.
3. The room immersive switch stays its own consent. It frames every speaker's cards statically, and the surfaces state that.
4. The viewer's own messages load external media under the install switch. Other people's messages stay click-to-load.
5. A failed viewer-settings read draws the card static, never an error.
6. A streaming panel mints static with no external media, and its scripts start at settle.
7. The pinned script reports open panels, and the host restores them when it builds the document. No host-to-frame channel.
8. The viewer's own messages keep the static frame (a null selector), so a display script that adds scripts to user rows never runs them.
