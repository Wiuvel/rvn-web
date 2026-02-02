/**
 * WebSocket события для системы поддержки
 */

export interface SupportWebSocketEvents {
  // Клиент -> Сервер
  'support:join': (data: { ticketId: string; userId: string; isSupport: boolean }) => void;
  'support:leave': (data: { ticketId: string }) => void;
  'support:typing': (data: { ticketId: string; userId: string; isTyping: boolean }) => void;

  // Сервер -> Клиент
  'support:message:new': (data: {
    ticketId: string;
    message: {
      id: string;
      ticket_id: string;
      sender_id: string;
      sender_type: 'user' | 'support';
      message_text: string;
      is_read: boolean;
      created_at: string;
      sender?: {
        id: string;
        username: string;
        user_id: string;
        avatar?: string | null;
      };
      attachments?: Array<{
        id: string;
        file_name: string;
        file_type: string;
        file_size: number;
        storage_path: string;
        storage_url?: string;
      }>;
    };
  }) => void;
  'support:ticket:updated': (data: {
    ticketId: string;
    ticket: {
      id: string;
      status: 'open' | 'closed' | 'pending';
      assigned_to?: string | null;
      updated_at: string;
      closed_at?: string | null;
    };
  }) => void;
  'support:ticket:assigned': (data: {
    ticketId: string;
    assignedTo: string | null;
    assignedUser: {
      id: string;
      username: string;
      user_id: string;
      avatar?: string | null;
    } | null;
  }) => void;
  'support:typing:status': (data: {
    ticketId: string;
    userId: string;
    username: string;
    isTyping: boolean;
  }) => void;
  'support:message:read': (data: {
    ticketId: string;
    messageIds: string[];
    readBy: 'user' | 'support';
  }) => void;
  'support:error': (data: { message: string; code?: string }) => void;

  // Profile Comments
  'profile:join': (data: { profileId: string }) => void;
  'profile:leave': (data: { profileId: string }) => void;
  'profile:comment:new': (data: {
    profileId: string;
    comment: {
      id: string;
      profile_id: string;
      author_id: string;
      parent_id?: string | null;
      content: string;
      is_pinned: boolean;
      created_at: string;
      author: {
        id: string;
        username: string;
        user_id: string;
        avatar?: string | null;
      };
    };
  }) => void;
}

export type SupportEventName = keyof SupportWebSocketEvents;


