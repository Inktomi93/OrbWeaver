// Source observations retain the native program's declaration and position identities.
import type { ElementAccessExpression, Node, ts } from "ts-morph";
export interface NativeColumnReference {
  readonly node: ts.Node;
  readonly declarations: readonly ts.Node[];
}
export interface RowShapeRead {
  readonly name: string;
  readonly node: Node;
  readonly receiver: Node;
}

export interface IndexedCallParameters {
  readonly receiverIndex: number;
  readonly keyIndex: number;
  readonly node: ElementAccessExpression;
}
