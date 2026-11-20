import { describe, expect, it } from 'vitest';
import { detectGuidedNotesLayout } from '../../../server/src/features/guided-notes/domain/layout-recognizer.js';
import { groupSampleGrid, shiftSampleGrid, singleSlotSampleGrid } from '../../helpers/guided-notes-sample-grids.js';

describe('Guided Notes sample layouts', () => {
  it('recognizes the multi-row, ordered-slot sample without importing prompt text', () => {
    const layout = detectGuidedNotesLayout(groupSampleGrid());
    expect(layout.questions.map(({ questionNumber, blanks }) => [questionNumber, blanks.length])).toEqual([
      [1, 2], [2, 2], [3, 1], [4, 1]
    ]);
    expect(layout.questions[0].blanks.map(({ rowIndex, columnIndex }) => [rowIndex, columnIndex])).toEqual([[4, 7], [5, 7]]);
  });

  it('recognizes six single-slot questions from the second teacher-provided sample', () => {
    const layout = detectGuidedNotesLayout(singleSlotSampleGrid());
    expect(layout.questions.map(({ questionNumber, blanks }) => [questionNumber, blanks.length])).toEqual([
      [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]
    ]);
    expect(layout.questions.map(({ blanks }) => [blanks[0].rowIndex, blanks[0].columnIndex])).toEqual([
      [4, 6], [6, 6], [8, 6], [10, 6], [12, 6], [14, 6]
    ]);
  });

  it('recognizes both sample structures after row and column shifts', () => {
    for (const source of [groupSampleGrid(), singleSlotSampleGrid()]) {
      const shifted = detectGuidedNotesLayout(shiftSampleGrid(source, 7, 3));
      const original = detectGuidedNotesLayout(source);
      expect(shifted.questions.map(({ questionNumber, blanks }) => [questionNumber, blanks.length])).toEqual(
        original.questions.map(({ questionNumber, blanks }) => [questionNumber, blanks.length])
      );
      expect(shifted.questions[0].blanks[0].rowIndex).toBe(original.questions[0].blanks[0].rowIndex + 7);
      expect(shifted.questions[0].blanks[0].columnIndex).toBe(original.questions[0].blanks[0].columnIndex + 3);
    }
  });
});
