export const ROLES = ['teacher', 'student'] as const;
export type Role = (typeof ROLES)[number];

export const ACTIVITY_PHASES = ['準備中', '搶答進行中', '已結束'] as const;
export type ActivityPhase = (typeof ACTIVITY_PHASES)[number];

export interface UserSession {
  sessionId: string;
  role: Role;
  activityId: string | null;
  groupId: string | null;
  groupName?: string | null;
  groupRole?: 'leader' | 'member' | null;
  groupInviteCode?: string | null;
  recoveryRequired?: boolean;
}

export interface ActivitySnapshot {
  activityId: string;
  phase: ActivityPhase;
  revision: number;
  joiningOpenedAt?: string | null;
}

export interface GroupRecord {
  groupId: string;
  activityId: string;
  displayName: string;
  inviteCode?: string;
  groupRole?: GroupRole;
  groupLiveRevision?: number;
  onlineCount?: number;
  occupiedCount?: number;
  capacity?: 2;
  acceptsMembers?: boolean;
}

export type GroupRole = 'leader' | 'member';

export interface LiveQuestionAnswerSnapshot {
  questionNumber: number;
  displayOrder: number;
  status: 'unanswered' | 'submitted';
  answerParts?: string[];
}

export interface LiveGroupRosterRecord {
  groupId: string;
  displayName: string;
  inviteCode?: string;
  onlineCount: number;
  leaderOnline: boolean;
  joinStatus: GroupJoinStatus;
  answers: LiveQuestionAnswerSnapshot[];
}

export type GroupJoinStatus = '不可用' | '開放加入' | '額滿' | '停止加入';

export interface TeacherActivityLiveSnapshot {
  activityId: string;
  activityLiveRevision: number;
  groups: LiveGroupRosterRecord[];
}

export interface StudentTeamLiveSnapshot {
  activityId: string;
  groupId: string;
  groupLiveRevision: number;
  displayName: string;
  groupRole: GroupRole;
  onlineCount: number;
  occupiedCount: number;
  capacity: 2;
  acceptsMembers: boolean;
  answers: LiveQuestionAnswerSnapshot[];
}

export interface ActivityRosterUpdatedEvent extends TeacherActivityLiveSnapshot {
  type: 'activity.roster.updated';
}

export interface TeamPresenceUpdatedEvent extends StudentTeamLiveSnapshot {
  type: 'team.presence.updated';
}

export type GroupEnrollmentRequest =
  | { mode: 'leader'; activityId: string; groupName: string }
  | { mode: 'member'; activityId: string; inviteCode: string };

export interface TeacherGroupRosterItem {
  groupId: string;
  displayName: string;
  inviteCode: string;
  onlineCount: number;
  leaderOnline: boolean;
  joinStatus: GroupJoinStatus;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ActivityPhaseUpdatedEvent extends ActivitySnapshot {
  type: 'activity.phase.updated';
}

export interface ActivitySubscribeMessage {
  type: 'activity.subscribe';
  activityId: string;
  sessionId: string;
}

export interface ActivitySubscribedEvent extends ActivitySnapshot {
  type: 'activity.subscribed';
}
