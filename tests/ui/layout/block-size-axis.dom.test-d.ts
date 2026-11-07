// A box states its block size once: `fill` is an arm of `height`, so "the parent's whole block size" and a named height cannot both be written.
import type { Card } from "@orb/ui/card";
import type { Container, Row, Section, Stack } from "@orb/ui/layout";
import type { ComponentProps } from "react";

type StackProps = ComponentProps<typeof Stack>;
type RowProps = ComponentProps<typeof Row>;
type ContainerProps = ComponentProps<typeof Container>;
type SectionProps = ComponentProps<typeof Section>;
type CardProps = ComponentProps<typeof Card>;

export const stack: StackProps = { height: "fill" };
export const row: RowProps = { height: "fill" };
export const container: ContainerProps = { height: "fill" };
export const section: Pick<SectionProps, "height"> = { height: "fill" };
export const card: Pick<CardProps, "height"> = { height: "fill" };

// @ts-expect-error -- `fill` is no axis of a box.
export const stackFill: StackProps = { fill: true };
// @ts-expect-error -- `fill` is no axis of a box.
export const rowFill: RowProps = { fill: true };
// @ts-expect-error -- `fill` is no axis of a box.
export const containerFill: ContainerProps = { fill: true };
// @ts-expect-error -- `fill` is no axis of a box.
export const sectionFill: Pick<SectionProps, "fill"> = { fill: true };
// @ts-expect-error -- `fill` is no axis of a box.
export const cardFill: Pick<CardProps, "fill"> = { fill: true };
