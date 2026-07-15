// AssemblyPreview — the display-only assembled read-out. The toolbar's Preview toggle swaps the rack for
// this: ordered enabled sections grouped under role block headers, with spliced sections shown inside an
// inset conversation band at their depth positions. Macros render as inline Badges, never resolved. Every
// block is click-through: clicking it flips back to Compose, selects the section, and reveals the
// inspector. Derives entirely from `assemblePreview`; this component only paints.

import type { MessageRole } from "@orb/kit/message-role";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { AssembledPreview, MacroToken, PreviewBlock, RoleGroup } from "./preview-model";

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
        <Text size="micro" tone="muted">
          Nothing to preview yet — enable some sections in Compose.
        </Text>
      ) : null}
    </Stack>
  );
}

/** A stable-ish key for a role group (zone + index + role — group membership is order-stable per render). */
function groupKey(zone: string, index: number, group: RoleGroup): string {
  return `${zone}-${index}-${group.role}`;
}

/** One role block: a header + its contiguous same-role blocks. */
function RoleGroupView({
  group,
  onSelect,
}: {
  readonly group: RoleGroup;
  readonly onSelect: (sectionId: string) => void;
}): ReactElement {
  return (
    <Stack gap="field">
      <Text size="micro" tone="muted" transform="caps" weight="semibold">
        {ROLE_HEADER[group.role]}
      </Text>
      {group.blocks.map((block) => (
        <BlockView key={block.section.id} block={block} onSelect={onSelect} />
      ))}
    </Stack>
  );
}

/** The inset conversation band — the pivot horizon with the spliced sections shown at their depth. */
function ConversationBand({
  preview,
  onSelect,
}: {
  readonly preview: AssembledPreview;
  readonly onSelect: (sectionId: string) => void;
}): ReactElement {
  if (preview.missingPivot) {
    return (
      <Text size="micro" tone="warning">
        No chat history marker — the conversation has nowhere to splice in.
      </Text>
    );
  }
  return (
    <Stack gap="field" className="rounded-card border border-border bg-accent/40 p-block">
      <Row gap="row" align="center">
        <Icon icon={MessagesSquare} size="sm" />
        <Text size="body" weight="semibold" transform="caps" className="flex-1">
          Chat history
        </Text>
        {preview.historyEnabled ? null : (
          <Text size="micro" tone="muted">
            (disabled)
          </Text>
        )}
      </Row>
      {preview.splices.length === 0 ? (
        <Text size="micro" tone="muted">
          your conversation splices in here
        </Text>
      ) : (
        preview.splices.map((entry) => (
          <SpliceView
            key={entry.section.id}
            block={entry}
            depth={entry.depth}
            order={entry.order}
            onSelect={onSelect}
          />
        ))
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
function BlockView({
  block,
  onSelect,
}: {
  readonly block: PreviewBlock;
  readonly onSelect: (sectionId: string) => void;
}): ReactElement {
  return (
    <Button
      intent="ghost"
      size="sm"
      className="min-w-0 flex-1 flex-col items-start gap-field rounded-control border border-border p-row text-left"
      onClick={(): void => onSelect(block.section.id)}
    >
      <Text size="micro" tone="muted" transform="caps" weight="semibold" className="truncate">
        {block.name}
      </Text>
      <BlockBody block={block} />
    </Button>
  );
}

/** The block's body — the macro-chipped display text, the plain-marker hint, or a "sends nothing" note. */
function BlockBody({ block }: { readonly block: PreviewBlock }): ReactElement {
  if (block.plainHint !== undefined) {
    return (
      <Text size="micro" tone="muted">
        {block.plainHint}
      </Text>
    );
  }
  const tokens = block.tokens ?? [];
  if (tokens.length === 0) {
    return (
      <Text size="micro" tone="muted">
        Sends nothing.
      </Text>
    );
  }
  return <MacroText tokens={tokens} />;
}

/** Render a token run — literal prose as inline text, `{{macro}}` references as inline info Badges. A
 *  text token stays a bare string child (strings in a `ReactNode[]` need no key — only elements do). */
function MacroText({ tokens }: { readonly tokens: readonly MacroToken[] }): ReactElement {
  return (
    <Text size="micro" className="whitespace-pre-wrap break-words">
      {tokens.map(
        (token, i): ReactNode =>
          token.kind === "macro" ? (
            <Badge key={tokenKey(i, token)} intent="info" size="sm">
              {token.value}
            </Badge>
          ) : (
            token.value
          ),
      )}
    </Text>
  );
}

/** A stable-enough key for a token at a position (index + value — the token list is render-stable). */
function tokenKey(index: number, token: MacroToken): string {
  return `${index}-${token.kind}-${token.value}`;
}
