import { afterEach, describe, expect, it, vi } from 'vitest';
import { getQuestionDraft, saveQuestionDraft, removeQuestionDraft } from '../../../client/src/features/buzzer-flow/services/question-draft-store.js';

describe('device-local answer drafts', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
  afterEach(() => { values.clear(); vi.unstubAllGlobals(); });

  it('restores the draft for one activity, group and question without crossing group boundaries', () => {
    vi.stubGlobal('localStorage', storage);
    saveQuestionDraft('activity-a', 'group-a', 1, ['first draft']);
    saveQuestionDraft('activity-a', 'group-a', 2, ['second draft']);
    saveQuestionDraft('activity-a', 'group-b', 1, ['other group']);
    expect(getQuestionDraft('activity-a', 'group-a', 1)).toEqual(['first draft']);
    expect(getQuestionDraft('activity-a', 'group-a', 2)).toEqual(['second draft']);
    expect(getQuestionDraft('activity-a', 'group-b', 1)).toEqual(['other group']);
    removeQuestionDraft('activity-a', 'group-a', 1);
    expect(getQuestionDraft('activity-a', 'group-a', 1)).toBeNull();
    expect(getQuestionDraft('activity-a', 'group-a', 2)).toEqual(['second draft']);
  });
});
