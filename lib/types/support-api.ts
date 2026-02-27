/**
 * Raw API types for Support system.
 * These match the shape of responses from /api/support/tickets and /api/support/tickets/[ticketId].
 */

export interface RawSupportUser {
  id: string;
  username: string;
  user_id: string;
  avatar?: string | null;
}

export interface RawAttachmentApi {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path?: string;
  storage_url?: string;
  blur_hash?: string;
  width?: number;
  height?: number;
}

export interface RawLastMessageApi {
  id: string;
  message_text: string;
  sender_id?: string;
  sender_type?: 'user' | 'support' | 'system';
  created_at: string;
  is_read: boolean;
  attachments?: RawAttachmentApi[];
}

export interface RawTicketApi {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'closed' | 'pending';
  created_at: string;
  updated_at?: string;
  last_message_at?: string | null;
  closed_at?: string | null;
  assigned_to?: string | null;
  unread_count?: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  user?: RawSupportUser;
  assigned_user?: RawSupportUser | null;
  last_message?: RawLastMessageApi | null;
}

/**
 * Raw message from API or Supabase. Supabase relations can return arrays.
 */
export interface RawMessageApi {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: 'user' | 'support';
  message_text: string;
  created_at: string;
  is_read?: boolean;
  /** Supabase relation may return array or single object */
  sender?: RawSupportUser | RawSupportUser[];
  attachments?: RawAttachmentApi[];
}
