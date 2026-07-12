// GalleryGifSearchPanel (G7, D61) — the "Search GIFs" mode of the character-gallery add-picker. A search box
// → a Tenor results grid → one-click import into THIS character's gallery. Rendered inside the add-picker
// Dialog (character-gallery-dialog.tsx); split out to keep that anchor under the component-size cap.
//
// Security: the client only shows previews + fires the import. The server (`hub.searchGifs`/`hub.importGif`)
// resolves the caller's gif-search key, re-validates the URL host against the Tenor allowlist, and
// magic-validates the bytes before storing. The preview <img> loads are external Tenor CDN URLs — allowed by
// the D61 `img-src` CSP entry, an owner-action load in an owner-only picker (outside D44's forbidExternalMedia).

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the chat-options-menu.tsx precedent).
import { Icon, Images, Search } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { MediaGridItem } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useImportGif } from "../hooks/use-character-gallery";

/** Results per gif search page — the wire clamps to 50; a single page of 24 fills the picker grid. */
const GIF_SEARCH_LIMIT = 24;

type GifHit = inferOutput<Trpc["hub"]["searchGifs"]>["hits"][number];

function toGifGridItem(hit: GifHit): MediaGridItem {
  return {
    id: hit.id,
    url: hit.fullUrl,
    thumbUrl: hit.previewUrl,
    animated: true, // every Tenor result is an animated gif
    alt: "Gif search result",
  };
}

/** A transient in-panel hint (NOT an EmptyState — the search box IS the always-present next action, so a
 *  mandatory CTA would be redundant; this is a lightweight muted status, token-composed). */
function GifHint({
  icon,
  title,
  detail,
}: {
  readonly icon: ReactElement;
  readonly title: string;
  readonly detail: string;
}): ReactElement {
  return (
    // aria-live: the body swaps blank→searching→results/error as the query resolves; announce the
    // status transitions to screen readers (the grid itself carries its own label, not this region).
    <Stack gap="row" align="center" padding="block" aria-live="polite">
      {icon}
      <Text tone="muted">{title}</Text>
      <Text size="micro" tone="muted">
        {detail}
      </Text>
    </Stack>
  );
}

export interface GalleryGifSearchPanelProps {
  readonly characterId: CharacterId;
}

/** The gif-search mode body: search box → results grid → one-click import. */
export function GalleryGifSearchPanel({ characterId }: GalleryGifSearchPanelProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const importGif = useImportGif({ trpc, invalidation });
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const results = useQuery(
    trpc.hub.searchGifs.queryOptions(
      { query, limit: GIF_SEARCH_LIMIT },
      // retry:false — a "no gif-search credential" miss is a deterministic 412 config error, not a
      // transient failure; retrying it (default 3× exponential backoff) only strands the panel on a
      // blank body for ~4s before the error state resolves. Fail straight to the "unavailable" hint.
      { enabled: query.trim().length > 0, retry: false },
    ),
  );

  const hits = results.data?.hits ?? [];
  // Look the hit up by id → its full URL (MediaGridItem.url is optional; the import target must be a string).
  const importHit = (activated: MediaGridItem): void => {
    const hit = hits.find((h) => h.id === activated.id);
    if (hit !== undefined) {
      importGif.mutate({ url: hit.fullUrl, subjectCharacterId: characterId });
    }
  };

  let body: ReactElement;
  if (query.trim().length === 0) {
    body = (
      <GifHint
        icon={<Icon icon={Search} size="lg" />}
        title="Search for a gif"
        detail="Type a search above, then pick a gif to add it to the gallery."
      />
    );
  } else if (results.isError) {
    body = (
      <GifHint
        icon={<Icon icon={Images} size="lg" />}
        title="Gif search unavailable"
        detail="Gif search isn't set up, or the provider is unavailable right now."
      />
    );
  } else if (results.isPending) {
    body = (
      <GifHint
        icon={<Icon icon={Search} size="lg" />}
        title="Searching…"
        detail="Finding gifs — one moment."
      />
    );
  } else if (hits.length === 0) {
    body = (
      <GifHint
        icon={<Icon icon={Search} size="lg" />}
        title="No gifs found"
        detail="Nothing matched that search — try different words."
      />
    );
  } else {
    body = (
      <MediaGrid
        items={hits.map(toGifGridItem)}
        ariaLabel="Gif results"
        gapToken="row"
        onActivate={importHit}
        className="max-h-96"
      />
    );
  }

  return (
    <Stack gap="block">
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          setQuery(draft.trim());
        }}
      >
        <Row gap="row" align="center">
          <Input
            aria-label="Search gifs"
            placeholder="Search GIFs…"
            value={draft}
            onValueChange={setDraft}
          />
          <Button type="submit" intent="secondary">
            <Icon icon={Search} size="sm" />
            Search
          </Button>
        </Row>
      </form>
      {body}
      <Row justify="end" gap="row">
        <DialogClose render={<Button intent="ghost">Close</Button>} />
      </Row>
    </Stack>
  );
}
