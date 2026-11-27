import { describe, expect, it } from 'vitest';
import { isSheetsCellBlank } from '../../../server/src/features/guided-notes/application/target-cell-blank.js';

describe('Guided Notes target cell blank detection', () => {
  it.each(['', '   ', '\u3000\t\r\n\v\f'])('treats trimmed whitespace %j as blank', (enteredValue) => {
    expect(isSheetsCellBlank({ enteredValue })).toBe(true);
  });

  it.each(['0', 0, 'false', false, ' answer ', '#N/A'])('preserves nonblank values %j as occupied', (enteredValue) => {
    expect(isSheetsCellBlank({ enteredValue })).toBe(false);
  });

  it('treats a formula as occupied even when its displayed result is empty', () => {
    expect(isSheetsCellBlank({ enteredValue: null, formula: '=IF(A1="","",A1)' })).toBe(false);
    expect(isSheetsCellBlank({ enteredValue: null, formula: '' })).toBe(true);
  });
});
