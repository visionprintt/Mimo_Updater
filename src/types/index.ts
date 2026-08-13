// ─── User & Auth Types ─────────────────────────────────────────────
export type UserRole = 'admin' | 'lead' | 'employee' | 'intern' | 'hr' | 'founder' | 'co-founder';
export type UserStatus = 'pending' | 'approved' | 'suspended' | 'rejected' | 'deleted';
export type Department =
  | 'Marketing'
  | 'Frontend'
  | 'Backend'
  | 'Production'
  | 'Hardware Team'
  | 'Finance'
  | 'Design'
  | 'Management'
  | 'HR';

export const DEPARTMENTS: Department[] = [
  'Marketing',
  'Frontend',
  'Backend',
  'Production',
  'Finance',
  'Design',
];

export const ADMIN_ROLES: UserRole[] = ['admin', 'lead'];

export interface MimoUser {
  uid: string;
  employeeId?: string;
  email: string;
  phoneNumber?: string;
  displayName: string;
  role: UserRole;
  department?: Department; // Keeping string for simpler queries later
  departments?: Department[]; // deprecated, but kept if existing code relies on it temporarily
  team?: string;
  position?: string;
  managerId?: string;
  status: UserStatus;
  avatarUrl?: string;
  photoURL?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  internshipStartDate?: string;
  internshipEndDate?: string;
  joinedAt: string;
  createdAt?: string;
  updatedAt?: string;
  lastActiveAt?: string;
  paymentStatus?: Record<string, 'paid' | 'unpaid'>;
}

export type LeaveType = 'Sick' | 'Casual' | 'Unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id?: string;
  userId: string;
  userName: string; // for easier display in admin panel
  startDate: string;
  endDate: string;
  days: number;
  leaveType: LeaveType;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  approvedBy?: string;
  rejectionReason?: string;
}

export interface Invitation {
  email: string;
  displayName: string;
  role: UserRole;
  departments: Department[];
  position?: string;
  invitedBy: string;
  invitedAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId?: string;
  targetName?: string;
  details: string;
  createdAt: string;
}

// ─── Session & Timer Types ─────────────────────────────────────────
export type SessionStatus = 'active' | 'completed' | 'auto-stopped' | 'flagged';

export interface BreakEntry {
  startedAt: string;
  endedAt?: string;
  reason?: string;
}

export interface TaskEntry {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  dueDate?: string;
}

export type TaskCategory =
  | 'Development'
  | 'Design'
  | 'Content Creation'
  | 'Marketing'
  | 'Hardware'
  | 'Meeting'
  | 'Research'
  | 'Finance'
  | 'Other';

export const TASK_CATEGORIES: TaskCategory[] = [
  'Development',
  'Design',
  'Content Creation',
  'Marketing',
  'Hardware',
  'Meeting',
  'Research',
  'Finance',
  'Other',
];

export interface WorkSession {
  id: string;
  userId: string;
  userName: string;
  userDepartments: Department[];
  userDepartment?: Department; // deprecated
  clockInTime: string;
  clockOutTime?: string;
  totalDurationMs: number; // actual worked milliseconds
  breakDurationMs: number; // total break milliseconds
  breaks: BreakEntry[];
  status: SessionStatus;
  workSummary?: string;
  tasks: TaskEntry[];
  mood?: Mood;
  blockers?: string;
  achievements?: string;
  review?: SessionReview;
}

export type Mood = 'frustrated' | 'neutral' | 'good' | 'fire';
export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 'frustrated', emoji: '', label: 'Frustrated' },
  { value: 'neutral', emoji: '', label: 'Neutral' },
  { value: 'good', emoji: '', label: 'Good' },
  { value: 'fire', emoji: '', label: 'On Fire' },
];

// ─── UI State & Preferences ────────────────────────────────────────

export interface UIPreferences {
  theme: 'dark' | 'light' | 'system';
  compactMode: boolean;
  accentColor: string;
}

// ─── Task Management ────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface MimoTask {
  id: string;
  title: string;
  description?: string;
  assignedTo: string; // Employee UID
  assignedBy: string; // Admin/Lead UID
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string;
  dueDate: string;
  completedAt?: string;
  delayReason?: string;
  deadlineUpdatedBy?: string;
  deadlineUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export type ReviewAction = 'approved';

export interface SessionReview {
  reviewedBy: string;
  reviewerName: string;
  action: ReviewAction;
  comment?: string;
  rating?: number;
  reviewedAt: string;
}

// ─── Notification Types ────────────────────────────────────────────
export type NotificationType =
  | 'account_approved'
  | 'account_rejected'
  | 'session_flagged'
  | 'session_starred'
  | 'session_noted'
  | 'session_auto_stopped'
  | 'general'
  | 'system';

export interface MimoNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

// ─── Analytics Types ───────────────────────────────────────────────
export interface DailyStats {
  date: string;
  totalHours: number;
  sessionCount: number;
  avgSessionLength: number;
}

export interface UserStats {
  totalSessions: number;
  totalHoursWorked: number;
  avgSessionLength: number;
  currentStreak: number;
  longestStreak: number;
  flagCount: number;
  starCount: number;
  lastSessionDate?: string;
}

// ─── Constants ─────────────────────────────────────────────────────
export const SESSION_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours in ms
export const SESSION_DURATION_SECONDS = 3 * 60 * 60; // 3 hours in seconds
