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
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, Plus, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { useBulkAddCardTag, useBulkRemoveCardTag } from "../hooks/use-character-mutations";

export interface CharacterTagsRowProps {
  readonly characterId: CharacterId;
  /** The accepted canonical tags on this card (`CharacterDetail.tags`; pending suggestions excluded). */
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
  readonly trpc: Trpc;
}

/** The accepted-tag chips (each removable) + an "Add tag" picker Dialog (immediate attach/detach). */
export function CharacterTagsRow({ characterId, tags, trpc }: CharacterTagsRowProps): ReactElement {
  const invalidation = useInvalidation();
  const addTag = useBulkAddCardTag({ trpc, invalidation });
  const removeTag = useBulkRemoveCardTag({ trpc, invalidation });
  const [open, setOpen] = useState(false);
  const [tagName, setTagName] = useState("");

  const applyTag = (): void => {
    const trimmed = tagName.trim();
    if (trimmed === "") {
      return;
    }
    addTag.mutate({ tagName: trimmed, characterIds: [characterId] });
    setOpen(false);
    setTagName("");
  };

  const visible = tags.filter((tag) => !tag.isHiddenOnCard);
  return (
    <Row gap="field" align="center" className="flex-wrap" data-slot="character-tags">
      {visible.length === 0 ? (
        <Text size="micro" tone="muted">
          No tags
        </Text>
      ) : (
        visible.map((tag) => (
          <Badge key={tag.id} size="sm">
            {tag.name}
            <Button
              type="button"
              size="icon"
              intent="ghost"
              aria-label={`Remove ${tag.name}`}
              onClick={(): void =>
                removeTag.mutate({ tagName: tag.name, characterIds: [characterId] })
              }
            >
              <Icon icon={X} size="xs" />
            </Button>
          </Badge>
        ))
      )}
      <Button type="button" size="sm" intent="ghost" onClick={(): void => setOpen(true)}>
        <Icon icon={Plus} size="sm" />
        Add tag
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>Tag this character</DialogTitle>
            <DialogDescription>
              Attach an existing tag, or type a new one to create it.
            </DialogDescription>
            <Input
              aria-label="Tag name"
              onValueChange={setTagName}
              placeholder="e.g. adventure"
              value={tagName}
            />
            <Row gap="field" justify="end">
              <DialogClose render={<Button intent="ghost">Cancel</Button>} />
              <Button disabled={tagName.trim() === ""} intent="primary" onClick={applyTag}>
                Apply
              </Button>
            </Row>
          </Stack>
        </DialogPopup>
      </Dialog>
    </Row>
  );
}
