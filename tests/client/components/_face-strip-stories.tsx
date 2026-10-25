import { FaceStrip } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";

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
