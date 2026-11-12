import type { Locator } from "@playwright/test";
import { LAYOUT_SUBPIXEL_PX } from "./enlarged-text-geometry.ts";

/** How one qualified `ListRow` lays its title line out: whether the qualifier shares the name's line, whether the name keeps the least
 *  width it is owed (its own text, or the title floor when the text is longer, or the whole title line when that is narrower), whether it is cut short of its own text, and whether the
 *  qualifier is on the row whole. Measured from the rendered boxes, so a row that lost its qualifier cannot read as one that merely fits. */
interface TitleFit {
  readonly qualifierBesideName: boolean;
  readonly nameKeepsItsFloor: boolean;
  readonly nameTruncated: boolean;
  readonly qualifierWhole: boolean;
}

/** How far one `ListRow`'s title reaches: how far its box ends past its row's inline end, and whether it keeps the least width it is owed
 *  (the smaller of the title floor, its own text and the title line). Any row, qualified or not. */
interface TitleReach {
  readonly pastRowBy: number;
  readonly nameKeepsItsFloor: boolean;
}

/** @param floorPx - the title floor token resolved to px under the page's font setting. */
export function titleReach(row: Locator, floorPx: number): Promise<TitleReach> {
  return row.evaluate(
    (root, { floor, subpixel }) => {
      const title = root.querySelector<HTMLElement>('[data-slot="list-row-title"]');
      const line = root.querySelector<HTMLElement>('[data-slot="list-row-title-row"]');
      if (title === null || line === null) {
        throw new Error("list row has no title or title line");
      }
      const titleBox = title.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(title);
      return {
        pastRowBy: Math.max(0, Math.round(titleBox.right - root.getBoundingClientRect().right)),
        nameKeepsItsFloor: titleBox.width >= Math.min(floor, text.getBoundingClientRect().width, line.getBoundingClientRect().width) - subpixel,
      };
    },
    { floor: floorPx, subpixel: LAYOUT_SUBPIXEL_PX },
  );
}

/** @param floorPx - the title floor token resolved to px under the page's font setting. */
export function titleFit(row: Locator, floorPx: number): Promise<TitleFit> {
  return row.evaluate(
    (root, { floor, subpixel }) => {
      const part = (slot: string): HTMLElement => {
        const found = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
        if (found === null) {
          throw new Error(`list row has no ${slot}`);
        }
        return found;
      };
      const title = part("list-row-title");
      const qualifier = part("list-row-title-qualifier");
      const titleBox = title.getBoundingClientRect();
      const qualifierBox = qualifier.getBoundingClientRect();
      const rowBox = root.getBoundingClientRect();
      // The name's own text width, whatever width the title box was given.
      const text = document.createRange();
      text.selectNodeContents(title);
      const natural = text.getBoundingClientRect().width;
      // The room the title line gives the name: a floor wider than the line itself cannot be kept.
      const room = part("list-row-title-row").getBoundingClientRect().width;
      return {
        qualifierBesideName: qualifierBox.top < titleBox.bottom,
        nameKeepsItsFloor: titleBox.width >= Math.min(floor, natural, room) - subpixel,
        nameTruncated: natural > titleBox.width + subpixel,
        qualifierWhole: qualifierBox.left >= rowBox.left && qualifierBox.right <= rowBox.right && qualifier.scrollWidth <= qualifier.clientWidth,
      };
    },
    { floor: floorPx, subpixel: LAYOUT_SUBPIXEL_PX },
  );
}
