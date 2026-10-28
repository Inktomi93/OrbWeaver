# Composer reference review

## Scope

The owner-authorized Chrome walkthrough inspected the live SillyTavern composer and opened its chat, extension, guided-tool and persistent-guide menus.
Actions that send, generate, edit messages, clear drafts or change guides were not invoked. Button meanings below come from visible labels and tooltips, not execution.
The existing draft remains unchanged. Menus were returned to their closed state.

## Observed organization

The writing row contains chat actions and extensions on the left, the draft in the middle, and Send on the right.
A separate compact row places guided-tool and persistent-guide menus on the left, with guided generation actions grouped on the right.
Persistent Guides exposes its active injection count at rest.

| Entry | Visible contents or described function |
| - | - |
| Chat actions | Author's Note; CFG Scale; Token Probabilities; Back to parent chat; Save checkpoint; Convert to group; Start new chat; Close chat; Manage chat files; Delete messages; Regenerate; Impersonate; Continue |
| Extensions | Open Data Bank; Attach a File; Show Gallery; Inspect Prompts; Token Counter; Moonlit Echoes |
| Guided Generations Tools | Simple Send; Recover Input; Undo Last Addition; Revert to Original; Edit Intros; Corrections; Separated Thinking; Spellchecker; Clear Input; Help |
| Persistent Guides | Situational; Thinking; Clothes; State; Rules; Custom; Custom Auto; Fun; Show Guides; Flush Guides; Stat Tracker; Edit Guides |
| Guided Impersonate | Tooltip identifies first-person guided impersonation. Its execution flow was not invoked. |
| Guided Swipe | Tooltip identifies guided swipe generation. Its execution flow was not invoked. |
| Guided Response | Tooltip identifies guided response generation. Its execution flow was not invoked. |
| Send | Sends a message. Not invoked. |

## Guided tool meanings

- Simple Send posts the current input without requesting a chatbot response.
- Recover Input restores previously typed input after clearing or replacement.
- Undo Last Addition removes the last guided-continue addition.
- Revert to Original restores the message before guided continues.
- Edit Intros opens an introduction editing or regeneration popup.
- Corrections asks the model to rewrite its last message using corrections from the input.
- Separated Thinking analyzes the shown message for errors and appends a corrected swipe.
- Spellchecker corrects grammar, punctuation and flow in the draft.
- Help opens extension documentation. Clear Input is explicitly named as a draft-clearing action.

## Persistent guide meanings

Situational summarizes scene location, characters, objects and events. Thinking describes character thoughts and motivations.
Clothes describes clothing. State describes physical state, position and actions. Rules lists established facts or learned rules.
Custom runs a user-defined guide; Custom Auto runs one on triggers or conditions. Fun opens a prompt popup.
Show Guides displays active guide content. Flush Guides clears injected guide content.
Stat Tracker opens tracker configuration. Edit Guides opens guide and prompt management.

## Current-mode measurements

Values are live CSS pixels from the owner's current theme and mode, not SillyTavern defaults or proposed Orbweaver tokens.
The composer measurement viewport is 1900 × 843 at DPR 1. Menu measurements are separate opened states; do not compare absolute positions across viewport changes.

| Part | Measured geometry and typography |
| - | - |
| Composer outer box | 950 wide × 77 high; 1px border; bottom corners 10px |
| Writing row | 948 wide × 36.5 high; 5px column gap |
| Draft input | 830.5 wide × 36.5 high; Noto Sans 15px; 6px padding; computed line-height normal; max-height 421.5px |
| Chat menu, extension menu and Send targets | 34.5 × 34.5; Font Awesome icon font 28.5px; 5px radius |
| Guided toolbar | 948 wide × 38.5 high; 5px padding and gap |
| Guided toolbar buttons | 28.5 high; 16.5px icon font; 5px vertical and 8px horizontal padding; 1px border; 4px radius |
| Guided action cluster | 113.5 wide; button widths approximately 32.44, 34.5 and 36.56; 5px gaps |
| Persistent-guide count button | 48.78 wide; counter font approximately 14.85px |
| Chat-actions popup | 196.20 wide × 437 high; rows 33 high; 16.5px text; 5px row padding |
| Extensions popup | 173.20 wide × 204 high; observed rendered row 33 high with 16.5px text and 5px padding |
| Guided-tools popup | 181.53 wide × 328 high; rows 30 high; 15px text; 5px vertical and 10px horizontal padding |
| Persistent-guides popup | 150 wide × 377 high; rows 30 high; 15px text; 5px vertical and 10px horizontal padding |
| Popup common treatment | 2px padding; 10px radius |

The empty quick-reply host occupies the flexible middle of the guided toolbar; the menu and generation clusters stay at opposite ends.
The visible composer does not spend an extra line on attributed text labels for every extension action.
These fine-pointer dimensions are below Orbweaver's coarse-pointer floor and must not be copied directly to phone controls.
No draft, generation or guide mutation was performed.

## Flat and Bubbles comparison

Mode names are owner-identified. Moonlit Echoes and enabled extensions remain active, so these are combined customizations, not stock mode specifications.

| Measurement | Flat | Bubbles |
| - | - | - |
| Viewport | 1920 × 863, DPR 1 | 1920 × 919, DPR 1 |
| Composer | 945 × 87 | 945 × 87 |
| Writing row | 943 × 46.5; padding 5px 10px | Same |
| Draft input | 825 × 36.5; 15px text | Same |
| Guided toolbar | 943 × 38.5 | Same |
| Guided buttons | 28.5px high; 16.5px icons | Same |
| Last assistant message block width | 869.5 | 746.39 |
| Last assistant reading width | 837.5 | 714.39 |
| Reading typography | 15px / 23px | 15px / 23px |
| Last assistant block radius | 10px | 5px 20px 20px 40px |
| Last assistant block padding | 15px 15px 25px | Same |

Bubbles visibly separates user and assistant sides, placing the user's avatar and attribution on the right.
The narrower message measure and asymmetric shape change the conversation's rhythm without rearranging the composer.
The composer keeps its action groups and geometry across these inspected modes. This continuity is the useful reference property.
Viewport height and scroll position differ; these are settled geometry observations, not a controlled motion comparison.

## Document mode

At 1920 × 863 and DPR 1, the composer remains 945 × 87 with the same writing row, guided toolbar and button dimensions as Flat and Bubbles.
The last assistant message block and reading area both measure 933px wide. The block has no padding or radius; reading text retains 15px / 23px and 5px bottom padding.
The inspected reading surface removes visible avatar gutters, bubble outlines and prominent speaker headers, producing continuous document-like prose.
Message actions remain available without turning the composer into a different control surface.
This mode reduces identity chrome and expands the measure; it does not enlarge the text. These observations include Moonlit Echoes.

## Echoes mode

At 1920 × 863 and DPR 1, the composer remains 945 × 87 with unchanged writing and guided-action rows.
The measured last assistant block is 933px wide. Its text box uses 20px left and approximately 186.59px right padding, leaving approximately 726.41px before any border subtraction.
Reading typography remains 15px / 23px. The text box has a 10px radius; the outer message row has a 15px radius.
The screenshot shows an attribution band above the message and portrait art at the message edge, fading toward the reading area.
User and assistant art occupy opposite edges in the inspected view. The art adds identity while the prose remains on a quiet surface.
This is a more decorative message treatment, not a new composer arrangement. Exact placement remains attributed to the owner's combined theme and extensions.

## Whisper mode

At 1920 × 863 and DPR 1, the composer remains 945 × 87 with the same controls and measured row dimensions.
The last assistant reading area measures 901px wide at 15px / 23px. The outer row measures 933px wide, with 15px horizontal padding, 45px top padding and a 15px radius.
The screenshot shows portrait artwork as a shallow upper banner instead of Echoes' tall side reservation.
The avatar and attribution sit near the banner's lower edge; the prose uses the width below, on a quiet background.
This trades vertical header space for a wider reading area. The writing interface remains unchanged.
Measurements describe the owner's theme and extensions together. No mode setting, draft or generation state was changed by the reviewer.

## Hush mode

At 1920 × 863 and DPR 1, the composer remains 945 × 87 with unchanged control placement and row dimensions.
The measured last assistant reading area is 895px wide at 15px / 23px. Its outer row is 933px wide, with 19.5px vertical and 18px horizontal padding, 10px vertical margins and a 15px radius.
The screenshot retains the avatar and attribution inside a quiet rounded message surface, without Whisper's decorative banner or Echoes' side artwork.
Hush emphasizes message identity and separation without the large art treatment. Its reading width is close to Whisper's, not Bubbles' narrower column.
The owner's theme and extensions remain active. No draft or mode setting was changed by the reviewer.

## Ripple mode

At 1920 × 863 and DPR 1, the composer remains 945 × 87. The last assistant message row is 933px wide; its content block is 743.5px and reading area is 723.5px.
Reading typography remains 15px / 23px. The content block has 20px top, 15px right and bottom, and 5px left padding.
The screenshot shows a left portrait column, an adjacent attribution line with a divider, and prose beside the portrait rather than beneath a banner.

The owner calls out art following long messages. A live scroll confirms sticky artwork within the message: an inspected long row moves from y386 to y−477 while its art moves from y387 to y34.
Its avatar wrapper computes `position: sticky; top: 0px`. The artwork remains beside the continuing prose rather than disappearing with the message's first line.
This corrects the initial loose description of artwork simply scrolling away with the message. The observed mechanism is sticky within message content, not a fixed viewport background.
The message-bottom release was not traversed, so its exact release geometry remains unmeasured. The scroll was moved back afterward; the draft is unchanged.

## Tide mode

At 1920 × 919 and DPR 1, the composer remains 945 × 87 with unchanged writing and guided-action rows.
The last assistant message row is 907px wide; its paragraph region is approximately 634.89px wide, retaining 15px / 23px typography.
Paragraphs form separate rounded bubbles rather than one enclosing message bubble. Sample paragraph padding is 6px vertical and 14px horizontal, with an 18px radius and 8px bottom margin.
Short paragraphs shrink to their content; long paragraphs use the region width. The sampled short paragraph measures approximately 210.95px wide.
The visible user content is right-aligned and assistant content left-aligned, with attribution above the paragraph group.
This makes prose read as separate conversational beats and adds vertical rhythm without changing the composer. It also increases per-paragraph chrome compared with Document.
The measurements describe the combined owner theme and extensions, not stock SillyTavern defaults.

## Phone portrait and landscape

The live Chrome walkthrough used 390 × 844 portrait and 844 × 390 landscape, with touch emulation enabled.
The page reported `pointer: coarse` and `hover: none`. This is Chromium responsive testing, not Safari or a physical iPhone certification.
Device pixel ratio remained the desktop value; safe-area insets, browser chrome and the software keyboard were not emulated.

Flat, Bubbles, Document, Echoes, Whisper, Hush, Ripple and Tide were opened in both orientations through their documented style commands.
The existing draft was preserved across commands. Tide, the original mode, was restored; touch emulation and viewport overrides were cleared.
The final draft equality check passed. Scroll position changed during the walkthrough.

### Composer and menus

The settled composer grows from 87px desktop height to approximately 132.5px in both phone orientations.
Its draft takes a full-width row, with chat tools and Send below, while the guided toolbar remains above.
This consumes approximately 34 percent of the landscape viewport before a software keyboard appears.
Guided controls remain 28.5px high under coarse-pointer emulation. Their compact desktop appearance does not satisfy Orbweaver's stronger touch-floor policy.

The expanded wand menu fits portrait. In landscape it constrains itself to 311px, with `overflow-y: auto` and a larger scrollable content height.
The nested image-generation menu instead extends above the landscape viewport, hiding its upper subject choices.
Guided Tools also extends above the landscape viewport: top −62.5px, height 328px, overflow visible.
Persistent Guides has top −111.5px, height 377px, overflow visible. Its upper entries are clipped too.
The reference's stable menu grouping is useful; its unconstrained extension popup positioning is not a pattern to copy.

### Reading-layout observations

| Mode | Portrait sampled text-region width | Landscape sampled text-region width | Judgment |
| - | - | - | - |
| Ripple | 244.5px | 698.5px | Sticky portrait column shrinks to 100px, but still takes substantial portrait reading space. |
| Echoes | 374px including 113.5px horizontal padding | 828px including 227px horizontal padding | Art reservation persists beside long text even when the art itself has scrolled away. |
| Whisper | 342px | Not sampled | Banner avoids the permanent side reservation; both orientations were visually inspected. |
| Hush | 336px | Not sampled | Quiet identity above prose preserves more portrait width; both orientations were visually inspected. |
| Flat | 278.5px | 732.5px | Avatar gutter remains beside the message, narrowing portrait prose. |
| Bubbles | 267.19px | 630.39px | Additional bubble narrowing makes long portrait messages particularly tall. |
| Document | 360px | 814px | Most direct reading layout; removes the avatar gutter. |
| Tide | 336.59px | 745.19px | Paragraph bubbles use more of the mobile width while retaining separate conversational beats. |

Sampled text keeps 15px / 23px typography. The width sampler selects an in-view long message; Whisper and Hush landscape had no eligible sample at that position.
No page-level horizontal overflow was measured in these states. This does not establish every descendant, popup or interaction is contained.
Different modes retain different scroll positions after layout changes; these are representative settled views, not matched-text motion comparisons.

### Implications for Orbweaver

Preserve stable action groups across message skins. Let the reading presentation vary without remapping writing controls.
Give every menu the same viewport-constrained scrolling and collision behavior, including plugin submenus.
Adapt optional artwork to the remaining reading width rather than preserving desktop decoration at any cost.
Budget composer height in short landscape containers, and preserve governed coarse targets instead of copying the reference's smaller buttons.

## Expanded wand menu

With additional extensions enabled, the menu adds Generate Image, Generate Caption, Narrate All Chat, Translate Chat and Translate Input.
Generate Image opens a subject submenu: Yourself, Your Face, Me, The Whole Story, The Last Message, Raw Last Message and Background.
Only the submenu was opened. No subject was selected and no image generation, captioning, narration or translation was invoked.
The additional capabilities remain behind the existing wand door rather than adding permanent composer buttons.

## Design judgment

The useful pattern is stable grouping and progressive disclosure, not smaller typography.
The draft has a clear visual home. Frequent generation actions form a compact cluster; tools and persistent context have separate menu doors.
Secondary actions do not become a continuous rail of long labels beside the input.

The reference is not a flawless design. Its chat menu mixes configuration, navigation, destructive operations and generation.
Several icons require learned meanings or tooltips. Compactness alone does not establish accessibility or mobile suitability.
Do not copy these weaknesses into Orbweaver.

## Orbweaver direction to validate

Preserve the governed ramps, pointer floors, native control semantics and plugin attribution.
Organize the composer around writing and Send, a distinct generation-action group, and stable secondary menus.
Keep persistent guidance distinguishable from one-shot editing and generation commands.
Adjudicate each existing action before moving it; the goal is a coherent task model, not an arbitrary icon-only conversion.
The existing plugin-enabled Orbweaver capture shows long attributed command labels competing with native generation controls.
The shared host owns this grouping problem; separate plugin skins are not the default repair.

The [visual consistency audit](visual-consistency-audit.md) tracks the broader work and remaining coverage.
