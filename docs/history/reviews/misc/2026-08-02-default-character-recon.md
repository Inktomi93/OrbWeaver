# Default-character program — recon (scout, 2026-08-02 night)

Input for the Fable authoring lane. Sanitized per program rules. Full program spec: workboard
★ DEFAULT-CHARACTER PROGRAM block. Owner sign-off bar: FUN, not sterile.

## ST corpus (`/home/inktomi/inktomi-stack/development/neo-tavern/.st-data`, profile default-user)

310 character PNGs, 125 chat dirs. Popularity (chat files / total msgs / recency):
Hikari 110/3143 · Ruby 93/665 · Selene1 65/2320 · Azarael 65/1626 · Ayami 47/1708 ·
Bess 32/1766 · Bengal 37/1029 · Anika 28/852 · Ysabeau 19/515 · Hikari1 18/693 · Tama 14/184 ·
default_Assistant 14/34 · Rin 13/339 · Amanda Jones 13/354 · Rosalia 12/125.
(Chat-count proxy; Selene1/Bess have higher msg-density per chat.)

**Universal corpus pattern:** everything front-loaded into `description`; `personality`/
`scenario`/`mes_example` near-universally EMPTY — the exact anti-pattern our Rev card satirizes.
SKIP all as direct templates; derive voice/attitude only. Structural outlier: Alathea (41
alt-greetings, lorebook+sysprompt) — the how-alt-greetings-scale reference.
Lorebooks embedded-in-card only (Rosalia 42 entries, Bess 5, Ayami 3…); `world` ext unused.
All use {{char}}/{{user}} conventionally.

**Hikari (the gold):** exhausted ~36yo chosen-one magical girl, 20 years unpaid supernatural
labor + soul-crushing day job. Weary sardonic hero-fatigue; competence without enthusiasm;
cynicism that never curdles cruel; self-aware thankless-heroism jokes; uniform-doesn't-fit
physical comedy. Card itself heavily explicit (desc + intro scene) — the burnout voice is
CLEANLY separable: rebuild as "reluctant superhero, decades in, running on fumes and gallows
humor."

**Ruby (CLAUDE.md's model, feeds JFC):** description = ONE markdown SYSTEM DIRECTIVE doc
(numbered: Core Identity → Beliefs → Operational Directives → Response Protocols → Code Output
Standards → tech rules → Architectural Principles → Quality Standards → Final Mandate); every
other field blank — persona defined by doctrine + response rules, zero scene-setting. Voice:
brutally-direct reviewer, profanity for emphasis not shock, anti-cargo-cult, anti-overengineering
(boring tech wins, dead code = deleted), closing mandate = satire-with-sincerity.

**JFC (survives, rebuilt toward Ruby fidelity):** cards.ts:110-134 — structurally clean today
(good fields, good marks, creatorNotes cite justfuckingcode.com energy). Not broken; rebuild
= richer Ruby-DNA transplant.
**Niko (survives, coherence+marks rewrite):** cards.ts:60-83 — fully built but premise is
self-referentially CardRefinery-demo-flavored (illegible to a cold user); marks need line-by-line
audit (not done in recon).

## Our seed system

- Cards: `packages/server/src/domain/character/seeder/cards.ts:10-135` (DEFAULT_CHARACTER_CARDS:
  Assistant, Rev, Niko, Mara, JFC).
- Seeder: `seeder/seed.ts:25-122` — real CharacterService.create, idempotent
  (UserSettings.onboarding.defaultCharactersSeeded + in-process memo), tags + storeAvatar +
  seedGallery per card.
- Triggers: boot owner seed `entry/boot/seed-default-characters.ts:16`; EVERY NEW USER on first
  authed request `entry/app.ts:198` (middleware 184-201) via `lifecycle.ts:339-342`.
- Avatars: `entry/boot/seed-assets/avatars/*.png` — 512×512 PNG; gallery `*-gallery.webp`;
  through the REAL asset pipeline (CAS, enforceMagic) via compose `assets-character.ts:269-320`.
- Field surface: `contracts/character/index.ts:147-170` — handle/name/description/personality/
  scenario/greetings[{text,groupOnly?}]/exampleMessages/systemPrompt/postHistoryInstructions/
  creatorNotes/creator/cardVersion/nickname/source[]/dates/regexScripts[]/extensions/
  residualData/avatarAssetId/depthPrompt{depth,role?,prompt}. Macro-capable: description,
  personality, scenario, greetings[].text, exampleMessages, depthPrompt.prompt.
- **No sheet/trackerGrants on the character contract** (rpg domain owns those) — rpg-ready
  defaults need a separate RPG-domain seed step if tracker grants should ship.
- **Chats-as-defaults NOT supported today** — no default-chat seeder exists; the door is
  `domain/import/verbs/import-chats.ts` (bulkImportChats onto an owned character) + export-chat.
  Demo conversations = a NEW seed step built on the bulk-import machinery.

## Not covered (scout-honest)
Other ~295 cards unread; chat jsonl bodies unread; import-door dogfood NOT executed (follow-up —
executor-tier); Niko line-audit; `worlds/` external lorebooks; `_cache`/`_uploads`.
