/**
 * Shared types for the WebSocket contract.
 *
 * Source of truth: `Wiuvel/rvn-socketio-server` (`src/types.ts`).
 * Эти типы должны соответствовать серверным один-в-один. При изменении
 * контракта на стороне `rvn-socketio-server` обновите и этот файл.
 *
 * Сюда выносится shape всех сообщений Socket.IO + REST broadcast payload-ов,
 * чтобы `lib/websocket/client.ts` и `hooks/useWebSocket.ts` опирались на одни
 * и те же типы.
 *
 * @module lib/websocket/types
 */

/* ------------------------------------------------------------------------- */
/* Domain models                                                              */
/* ------------------------------------------------------------------------- */

/** Public user profile (used in messages, comments, assignments). */
export interface WsUserProfile {
  id: string;
  username: string;
  user_id: string;
  avatar?: string | null;
}

/** Single attachment on a support message. */
export interface WsMessageAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  storage_url?: string;
}

/** Support ticket message with optional attachments. */
export interface WsSupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: 'user' | 'support';
  message_text: string;
  is_read: boolean;
  created_at: string;
  sender?: WsUserProfile;
  attachments?: WsMessageAttachment[];
}

/** Ticket status update payload. */
export interface WsTicketUpdate {
  id: string;
  status: 'open' | 'closed' | 'pending';
  assigned_to?: string | null;
  updated_at: string;
  closed_at?: string | null;
}

/** User profile comment with optional threading. */
export interface WsProfileComment {
  id: string;
  profile_id: string;
  author_id: string;
  parent_id?: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  author: WsUserProfile;
}

/** Notification payload for real-time delivery to user rooms. */
export interface WsNotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  count: number;
  related_ticket_id?: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------------- */
/* REST broadcast payloads (rvn-web → rvn-socketio-server)                    */
/* ------------------------------------------------------------------------- */

/** `POST /broadcast/support/message` */
export interface BroadcastMessagePayload {
  ticketId: string;
  message: WsSupportMessage;
}

/** `POST /broadcast/support/ticket-update` */
export interface BroadcastTicketUpdatePayload {
  ticketId: string;
  ticket: WsTicketUpdate;
}

/** `POST /broadcast/support/ticket-assigned` */
export interface BroadcastTicketAssignedPayload {
  ticketId: string;
  assignedTo: string | null;
  assignedUser: WsUserProfile | null;
}

/** `POST /broadcast/support/message-read` */
export interface BroadcastMessageReadPayload {
  ticketId: string;
  messageIds: string[];
  readBy: 'user' | 'support';
}

/** `POST /broadcast/profile/comment` */
export interface BroadcastCommentPayload {
  profileId: string;
  comment: WsProfileComment;
}

/** `POST /broadcast/notification` */
export interface BroadcastNotificationPayload {
  userId: string;
  notification: WsNotificationPayload;
}

/** `POST /broadcast/system` */
export interface BroadcastSystemPayload {
  message: string;
  type?: 'info' | 'warning' | 'error';
}

/* ------------------------------------------------------------------------- */
/* Socket.IO event map                                                        */
/* ------------------------------------------------------------------------- */

/** Acknowledgement callback response for client-initiated events. */
export interface AckResponse {
  ok: boolean;
  error?: string;
}

/**
 * Bidirectional Socket.IO event map.
 *
 * Зеркало `WebSocketEvents` из `rvn-socketio-server/src/types.ts`.
 */
export interface WebSocketEvents {
  /* Client → Server */
  'support:join': (data: { ticketId: string }, ack: (response: AckResponse) => void) => void;
  'support:leave': (data: { ticketId: string }) => void;
  'support:typing': (data: { ticketId: string; isTyping: boolean }) => void;

  'profile:join': (data: { profileId: string }) => void;
  'profile:leave': (data: { profileId: string }) => void;

  /* Server → Client */
  'support:message:new': (data: BroadcastMessagePayload) => void;
  'support:ticket:updated': (data: BroadcastTicketUpdatePayload) => void;
  'support:ticket:assigned': (data: BroadcastTicketAssignedPayload) => void;
  'support:typing:status': (data: {
    ticketId: string;
    userId: string;
    username: string;
    isTyping: boolean;
  }) => void;
  'support:message:read': (data: BroadcastMessageReadPayload) => void;
  'support:error': (data: { message: string; code?: string }) => void;

  'profile:comment:new': (data: BroadcastCommentPayload) => void;

  'notification:new': (data: { notification: WsNotificationPayload }) => void;
  'system:notification': (data: BroadcastSystemPayload) => void;
}
