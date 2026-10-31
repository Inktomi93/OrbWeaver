import { CollectionGrid, DetailHeader, EditorPage, LibraryListRows, ListPage, SettingsPane } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Input } from "@orb/ui/input";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import type { TemplateSeed } from "./page-template-cases.ts";
import { TEMPLATE_CASES } from "./page-template-cases.ts";

const ROWS = Array.from({ length: 30 }, (_, index) => `Row ${String(index + 1)}`);

/** One matrix cell: the seed palette's page ground at one density, in a fixed box the size of a docked LIST pane. */
function Cell({
  caseId,
  theme,
  density,
  children,
}: {
  readonly caseId: string;
  readonly theme: TemplateSeed | undefined;
  readonly density: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      data-case={caseId}
      data-density={density}
      data-theme={theme}
      style={{
        backgroundColor: "var(--color-background)",
        color: "var(--color-foreground)",
        inlineSize: "18rem",
        blockSize: "20rem",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}

function ListPageCase({ body, aside }: { readonly body: "scroll" | "pane"; readonly aside: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <ListPage
      body={body}
      lead={
        <Card data-probe="lead-card" variant="soft">
          Lead
        </Card>
      }
      ref={ref}
      search={<Input aria-label="Search rows" onValueChange={(): void => undefined} placeholder="Search rows" value="" />}
      searchAside={aside ? <Button variant="outline">Sort by recent activity</Button> : undefined}
      skipTo="Skip to rows"
    >
      <LibraryListRows isEmpty={false} scroll={false}>
        {ROWS.map((title) => (
          <ListRow clickable={true} key={title} onClick={(): void => undefined} title={title} />
        ))}
      </LibraryListRows>
    </ListPage>
  );
}

/** The same matrix in free-height cells of a given width, for templates that size to their content. */
function Matrix({ width, children }: { readonly width: string; readonly children: ReactNode }): ReactElement {
  return (
    <Stack gap="block">
      {TEMPLATE_CASES.map(({ caseId, theme, density }) => (
        <div
          data-case={caseId}
          data-density={density}
          data-theme={theme}
          key={caseId}
          style={{ backgroundColor: "var(--color-background)", inlineSize: width }}
        >
          {children}
        </div>
      ))}
    </Stack>
  );
}

const ACTIONS = (
  <>
    <Button variant="ghost" size="sm">
      Open card
    </Button>
    <Button variant="outline" size="sm">
      Edit scope
    </Button>
  </>
);

/** `DetailHeader` at the title step with marks, verbs and a gloss line, a masthead twin, and a narrow pane. */
export function DetailHeaderMatrixStory(): ReactElement {
  return (
    <CtIsolation subject="DetailHeader" isolates="The template renders the name, marks and verbs it is given and reads no application data.">
      <Matrix width="40rem">
        <DetailHeader actions={ACTIONS} meta={<Badge size="sm">Ready</Badge>} title="Elias Thorn">
          <Text voice="gloss">Pinned two hours ago.</Text>
        </DetailHeader>
      </Matrix>
      <div data-case="masthead" style={{ inlineSize: "40rem" }}>
        <DetailHeader actions={ACTIONS} deferToShell={false} kicker="Refinery · workbench" step="masthead" title="Elias Thorn" />
      </div>
      <div data-case="narrow" style={{ inlineSize: "14rem" }}>
        <DetailHeader actions={ACTIONS} title="A character whose name runs long" />
      </div>
    </CtIsolation>
  );
}

/** `EditorPage` in both kinds inside a pane below and above the `@cq-64` breathe step, plus a tier probe card. */
export function EditorPageMatrixStory(): ReactElement {
  return (
    <CtIsolation subject="EditorPage" isolates="The template lays out the column it is given and reads no application data.">
      <Matrix width="50rem">
        <Container>
          <EditorPage data-probe="form" gap="block">
            <Card data-probe="form-card">Form island</Card>
          </EditorPage>
          <EditorPage data-probe="instrument" gap="block" kind="instrument">
            <Card data-probe="instrument-card">Instrument island</Card>
          </EditorPage>
        </Container>
      </Matrix>
      {(["form", "instrument"] as const).map((kind) => (
        <div data-case={`wide-${kind}`} key={kind} style={{ inlineSize: "80rem" }}>
          <Container>
            <EditorPage data-probe={kind} kind={kind}>
              <Text>Column</Text>
            </EditorPage>
          </Container>
        </div>
      ))}
    </CtIsolation>
  );
}

const TILES = Array.from({ length: 5 }, (_, index) => `Tile ${String(index + 1)}`);

/** `CollectionGrid` on the 16rem tile floor in a pane two tiles wide and one three tiles wide. */
export function CollectionGridMatrixStory(): ReactElement {
  const grid = (
    <CollectionGrid
      cols="auto"
      gap="row"
      itemKey={(tile): string => tile}
      items={TILES}
      label="Tiles"
      renderItem={(tile): ReactElement => <Button variant="outline">{tile}</Button>}
    />
  );
  return (
    <CtIsolation subject="CollectionGrid" isolates="The template tiles the items it is given and reads no application data.">
      <Matrix width="34rem">{grid}</Matrix>
      <div data-case="wide" style={{ inlineSize: "52rem" }}>
        {grid}
      </div>
    </CtIsolation>
  );
}

/** `SettingsPane` with a title over two sections, one holding a tier probe card. */
export function SettingsPaneMatrixStory(): ReactElement {
  return (
    <CtIsolation subject="SettingsPane" isolates="The template stacks the title and sections it is given and reads no application data.">
      <Matrix width="40rem">
        <SettingsPane title={<Text data-probe="title">Appearance</Text>}>
          <Section data-probe="first" kicker="Sizing">
            <Card data-probe="card">A section island</Card>
          </Section>
          <Section kicker="Effects">
            <Text>Second section</Text>
          </Section>
        </SettingsPane>
      </Matrix>
    </CtIsolation>
  );
}

/** `ListPage` in every seed and density with a scroll body, plus a narrow pane whose search row must wrap its aside
 *  and a pane-scrolling arm. */
export function ListPageMatrixStory(): ReactElement {
  return (
    <CtIsolation subject="ListPage" isolates="The template renders the slots it is given and reads no application data.">
      <Row className="flex-wrap" gap="block">
        {TEMPLATE_CASES.map(({ caseId, theme, density }) => (
          <Cell caseId={caseId} density={density} key={caseId} theme={theme}>
            <ListPageCase aside={false} body="scroll" />
          </Cell>
        ))}
        <Cell caseId="aside" density="comfortable" theme={undefined}>
          <ListPageCase aside={true} body="scroll" />
        </Cell>
        <Cell caseId="pane" density="comfortable" theme={undefined}>
          <ListPageCase aside={false} body="pane" />
        </Cell>
      </Row>
    </CtIsolation>
  );
}
