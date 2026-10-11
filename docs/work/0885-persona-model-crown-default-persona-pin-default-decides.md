---
kind: work
status: doing
updated: 2026-10-11
priority: P1
area: client
lane: wt/agent-af25b71bb99b197b8
---

# Persona model: crown default, persona pin, default decides new chats

## What

Rebuild the persona switcher and seed chain on the owner-ruled model: crown marks the default, the pin marks the room anchor (card {{user}}), a switch moves only the seat and last played, the default outranks last played for new chats and joins, the Everywhere/This chat picker goes, the switcher shows the description read-only, and the anchor gains a resolves flag, handoff keeps it, and persona deletes re-seat and repoint.

## Why

Owner: pin and default are different concepts and need separate glyphs; the default is dead today because current outranks it; SillyTavern returns to the default on a new chat; stickler review recommended twelve changes, all ruled yes.

## Done when

New chat resolves explicit, connected (exactly one), default, last played; joins resolve default then last played; switches write seat and last played only; crown toggles default with no undo toast; pin toggles the anchor for the host and is greyed state for members; host dropdown pins any present enabled player's persona; ChatDetail carries an anchor-resolves flag and the room shows a warning when the pinned player left or is disabled; handoff keeps an anchor whose owner is still present; deleting the default repoints to last played and notifies; deleting a seated persona re-seats with the default; outside a chat rows are not switches and the head reads who new chats start as; notice only when something other than the default decided; link glyph is state only; persona-resolution suite stays byte-untouched and green; an ADR records the new chain; wiki pages updated; verifier and side-eye confirm.

## Evidence

Filled at landing: what ran and where its output is.
