import {
  cancelEditingMessage,
  enterSelectionMode,
  exitSelectionMode,
  presetSectionSelection,
  pushFiredSteer,
  selectPreset,
  selectPresetFromList,
  selectPresetSection,
  setMessageEditDraft,
  setOpenOverlayPanel,
  startEditingMessage,
  toggleMessageSelected,
  useIsEditingMessage,
  useIsMessageSelected,
  useMessageEditDraftText,
  useMessageEditReservedBlockSize,
  useMessageEditReservedInlineSize,
  useOpenOverlayPanel,
  useRecentSteers,
  useSelectedCount,
  useSelectedPresetId,
  useSelectedPresetSectionId,
  useSelectionActive,
} from "@orb/client/state";
import type { MessageId, PresetId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function DraftRead({ id }: { readonly id: MessageId }): ReactElement {
  const editing = useIsEditingMessage(id);
  const text = useMessageEditDraftText(id);
  const inline = useMessageEditReservedInlineSize(id);
  const block = useMessageEditReservedBlockSize(id);
  return <output aria-label={id}>{JSON.stringify({ editing, text, inline, block })}</output>;
}

function DraftActions({ first, second }: { readonly first: MessageId; readonly second: MessageId }): ReactElement {
  const [visible, setVisible] = useState(true);
  return (
    <Stack>
      {visible ? <DraftRead id={first} /> : null}
      <DraftRead id={second} />
      <Button onClick={(): void => startEditingMessage(first, "Original", 320, 160)}>Edit first</Button>
      <Button onClick={(): void => startEditingMessage(second, "Other")}>Edit second</Button>
      <Button onClick={(): void => setMessageEditDraft(first, "Changed")}>Change first</Button>
      <Button onClick={(): void => setMessageEditDraft(first, "")}>Empty first</Button>
      <Button onClick={(): void => cancelEditingMessage(first)}>Cancel first</Button>
      <Button onClick={(): void => setVisible((value) => !value)}>Toggle first observer</Button>
    </Stack>
  );
}

/** Observe real draft hooks across reader unmount without replacing the store or its factory. */
export function MessageDraftStory(props: { readonly first: MessageId; readonly second: MessageId }): ReactElement {
  return (
    <CtClientProviders>
      <DraftActions {...props} />
    </CtClientProviders>
  );
}

function SelectionActions({ first, second }: { readonly first: MessageId; readonly second: MessageId }): ReactElement {
  const active = useSelectionActive();
  const count = useSelectedCount();
  const firstSelected = useIsMessageSelected(first);
  const secondSelected = useIsMessageSelected(second);
  return (
    <Stack>
      <output>{JSON.stringify({ active, count, firstSelected, secondSelected })}</output>
      <Button onClick={enterSelectionMode}>Enter selection</Button>
      <Button onClick={exitSelectionMode}>Exit selection</Button>
      <Button onClick={(): void => toggleMessageSelected(first)}>Toggle first</Button>
      <Button onClick={(): void => toggleMessageSelected(second)}>Toggle second</Button>
    </Stack>
  );
}

export function MessageSelectionStory(props: { readonly first: MessageId; readonly second: MessageId }): ReactElement {
  return (
    <CtClientProviders>
      <SelectionActions {...props} />
    </CtClientProviders>
  );
}

function PresetActions({ first, second }: { readonly first: PresetId; readonly second: PresetId }): ReactElement {
  const selected = useSelectedPresetId();
  const section = useSelectedPresetSectionId();
  const overlay = useOpenOverlayPanel();
  return (
    <Stack>
      <output>{JSON.stringify({ selected, section, overlay })}</output>
      <Button onClick={(): void => selectPreset(first)}>Select first preset</Button>
      <Button onClick={(): void => selectPresetSection("main")}>Select section</Button>
      <Button onClick={(): void => setOpenOverlayPanel("list")}>Open list overlay</Button>
      <Button onClick={(): void => selectPresetFromList(second)}>Select second from list</Button>
      <Button onClick={presetSectionSelection.clear}>Back through section</Button>
    </Stack>
  );
}

export function PresetSelectionStory(props: { readonly first: PresetId; readonly second: PresetId }): ReactElement {
  return (
    <CtClientProviders>
      <PresetActions {...props} />
    </CtClientProviders>
  );
}

function SteerActions(): ReactElement {
  const steers = useRecentSteers();
  return (
    <Stack>
      <output>{JSON.stringify(steers)}</output>
      <Button onClick={(): void => pushFiredSteer("  First steer  ")}>Fire first</Button>
      <Button onClick={(): void => pushFiredSteer("Second steer")}>Fire second</Button>
      <Button onClick={(): void => pushFiredSteer(" \n\t ")}>Fire blank</Button>
    </Stack>
  );
}

export function SteerRecoveryStory(): ReactElement {
  return (
    <CtClientProviders>
      <SteerActions />
    </CtClientProviders>
  );
}
