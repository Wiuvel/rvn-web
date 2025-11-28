export interface UserData {
  id: string;
  user_id: string;
  username: string;
  dashboard_token: string;
  created_at: string;
  last_login?: string;
  avatar_gradient?: string | null;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}


