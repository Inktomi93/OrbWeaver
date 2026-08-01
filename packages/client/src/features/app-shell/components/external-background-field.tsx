// The add-a-background-from-a-URL control (side-eye F-P0-2) — the client half of
// `settings.addExternalBackground`. A pasted external URL can NEVER paint (CSP `img-src` self/data/blob) and
// is never persisted as a paintable field (the BG-C invariant, `contracts/settings`: `external` stays a
// transient INPUT mode, which is exactly why `backgroundImageKind` has no `external` OPTION — selecting it
// on an AUTOSAVING form would persist the banned state). So the URL is a DISCRETE server action instead: the
// verb fetches it through the SSRF-safe egress belt, magic-verifies it is an image, stores it in the caller's
// CAS, and returns a ready `BackgroundLibraryEntry` the appearance form appends to `backgroundLibrary` — the
// `BackgroundUploadField` twin, one library, two ways in.
//
// A refusal is the verb's OWN leak-free copy (`backgroundMaterializeMessage` — unreachable / not-an-image /
// too-large, never echoing the address), so it is surfaced INLINE in the Field's error slot rather than
// flattened into a generic toast (the upload twin's posture); the mutation therefore carries no `errorToast`.

import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";

/** The verb WRITES no settings — it only materializes the asset and hands the entry back; the library row
 *  lands through the appearance autosave patch, which owns that reconciliation. So nothing to invalidate. */
const useAddExternalBackground = createEntityMutation<inferInput<Trpc["settings"]["addExternalBackground"]>, BackgroundLibraryEntry>({
  options: (trpc) => trpc.settings.addExternalBackground.mutationOptions(),
  invalidates: () => [],
});

/** The inline refusal copy — the verb's own leak-free message when it threw one, else the generic fallback
 *  (a transport/unknown failure carries no user-facing reason). `null` ⇒ no error row. */
function refusalText(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null;
  }
  return error instanceof Error ? error.message : "Couldn't add that background.";
}

export interface ExternalBackgroundFieldProps {
  /** Fired with the materialized library entry — the caller persists it (append + select) via its form. */
  readonly onAdded: (entry: BackgroundLibraryEntry) => void;
}

/** Paste → `addExternalBackground` → hand the stored `BackgroundLibraryEntry` up. In-flight the control is
 *  busy (the fetch+store round-trip is not instant); a refusal reads inline under the row. */
export function ExternalBackgroundField({ onAdded }: ExternalBackgroundFieldProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const add = useAddExternalBackground({ trpc, invalidation });
  const [url, setUrl] = useState("");
  const trimmed = url.trim();

  const submit = (): void => {
    if (trimmed === "") {
      return;
    }
    add.mutate(
      { url: trimmed },
      {
        onSuccess: (entry): void => {
          onAdded(entry);
          setUrl("");
        },
      },
    );
  };

  const error = refusalText(add.error);

  return (
    <Field
      label="Add from a web address"
      description="The image is fetched once and saved to your background library — the address itself is never used to paint."
      error={error}
      name="backgroundExternalUrl"
    >
      <Row gap="field" align="center">
        {/* No `aria-label` here: Base UI's Field wires the visible label onto the control via
            `aria-labelledby`, which BEATS `aria-label` — a second name would only be dead weight. */}
        <Input className="flex-1" disabled={add.isPending} onValueChange={setUrl} placeholder="https://…" value={url} />
        <Button disabled={trimmed === ""} intent="secondary" loading={add.isPending} onClick={submit} type="button">
          Add
        </Button>
      </Row>
    </Field>
  );
}
