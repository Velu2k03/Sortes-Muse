// Traditional 4x4 square layout for the Ziwei board, pure data, no DOM.
// The 12 palaces sit on the perimeter in the same clockwise order as the
// ring (iztro array order), starting at the top-left corner and going
// right, down, left, and up. The centre 2x2 block (rows 2-3, cols 2-3)
// holds the zodiac, Western sign, and Life palace stars, exactly as the
// ring centre does. This is the traditional square FORM with the ring's
// palace order; it does not claim a school-specific branch placement,
// and the same palaces, stars, language, and selection state are shared.
export interface SquareCell {
  row: number; // 1-4
  col: number; // 1-4
}

export const SQUARE_CELLS: SquareCell[] = [
  { row: 1, col: 1 },
  { row: 1, col: 2 },
  { row: 1, col: 3 },
  { row: 1, col: 4 },
  { row: 2, col: 4 },
  { row: 3, col: 4 },
  { row: 4, col: 4 },
  { row: 4, col: 3 },
  { row: 4, col: 2 },
  { row: 4, col: 1 },
  { row: 3, col: 1 },
  { row: 2, col: 1 },
];

export function squareCellForPalaceIndex(index: number): SquareCell {
  return SQUARE_CELLS[index] ?? { row: 1, col: 1 };
}
