// The shared regex-script PICKER (D121-E). Attaches/detaches LIBRARY rows to one scope — a preset, a
// character, or a room — instead of authoring a private copy of the script into that carrier's blob.
//
// This component is the whole user-visible payoff of the reshape. Before, a preset's Regex tab and a
// character's regex facet each held their OWN array of scripts: the same rule written twice ran twice, the
// character editor exposed four of the ten fields (so an in-app card script had `placement: []` and could
// never fire), and there was no way to say "this preset and that character share this one rule". Now every
// surface picks from the ONE library the settings pane authors, and the row runs exactly once per turn even
// when two scopes both claim it (the resolver dedupes on the row id, earliest tier wins).
//
// Client-shared (not `@orb/ui`): it speaks tRPC. Features cannot import each other, and BOTH the preset
// editor and the character facet editor need it — `components/` is the shared home (the
// `RegexEditorDialog` precedent).

import type { RegexPickerScope, RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PresetId, RegexScriptId } from "@orb/kit/ids";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { REGEX_PLACEMENT_LABELS } from "#lib";

// Every regex verb is `busDriven` (`regexChanged` path-invalidates the whole router), so no call site
// hand-invalidates its own attached-list read. The six factories live at the BOTTOM of this file, next to
// each other, so the three scope pairs read as one table.

export interface RegexScriptPickerProps {
  readonly scope: RegexPickerScope;
  readonly heading: string;
  readonly helperText: string;
}

/** The picker. Dispatches to the per-scope READER — three sibling components rather than one component
 *  switching a query, because the three `listFor*` procs have three distinct option types and a hook cannot
 *  be called conditionally: one component per scope keeps each read honestly typed with no cast. The switch
 *  is exhaustive, so a new scope is a compile error rather than a silently empty picker. */
export function RegexScriptPicker({ scope, heading, helperText }: RegexScriptPickerProps): ReactElement {
  switch (scope.kind) {
    case "character":
      return <CharacterScopePicker scope={scope} heading={heading} helperText={helperText} />;
    case "preset":
      return <PresetScopePicker scope={scope} heading={heading} helperText={helperText} />;
    case "chat":
      return <ChatScopePicker scope={scope} heading={heading} helperText={helperText} />;
    default:
      return assertNeverScope(scope);
  }
}

function assertNeverScope(scope: never): never {
  throw new Error(`unhandled regex picker scope: ${JSON.stringify(scope)}`);
}

function CharacterScopePicker({
  scope,
  heading,
  helperText,
}: RegexScriptPickerProps & { readonly scope: { kind: "character"; characterId: CharacterId } }): ReactElement {
  const trpc = useTRPC();
  const attached = useSuspenseQuery(trpc.regex.listForCharacter.queryOptions({ characterId: scope.characterId }));
  return <PickerBody scope={scope} heading={heading} helperText={helperText} attached={attached.data} />;
}

function PresetScopePicker({ scope, heading, helperText }: RegexScriptPickerProps & { readonly scope: { kind: "preset"; presetId: PresetId } }): ReactElement {
  const trpc = useTRPC();
  const attached = useSuspenseQuery(trpc.regex.listForPreset.queryOptions({ presetId: scope.presetId }));
  return <PickerBody scope={scope} heading={heading} helperText={helperText} attached={attached.data} />;
}

function ChatScopePicker({ scope, heading, helperText }: RegexScriptPickerProps & { readonly scope: { kind: "chat"; chatId: ChatId } }): ReactElement {
  const trpc = useTRPC();
  const attached = useSuspenseQuery(trpc.regex.listForChat.queryOptions({ chatId: scope.chatId }));
  return <PickerBody scope={scope} heading={heading} helperText={helperText} attached={attached.data} />;
}

/** The scope-blind body: the owner's whole library with a switch per row (on = attached to this scope). */
function PickerBody({ scope, heading, helperText, attached }: RegexScriptPickerProps & { readonly attached: readonly RegexScriptRow[] }): ReactElement {
  const trpc = useTRPC();
  const library = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const attachedIds = new Set(attached.map((row) => row.id));

  return (
    <Section heading={heading}>
      <Stack gap="field">
        <Text voice="gloss">{helperText}</Text>
        {library.data.length === 0 ? (
          <Text voice="gloss">You haven't written any regex scripts yet — add one in Settings → Regex, then attach it here.</Text>
        ) : (
          library.data.map((script) => <PickerRow key={script.id} scope={scope} script={script} attached={attachedIds.has(script.id)} />)
        )}
      </Stack>
    </Section>
  );
}

/** One library row + its attach switch. The subtitle names the pipeline STAGES the script bites at, in the
 *  same words the Transforms readout prints (the F-23 one-vocabulary rule), so a picked row here and a step
 *  row over there are legibly the same thing. */
function PickerRow({
  scope,
  script,
  attached,
}: {
  readonly scope: RegexPickerScope;
  readonly script: RegexScriptRow;
  readonly attached: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toggle = useToggleAttachment({ trpc, invalidation, scope });
  const name = script.name === "" ? "Unnamed script" : script.name;
  const stages = script.placement.map((placement) => REGEX_PLACEMENT_LABELS[placement].toLowerCase()).join(" · ");

  return (
    <Row gap="field" align="center" justify="between">
      <Stack gap="tight">
        <Text>{name}</Text>
        <Text voice="gloss">{script.enabled ? stages : `off · ${stages}`}</Text>
      </Stack>
      <Switch
        aria-label={`Attach ${name}`}
        checked={attached}
        onCheckedChange={(next): void => {
          void toggle(script.id, next);
        }}
      />
    </Row>
  );
}

/** The attach/detach dispatch — one call site per scope kind, returned as a single `(scriptId, next)` fn so
 *  the row does not care which junction it is writing. */
function useToggleAttachment({
  trpc,
  invalidation,
  scope,
}: {
  readonly trpc: ReturnType<typeof useTRPC>;
  readonly invalidation: ReturnType<typeof useInvalidation>;
  readonly scope: RegexPickerScope;
}): (scriptId: RegexScriptId, next: boolean) => Promise<unknown> {
  const attachCharacter = useAttachCharacter({ trpc, invalidation });
  const detachCharacter = useDetachCharacter({ trpc, invalidation });
  const attachPreset = useAttachPreset({ trpc, invalidation });
  const detachPreset = useDetachPreset({ trpc, invalidation });
  const attachChat = useAttachChat({ trpc, invalidation });
  const detachChat = useDetachChat({ trpc, invalidation });

  return (scriptId, next): Promise<unknown> => {
    switch (scope.kind) {
      case "character":
        return next
          ? attachCharacter.mutateAsync({ characterId: scope.characterId, scriptId })
          : detachCharacter.mutateAsync({ characterId: scope.characterId, scriptId });
      case "preset":
        return next ? attachPreset.mutateAsync({ presetId: scope.presetId, scriptId }) : detachPreset.mutateAsync({ presetId: scope.presetId, scriptId });
      case "chat":
        return next ? attachChat.mutateAsync({ chatId: scope.chatId, scriptId }) : detachChat.mutateAsync({ chatId: scope.chatId, scriptId });
      default:
        return assertNeverScope(scope);
    }
  };
}

const useAttachCharacter = createEntityMutation<{ readonly characterId: CharacterId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this character.",
});
const useDetachCharacter = createEntityMutation<{ readonly characterId: CharacterId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this character.",
});
const useAttachPreset = createEntityMutation<{ readonly presetId: PresetId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToPreset.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this preset.",
});
const useDetachPreset = createEntityMutation<{ readonly presetId: PresetId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromPreset.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this preset.",
});
const useAttachChat = createEntityMutation<{ readonly chatId: ChatId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this chat.",
});
const useDetachChat = createEntityMutation<{ readonly chatId: ChatId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this chat.",
});
