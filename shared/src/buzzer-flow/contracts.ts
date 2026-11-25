import type { WinningAnswerResult } from '../guided-notes/contracts.js';
import type { ActivityPhase } from '../user-stage-sync/contracts.js';

export interface BuzzerQuestionPrompt {
  questionNumber: number;
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
  status: 'submitted' | 'won';
  groupId: string;
  groupName: string;
  answerParts: string[];
  submissionRank?: number;
  isWinner?: boolean;
}

export type BuzzerActivityPhase = ActivityPhase;
