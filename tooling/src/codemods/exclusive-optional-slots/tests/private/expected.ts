interface ModalTitlePropsBase {
  readonly title: string;
}

type ModalTitleProps = ModalTitlePropsBase & (
  | {
      /** The title holds one line. */
      readonly truncate?: boolean;
      readonly words?: never;
    }
  | {
      readonly truncate?: never;
      readonly words?: string;
    }
);
