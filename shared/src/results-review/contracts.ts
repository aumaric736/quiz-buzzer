import type { ActivityPhase } from '../user-stage-sync/contracts.js';

export interface TeacherActivitySummary {
  activityId: string;
  phase: ActivityPhase;
  createdAt: string;
}

export interface TeacherActivityListResponse {
  activities: TeacherActivitySummary[];
}

export interface TeacherReviewSubmissionRecord {
  submissionRank: number;
  groupId: string;
  groupName: string;
  answerParts: string[];
  isWinner: boolean;
}

export interface TeacherReviewQuestion {
  questionNumber: number;
  unanswered: boolean;
  records: TeacherReviewSubmissionRecord[];
}

export interface TeacherReviewRecordsResponse {
  activityId: string;
  phase: '已結束';
  questions: TeacherReviewQuestion[];
}
