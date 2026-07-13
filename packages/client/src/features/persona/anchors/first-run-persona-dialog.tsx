// The first-run persona gate: a fresh account must name its {{user}} persona before chatting. Mounted
// as an AppShell sibling on `/`. Trigger: viewer owns zero personas. Forced — no close affordance; the
// only action is Create. On create, seeds both global pointers (current + default).

import { Button } from "@orb/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { notify, testId } from "#lib";
import { useSetPersonaSeed } from "../hooks/use-persona-identity";
import { useCreatePersona } from "../hooks/use-persona-mutations";

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
  // Closes the gate the instant create resolves, without waiting for the bus-driven refetch echo.
  const [done, setDone] = useState(false);

  if (done || personasQuery.data === undefined || personas.length > 0) {
    return null;
  }

  const canSubmit = name.trim().length > 0 && !pending;
  const submit = async (): Promise<void> => {
    setPending(true);
    try {
      const created = await create.mutateAsync({
        input: { name: name.trim(), description: description.trim() },
      });
      await setSeed.mutateAsync({
        section: "seeds",
        patch: { currentPersonaId: created.id, defaultPersonaId: created.id },
      });
      setDone(true);
    } catch {
      notify.error("Couldn't create your persona — try again.");
      setPending(false);
    }
  };

  return (
    // Forced-open: onOpenChange is deliberately inert, the only way out is creating the persona.
    <Dialog
      open={true}
      onOpenChange={(): void => {
        // Ignored by design.
      }}
    >
      <DialogPopup data-testid={testId("firstRunPersonaDialog")}>
        <Stack gap="block">
          <DialogTitle>Who are you in the story?</DialogTitle>
          <DialogDescription>
            Chats speak to you through a persona — the name (and optional description) characters
            see as you. Create yours to get started; you can refine it any time from the avatar at
            the rail's foot.
          </DialogDescription>
          <Field label="Name">
            <Input
              autoComplete="off"
              value={name}
              onValueChange={(value): void => setName(value)}
              data-testid={testId("firstRunPersonaName")}
            />
          </Field>
          {/* An always-visible description, not a hint tooltip: 2+ hints would duplicate accessible names. */}
          <Field label="Description" description="Optional — how characters should picture you.">
            <Textarea
              value={description}
              onChange={(event): void => setDescription(event.target.value)}
            />
          </Field>
          <Button
            intent="primary"
            disabled={!canSubmit}
            data-testid={testId("firstRunPersonaCreate")}
            onClick={(): void => void submit()}
          >
            {pending ? "Creating…" : "Create persona"}
          </Button>
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}
