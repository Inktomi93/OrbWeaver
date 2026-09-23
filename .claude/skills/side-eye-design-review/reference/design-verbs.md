# The design-verb vocabulary

Adapted from impeccable's commands (Apache-2.0); triage and attribution in
`docs/design/impeccable-adoption.md`. A shared vocabulary so a review can prescribe in one word and a
fix inherits an exact, law-bound meaning. Each verb binds to SKILL.md's law and instruments, never a
license to invent values. A report using one of these verbs names the target surfaces and the evidence
that will prove the verb landed. Prescription grammar: `<verb>: <targets> — <evidence>`. A verb with no
target is not usable; a verb with no evidence is not proven.

| Verb | Means here — bound by | Evidence that proves it |
| - | - | - |
| **critique** | the Track A method (§7-9, §13) | the review + screenshots |
| **audit** | the deterministic scan + measured a11y/perf pass — P0-P3 (§10) | `snap --design-audit` JSON + `snap --contrast/--aria/--motion` |
| **polish** | kill micro-defects: alignment, off-step spacing, inconsistent states — the density tier map | before/after `--shot-of` + computed padding/radius equal to resolved tokens |
| **quieter** | strip unsanctioned glow/gradient/motion, demote competing focal elements to one, accent back under about 10% of viewport — chrome-quiet/content-loud law | design-audit glow/radial/stripe rules clean + before/after shots |
| **bolder** | spend the one focal slot deliberately, sanctioned accent carriers only, never new raw values — tokens-only + owner theme | shots + the focal element named; design-audit still clean |
| **distill** | remove elements/duplication; read-only groupings lose their boxes — §13; empty states are never distilled away | element-count delta + shots |
| **layout** | fix rhythm/grouping/hierarchy within the tier map's steps — density §3.1 + §14 | computed gaps equal to resolved spacing tokens |
| **typeset** | voice discipline: right voice per role, no off-ramp sizes/faces — the type ramp | design-audit `off-theme-font`/`text-below-ramp`/`flat-type-hierarchy` clean |
| **colorize** | apply existing intent/accent tokens where meaning is carried by nothing; a new hue is an owner decision — the theme pipeline | `--contrast` PASS lines + shots |
| **animate** | purposeful motion on the sanctioned tokens/easing; exits paired with entrances; reduced-motion means remove — the motion guide | `__orb.motion()`/`__orb.animations()` compositor-clean + `snap --motion` PASS |
| **optimize** | kill churn/jank: hot renders, long tasks, dropped frames — §11 thresholds | `__orb.renders()` deltas + `snap --perf`/`snap --motion` numbers |
| **adapt** | responsive correctness at real mounts: container model, coarse-pointer floors — §0 | `--mobile`/`--matrix` runs + design-audit at both pointers |
| **harden** | survive Riley: long strings/emoji/RTL, empty/error/loading, refresh mid-flow — §5 + §9 | seeded stress fixtures + shots of every state |
| **clarify** | UX copy in UI chrome: controls name their action, errors name problem+recovery — never model/user prose | before/after copy table |
| **onboard** | design the landing/teaching and empty states that guide to first value — §14 CONTENT law | shots of first-run and empty states |
| **shape** | plan before code: a mock under `docs/design/mocks/`, driven through the same instruments | `snap --file <mock>` + the mock-vs-rendered delta table below |
| **document** | re-derive `reference/design-context.md` from the law sources it maps | the updated file, evidence per changed fact |
| **extract** | promote a repeated shape to a token/primitive via the governed process — `UI-Primitives-and-Reuse.md` §13.7/§13.8 | the primitive/token delta + its component test |
| **delight** | rationed personality through the sanctioned effect axes (§11) and motion — never decorative pulse/marquee/confetti | shots + the axes' guards verified |
| **overdrive** | out of register for this operate-mode shell — owner-directed only; an overdrive urge is a fork to escalate, not a move to make | none, escalation, not execution |
| **live** | iterate visually without fighting the dev stack: `snap --dirty`/`--isolated` and the mock loop | per-iteration shots |

"craft" is not a verb in this vocabulary. Say what you mean with one of the verbs above.

**Mocks:** build a mock through the Claude Design canvas flow, matched to app tokens and components, never forge-drawn HTML. Commit the canvas source, renders, and a `DESIGN.md` under `docs/design/mocks/<name>/`. Render and look at each board's default state before publishing. Comparing a mock to the rendered surface is an image comparison, not a subjective check: shoot both at the same viewport (`pnpm snap --file <mock.html> --viewport WxH`) and build a per-element delta table: `RENDERED-WRONG` (the build missed the mock), `MOCK-STALE-SANCTIONED` (a later ruling overtook the drawing, cite it), or `DELIBERATE-WITH-CITE` (the build diverged on purpose, cite the line that says so). A row you cannot classify is a question for the orchestrator, not a silent pass.
