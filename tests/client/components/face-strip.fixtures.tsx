// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome forbids
// exporting a component from a `.ct.tsx`). The FOLD arm cannot be driven from a `.ct.tsx` at all: the
// `overflow.render` RENDER PROP returns JSX, and only plain data crosses the CT prop wire — so the picker
// body, the selection state it writes, and the width host the strip measures itself against are all built
// HERE, in the module that executes in the browser.
//
// The host `<div>` is the strip's measuring container: a CT resizes it (its `data-fold-host` attribute) to
// sweep every pane width a real LIST panel can resolve to, which is the only way to prove the fold's rules
// hold at ALL widths rather than at the one a fixture happened to pick.

import { FaceStrip } from "@orb/client/components";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

/** Deliberately UNEVEN name lengths — a captioned face takes its name's natural width, so a fold that
 *  assumes a uniform slot is wrong the moment two names differ. */
const NAMES = ["Az", "Sera", "Niko", "Aria Nightshade", "Bo", "Wren of the Long Winter Court", "Cass", "Ilya", "Mara Vex", "Tuo", "Perrin Halloway", "Ro"];

export interface FaceStripFoldHarnessProps {
  /** The measuring host's inline size — the pane the strip has to fit into. @defaultValue 256 */
  readonly width?: number;
  /** How many faces the curation hands the strip. @defaultValue 12 */
  readonly count?: number;
  /** Start with a face already scoping the pane (an id from `face_<n>`). @defaultValue null */
  readonly initialSelectedId?: string | null;
}

function faceItems(count: number): readonly { readonly id: string; readonly name: string; readonly avatarHash: null }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `face_${index}`,
    name: `${NAMES[index % NAMES.length] ?? "Face"} ${index}`,
    avatarHash: null,
  }));
}

/** The chats-pane posture (captions + a filter verb + the overflow picker), inside a resizable host. */
export function FaceStripFoldHarness({ width = 256, count = 12, initialSelectedId = null }: FaceStripFoldHarnessProps): ReactElement {
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const items = faceItems(count);
  return (
    <div data-fold-host="" style={{ width }}>
      <FaceStrip
        caption={true}
        items={items}
        kicker="Filter by character"
        label="Recent characters"
        onSelect={(id): void => setSelectedId((current) => (current === id ? null : id))}
        overflow={{
          label: "Filter by another character",
          render: (close): ReactElement => (
            <Stack gap="tight">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={(): void => {
                    setSelectedId(item.id);
                    close();
                  }}
                  type="button"
                >
                  {item.name}
                </button>
              ))}
            </Stack>
          ),
        }}
        selectedId={selectedId}
        verb="Show chats with"
      />
    </div>
  );
}
