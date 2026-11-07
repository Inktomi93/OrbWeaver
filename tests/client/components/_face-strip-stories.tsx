import { FaceStrip } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";

const TILE_FACES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((name) => ({ id: name.toLowerCase(), name, avatarHash: null }));

/** A strip too narrow for its faces, so it folds the rest behind the overflow tile. */
export function FaceStripTileStory({ caption }: { readonly caption: boolean }): ReactElement {
  return (
    <CtIsolation subject="FaceStrip" isolates="The folded strip's tile against its faces needs no application data.">
      <div style={{ width: caption ? 240 : 120 }}>
        <FaceStrip
          items={TILE_FACES}
          selectedId={null}
          onSelect={(): void => undefined}
          caption={caption}
          label="Faces"
          overflow={{ label: "Choose another face", render: () => <Text>Other faces</Text> }}
        />
      </div>
    </CtIsolation>
  );
}

export function FaceStripRefsStory(): ReactElement {
  const [narrow, setNarrow] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [renamed, setRenamed] = useState(false);
  const [removed, setRemoved] = useState(false);
  const items = [
    { id: "alpha", name: "Alpha", avatarHash: null },
    { id: "beta", name: "Beta", avatarHash: null },
    ...(removed ? [] : [{ id: "gamma", name: renamed ? "Renamed Gamma" : "Gamma", avatarHash: null }]),
  ];
  return (
    <CtIsolation subject="FaceStrip" isolates="The measured fold and keyed node lifetime need no application data.">
      <Button onClick={(): void => setNarrow(!narrow)}>Toggle width</Button>
      <Button onClick={(): void => setRenamed(true)}>Rename last face</Button>
      <Button onClick={(): void => setRemoved(true)}>Remove last face</Button>
      <Text role="status">{selected ?? "Nothing selected"}</Text>
      <div style={{ width: narrow ? 160 : 560 }}>
        <FaceStrip
          items={items}
          selectedId={selected}
          onSelect={setSelected}
          caption={true}
          label="Faces"
          overflow={{ label: "Choose another face", render: () => <Text>Other faces</Text> }}
        />
      </div>
    </CtIsolation>
  );
}
