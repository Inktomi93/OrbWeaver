// The §6.2 tags row — the accepted-tag chip strip pinned under the hero (present in both tabs). Immediate
// junction writes (§2 — tags are the tag-domain CRUD, NOT the card draft form, so they never light the
// save-bar pill). "Add tag" opens a picker Dialog (legal — a component owning its own interior Dialog, the
// character-bulk-bar precedent), attaching via `bulkAddCardTag` with this ONE character's id
// (attach-existing or create-and-attach). Each chip carries a house-grammar remove (a `Remove <name>`
// button + the `X` glyph, keyboard + coarse-pointer reachable per rule 4) → `bulkRemoveCardTag` by name.

import type { TagView } from "@orb/contracts/tag";
import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Plus, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { TagPickerDialog } from "#components";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { removeActionName } from "#lib";
import { useBulkAddCardTag, useBulkRemoveCardTag } from "../hooks/use-character-mutations.ts";
import { EMPTY_VALUE } from "../lib/empty-vocabulary.ts";

export interface CharacterTagsRowProps {
  readonly characterId: CharacterId;
  /** The accepted canonical tags on this card (`CharacterDetail.tags`; pending suggestions excluded). */
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
  readonly trpc: Trpc;
}

/** The accepted-tag chips (each removable) + an "Add tag" picker Dialog (immediate attach/detach). */
export function CharacterTagsRow({ characterId, tags, trpc }: CharacterTagsRowProps): ReactElement {
  const invalidation = useInvalidation();
  // THE ROW SAYS WHAT IT IS (side-eye 2026-08-30 rail-characters P2, #840c). Its accessible tree read
  // `paragraph: Empty` then `button "Add tag"` — the word "Tags" appeared NOWHERE, so a screen-reader user
  // met an unlabelled value and had to infer the datum from the verb beside it. The four ADVANCED facet
  // rows do this right (`button "System prompt"` naming the datum, `text: Empty` as its value); this is the
  // same grammar for a row whose name is not itself a control — a visible kicker, referenced by the group.
  const labelId = useId();
  const addTag = useBulkAddCardTag({ trpc, invalidation });
  const removeTag = useBulkRemoveCardTag({ trpc, invalidation });
  const [open, setOpen] = useState(false);
  const tagWriteInFlight = useRef(false);

  const beginTagWrite = (): boolean => {
    if (tagWriteInFlight.current) {
      return false;
    }
    tagWriteInFlight.current = true;
    return true;
  };

  const applyTag = (name: string): void => {
    if (!beginTagWrite()) {
      return;
    }
    addTag.mutate(
      { tagName: name, characterIds: [characterId] },
      {
        onSettled: (): void => {
          tagWriteInFlight.current = false;
        },
      },
    );
  };

  const visible = tags.filter((tag) => !tag.isHiddenOnCard);
  const tagWritePending = addTag.isPending || removeTag.isPending;
  return (
    <Row aria-labelledby={labelId} gap="field" align="center" className="flex-wrap" data-slot="character-tags" role="group">
      <Text id={labelId} voice="kicker">
        Tags
      </Text>
      {visible.length === 0 ? (
        // The house empty word (#502) — this row said "No tags" while the facet rows said "Add…" and the
        // CONTEXT card said "None", three vocabularies for one state inside one editor. The verb lives in
        // the "Add tag" button beside it, which is why the value can just say what is there.
        <Text voice="gloss">{EMPTY_VALUE}</Text>
      ) : (
        visible.map((tag) => (
          <Badge key={tag.id} size="sm">
            {tag.name}
            <Button
              type="button"
              size="icon"
              intent="ghost"
              aria-label={removeActionName(tag.name)}
              disabled={tagWritePending}
              onClick={(): void => {
                if (!beginTagWrite()) {
                  return;
                }
                removeTag.mutate(
                  { tagName: tag.name, characterIds: [characterId] },
                  {
                    onSettled: (): void => {
                      tagWriteInFlight.current = false;
                    },
                  },
                );
              }}
            >
              <Icon icon={X} size="xs" />
            </Button>
          </Badge>
        ))
      )}
      <Button disabled={tagWritePending} type="button" size="sm" intent="ghost" onClick={(): void => setOpen(true)}>
        <Icon icon={Plus} size="sm" />
        Add tag
      </Button>
      <TagPickerDialog
        // Every ACCEPTED tag on this card, hidden ones included: a hidden tag is still attached, and
        // offering it would be a suggestion whose only outcome is a no-op write.
        attachedNames={tags.map((tag) => tag.name)}
        confirmLabel="Apply"
        description="Attach an existing tag, or type a new one to create it."
        onOpenChange={setOpen}
        onSubmit={applyTag}
        open={open}
        title="Tag this character"
      />
    </Row>
  );
}
