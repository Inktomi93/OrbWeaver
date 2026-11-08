// A chip opens the same editor as Corpus; closed chips subscribe only to the warm library cache.
import type { TagView } from "@orb/contracts/tag";
import { Button } from "@orb/ui/button";
import { Icon, Pencil, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverClose, PopoverPopup, PopoverTitle, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import { CORPUS_MODE_LABELS } from "#lib";
import { selectLabel, setActiveSection, setCorpusMode } from "#state";
import { QueryBoundary } from "./query-boundary.tsx";
import { editTagName, TAG_EDITOR_CLOSE_NAME } from "./shared-control-names.ts";
import { TagEditorBody } from "./tag-editor-body.tsx";

export function EditableTagChip({
  tag,
  iconOnly = false,
  trigger,
  onManage,
}: {
  readonly tag: Pick<TagView, "id" | "name">;
  readonly iconOnly?: boolean;
  readonly trigger?: (edit: () => void) => ReactElement;
  readonly onManage?: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  // Value read only (the trigger name); the popup's own read suspends in TagChipBody under the boundary.
  const library = useQuery({ ...trpc.tag.listTagsWithUsage.queryOptions(), enabled: open });
  const row = library.data?.find((item) => item.id === tag.id);
  const name = row?.name ?? tag.name;
  const editTitle = editTagName(name);
  const changeOpen = (next: boolean): void => {
    if (next) {
      setNavigating(false);
    }
    setOpen(next);
  };
  return (
    <Popover
      modal={true}
      open={open}
      triggerId={triggerId}
      onOpenChange={(next, details): void => {
        if (trigger === undefined || details.reason !== "trigger-press") {
          changeOpen(next);
        }
      }}
    >
      <PopoverTrigger
        id={triggerId}
        ref={triggerRef}
        render={
          trigger === undefined ? (
            <Button
              className="min-inline-0"
              cap="fit"
              aria-label={editTitle}
              variant="ghost"
              size={iconOnly ? "sm" : "chip"}
              square={iconOnly}
              touchFloor="inline"
              type="button"
            >
              {iconOnly ? (
                <Icon icon={Pencil} size="xs" />
              ) : (
                <Text ink="inherit" as="span" truncate={true} voice="label">
                  {name}
                </Text>
              )}
            </Button>
          ) : (
            trigger((): void => changeOpen(true))
          )
        }
      />
      <PopoverPopup aria-label={editTitle} finalFocus={navigating ? false : triggerRef} width="stable">
        <Stack gap="block">
          <Row className="min-inline-0" align="center" justify="between" gap="field">
            <PopoverTitle className="truncate">{editTitle}</PopoverTitle>
            <PopoverClose
              render={
                <Button
                  className="shrink-0"
                  aria-label={TAG_EDITOR_CLOSE_NAME}
                  variant="ghost"
                  size="sm"
                  square={true}
                  onClick={(): void => changeOpen(false)}
                  type="button"
                >
                  <Icon icon={X} size="sm" />
                </Button>
              }
            />
          </Row>
          {open ? (
            <QueryBoundary
              resetKeys={[tag.id]}
              fallback={<SkeletonRows count={1} />}
              renderError={(_error, retry): ReactElement => <QueryErrorState label="this tag" onRetry={retry} />}
            >
              <TagChipBody tagId={tag.id} onMerged={(): void => changeOpen(false)} />
            </QueryBoundary>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={(): void => {
              setNavigating(true);
              changeOpen(false);
              onManage?.();
              setCorpusMode("labels");
              selectLabel(tag.id);
              setActiveSection("corpus");
            }}
          >
            {`Manage in ${CORPUS_MODE_LABELS.labels}`}
          </Button>
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}

function TagChipBody({ tagId, onMerged }: { readonly tagId: TagView["id"]; readonly onMerged: () => void }): ReactElement {
  const trpc = useTRPC();
  const { data: library } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const row = library.find((item) => item.id === tagId);
  if (row === undefined) {
    return <Text voice="gloss">This tag was deleted.</Text>;
  }
  return <TagEditorBody onMerged={onMerged} key={row.id} tag={row} others={library.filter((item) => item.id !== row.id)} />;
}
