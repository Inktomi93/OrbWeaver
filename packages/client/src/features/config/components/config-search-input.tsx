// The Settings SEARCH (#866 S2) — ONE index over every group, with
// VS Code's typed `@` filters. It rides the TOP of the LIST scroller as a `role="search"` block (fork F-11
// — the corpus-omnibox precedent; the 48px LIST band keeps the title), and while a query is live its
// results render as a capped listbox UNDER the input: the static index's hits (groups · sections · leaves,
// fuzzy over `@orb/ui/fuzzy-search`, label boosted ×4) plus each contributing group's DYNAMIC rows (a
// collection's members, the persona names — `useSearchRows`, one component per group so every hook runs in
// its own fiber, the `CommandPaletteSource.useRows` posture). Selecting a hit deep-links
// (`openConfigTo(group, sub, setting)` / the member selection) and REMEMBERS the match
// (`setConfigSearchMatch` — §3.4's seam); the query survives the jump, so the marks live until the reader
// clears it.
//
// Typing `@` (or the funnel button) opens the TOKEN MENU in the same listbox — selecting a token completes
// it in place (`applyConfigToken`). `aria-expanded` tracks the LIST'S EXISTENCE (the side-eye 2026-08-16
// ARIA rider, carried from the retired shell): cmdk hardcodes `expanded` because it assumes its listbox is
// always mounted; this caller mounts it only while there is a query or a partial token.

import { Command, CommandAuxiliaryButton, CommandInput, CommandList } from "@orb/ui/command";
import { fuzzySearch } from "@orb/ui/fuzzy-search";
import { HighlightedText } from "@orb/ui/highlighted-text";
import { Icon, SlidersHorizontal } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useSettingsViewerView } from "#data";
import type { ConfigQueryToken, ParsedConfigQuery } from "#lib";
import { applyConfigToken, CONFIG_QUERY_TOKENS, findHighlightRanges, parseConfigQuery, partialConfigToken } from "#lib";
import type { ConfigGroupDefinition, ConfigGroupRegistry, ConfigSearchRow } from "#state";
import { openConfigTo, selectCollectionMember, setConfigSearchMatch, setConfigSearchQuery, useConfigSearchQuery } from "#state";
import { useConfigModified } from "../hooks/use-modified-sections.ts";
import { CONFIG_MODIFIED_MARKER } from "../lib/config-copy.ts";
import type { ConfigSearchEntry } from "../lib/config-search.ts";
import { buildConfigSearchEntries, filterConfigEntries, isConfigEntryModified } from "../lib/config-search.ts";
import { useConfigSubcategories } from "../lib/config-subcategories.ts";
import { CommandRow } from "./config-search-row.tsx";

/** The static index's search-item projection: minisearch fields must be strings, so keywords fold into one
 *  haystack and `label` keeps its ×4 boost (§3.3). */
interface SearchItem {
  readonly id: string;
  readonly label: string;
  readonly haystack: string;
}

const SEARCH_OPTIONS = { fields: ["label", "haystack"], boost: { label: 4 }, limit: 50 } as const;

/** The static hits for the narrowed entries, in rank order. Terms empty (tokens only) ⇒ every narrowed
 *  entry, registry order — a bare `@shelf:app` is a browse, not a miss. */
function staticHits(entries: readonly ConfigSearchEntry[], terms: string): readonly ConfigSearchEntry[] {
  const items: SearchItem[] = entries.map((entry) => ({ id: entry.id, label: entry.label, haystack: entry.keywords.join(" ") }));
  const ranked = fuzzySearch(items, terms, SEARCH_OPTIONS);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const out: ConfigSearchEntry[] = [];
  for (const item of ranked) {
    const entry = byId.get(item.id);
    if (entry !== undefined) {
      out.push(entry);
    }
  }
  return out;
}

function selectEntry(entry: ConfigSearchEntry): void {
  openConfigTo(entry.groupId, entry.subId ?? undefined, entry.settingId ?? undefined);
  setConfigSearchMatch({ group: entry.groupId, sub: entry.subId, setting: entry.settingId, memberId: null });
}

/** One group's DYNAMIC rows (members / persona names) — its own component so `useSearchRows` runs in its
 *  own fiber (never a hooks-in-a-loop at the search). Applies the same token narrowing as the static half
 *  (`@modified`/`@advanced` exclude member rows — a member is data, not a knob) and fuzzy-filters by the
 *  free-text terms. */
function GroupSearchRows({
  group,
  parsed,
  terms,
}: {
  readonly group: ConfigGroupDefinition;
  readonly parsed: ParsedConfigQuery;
  readonly terms: string;
}): ReactNode {
  const rows = group.useSearchRows?.() ?? [];
  if (parsed.modified || parsed.advanced || parsed.ext !== undefined) {
    return null;
  }
  if (parsed.shelf !== undefined && group.shelf !== parsed.shelf) {
    return null;
  }
  if (parsed.group !== undefined && group.id.toLowerCase() !== parsed.group.toLowerCase()) {
    return null;
  }
  const items = rows.map((row) => ({ id: row.id, label: row.label, haystack: (row.keywords ?? []).join(" ") }));
  const ranked = fuzzySearch(items, terms, SEARCH_OPTIONS);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const select = (row: ConfigSearchRow): void => {
    if (row.memberId === undefined) {
      openConfigTo(group.id, row.subId);
      setConfigSearchMatch({ group: group.id, sub: row.subId ?? null, setting: null, memberId: null });
      return;
    }
    // A MEMBER hit opens the member itself: land the group (which clears any stale selection), then select.
    openConfigTo(group.id);
    selectCollectionMember(group.id, row.memberId);
    setConfigSearchMatch({ group: group.id, sub: null, setting: null, memberId: row.memberId });
  };
  return (
    <>
      {ranked.map((item) => {
        const row = byId.get(item.id);
        if (row === undefined) {
          return null;
        }
        return (
          <CommandRow context={group.label} key={`${group.id}::${item.id}`} onSelect={(): void => select(row)} value={`${group.id}::${item.id}`}>
            <HighlightedText ranges={findHighlightRanges(row.label, terms)} text={row.label} />
          </CommandRow>
        );
      })}
    </>
  );
}

/** The token menu — the `@` completions, filtered by the partial the caret is inside. */
function TokenMenu({
  partial,
  query,
  tokens,
}: {
  readonly partial: string;
  readonly query: string;
  readonly tokens: readonly ConfigQueryToken[];
}): ReactElement {
  if (tokens.length === 0) {
    return <Text voice="gloss">{`No filter matches “${partial}”.`}</Text>;
  }
  return (
    <>
      {tokens.map((token) => (
        <CommandRow
          context={token.hint}
          key={token.token}
          onSelect={(): void => setConfigSearchQuery(applyConfigToken(query, token.token))}
          value={token.token}
        >
          <Text>{token.token}</Text>
        </CommandRow>
      ))}
    </>
  );
}

export interface ConfigSearchInputProps {
  readonly groups: ConfigGroupRegistry;
}

export function ConfigSearchInput({ groups }: ConfigSearchInputProps): ReactElement {
  const query = useConfigSearchQuery();
  const viewer = useSettingsViewerView();
  const subcategoriesFor = useConfigSubcategories();
  const modified = useConfigModified();

  const parsed = parseConfigQuery(query);
  const partial = partialConfigToken(query);
  const hasQuery = query.trim().length > 0;
  const tokenMenu = partial !== null;
  const expanded = hasQuery || tokenMenu;

  const visible = new Set(
    groups
      .list()
      .filter((group) => group.when?.(viewer) ?? true)
      .map((group) => group.id),
  );
  const entries = buildConfigSearchEntries(groups, (id) => visible.has(id), subcategoriesFor);
  const narrowed = filterConfigEntries(entries, parsed, modified);
  // `@ext:<slug>` narrows to the plugins group and SEARCHES the slug like a term (the slug is row text).
  const terms = parsed.ext === undefined ? parsed.terms : `${parsed.terms} ${parsed.ext}`.trim();
  const hits = expanded && !tokenMenu ? staticHits(narrowed, terms) : [];
  const tokens = tokenMenu ? CONFIG_QUERY_TOKENS.filter((token) => token.token.startsWith(partial.toLowerCase())) : [];
  const rowGroups = groups.list().filter((group) => group.useSearchRows !== undefined && visible.has(group.id));

  return (
    <Stack aria-label="Settings search" role="search">
      <Command label="Search settings" shouldFilter={false}>
        <Row align="center" gap="tight">
          <Stack className="min-w-0 flex-1">
            {/* NO CALLER REF HERE (#1218's rejected arm, stated so nobody re-tries it): `CommandInput` keeps
                its own internal ref to correct cmdk's `aria-expanded`, and a `ref` passed through its props
                replaces that one — the correction then reads `null` and the box claims an expanded listbox
                that does not exist. The arrival focus lands on the active group's BAND instead. */}
            <CommandInput aria-label="Search settings" expanded={expanded} onValueChange={setConfigSearchQuery} placeholder="Search settings…" value={query} />
          </Stack>
          {/* The FUNNEL — inserts `@` and the token menu opens, so the grammar teaches itself (§3.3). */}
          <CommandAuxiliaryButton
            aria-label="Add a search filter"
            onClick={(): void => setConfigSearchQuery(applyConfigToken(query, "@"))}
            size="icon-sm"
            title="Add a search filter"
          >
            <Icon icon={SlidersHorizontal} size="sm" />
          </CommandAuxiliaryButton>
        </Row>
        {expanded ? (
          <CommandList className="max-h-(--container-cq-sm)">
            {tokenMenu ? (
              <TokenMenu partial={partial} query={query} tokens={tokens} />
            ) : (
              <>
                {hits.length === 0 && rowGroups.length === 0 ? <Text voice="gloss">{`No settings match “${query.trim()}”.`}</Text> : null}
                {/* EVERY MODIFIED HIT SAYS SO, in every query — not only under `@modified` (#1099 F16: the
                    filter returned five rows and not one of them carried a mark, so the reader hunting the
                    setting they changed had nothing to steer by). The mark is the SAME verdict the filter
                    applies, read at the row's own grain. */}
                {hits.map((entry) => (
                  <CommandRow
                    key={entry.id}
                    onSelect={(): void => selectEntry(entry)}
                    value={entry.id}
                    {...(entry.kind === "group" ? {} : { context: entry.groupLabel })}
                    {...(isConfigEntryModified(entry, modified) ? { mark: CONFIG_MODIFIED_MARKER } : {})}
                  >
                    <HighlightedText ranges={findHighlightRanges(entry.label, terms)} text={entry.label} />
                  </CommandRow>
                ))}
                {rowGroups.map((group) => (
                  <GroupSearchRows group={group} key={group.id} parsed={parsed} terms={terms} />
                ))}
              </>
            )}
          </CommandList>
        ) : null}
      </Command>
    </Stack>
  );
}
