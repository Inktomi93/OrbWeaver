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

/** Mounted on `/` (an AppShell sibling); renders nothing until the zero-personas trigger fires. */
export function FirstRunPersonaDialog(): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreatePersona({ trpc, invalidation });
  const setSeed = useSetPersonaSeed({ trpc, invalidation });
  const personasQuery = useQuery(trpc.persona.list.queryOptions());
  const personas = personasQuery.data ?? [];

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

  // The gate stays up while THIS session owns an unseeded persona: the library is no longer empty, but the
  // pointer the gate exists to write is still missing, and no other surface would ever offer to write it.
  if (done || (createdId === null && (personasQuery.data === undefined || personas.length > 0))) {
    return null;
  }

  const canSubmit = name.trim().length > 0 && !pending;
  // The verb NAMES THE REMAINING WORK. Once the persona exists, "Create persona" would offer to mint a second
  // one; what is left is the pointer the seed write failed to set.
  let submitLabel = pending ? "Creating…" : "Create persona";
  if (createdId !== null) {
    submitLabel = pending ? "Finishing…" : "Finish setting up";
  }
  const submit = async (): Promise<void> => {
    setPending(true);
    let personaId = createdId;
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
