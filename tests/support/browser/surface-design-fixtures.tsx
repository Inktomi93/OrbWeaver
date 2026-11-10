import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { CodeEditor } from "@orb/ui/code-editor";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { GlyphButton } from "@orb/ui/glyph-button";
import { Icon, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack, Surface } from "@orb/ui/layout";
import { declaresOverlay } from "@orb/ui/lib";
import { ListRow } from "@orb/ui/list-row";
import { MessageBubble } from "@orb/ui/message-bubble";
import { RoomIsland } from "@orb/ui/room-island";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Text } from "@orb/ui/text";
import { ThemePreviewPane } from "@orb/ui/theme-swatch";
import { TOKENS } from "@orb/ui/tokens";
import { WeaveVeil } from "@orb/ui/web-weave";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
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

/**
 * A control in a fixed-pixel clipping box, or in a box that lets it reflow, for the enlarged-text geometry probes. Beside
 * it a production slider sits in a padded scroller: its visually hidden range input paints nothing, so it is never judged.
 */
export function SurfaceTextGeometryStory({ clipped }: { readonly clipped: boolean }): ReactElement {
  return (
    <CtIsolation subject="Enlarged-text geometry" isolates="A fixed-pixel clipping box and production controls need no application services.">
      <main>
        <Stack padding="section">
          <h1>Text geometry control</h1>
          <div style={clipped ? { inlineSize: CLIPPING_BOX_PX, overflow: "hidden", whiteSpace: "nowrap" } : {}}>
            <Button variant="outline">Continue to the next step</Button>
          </div>
          <Stack scroll="y" padding="section">
            <Slider label="Reflowing group slider" defaultValue={50} />
          </Stack>
        </Stack>
      </main>
    </CtIsolation>
  );
}

/** A closed production disclosure whose panel holds stacked controls: opening it grows the clipping panel to rest. */
export function SurfaceTextDisclosureStory(): ReactElement {
  return (
    <CtIsolation subject="Enlarged-text disclosure" isolates="One production collapsible and its controls need no application services.">
      <main>
        <Stack padding="section">
          <h1>Disclosure control</h1>
          <Collapsible>
            <CollapsibleTrigger>Disclosure options</CollapsibleTrigger>
            <CollapsiblePanel>
              <Stack gap="row">
                <Button variant="outline">First disclosed control</Button>
                <Button variant="outline">Second disclosed control</Button>
                <Button variant="outline">Last disclosed control</Button>
              </Stack>
            </CollapsiblePanel>
          </Collapsible>
        </Stack>
      </main>
    </CtIsolation>
  );
}

// How the overlapping pair is named: buttons by their content, text fields by placeholder only, or text fields with no name.
const OVERLAP_NAMINGS = ["content", "placeholder", "none"] as const;
type OverlapNaming = (typeof OVERLAP_NAMINGS)[number];

/** Two visible controls laid over each other, named by {@link OverlapNaming}. */
export function SurfaceTextOverlapStory({ naming }: { readonly naming: OverlapNaming }): ReactElement {
  // The second control rises a quarter control height onto the first's bottom edge: an edge overlap leaves both
  // centres uncovered, so only the overlap probe sees it and the centre hit test stays clean.
  const over = { marginBlockStart: `calc(-0.25 * var(${TOKENS["size.control-md"].cssVar}))` };
  return (
    <CtIsolation subject="Enlarged-text overlap" isolates="Two production controls laid over each other need no application services.">
      <main>
        <Stack padding="section">
          <h1>Overlap control</h1>
          {naming === "content" ? (
            <>
              <Button variant="outline">Under control</Button>
              <Button variant="outline" style={over}>
                Over control
              </Button>
            </>
          ) : (
            <>
              <Input name="underControl" {...(naming === "placeholder" ? { placeholder: "Search" } : {})} />
              <Input name="overControl" style={over} {...(naming === "placeholder" ? { placeholder: "Filter" } : {})} />
            </>
          )}
        </Stack>
      </main>
    </CtIsolation>
  );
}

/** A control laid wholly inside another's corner as its sibling, not its child: the tree declares no nesting. */
export function SurfaceTextContainedOverlayStory(): ReactElement {
  const control = `var(${TOKENS["size.control-md"].cssVar})`;
  return (
    <CtIsolation subject="Enlarged-text contained overlay" isolates="Two production controls, one over the other's corner, need no application services.">
      <main>
        <Stack padding="section">
          <h1>Contained overlay control</h1>
          <Stack style={{ position: "relative" }}>
            <Button variant="outline" style={{ blockSize: `calc(3 * ${control})` }}>
              Covered row
            </Button>
            <GlyphButton
              aria-label="Corner control"
              glyph="sm"
              variant="ghost"
              style={{ position: "absolute", insetBlockStart: `calc(0.25 * ${control})`, insetInlineEnd: `calc(0.25 * ${control})` }}
            >
              <Icon icon={Plus} size="sm" />
            </GlyphButton>
          </Stack>
        </Stack>
      </main>
    </CtIsolation>
  );
}

/**
 * A cell whose corner control lies over the cell's own control, and a second cell below it. `declared` declares the corner
 * as a designed overlay; `none` is the same layout with no declaration; `foreign` drops the declared corner onto the next
 * cell's control as well, which the declaration does not cover.
 */
export function SurfaceDeclaredOverlayStory({ declare }: { readonly declare: "declared" | "none" | "foreign" }): ReactElement {
  const control = `var(${TOKENS["size.control-md"].cssVar})`;
  const corner = {
    position: "absolute",
    insetInlineEnd: `calc(0.25 * ${control})`,
    insetBlockEnd: declare === "foreign" ? `calc(-0.25 * ${control})` : `calc(0.25 * ${control})`,
  } as const;
  return (
    <CtIsolation subject="Enlarged-text declared overlay" isolates="Two production cells, one with a corner control over it, need no application services.">
      <main>
        <Stack padding="section">
          <h1>Declared overlay control</h1>
          <Stack>
            <Stack style={{ position: "relative" }}>
              <Button variant="outline" style={{ blockSize: `calc(3 * ${control})` }}>
                Covered cell
              </Button>
              <Stack style={corner} {...(declare === "none" ? {} : declaresOverlay("theme-menu-over-cell"))}>
                <GlyphButton aria-label="Corner control" glyph="sm" variant="ghost">
                  <Icon icon={Plus} size="sm" />
                </GlyphButton>
              </Stack>
            </Stack>
            <Button variant="outline" style={{ blockSize: `calc(3 * ${control})` }}>
              Next cell
            </Button>
          </Stack>
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

// How long the boot veil holds over the control before it dissolves.
const VEIL_HOLD_MS = 800;

/** A control under a cover: the production boot veil that dissolves after a beat, or a plain panel that stays. */
export function SurfaceVeilCoverStory({ cover }: { readonly cover: "veil" | "panel" }): ReactElement {
  const [veilOpen, setVeilOpen] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVeilOpen(false), VEIL_HOLD_MS);
    return (): void => clearTimeout(timer);
  }, []);
  return (
    <CtIsolation subject="Enlarged-text cover" isolates="A production control under a leaving veil or a standing panel needs no application services.">
      <main>
        <Stack padding="section">
          <h1>Cover control</h1>
          <Button variant="outline">Retry</Button>
        </Stack>
      </main>
      {cover === "veil" ? <WeaveVeil open={veilOpen} label="Loading" /> : <div style={{ position: "fixed", inset: 0 }} />}
    </CtIsolation>
  );
}

const CUT_VALUE = "Same as my Image generation role";
const CUT_TITLE = "Calamity, Doomblade of the Ninth Epoch, Keeper of the Orbital Loom";

/**
 * A text-cut case in a box of the given width: a picker whose value is wider than its trigger (`value`, with `wraps` the arm that wraps it), the
 * same picker in a list row's actions (`action`), a list row whose title is wider than the row (`row`), a button whose preview line carries the
 * facet-preview slot (`preview`), or a button whose visible label is cut with no such slot (`label`). A picker and a label are a control's own
 * text; the row title and the declared preview are design.
 */
export function SurfaceCutValueStory({
  width,
  cut,
  wraps,
}: {
  readonly width: number;
  readonly cut: "value" | "action" | "row" | "preview" | "label";
  readonly wraps?: boolean;
}): ReactElement {
  const picker = <Select aria-label="Connection" items={[{ label: CUT_VALUE, value: "same" }]} layout={wraps === true ? "hugWrap" : "hug"} value="same" />;
  const cases: Record<typeof cut, ReactElement> = {
    value: <Row>{picker}</Row>,
    action: <ListRow actions={picker} stackActions={true} title="Pamela" />,
    row: <ListRow clickable={true} title={CUT_TITLE} />,
    preview: (
      <Button aria-label="Description" className="min-inline-0" variant="outline" width="full" wrap={true}>
        <Text aria-hidden={true} as="span" className="min-inline-0" data-slot="facet-preview" truncate={true}>
          {CUT_TITLE}
        </Text>
      </Button>
    ),
    label: (
      <Button aria-label="Description" className="min-inline-0" variant="outline" width="full" wrap={true}>
        <Text aria-hidden={true} as="span" className="min-inline-0" truncate={true}>
          {CUT_TITLE}
        </Text>
      </Button>
    ),
  };
  return (
    <CtIsolation subject="Enlarged-text cut value" isolates="A production picker, list row and button in a narrow box need no application services.">
      <main>
        <Container style={{ inlineSize: width }}>{cases[cut]}</Container>
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
