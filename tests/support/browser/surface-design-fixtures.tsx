import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack, Surface } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
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
                <Card shape="float" aria-label="Floating island">
                  Floating island
                </Card>
                <Card shape="bubble" aria-label="Message bubble">
                  Message bubble
                </Card>
                <Card shape="pill" aria-label="Pill island">
                  Pill island
                </Card>
                <Card shape="inset" aria-label="Inset island">
                  Inset island
                </Card>
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
              <Button intent="ghost" size="glyph-xs" aria-label="Small control one">
                <Icon icon={Plus} size="xs" />
              </Button>
              <Button intent="ghost" size="glyph-xs" aria-label="Small control two">
                <Icon icon={Plus} size="xs" />
              </Button>
              <Button intent="ghost" size="glyph-xs" aria-label="Small control three">
                <Icon icon={Plus} size="xs" />
              </Button>
              <Button intent="ghost" size="md" aria-label="Full control">
                <Icon icon={Plus} size="xs" />
              </Button>
            </Row>
            <ScrollArea style={{ blockSize: width / 3 }} wrapContent={true} viewportProps={{ "aria-label": "Design scroll control" }}>
              <Stack gap="section">
                <Button intent="secondary">Scroll start</Button>
                <Stack style={{ blockSize: width * 3 }} aria-hidden="true" />
                <Button intent="secondary">Scroll end</Button>
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

/** Adjacent production hit pseudos tile at the actual touch floor. */
export function SurfaceTouchTilingStory(): ReactElement {
  return (
    <CtIsolation subject="Tiled touch targets" isolates="Compositor ownership of adjacent hit pseudos needs no application services.">
      <main>
        <Stack padding="section">
          <h1>Tiled touch controls</h1>
          <Row style={{ columnGap: "calc(var(--size-touch-target) - var(--size-glyph-lg))" }}>
            {["Left", "Middle", "Right"].map((name) => (
              <Button key={name} size="glyph-lg" intent="ghost" aria-label={`Tiled ${name}`}>
                <Icon icon={Plus} size="sm" />
              </Button>
            ))}
          </Row>
        </Stack>
      </main>
    </CtIsolation>
  );
}
