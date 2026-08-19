// THE ROOM'S ONE TRACK (#213). Every element in a chat room's vertical stack — the transcript rows, the
// composer and its attachment/slash strips, and the above-composer band — resolves its horizontal box
// through THIS string, so the room has exactly one answer to "where is the middle".
//
// It used to be spelled per element, and the three spellings disagreed: the bubble-family row outers
// carried `mx-auto max-w-(--width-shell-content)`, the composer carried the same string independently,
// and flat/hush/document carried a bare `w-full` — so the transcript hard-left-anchored while the composer
// centred. Measured on the owner's own room (reports/design/chats-delta-2026-08-18.md §pane-states): the
// two boxes' centres sat 107px apart at the default pane state, 68px at list-collapsed, 260px at full
// width, and agreed only at the one state where the pane happened to be narrower than the cap. The
// composer visibly slid sideways on every context-panel toggle. Mobile was clean at every state (the
// panels are full-screen views there, not tracks), which is why the defect only ever showed on desktop.
//
// `--width-shell-content` is the user's `chatWidthPct` dial (app-shell.tsx stamps it as a clamp against
// the viewport); `w-full` + `mx-auto` is what makes the box centre in whatever pane the shell hands it.
// The READING MEASURE is a different concern and stays where it lives (globals.css, on the content
// column) — the track owns PLACEMENT, the measure owns LINE LENGTH (the #97 ratification, untouched).
export const CHAT_TRACK = "mx-auto w-full max-w-(--width-shell-content)";
