// Policy: surface-a11y-focus (UI-Gates-and-Lessons.md §8) — a feature `surfaces/*.tsx` manages focus during
// mount/lifecycle, OR a waiver says in source, with a reason, that its section's arrival focus is owned by
// ANOTHER pane. Drill-down/SPA surfaces that take neither leave a keyboard user on `<body>`.
//
// FAMILY `surface-a11y-focus` — a SINGLETON today, and the reason is worth the line because the shape says
// otherwise. The shared reader `lib/surface-composition.ts` (`managesArrivalFocus` + `exportedComponentAnchor`)
// was built for TWO members: `surface-in-a-container` judges the same population from the other angle and is
// designed to report the SAME position — one anchor, so one `@orb-waive` line can carry both ids, which is
// the payoff guide §2 names. That sibling is PARKED rather than converted (owner call pending, 2026-09-13):
// its `SHELL_EXEMPT` row encodes `UI-Architecture-and-Layout.md` §4's SHELL-vs-ANCHOR role distinction, and
// the open question is whether the shell belongs in that policy's POPULATION at all rather than being
// exempted inside it. The reader therefore carries ONLY what this policy consumes — a dead export held
// against a future second member is exactly the rot the constitution bans — and it gains the containment
// half, plus the `surface-composition` family string, in the same commit that converts the sibling. A
// singleton family must equal its sole policy id until then (`lib/policy-module.ts:79`).
//
// POPULATION PORT: `@client` under `packages/client/src/features/*/surfaces/**`, `tsx` only, MINUS the
// app-shell and topbar features. LEGACY at 854c81c80: `scopeSafety: "whole-project"` with no `scanRoot`,
// filtered inside `run` by
// `SURFACE_RE = /^packages\/client\/src\/features\/([^/]+)\/surfaces\/[^/]+\.tsx$/u` and then
// `if (rel.includes("app-shell") || rel.includes("topbar")) continue;`.
// ONE INTENTIONAL CORRECTION, stated rather than absorbed: the legacy skip was a SUBSTRING test over the whole
// repo-relative path, so a file merely NAMED `app-shell-*.tsx` in any feature was skipped too. The population
// expresses it as two `notUnder` feature roots. Measured on this tree (2026-09-13): 32 files match the
// surfaces pattern, exactly ONE of them matches either substring — `features/app-shell/surfaces/app-shell.tsx`
// — so the admitted set is byte-identical today and the correction only narrows a future false skip.
// The `topbar` root matches nothing today; it is carried rather than dropped because dropping it would
// silently change the verdict the day a topbar surface lands, and the population algebra has no liveness on
// an inert `notUnder` (a limit worth stating, not a defect this lane invents a ratchet for).
// The population is pinned by `mustPass[3]` (`@ui`, out of root) and `mustPass[4]` (the app-shell fence),
// each with an in-population anchor file beside it — a falsifier admitting nothing tool-errors instead of
// passing.
//
// THE §4.6 BLINDNESS TRIPWIRE IS RETIRED INTO THE RUNTIME, AND THAT IS AN UPGRADE, NOT A LOSS. Legacy carried
// its own arm: `if (featuresSeen && surfacesSeen === 0) report(FEATURES, BLIND_MESSAGE)` — a hand-rolled
// guard against `surfaces/` being renamed out from under a directory-name-keyed scan, reported at a DIRECTORY
// path. Under this contract the same failure is a REFUSAL: the population is declared data, and a declared
// population that resolves to zero paths refuses the run rather than passing it (guide §3, "missing/empty
// population refusal"). The runtime says "I could not judge" where the gate used to say "the tree is wrong",
// which is the more honest of the two — and a directory is not a member of any population, so the legacy
// anchor could not survive regardless. Pinned by the empty-population drive in the family test.
//
// THE CUSTOM `@surface-focus-elsewhere` GRAMMAR IS DELETED, AND ITS TWO-SIDEDNESS SURVIVES CENTRALLY.
// Legacy owned a whole-file regex pair (`MARKER_RE` / `MARKER_OPENER_RE`), a `markerLine` scanner, a MALFORMED
// arm (an opener that does not parse) and a STALE arm (a declaration on a surface that DOES manage focus).
// All four retire, and none of the behaviour does: `@orb-waive surface-a11y-focus(<position>): <reason>` is
// parsed centrally, a malformed marker is a central `malformed` authority finding, and a marker that
// suppressed nothing is a central `stale`/`dead-position` alarm — which IS the stale arm, now applying to
// every policy rather than to this one. The mention fence survives too, and by construction: the central
// grammar requires the comment's own text to OPEN with the marker, so a quotation inside prose is inert.
//
// MARKER TRANSLATION (in this commit, per guide §8). 2 live marker-form sites, both file-level comment
// openers; census and per-file reconciliation in the lane report.
//   packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx      1 -> 1
//   packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx     1 -> 1
// The legacy position was an OWNER LABEL (`CharacterPicker`, `SearchOmnibox`) — a free-form discriminator
// under `lib/gate-ignore.ts:180`'s plain string equality, naming a control in ANOTHER file. Under this
// contract a position is a SOURCE COORDINATE, so it becomes this surface's own exported component name; the
// owner it used to name moves into the reason, where it is still checkable and no longer pretends to be a
// coordinate. The picker's marker also MOVES: it sat ~94 lines above its export inside a file-level comment
// block, which binds to nothing under the central engine (leading trivia on the node or its ancestors up to
// the enclosing statement). Both translations are proven on the REAL FILES read off disk in the family test,
// not on fixtures — an in-place translation is a claim about the ENGINE, and only a real-site run tests it.
//
// COMMENT POSTURE: comment-SAFE throughout. Legacy was comments-INTENDED for its marker half only, and that
// half is gone — the central waiver engine owns comment reading now, so this policy reads no comment text at
// all. The permissive-direction fixture (a surface whose COMMENT names `.focus(` and `<Dialog>`) is kept as
// `mustFlag[1]`: it is the row that dies if anyone ever re-introduces a file-text scan.
import type { SourceFile } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { exportedComponentAnchor, managesArrivalFocus } from "../lib/surface-composition.ts";

const SURFACES = "packages/client/src/features/*/surfaces/**";

const MESSAGE =
  "surface is missing A11y focus restoration. Drill-down/SPA surfaces must manage focus on mount " +
  "(`ref.current?.focus()` in a mount lifecycle, or `useFocusOnMount`) unless wrapped in a focus-trapping " +
  "primitive (Popover, Dialog, Tooltip, Dropdown, Sheet) — or declare that another pane owns the section's " +
  "arrival focus (UI-Gates-and-Lessons.md §8). A section has ONE arrival target; a surface that takes none " +
  "and declares none leaves a keyboard user on `<body>` with no ring on screen to explain why.";

const FIX =
  "manage focus on mount (`ref.current?.focus()` inside a `useEffect`/`useLayoutEffect`, or `useFocusOnMount`), " +
  "wrap the surface in a focus-trapping primitive (Popover/Dialog/Tooltip/Dropdown/Sheet), or — when another " +
  "pane owns the section's arrival focus — declare it: " +
  "`// @orb-waive surface-a11y-focus(<ExportedComponentName>): <which control takes arrival focus, and the " +
  "test that pins it>` on the line above the surface's exported component. The position is THIS surface's own " +
  "exported component name, never the owning control's — the owner belongs in the reason, where it is " +
  "checkable against that pane.";

export const gate = defineGate({
  id: "surface-a11y-focus",
  family: "surface-composition",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@client"],
    under: [SURFACES],
    notUnder: ["packages/client/src/features/app-shell/**", "packages/client/src/features/topbar/**"],
    ext: ["tsx"],
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitFile: (sourceFile: SourceFile): void => {
      if (managesArrivalFocus(sourceFile)) {
        return;
      }
      const anchor = exportedComponentAnchor(sourceFile);
      if (anchor === undefined) {
        // DECLARED LIMIT (`mustPass[5]`): a surface file that exports no component has no authored position,
        // and an ordinary finding with no position has no waiver door at all. Reporting one would raise a
        // central binding failure on the author's first real waiver rather than naming a defect.
        return;
      }
      ctx.report.node(anchor, { token: anchor.getText(), offset: 0, message: MESSAGE, fix: FIX });
    },
  }),

  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/surfaces/pane.tsx": "export const Pane = () => <div>content</div>;\n" },
      expect: { count: 1, token: "Pane" },
      why: "the founding shape: a full-page surface with no `.focus()`/`useFocusOnMount` and no focus-trapping primitive. The token is the exported component NAME, which is the §4.2 waiver position",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/commented-focus.tsx":
          "// Focus: the anchor's <Dialog> owns it today; when this becomes a drill-down pane, call ref.focus() here.\nexport const Pane = () => <div>content</div>;\n",
      },
      expect: { count: 1, token: "Pane" },
      why: "COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction: a surface whose COMMENT names `.focus(` and a focus-trapping primitive manages no focus at all — a file-text scan hands it the exemption, which is the silent-green half of the comment-blindness class. This is the row that dies if anyone re-introduces one",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/handler-only.tsx":
          'export function Pane(): unknown {\n  const ref = { current: null as { focus: () => void } | null };\n  return <button type="button" onClick={() => ref.current?.focus()}>go</button>;\n}\n',
      },
      expect: { count: 1, token: "Pane" },
      why: "A `.focus()` in an EVENT HANDLER is not arrival focus. This is the row that dies when the lifecycle test in `isLifecycleFocusCall` is cut to a bare `.focus()` scan — without it the policy acquits every surface with a focus button and the rule stops meaning anything. Carried from `tests/tooling/ui-gate-structural-regressions.int.test.ts` at this conversion",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/string-focus.tsx": 'export const Pane = () => <div>{"call ref.focus() after mount"}</div>;\n',
      },
      expect: { count: 1, token: "Pane" },
      why: "the STRING spelling of the same blindness, distinct from the comment one above and also carried from `ui-gate-structural-regressions.int.test.ts`: a string literal spelling `.focus(` is a JSX text node, not a call, and it survives comment blanking — so a scan that blanked comments but grepped text would still be fooled by it",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/ok.tsx":
          "export const Ok = () => {\n  useLayoutEffect(() => { ref.current?.focus(); }, []);\n  return <div>content</div>;\n};\n",
      },
      why: "the surface calls .focus() on mount inside a lifecycle — it manages its own focus restoration, passes",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/trap.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const Trap = () => <Dialog>content</Dialog>;\n',
      },
      why: "the focus-TRAPPING primitive arm: the surface's root is a Dialog, which owns the caret itself. Cut `AUTO_FOCUS_PRIMITIVES` out of `managesArrivalFocus` and this is the row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/declared.tsx":
          "// @orb-waive surface-a11y-focus(Declared): the corpus LIST pane's omnibox takes arrival focus; this CONTENT surface mounts second and must not steal it (pinned by corpus-list-surface.ct.tsx).\nexport const Declared = () => <div>content</div>;\n",
      },
      why: "§4.2 POSITIONAL IDENTITY, and the successor to the retired `@surface-focus-elsewhere` grammar: the marker names THIS surface's exported component and carries its reason. The fixture is mustFlag[0] plus the marker line, so exactly ONE occurrence exists for the one marker to consume; the arm ends if that row changes",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/anchor.tsx":
          "export const Anchor = () => {\n  useLayoutEffect(() => { ref.current?.focus(); }, []);\n  return <div>content</div>;\n};\n",
        "packages/ui/src/primitives/pane/pane.tsx": "export const Pane = () => <div>content</div>;\n",
      },
      why: "THE ROOT FENCE, pinned with an in-population anchor beside it: the identical founding shape under `@ui` is not a feature surface and is not this policy's finding. Widen the population past `@client` and this is the only row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/anchor.tsx":
          "export const Anchor = () => {\n  useLayoutEffect(() => { ref.current?.focus(); }, []);\n  return <div>content</div>;\n};\n",
        "packages/client/src/features/app-shell/surfaces/app-shell.tsx": "export const AppShell = () => <div>content</div>;\n",
      },
      why: "THE DECLARED LIMIT, pinned: app-shell/topbar surfaces do not TRANSITION, so there is no arrival to land. Delete the `notUnder` and this is the only row that dies — which is what makes the legacy substring skip's port a measured fence rather than a copied line",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/anchor.tsx":
          "export const Anchor = () => {\n  useLayoutEffect(() => { ref.current?.focus(); }, []);\n  return <div>content</div>;\n};\n",
        "packages/client/src/features/x/surfaces/constants.tsx": 'export const PANE_TITLE = "Corpus";\n',
      },
      why: "THE DECLARED LIMIT the anchor creates, written down rather than hidden: a surfaces file that exports no COMPONENT has no authored position, and an ordinary finding with no position has no waiver door — it raises a central binding failure instead of naming a defect. The honest outcome is silence, and this row is what states it",
    },
  ],
});
