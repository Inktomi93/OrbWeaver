// The FIRST-RUN persona gate (owner-directed FUE, 2026-07-10 — the ST first-run parity: a fresh account
// must name its {{user}} persona before chatting; the landing hero's deferred "first-run persona ask"
// now lands HERE as a forced modal instead of a hero slot). An ANCHOR (it owns its Dialog — the
// surface-purity rule) the route mounts as an AppShell sibling on `/`:
//   • trigger — the viewer owns ZERO personas (`persona.list` empty). Static + self-healing: creating
//     the persona ends it forever; a returning user never sees it. Pending/error reads render nothing
//     (the gate must never block the app on a flaky read — worst case it shows next load).
//   • forced — no close affordance, `onOpenChange` ignored (Esc/outside-click can't dismiss); the ONE
//     action is Create (§4.3 rule 1: the enabled next step IS the teaching).
//   • on create — mint the persona, then seed BOTH global pointers (current #2 + default #1) via the
//     `seeds` section patch, so the rail-foot avatar + `{{user}}` resolution immediately reflect it.
// Two plain controlled fields (name required, description optional) — the login-form trivial-input
// carve-out; the full editor lives in the rail-foot panel (persona-editor.tsx), not here.

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
  // Local terminal flag — closes the gate the instant the create resolves, without waiting for the
  // bus-driven `persona.list` refetch echo.
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
    // Forced-open: the store-less controlled Dialog (the ModalHost `open` precedent); `onOpenChange` is
    // deliberately inert — the only way out is creating the persona.
    <Dialog
      open={true}
      onOpenChange={(): void => {
        // Ignored by design (the forced first-run gate — see the file header).
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
          {/* An always-visible `description`, NOT a `hint` tooltip: the Field primitive hard-labels
              every hint trigger "More info", so a form with 2+ hints ships duplicate accessible names
              (P3). One field, an always-visible note reads better anyway. */}
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
