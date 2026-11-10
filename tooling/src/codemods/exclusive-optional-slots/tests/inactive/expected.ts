interface SandboxFramePropsBase {
  title: string;
}

export type SandboxFrameProps = SandboxFramePropsBase & (
  | {
      readonly heightPx?: number;
      readonly fill?: false;
    }
  | {
      readonly heightPx?: never;
      readonly fill?: boolean;
    }
);
