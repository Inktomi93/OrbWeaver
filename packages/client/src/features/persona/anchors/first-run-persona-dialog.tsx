// The first-run persona gate: an account that cannot SPEAK YET must name its {{user}} persona before
// chatting. Mounted as an AppShell sibling on `/`. Forced — no close affordance.
//
// TRIGGER: the viewer owns no persona AT ALL, or owns one that no pointer names (#1570). The second arm is
// the recovery half: `persona.create` and the `seeds` write are two round trips, so an interruption between
// them leaves a persona with `currentPersonaId`/`defaultPersonaId` both null — a viewer who owns a persona
// and cannot use it, in a state no other surface in the app offers to fix. Deriving the trigger from the
// POINTERS rather than from the row count makes that state recoverable on any device, in any later session.
//
// On the create arm: create, then seed both global pointers. On the recovery arm: save the fields if the
// reader changed them, then seed — the same dialog, so the same edits mean the same thing on both.
//
// PINNED IN TWO PLACES, AND A TRIGGER CHANGE DRIVES BOTH: `first-run-persona-dialog.ct.tsx` owns the arms;
// `tests/client/routes/app-root.ct.tsx` mounts this as an AppShell sibling in EVERY one of its journeys, so
// a viewer this gate does not stand down for blocks that whole file behind a modal (#1644 — the pointer
// trigger above landed while the route CT still seeded a persona ROW with the all-null default seeds, and
// four of its six tests timed out against the overlay for a day before anything named the file).

import type { PersonaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Textarea } from "@orb/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify, testId } from "#lib";
import { useSetPersonaSeed } from "../hooks/use-persona-identity.ts";
import { useCreatePersona, useUpdatePersona } from "../hooks/use-persona-mutations.ts";

/** The lowest id in the set — a total order BOTH ends agree on and every device computes identically, so
 *  "which persona does the gate offer to recover" never depends on the server's list ordering. That ordering
 *  is `desc(createdAt)` today, but it is a property of that query rather than part of the read's contract,
 *  and the projected row carries no timestamp for the client to sort by (`persona/persistence/queries.ts`) —
 *  so taking `personas[0]` would be choosing by an ordering this side cannot see and the server is free to
 *  change. Determinism is the load-bearing half: the same library must always offer the same persona. */
function oldestByIdOf<TRow extends { readonly id: PersonaId }>(rows: readonly TRow[]): TRow | undefined {
  return rows.reduce<TRow | undefined>((lowest, row) => (lowest === undefined || row.id < lowest.id ? row : lowest), undefined);
}

/** Mounted on `/` (an AppShell sibling); renders nothing until the unseeded-viewer trigger fires. */
export function FirstRunPersonaDialog(): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreatePersona({ trpc, invalidation });
  const update = useUpdatePersona({ trpc, invalidation });
  const setSeed = useSetPersonaSeed({ trpc, invalidation });
  const personasQuery = useQuery(trpc.persona.list.queryOptions());
  const personas = personasQuery.data ?? [];
  // THE TRIGGER IS "CAN THIS VIEWER SPEAK", NOT "DOES A ROW EXIST" (#1570). A create-succeeds / seed-fails
  // run leaves a persona with NO pointer, and the in-session `createdId` below cannot survive a reload — so
  // before this the orphan was permanent: the gate saw a non-empty library and stood down, and no other
  // surface in the app offers to write `currentPersonaId`. The pointer is server state, so the recovery is
  // re-derived from the server rather than stashed on the device: it heals an orphan made in ANY session, on
  // any device, by any interruption. `getUserSettings` is the same cache-first read the shell already holds.
  const settingsQuery = useQuery(trpc.settings.getUserSettings.queryOptions());
  const seeds = settingsQuery.data?.config.seeds;
  const unseeded = seeds !== undefined && seeds.currentPersonaId === null && seeds.defaultPersonaId === null;
  /** The persona this viewer OWNS but cannot speak as. Only ever set when the library is non-empty and both
   *  pointers are null — i.e. exactly the orphan state, never an ordinary viewer mid-switch.
   *
   *  PICKED DETERMINISTICALLY BY ID, not by list position. `persona.list` is ordered `desc(createdAt)`
   *  SERVER-side, which is a detail of that query rather than part of the read's contract, and the row it
   *  returns carries no timestamp — so a client that took `personas[0]` would be choosing by an ordering it
   *  cannot see and the server is free to change. The id is the one total order both ends agree on and every
   *  device computes identically, so the same library always offers the same persona to recover. */
  const orphan = unseeded ? oldestByIdOf(personas) : undefined;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  // Closes the gate the instant BOTH writes resolve, without waiting for the bus-driven refetch echo.
  const [done, setDone] = useState(false);
  // THE PERSONA THIS SESSION ALREADY CREATED (#1501). Create and seed were awaited under ONE generic catch,
  // so a create-succeeds / seed-fails run left an orphan persona with no `currentPersonaId` pointer, told the
  // reader to "try again" — which would have minted a SECOND persona — and then unmounted the gate anyway the
  // moment `persona.list` echoed a non-empty library. Holding the id makes the retry retry the half that
  // failed, and holding the gate open makes the retry reachable at all.
  const [createdId, setCreatedId] = useState<PersonaId | null>(null);
  /** The orphan whose name has already been adopted into the box — so the adopt runs once per orphan and a
   *  reader editing the name is never overwritten by a re-render. */
  const [seenOrphanId, setSeenOrphanId] = useState<PersonaId | null>(null);

  // The gate stays up while the viewer cannot speak: an empty library (the first-run case), an unseeded
  // ORPHAN (this session's or an earlier one's), or a persona this session just created and has not seeded.
  // Both reads must have SETTLED first — a gate that flashes over a viewer who is perfectly set up is the
  // opposite of what it is for.
  const recoverable = createdId !== null || orphan !== undefined;
  if (done || personasQuery.data === undefined || settingsQuery.data === undefined || (personas.length > 0 && !recoverable)) {
    return null;
  }

  // Adjusted during RENDER (the React-documented "a prop/read changed and state derived from it must change
  // too" shape — `forms/editor/create-autosave-entity-form.tsx` is the house precedent), never in an effect: the
  // box would otherwise paint empty for a frame over a persona that already has a name.
  if (orphan !== undefined && orphan.id !== seenOrphanId) {
    setSeenOrphanId(orphan.id);
    setName(orphan.name);
    // BOTH fields, because both are editable and both are shown. An empty Description box over a persona
    // that has one is the same lie as an empty Name box would be — `PersonaView.description` is required,
    // so there is always a real value to show.
    setDescription(orphan.description);
  }

  // ONE RULE ON BOTH ARMS: a persona needs a name, and the box is editable on both, so the same predicate
  // governs both. (It used to wave the recovery arm through on an empty name — which, with the write below,
  // would have let a reader blank their own name.)
  const canSubmit = name.trim().length > 0 && !pending;
  // The verb NAMES THE REMAINING WORK. Once the persona exists, "Create persona" would offer to mint a second
  // one; what is left is the pointer the seed write failed to set.
  let submitLabel = pending ? "Creating…" : "Create persona";
  if (recoverable) {
    submitLabel = pending ? "Finishing…" : "Finish setting up";
  }
  /**
   * THE FIELDS ARE WRITTEN ON THE RECOVERY ARM TOO. They are editable and pre-filled there, so a reader who
   * fixes the name they typed before the interruption — or clears a description — must see that stick;
   * going straight to `setSeed` would have kept the old values with no error, which is exactly the "state
   * that lies" class this gate was reopened for. Skipped when nothing changed, so the ordinary recovery is
   * still two round trips rather than three. Returns whether the submit may continue.
   */
  const saveOrphanEdits = async (): Promise<boolean> => {
    if (orphan === undefined || createdId !== null) {
      return true;
    }
    if (name.trim() === orphan.name && description.trim() === orphan.description) {
      return true;
    }
    try {
      await update.mutateAsync({ personaId: orphan.id, input: { name: name.trim(), description: description.trim() } });
      return true;
    } catch {
      notify.error("Couldn't save your persona — try again.");
      return false;
    }
  };

  /** Mint the persona this viewer does not have yet. `null` ⇒ the create failed and it has been reported. */
  const createPersona = async (): Promise<PersonaId | null> => {
    try {
      const created = await create.mutateAsync({ input: { name: name.trim(), description: description.trim() } });
      setCreatedId(created.id);
      return created.id;
    } catch {
      notify.error("Couldn't create your persona — try again.");
      return null;
    }
  };

  const submit = async (): Promise<void> => {
    setPending(true);
    if (!(await saveOrphanEdits())) {
      setPending(false);
      return;
    }
    // The orphan is the same recovery as `createdId`, one reload later — seed the row that exists rather
    // than minting a second one.
    const personaId = createdId ?? orphan?.id ?? (await createPersona());
    if (personaId === null) {
      setPending(false);
      return;
    }
    try {
      await setSeed.mutateAsync({
        section: "seeds",
        patch: { currentPersonaId: personaId, defaultPersonaId: personaId },
      });
    } catch {
      // NAMED HONESTLY: the persona exists. "Couldn't create your persona" over a persona that WAS created is
      // the lie that sent the reader back to a Create button.
      notify.error("Created your persona, but couldn't make it yours yet — try again.");
      setPending(false);
      return;
    }
    setDone(true);
  };

  return (
    // Forced-open: onOpenChange is deliberately inert, the only way out is creating the persona.
    <FormDialog
      description="Chats speak to you through a persona — the name (and optional description) characters see as you. Create yours to get started; you can refine it any time from the avatar at the rail's foot."
      onOpenChange={(): void => {
        // Ignored by design.
      }}
      open={true}
      testKey="firstRunPersonaDialog"
      title="Who are you in the story?"
    >
      <Field label="Name">
        <Input autoComplete="off" value={name} onValueChange={(value): void => setName(value)} data-testid={testId("firstRunPersonaName")} />
      </Field>
      {/* An always-visible description, not a hint tooltip: 2+ hints would duplicate accessible names. */}
      <Field label="Description" description="Optional — how characters should picture you.">
        <Textarea value={description} onChange={(event): void => setDescription(event.target.value)} />
      </Field>
      <Button intent="primary" disabled={!canSubmit} data-testid={testId("firstRunPersonaCreate")} onClick={(): void => void submit()}>
        {submitLabel}
      </Button>
    </FormDialog>
  );
}
