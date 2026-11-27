function key(activityId: string, groupId: string, questionNumber: number): string {
  return `quiz-buzzer.answer-draft.${encodeURIComponent(activityId)}.${encodeURIComponent(groupId)}.${questionNumber}`;
}

export function getQuestionDraft(activityId: string, groupId: string, questionNumber: number): string[] | null {
  try {
    const value = localStorage.getItem(key(activityId, groupId, questionNumber));
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((part) => typeof part === 'string') ? parsed : null;
  } catch { return null; }
}

export function saveQuestionDraft(activityId: string, groupId: string, questionNumber: number, answerParts: string[]): void {
  try { localStorage.setItem(key(activityId, groupId, questionNumber), JSON.stringify(answerParts)); } catch { /* Drafts are best-effort device-local state. */ }
}

export function removeQuestionDraft(activityId: string, groupId: string, questionNumber: number): void {
  try { localStorage.removeItem(key(activityId, groupId, questionNumber)); } catch { /* Storage may be unavailable in private browsing. */ }
}
