import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { CodeEditor } from "@orb/ui/code-editor";
import { GlyphButton } from "@orb/ui/glyph-button";
import { Icon, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack, Surface } from "@orb/ui/layout";
import { MessageBubble } from "@orb/ui/message-bubble";
import { RoomIsland } from "@orb/ui/room-island";
import { ScrollArea } from "@orb/ui/scroll-area";
import { ThemePreviewPane } from "@orb/ui/theme-swatch";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { CtIsolation } from "./ct-isolated-subject.tsx";

/** Exercise the production density map and its sanctioned variant overrides under real containment. */
export function SurfaceDesignStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="Surface design token contracts" isolates="Density and variant conformance needs production primitives, not application services.">
      <main data-density="comfortable">
        <Container name="surface-design-control" style={{ inlineSize: width }}>
          <Stack gap="section" padding="block">
            <h1>Surface design controls</h1>
            <Surface tier="instrument">
              <Stack gap="row">
                <Card aria-label="Instrument island">Instrument island</Card>
                <RoomIsland ownSlot="surface-design-island" aria-label="Floating island">
                  Floating island
                </RoomIsland>
                <MessageBubble messageRole="assistant" shape="bubble" aria-label="Message bubble">
                  Message bubble
                </MessageBubble>
                <ThemePreviewPane fill="background" shape="inset" aria-label="Inset island">
                  Inset island
                </ThemePreviewPane>
                <Card padding="none" aria-label="Delegated inset">
                  Delegated inset
                </Card>
                <Card elevated={true} aria-label="Elevated island">
                  Elevated island
                </Card>
                <Card nested={true} aria-label="Nested island">
                  Nested island
                </Card>
                <Input aria-label="Title field" name="titleControl" typeStep="title" defaultValue="Title field" />
                <Input aria-label="Instrument field" name="instrumentControl" defaultValue="Instrument field" />
              </Stack>
            </Surface>
            <Row gap="row">
              <GlyphButton variant="ghost" glyph="xs" aria-label="Small control one">
                <Icon icon={Plus} size="xs" />
              </GlyphButton>
              <GlyphButton variant="ghost" glyph="xs" aria-label="Small control two">
                <Icon icon={Plus} size="xs" />
              </GlyphButton>
              <GlyphButton variant="ghost" glyph="xs" aria-label="Small control three">
                <Icon icon={Plus} size="xs" />
              </GlyphButton>
              <Button variant="ghost" size="md" aria-label="Full control">
                <Icon icon={Plus} size="xs" />
              </Button>
            </Row>
            <ScrollArea style={{ blockSize: width / 3 }} wrapContent={true} viewportProps={{ "aria-label": "Design scroll control" }}>
              <Stack gap="section">
                <Button variant="outline">Scroll start</Button>
                <Stack style={{ blockSize: width * 3 }} aria-hidden="true" />
                <Button variant="outline">Scroll end</Button>
              </Stack>
            </ScrollArea>
            <Surface tier="form">
              <Stack gap="row">
                <Card aria-label="Form island">Form island</Card>
                <Input aria-label="Form field" name="formControl" defaultValue="Form field" />
              </Stack>
            </Surface>
          </Stack>
        </Container>
      </main>
    </CtIsolation>
  );
}

// Narrower than the control's label at enlarged text, so a clipping box cuts the control off.
const CLIPPING_BOX_PX = 160;

/** A control in a fixed-pixel clipping box, or in a box that lets it reflow, for the enlarged-text geometry probes. */
export function SurfaceTextGeometryStory({ clipped }: { readonly clipped: boolean }): ReactElement {
  return (
    <CtIsolation subject="Enlarged-text geometry" isolates="A fixed-pixel clipping box and one production button need no application services.">
      <main>
        <Stack padding="section">
          <h1>Text geometry control</h1>
          <div style={clipped ? { inlineSize: CLIPPING_BOX_PX, overflow: "hidden", whiteSpace: "nowrap" } : {}}>
            <Button variant="outline">Continue to the next step</Button>
          </div>
        </Stack>
      </main>
    </CtIsolation>
  );
}

/** The production code editor mounts CodeMirror's runtime stylesheet, whose scope classes are not ASCII. */
export function SurfaceCodeEditorStory(): ReactElement {
  return (
    <CtIsolation subject="Runtime editor stylesheet" isolates="CodeMirror's mounted style module needs no application services.">
      <main>
        <Stack padding="section">
          <h1>Editor stylesheet control</h1>
          <CodeEditor ariaLabel="Stylesheet control" value=".control { color: black; }" />
        </Stack>
      </main>
    </CtIsolation>
  );
}

/** Adjacent production hit pseudos tile at the actual touch floor. */
export function SurfaceTouchTilingStory(): ReactElement {
  return (
    <CtIsolation subject="Tiled touch targets" isolates="Compositor ownership of adjacent hit pseudos needs no application services.">
      <main>
        <Stack padding="section">
          <h1>Tiled touch controls</h1>
          <Row style={{ columnGap: `calc(var(${TOKENS["size.touch-target"].cssVar}) - var(${TOKENS["size.glyph-lg"].cssVar}))` }}>
            {["Left", "Middle", "Right"].map((name) => (
              <GlyphButton key={name} glyph="lg" variant="ghost" aria-label={`Tiled ${name}`}>
                <Icon icon={Plus} size="sm" />
              </GlyphButton>
            ))}
          </Row>
        </Stack>
      </main>
    </CtIsolation>
  );
}
