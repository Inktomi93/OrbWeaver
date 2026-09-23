// The readout's binding CONTROL — the chip that names what the readout
// is resolving against. Its state (and the rationale for auto-binding at all) lives in
// `hooks/use-readout-binding.ts`; this file is the one drawing of it.
//
// ONE CONTROL, TWO STATES (§16 row 33): bound → the ✕ dismisses; dismissed → the same slot renders the quiet
// re-bind chip. Requiring a section round-trip to undo one click is a trap, so the two faces are one control,
// not two homes.

import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ReadoutBinding } from "../../hooks/use-readout-binding.ts";

/** The binding chip — the readout's own header row, above the per-view panel (the mock draws it exactly
 *  there: an info-tinted bar naming the chat, with the dismiss at its trailing edge).
 *
 *  Renders NOTHING when there is no target: with no recent chat there is no binding to name and no re-bind to
 *  offer, so the panels below simply speak their unbound arm — a disabled chip claiming a chat that does not
 *  exist would be chrome. */
export function ReadoutBindingChip({ binding }: { readonly binding: ReadoutBinding }): ReactElement | null {
  if (binding.targetChatId === null) {
    return null;
  }
  if (binding.boundChatId === null) {
    return (
      <Row align="center" gap="field">
        <Button intent="ghost" onClick={binding.rebind} size="sm" type="button">
          Inspect against {binding.chatTitle}
        </Button>
      </Row>
    );
  }
  return (
    <Row align="center" className="rounded-base bg-info/10" gap="field" justify="between" padding="row">
      <Row align="baseline" className="min-w-0" gap="field">
        <Text voice="gloss">inspecting against:</Text>
        <Text className="truncate" voice="label">
          {binding.chatTitle}
        </Text>
      </Row>
      {/* The ✕ is a LABELLED control, not a decoration: its whole job is reversing a binding the user never
          asked for, so it says what it does (and why) to a reader who cannot see the glyph. */}
      <Button
        aria-label={`Dismiss the binding to ${binding.chatTitle}`}
        intent="ghost"
        onClick={binding.dismiss}
        size="icon"
        title="Dismiss — fall back to the chat-free token view"
        type="button"
      >
        <Icon icon={X} size="xs" />
      </Button>
    </Row>
  );
}
