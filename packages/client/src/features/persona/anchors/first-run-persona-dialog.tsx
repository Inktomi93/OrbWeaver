// The first-run persona gate: a fresh account must name its {{user}} persona before chatting. Mounted
// as an AppShell sibling on `/`. Trigger: viewer owns zero personas. Forced — no close affordance; the
// only action is Create. On create, seeds both global pointers (current + default).

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
import { useCreatePersona } from "../hooks/use-persona-mutations.ts";

/** Mounted on `/` (an AppShell sibling); renders nothing until the unseeded-viewer trigger fires. */
export function FirstRunPersonaDialog(): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreatePersona({ trpc, invalidation });
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
   *  pointers are null — i.e. exactly the orphan state, never an ordinary viewer mid-switch. */
  const orphan = unseeded ? personas[0] : undefined;

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
  // too" shape — `forms/create-autosave-entity-form.tsx` is the house precedent), never in an effect: the
  // box would otherwise paint empty for a frame over a persona that already has a name.
  if (orphan !== undefined && orphan.id !== seenOrphanId) {
    setSeenOrphanId(orphan.id);
    setName(orphan.name);
  }

  const canSubmit = (recoverable || name.trim().length > 0) && !pending;
  // The verb NAMES THE REMAINING WORK. Once the persona exists, "Create persona" would offer to mint a second
  // one; what is left is the pointer the seed write failed to set.
  let submitLabel = pending ? "Creating…" : "Create persona";
  if (recoverable) {
    submitLabel = pending ? "Finishing…" : "Finish setting up";
  }
  const submit = async (): Promise<void> => {
    setPending(true);
    // The orphan is the same recovery as `createdId`, one reload later — seed the row that exists rather
    // than minting a second one.
    let personaId = createdId ?? orphan?.id ?? null;
    if (personaId === null) {
      try {
        const created = await create.mutateAsync({
          input: { name: name.trim(), description: description.trim() },
        });
        personaId = created.id;
        setCreatedId(created.id);
      } catch {
        notify.error("Couldn't create your persona — try again.");
        setPending(false);
        return;
      }
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
