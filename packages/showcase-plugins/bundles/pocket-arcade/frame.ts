((): void => {
  "use strict";

  type Direction = "up" | "down" | "left" | "right";
  type Cell = readonly [row: number, column: number];

  const boardSize = 4;
  const twoTileProbability = 0.9;
  const twoTileValue = 2;
  const fourTileValue = 4;
  const highestTileClass = 2048;
  let board: number[][] = [];
  let score = 0;
  let best = 0;
  let over = false;

  function element(id: string): HTMLElement {
    const found = document.getElementById(id);
    if (found === null) {
      throw new Error(`missing frame element: ${id}`);
    }
    return found;
  }

  function emptyCells(): Cell[] {
    const out: Cell[] = [];
    for (let row = 0; row < boardSize; row += 1) {
      for (let column = 0; column < boardSize; column += 1) {
        if (board[row]?.[column] === 0) {
          out.push([row, column]);
        }
      }
    }
    return out;
  }

  function spawn(): void {
    const cells = emptyCells();
    if (cells.length === 0) {
      return;
    }
    const pick = cells[Math.floor(Math.random() * cells.length)];
    if (pick === undefined) {
      return;
    }
    const row = board[pick[0]];
    if (row !== undefined) {
      row[pick[1]] = Math.random() < twoTileProbability ? twoTileValue : fourTileValue;
    }
  }

  function reset(): void {
    board = Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => 0));
    score = 0;
    over = false;
    spawn();
    spawn();
    draw();
  }

  function slideRow(row: readonly number[]): number[] {
    const values = row.filter((value) => value !== 0);
    const out: number[] = [];
    let index = 0;
    while (index < values.length) {
      const value = values[index] ?? 0;
      if (index + 1 < values.length && value === values[index + 1]) {
        const merged = value * 2;
        score += merged;
        out.push(merged);
        index += 2;
      } else {
        out.push(value);
        index += 1;
      }
    }
    while (out.length < boardSize) {
      out.push(0);
    }
    return out;
  }

  function cellFor(direction: Direction, index: number, offset: number): Cell {
    if (direction === "left") {
      return [index, offset];
    }
    if (direction === "right") {
      return [index, boardSize - 1 - offset];
    }
    if (direction === "up") {
      return [offset, index];
    }
    return [boardSize - 1 - offset, index];
  }

  function readLine(direction: Direction, index: number): number[] {
    const line: number[] = [];
    for (let offset = 0; offset < boardSize; offset += 1) {
      const [row, column] = cellFor(direction, index, offset);
      line.push(board[row]?.[column] ?? 0);
    }
    return line;
  }

  function writeLine(direction: Direction, index: number, line: readonly number[]): void {
    for (let offset = 0; offset < boardSize; offset += 1) {
      const [rowIndex, column] = cellFor(direction, index, offset);
      const row = board[rowIndex];
      if (row !== undefined) {
        row[column] = line[offset] ?? 0;
      }
    }
  }

  function move(direction: Direction): void {
    if (over) {
      return;
    }
    let changed = false;
    for (let index = 0; index < boardSize; index += 1) {
      const before = readLine(direction, index);
      const after = slideRow(before);
      if (before.some((value, offset) => value !== after[offset])) {
        changed = true;
      }
      writeLine(direction, index, after);
    }
    if (!changed) {
      return;
    }
    spawn();
    if (score > best) {
      best = score;
    }
    over = stuck();
    draw();
  }

  function canMergeAt(row: number, column: number): boolean {
    const value = board[row]?.[column];
    const right = column + 1 < boardSize && value === board[row]?.[column + 1];
    const down = row + 1 < boardSize && value === board[row + 1]?.[column];
    return right || down;
  }

  function stuck(): boolean {
    if (emptyCells().length > 0) {
      return false;
    }
    for (let row = 0; row < boardSize; row += 1) {
      for (let column = 0; column < boardSize; column += 1) {
        if (canMergeAt(row, column)) {
          return false;
        }
      }
    }
    return true;
  }

  function tile(value: number): HTMLDivElement {
    const cell = document.createElement("div");
    cell.className = `cell${value === 0 ? "" : ` t${Math.min(value, highestTileClass)}`}`;
    cell.textContent = value === 0 ? "" : String(value);
    return cell;
  }

  function draw(): void {
    const boardElement = element("board");
    boardElement.textContent = "";
    for (let row = 0; row < boardSize; row += 1) {
      for (let column = 0; column < boardSize; column += 1) {
        boardElement.appendChild(tile(board[row]?.[column] ?? 0));
      }
    }
    element("score").textContent = String(score);
    element("best").textContent = String(best);
    boardElement.classList.toggle("over", over);
    if (over) {
      const note = document.createElement("div");
      note.id = "over-note";
      note.textContent = "No moves left — new game?";
      boardElement.appendChild(note);
    }
  }

  const directionByKey = new Map<string, Direction>([
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
  ]);

  document.addEventListener("keydown", (event) => {
    const direction = directionByKey.get(event.key);
    if (direction !== undefined) {
      event.preventDefault();
      move(direction);
    }
  });
  element("pad").addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const direction = target.getAttribute("data-d");
    if (direction === "up" || direction === "down" || direction === "left" || direction === "right") {
      move(direction);
    }
  });
  element("new").addEventListener("click", reset);
  reset();
  element("board").focus();
})();
