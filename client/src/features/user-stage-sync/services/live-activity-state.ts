import type {
  ActivityRosterUpdatedEvent, ActivityTeamAnswerUpdatedEvent, LiveGroupRosterRecord,
  StudentOwnQuestionStatus, StudentTeamLiveSnapshot, TeacherQuestionProgress, TeamAnswerUpdatedEvent, TeamPresenceUpdatedEvent
} from '@quiz-buzzer/shared';

export function applyTeacherLiveEvent(
  current: LiveGroupRosterRecord[] | null,
  event: ActivityRosterUpdatedEvent | ActivityTeamAnswerUpdatedEvent
): LiveGroupRosterRecord[] {
  if (event.type === 'activity.roster.updated') return event.groups;
  if (!current) return current ?? [];
  return current.map((group) => {
    if (group.groupId !== event.groupId) return group;
    const answer = { questionNumber: event.questionNumber, displayOrder: event.questionProgress.displayOrder,
      status: 'submitted' as const, answerParts: event.answerParts };
    const exists = group.answers.some((item) => item.questionNumber === event.questionNumber);
    return { ...group, answers: exists
      ? group.answers.map((item) => item.questionNumber === event.questionNumber ? answer : item)
      : [...group.answers, answer].sort((left, right) => left.displayOrder - right.displayOrder) };
  });
}

export function applyTeacherQuestionProgress(
  current: TeacherQuestionProgress[],
  update: TeacherQuestionProgress
): TeacherQuestionProgress[] {
  return [...current.filter((question) => question.questionNumber !== update.questionNumber), update]
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

export function applyStudentPresenceEvent(event: TeamPresenceUpdatedEvent): StudentTeamLiveSnapshot {
  return event;
}

export function applyStudentAnswerEvent(
  current: Array<StudentOwnQuestionStatus> | null,
  event: TeamPresenceUpdatedEvent | TeamAnswerUpdatedEvent
): StudentOwnQuestionStatus[] {
  if (event.type === 'team.presence.updated') {
    return event.answers.filter((answer) => answer.status === 'submitted').map((answer) => ({
      questionNumber: answer.questionNumber, displayOrder: answer.displayOrder, status: 'submitted' as const, answerParts: answer.answerParts
    }));
  }
  const statuses = current ?? [];
  const updated = { questionNumber: event.questionNumber, displayOrder: event.displayOrder, status: 'submitted' as const, answerParts: event.answerParts };
  return [...statuses.filter((item) => item.questionNumber !== event.questionNumber), updated]
    .sort((left, right) => left.displayOrder - right.displayOrder);
}
