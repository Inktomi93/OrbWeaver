// AssemblyPreview — the display-only assembled read-out. The toolbar's Preview toggle swaps the rack for
// this: ordered enabled sections grouped under role block headers, with spliced sections shown inside an
// inset conversation band at their depth positions. Every block is click-through: clicking it flips back to
// Compose, selects the section, and reveals the inspector. Derives entirely from `assemblePreview`; this
// component only paints.
//
// MACROS PRINT THEIR BRACES, in the shared `../macro-text` chip (side-eye F-1, 2026-08-03). This file used
// to render the token's BARE name, which made the preview lie about the one thing it exists to show: the
// starter Main prompt read `You are char in an immersive, ongoing roleplay with user.` — broken English in
// which `char` is indistinguishable from a word, and the templated carriers read as the bare snake_case
// keys `description` / `personality` / `guided_instruction`. Nothing here resolves a macro; the run is the
// kit tokenizer's, and the chip is the same one the Actions readout ships.

import type { MessageRole } from "@orb/kit/message-role";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { MacroText } from "../macro-text.tsx";
import type { AssembledPreview, PreviewBlock, RoleGroup } from "./preview-model.ts";

/** The role → header label map (the block-header voice above a run of same-role sections). */
const ROLE_HEADER: Record<MessageRole, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};

export interface AssemblyPreviewProps {
  readonly preview: AssembledPreview;
  /** Click-through: flip to Compose + select this section + reveal the inspector (the caller wires it). */
  readonly onSelectBlock: (sectionId: string) => void;
}

/** The assembled read-out: setup role-groups → the conversation band (with splices) → post role-groups. */
export function AssemblyPreview({ preview, onSelectBlock }: AssemblyPreviewProps): ReactElement {
  return (
    <Stack gap="block">
      {preview.setup.map((group, i) => (
        <RoleGroupView key={groupKey("setup", i, group)} group={group} onSelect={onSelectBlock} />
      ))}

      <ConversationBand preview={preview} onSelect={onSelectBlock} />

      {preview.post.map((group, i) => (
        <RoleGroupView key={groupKey("post", i, group)} group={group} onSelect={onSelectBlock} />
      ))}

      {preview.setup.length === 0 && preview.post.length === 0 && preview.splices.length === 0 ? (
        <Text voice="gloss">Nothing to preview yet — enable some sections in Compose.</Text>
      ) : null}
    </Stack>
  );
}

/** A stable-ish key for a role group (zone + index + role — group membership is order-stable per render). */
function groupKey(zone: string, index: number, group: RoleGroup): string {
  return `${zone}-${index}-${group.role}`;
}

/** One role block: a header + its contiguous same-role blocks. */
function RoleGroupView({ group, onSelect }: { readonly group: RoleGroup; readonly onSelect: (sectionId: string) => void }): ReactElement {
  return (
    <Stack gap="field">
      <Text voice="kicker">{ROLE_HEADER[group.role]}</Text>
      {group.blocks.map((block) => (
        <BlockView key={block.section.id} block={block} onSelect={onSelect} />
      ))}
    </Stack>
  );
}

/** The inset conversation band — the pivot horizon with the spliced sections shown at their depth. */
function ConversationBand({ preview, onSelect }: { readonly preview: AssembledPreview; readonly onSelect: (sectionId: string) => void }): ReactElement {
  if (preview.missingPivot) {
    return (
      <Text size="micro" tone="warning">
        No chat history marker — the conversation has nowhere to splice in.
      </Text>
    );
  }
  return (
    <Stack gap="field" className="rounded-base border border-border bg-muted p-block">
      <Row gap="row" align="center">
        <Icon icon={MessagesSquare} size="sm" />
        <Text size="body" weight="semibold" transform="caps" className="flex-1">
          Chat history
        </Text>
        {preview.historyEnabled ? null : <Text voice="gloss">(disabled)</Text>}
      </Row>
      {preview.splices.length === 0 ? (
        <Text voice="gloss">your conversation splices in here</Text>
      ) : (
        preview.splices.map((entry) => <SpliceView key={entry.section.id} block={entry} depth={entry.depth} order={entry.order} onSelect={onSelect} />)
      )}
    </Stack>
  );
}

/** A spliced block inside the band — carries its depth·order cue in front of the block body. */
function SpliceView({
  block,
  depth,
  order,
  onSelect,
}: {
  readonly block: PreviewBlock;
  readonly depth: number;
  readonly order: number;
  readonly onSelect: (sectionId: string) => void;
}): ReactElement {
  return (
    <Row gap="field" align="center">
      <Badge intent="info" size="sm">
        @{depth}·{order}
      </Badge>
      <BlockView block={block} onSelect={onSelect} />
    </Row>
  );
}

/** One preview block — a click-through ghost Button of its name + macro-chipped display text. */
function BlockView({ block, onSelect }: { readonly block: PreviewBlock; readonly onSelect: (sectionId: string) => void }): ReactElement {
  return (
    <Button
      intent="ghost"
      size="sm"
      className="min-w-0 flex-1 flex-col items-start gap-field rounded-control border border-border p-row text-left"
      onClick={(): void => onSelect(block.section.id)}
    >
      <Text voice="kicker" className="truncate">
        {block.name}
      </Text>
      <BlockBody block={block} />
      {/* THE MODE CUE (side-eye 2026-08-08 P2). The body above is the default the preview can print — for
          `main_prompt` that is the PER-SPEAKER framing, and a narrator round resolves a different one
          (`assembly/assemble.ts` templateFor). Without a word here the read-out silently claims to be the
          whole story. It is a POINTER, not the explanation: `MarkerCopy.templateNote` stays the one home for
          what actually changes, in the drill-in this very block clicks through to. */}
      {block.cue === undefined ? null : <Text voice="gloss">{block.cue}</Text>}
    </Button>
  );
}

/** The block's body — the macro-chipped display text, the plain-marker hint, or a "sends nothing" note. */
function BlockBody({ block }: { readonly block: PreviewBlock }): ReactElement {
  if (block.plainHint !== undefined) {
    return <Text voice="gloss">{block.plainHint}</Text>;
  }
  const tokens = block.tokens ?? [];
  if (tokens.length === 0) {
    return <Text voice="gloss">Sends nothing.</Text>;
  }
  // `frame="bare"` — the block button already IS the box (`rounded-control border`); the quoted frame here
  // would be the box-in-box CD2 defect.
  return <MacroText frame="bare" tokens={tokens} />;
}
