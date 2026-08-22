// CT: the Characters CONTENT teaching hero — what it says when nothing is selected, and the one thing that
// changes about it (#446).
//
// NAMING THE LIST STILL PRESUPPOSES ONE IS ON SCREEN. The 2026-08 side-agnostic sweep fixed the SIDE ("on
// the left" is wrong in three of four pane states) but not the PRESUPPOSITION: the shell auto-collapses this
// section's docked default in the narrow-desktop band, focus mode hides both panes, and a reader can
// collapse the pane by hand — three states where "Pick someone from the list" points at nothing. The
// footnote is therefore CONDITIONALLY RENDERED off the shell's own resolved mode (`useSectionListMode`),
// never printed as an unconditional "if", and it names the topbar's control VERBATIM (WCAG 2.5.3 — a
// voice-control user says what is written).
//
// Both arms in ONE mount (`ct-mount-is-once-per-test`): the finding is that the SAME pane must say different
// things. The driver is the shell's FOCUS flag — see the story's own note for why, not `setPanelMode`.

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterLibraryWelcomeListModeStory } from "../_ct-stories.tsx";

const INSTRUCTION = /Pick someone from the list/u;
const LIST_PANEL_DOOR = /Show list panel in the top bar/u;

test("#446 the list-door footnote renders only while the Characters LIST is off screen", async ({ mount }) => {
  const welcome = await mount(<CharacterLibraryWelcomeListModeStory />);
  // The section's boot layout docks its LIST, so this is the reader who can already see it.
  await expect(welcome.getByText(INSTRUCTION)).toBeVisible();
  await expect(welcome.getByText(LIST_PANEL_DOOR)).toHaveCount(0);

  await welcome.getByRole("button", { name: "take the list off screen" }).click();
  await expect(welcome.getByText(LIST_PANEL_DOOR)).toBeVisible();
  // The instruction survives beside it — the footnote is an addition, never a replacement — and the hero
  // keeps its own primary, so the collapsed arm is not a dead end and no second door is minted for it.
  await expect(welcome.getByText(INSTRUCTION)).toBeVisible();
  await expect(welcome.getByRole("button", { name: "New", exact: true })).toBeVisible();

  await welcome.getByRole("button", { name: "put the list back" }).click();
  await expect(welcome.getByText(LIST_PANEL_DOOR)).toHaveCount(0);
});
