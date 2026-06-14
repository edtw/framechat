export interface User {
  id: string;
  username?: string;
  name?: string;
  role: "admin" | "user" | "client" | "editor";
  email?: string;
  phone?: string | null;
  fullName?: string;
  company_id?: string;
  companyId?: string;
  companyName?: string | null;
  companyEmail?: string | null;
  contact_id?: number;
  active?: boolean;
}

export interface Session {
  id?: string;
  sessionId: string;
  sessionName?: string;
  name?: string;
  status: string;
  phoneNumber?: string;
  messageCount?: number;
  lastActive?: string;
  updatedAt?: string;
  webhookUrl?: string;
  createdAt?: string;
  aiEnabled?: boolean;
}

export interface Stats {
  activeSessions: number;
  messagesToday: number;
  totalClients: number;
  uptime: string;
}

export interface Analytics {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  activeContacts: number;
}

export interface MessageAnalytics {
  date: string;
  incoming: number;
  outgoing: number;
}

export interface SessionPerformance {
  sessionId: string;
  sessionName?: string;
  status: string;
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
}

export interface VideoProject {
  id: number;
  company_id: string;
  contact_id: number;
  project_name: string;
  description?: string;
  status: "draft" | "pending" | "in_progress" | "review" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  deadline?: string;
  assigned_editor?: string;
  editor_notes?: string;
  client_notes?: string;
  video_style?: string;
  target_audience?: string;
  video_duration?: string;
  budget_range?: string;
  reference_links?: string;
  estimated_hours?: number;
  actual_hours?: number;
  drive_folder_id?: string;
  drive_folder_name?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  files?: ProjectFile[];
  activity?: ActivityLog[];
}

export interface ProjectFile {
  id: number;
  name?: string;
  file_name?: string;
  original_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  uploaded_by?: string;
  created_at: string;
  link_type?: "source" | "output" | "result";
  file_role?: "source" | "output" | "result";
  mega_link?: string;
  mega_id?: string;
}

export interface ActivityLog {
  id: number;
  project_id: number;
  actor?: string;
  user_name?: string;
  action: string;
  description: string;
  metadata?: any;
  created_at: string;
}

export interface DriveOwnerInfo {
  displayName?: string;
  emailAddress?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  iconLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  owners?: DriveOwnerInfo[];
}

export interface DriveFolderInfo {
  id: string;
  name: string;
}

export interface DriveOAuthCredential {
  email?: string;
  googleUserId?: string;
  scopes?: string[];
  expiresAt?: string | null;
  updatedAt?: string | null;
}

export interface DriveOAuthStatus {
  success?: boolean;
  connected: boolean;
  credential: DriveOAuthCredential | null;
  serviceAccountEmail?: string | null;
  oauth?: {
    clientId?: string | null;
    redirectUri?: string | null;
    scopes?: string[];
  };
}
