import { colOf, rowOf } from "../engine/geometry";

/** M0 placeholder: an empty 9x9 grid. Cages, digits and input arrive in M3. */
export function renderBoard(root: HTMLElement): HTMLElement {
  const board = document.createElement("div");
  board.className = "board";
  board.setAttribute("role", "grid");
  board.dataset.testid = "board";
  for (let c = 0; c < 81; c++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    cell.dataset.row = String(rowOf(c));
    cell.dataset.col = String(colOf(c));
    board.appendChild(cell);
  }
  root.appendChild(board);
  return board;
}
