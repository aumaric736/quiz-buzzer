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
}

export interface ActivitySnapshot {
  activityId: string;
  phase: ActivityPhase;
  revision: number;
}

export interface GroupRecord {
  groupId: string;
  activityId: string;
  displayName: string;
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
