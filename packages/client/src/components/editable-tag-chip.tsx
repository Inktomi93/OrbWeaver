// A chip opens the same editor as Corpus; closed chips subscribe only to the warm library cache.
import type { TagView } from "@orb/contracts/tag";
import { Button } from "@orb/ui/button";
import { Icon, Pencil, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverClose, PopoverPopup, PopoverTitle, PopoverTrigger } from "@orb/ui/popover";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { QueryErrorState, useTRPC } from "#data";
import { CORPUS_MODE_LABELS } from "#lib";
import { selectLabel, setActiveSection, setCorpusMode } from "#state";
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
  const library = useQuery({ ...trpc.tag.listTagsWithUsage.queryOptions(), enabled: open });
  const row = library.data?.find((item) => item.id === tag.id);
  const name = row?.name ?? tag.name;
  const editTitle = `Edit tag ${name}`;
  const changeOpen = (next: boolean): void => {
    if (next) {
      setNavigating(false);
    }
    setOpen(next);
  };
  let body: ReactElement;
  if (library.isError) {
    body = (
      <QueryErrorState
        label="this tag"
        onRetry={async (): Promise<void> => {
          await library.refetch();
        }}
      />
    );
  } else if (library.data === undefined) {
    body = <Skeleton className="h-16 w-full" />;
  } else if (row === undefined) {
    body = <Text voice="gloss">This tag was deleted.</Text>;
  } else {
    body = <TagEditorBody onMerged={(): void => changeOpen(false)} key={row.id} tag={row} others={library.data.filter((item) => item.id !== row.id)} />;
  }
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
            <Button className="min-w-0 max-w-full" aria-label={editTitle} intent="ghost" size={iconOnly ? "icon-sm" : "chip"} type="button">
              {iconOnly ? (
                <Icon icon={Pencil} size="xs" />
              ) : (
                <Text as="span" className="min-w-0 truncate" voice="label">
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
          <Row className="min-w-0" align="center" justify="between" gap="field">
            <PopoverTitle className="min-w-0 truncate" title={editTitle}>
              {editTitle}
            </PopoverTitle>
            <PopoverClose
              render={
                <Button className="shrink-0" aria-label="Close tag editor" intent="ghost" size="icon-sm" onClick={(): void => changeOpen(false)} type="button">
                  <Icon icon={X} size="sm" />
                </Button>
              }
            />
          </Row>
          {body}

          <Button
            intent="secondary"
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
