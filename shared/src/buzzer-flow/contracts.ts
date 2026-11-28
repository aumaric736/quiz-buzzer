import type { WinningAnswerResult } from '../guided-notes/contracts.js';
import type { ActivityPhase } from '../user-stage-sync/contracts.js';

export interface BuzzerQuestionPrompt {
  questionNumber: number;
  displayOrder: number;
  blankCount: number;
}

export interface BuzzerQuestionsResponse {
  questions: BuzzerQuestionPrompt[];
}

export interface AnswerSubmissionRequest {
  questionNumber: number;
  answerParts: string[];
}

export interface AnswerSubmissionAck {
  accepted: true;
  questionNumber: number;
  status?: 'accepted' | 'already_submitted';
  answerParts?: string[];
}

export type TeacherQuestionStatus =
  | { questionNumber: number; status: 'open'; submissions: [] }
  | {
      questionNumber: number;
      status: 'won';
      groupId: string;
      groupName: string;
      answerParts: string[];
      submissions: Array<{ groupId: string; groupName: string; answerParts: string[]; submissionRank: number; isWinner: boolean }>;
    };

export interface StudentOwnQuestionStatus {
  questionNumber: number;
  displayOrder: number;
  status: 'submitted';
  answerParts?: string[];
}

export interface TeacherLiveAnswerStatusResponse {
  phase: '搶答進行中';
  items: TeacherQuestionStatus[];
}

export interface StudentLiveAnswerStatusResponse {
  phase: '搶答進行中';
  items: StudentOwnQuestionStatus[];
}

export interface PreparingAnswerStatusResponse {
  phase: '準備中';
  items: [];
}

export interface EndedAnswerStatusResponse {
  phase: '已結束';
  items: WinningAnswerResult[];
}

export interface PublicFinalResultsResponse {
  phase: '已結束';
  items: WinningAnswerResult[];
}

export type AnswerStatusResponse =
  | PreparingAnswerStatusResponse
  | TeacherLiveAnswerStatusResponse
  | StudentLiveAnswerStatusResponse
  | EndedAnswerStatusResponse;

export interface BuzzerQuestionUpdatedEvent {
  type: 'buzzer.question.updated';
  activityId: string;
  questionNumber: number;
  displayOrder: number;
  status: 'submitted' | 'won';
  groupId: string;
  groupName: string;
  answerParts: string[];
  submissionRank?: number;
  isWinner?: boolean;
}

export interface TeamQuestionAnswerSnapshot {
  questionNumber: number;
  displayOrder: number;
  status: 'unanswered' | 'submitted';
  answerParts?: string[];
}

export interface TeamAnswerUpdatedEvent {
  type: 'team.answer.updated';
  activityId: string;
  groupId: string;
  groupLiveRevision: number;
  questionNumber: number;
  displayOrder: number;
  status: 'submitted';
  answerParts: string[];
}

export interface ActivityTeamAnswerUpdatedEvent {
  type: 'activity.team-answer.updated';
  activityId: string;
  activityLiveRevision: number;
  groupId: string;
  groupName: string;
  questionNumber: number;
  status: 'submitted';
  answerParts: string[];
  questionProgress: TeacherQuestionProgress;
}

export interface TeacherQuestionProgressGroup {
  groupId: string;
  groupName: string;
}

export interface TeacherAnsweredGroupProgress extends TeacherQuestionProgressGroup {
  answerParts: string[];
  submissionRank: number;
}

export interface TeacherQuestionProgress {
  questionNumber: number;
  displayOrder: number;
  answeredGroupCount: number;
  totalGroupCount: number;
  answeredGroups: TeacherAnsweredGroupProgress[];
  unansweredGroups: TeacherQuestionProgressGroup[];
}

export interface TeacherActivityProgressResponse {
  activityId: string;
  activityLiveRevision: number;
  questions: TeacherQuestionProgress[];
}

export type BuzzerActivityPhase = ActivityPhase;
