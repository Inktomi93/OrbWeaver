interface TitleRevealPropsBase {
  readonly whole: string;
}

export type TitleRevealProps = TitleRevealPropsBase & (
  | {
      readonly fill?: never;
      readonly action?: string;
      readonly control?: never;
      readonly frame?: never;
    }
  | {
      readonly fill?: never;
      readonly action?: never;
      readonly control?: string;
      readonly frame?: string;
    }
  | {
      readonly fill?: boolean;
      readonly action?: never;
      readonly control?: never;
      readonly frame?: string;
    }
);
