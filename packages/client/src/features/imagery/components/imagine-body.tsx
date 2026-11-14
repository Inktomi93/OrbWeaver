// The `imagine` modal's notices. The modal's commit, which lays them out and owns their state, is
// `hooks/use-imagine-commit.tsx`.

import { MIN_IMAGE_COUNT } from "@orb/contracts/imagery";
import { Row, Stack } from "@orb/ui/layout";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ROOM_PICTURES_NOTE, useElapsedSeconds } from "#lib";

/** The shared-room sentence D300 owes the person about to spend: where the picture lands and whose it is. */
export function RoomPicturesNote({ shared }: { readonly shared: boolean }): ReactElement | null {
  return shared ? (
    <Text cap="prose" data-slot="imagine-room-pictures-note" voice="gloss">
      {ROOM_PICTURES_NOTE}
    </Text>
  ) : null;
}

export function DoubleSpendNotice({ blind, count }: { readonly blind: boolean; readonly count: number }): ReactElement | null {
  return blind ? (
    <Text cap="prose" data-slot="imagine-double-spend" voice="reading">
      Generate now and this mode charges TWICE: one call to read the chat into a prompt, then {count > MIN_IMAGE_COUNT ? "the images" : "the image itself"}.
    </Text>
  ) : null;
}

export function GeneratingNotice({ pending }: { readonly pending: boolean }): ReactElement | null {
  return pending ? (
    <Stack data-slot="imagine-generating" gap="tight">
      <PendingLine label="Generating the image" verb="Generating the image…" />
      <Text cap="prose" voice="reading">
        Usually 5-60 seconds. You can close this. The image posts into the chat when it's ready.
      </Text>
    </Stack>
  ) : null;
}

/**
 * A live "…N s" line for one in-flight spend. MOUNT-SCOPED BY DESIGN: the caller renders it only while the
 * call is pending, so the counter starts at zero because the component is new — there is no reset arm, and
 * therefore no `setState` inside an effect adjusting state when a prop changed (which the react-hooks lint
 * refuses, correctly, as `react-hooks/set-state-in-effect`: it is a cascading render). A tick counter, never a wall-clock read in render scope
 * (the `reasoning-block` precedent).
 */
export function PendingLine({ label, verb }: { readonly label: string; readonly verb: string }): ReactElement {
  const seconds = useElapsedSeconds(true);
  return (
    <Row align="center" gap="field">
      <WebSpinner label={label} size="sm" />
      <Text as="span" voice="reading">
        {verb} {seconds}s
      </Text>
    </Row>
  );
}
