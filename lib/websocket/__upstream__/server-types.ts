// ============================================================================
// SNAPSHOT — DO NOT EDIT BY HAND
// ============================================================================
//
// This file is a verbatim copy of `Wiuvel/rvn-socketio-server/src/types.ts`.
//
// Source : https://github.com/Wiuvel/rvn-socketio-server/blob/main/src/types.ts
// Pinned : 633cf3ac5f188bd6cd4009da2011e5d6a011650f
//
// Sync workflow:
//   pnpm run ws:contract:sync   # fetch latest, show diff, update this file
//   pnpm run ws:contract:check  # CI/local: assert ours match this snapshot
//
// Drift detection:
//   `lib/websocket/__contract-check__.ts` performs a structural type-level
//   comparison between this snapshot and `lib/websocket/types.ts`. If the two
//   diverge, `pnpm run type:check` fails — preventing silent drift between
//   the rvn-web client and the rvn-socketio-server.
//
// Everything below this banner is byte-identical to upstream at the pinned
// commit. The body MUST stay byte-identical so `ws:contract:sync` works.
// ============================================================================

/**
 * Shared type definitions for the WebSocket server.
 *
 * Covers authentication, socket data, Socket.IO event contracts,
 * domain models, and internal broadcast payloads.
 *
 * @module types
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Authenticated user identity attached to each socket. */
export interface AuthUser {
  id: string;
  username: string;
  isSupport: boolean;
}

/** Response shape from the rvn-web token verification endpoint. */
export interface VerifyTokenResponse {
  valid: boolean;
  user?: AuthUser;
  error?: string;
}

/** Response shape from the rvn-web ticket access verification endpoint. */
export interface VerifyTicketAccessResponse {
  allowed: boolean;
}

// ---------------------------------------------------------------------------
// Socket Data
// ---------------------------------------------------------------------------

/** Per-socket data populated by the auth middleware. */
export interface SocketData {
  user: AuthUser;
  userId: string;
  isSupport: boolean;
}

// ---------------------------------------------------------------------------
// WebSocket Events
// ---------------------------------------------------------------------------

/** Acknowledgement callback response for client-initiated events. */
export interface AckResponse {
  ok: boolean;
  error?: string;
}

/**
 * Bidirectional Socket.IO event map.
 *
 * Client-to-server events use acknowledgement callbacks where needed.
 * Server-to-client events carry typed payloads for each domain.
 */
export interface WebSocketEvents {
  // Client -> Server
  'support:join': (data: { ticketId: string }, ack: (response: AckResponse) => void) => void;
  'support:leave': (data: { ticketId: string }) => void;
  'support:typing': (data: { ticketId: string; isTyping: boolean }) => void;

  // Server -> Client
  'support:message:new': (data: { ticketId: string; message: SupportMessage }) => void;
  'support:ticket:updated': (data: { ticketId: string; ticket: TicketUpdate }) => void;
  'support:ticket:assigned': (data: {
    ticketId: string;
    assignedTo: string | null;
    assignedUser: UserProfile | null;
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

  /* Profile Comments */
  'profile:join': (data: { profileId: string }) => void;
  'profile:leave': (data: { profileId: string }) => void;
  'profile:comment:new': (data: { profileId: string; comment: ProfileComment }) => void;

  /* Notifications */
  'notification:new': (data: { notification: NotificationPayload }) => void;

  /* System */
  'system:notification': (data: BroadcastSystemPayload) => void;
}

// ---------------------------------------------------------------------------
// Domain Models
// ---------------------------------------------------------------------------

/** Public user profile (used in messages, comments, assignments). */
export interface UserProfile {
  id: string;
  username: string;
  user_id: string;
  avatar?: string | null;
}

/** Support ticket message with optional attachments. */
export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: 'user' | 'support';
  message_text: string;
  is_read: boolean;
  created_at: string;
  sender?: UserProfile;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
    storage_url?: string;
  }>;
}

/** Ticket status update payload. */
export interface TicketUpdate {
  id: string;
  status: 'open' | 'closed' | 'pending';
  assigned_to?: string | null;
  updated_at: string;
  closed_at?: string | null;
}

/** User profile comment with optional threading. */
export interface ProfileComment {
  id: string;
  profile_id: string;
  author_id: string;
  parent_id?: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  author: UserProfile;
}

// ---------------------------------------------------------------------------
// Broadcast Payloads (REST API from rvn-web)
// ---------------------------------------------------------------------------

/** Payload for `POST /broadcast/support/message`. */
export interface BroadcastMessagePayload {
  ticketId: string;
  message: SupportMessage;
}

/** Payload for `POST /broadcast/support/ticket-update`. */
export interface BroadcastTicketUpdatePayload {
  ticketId: string;
  ticket: TicketUpdate;
}

/** Payload for `POST /broadcast/support/ticket-assigned`. */
export interface BroadcastTicketAssignedPayload {
  ticketId: string;
  assignedTo: string | null;
  assignedUser: UserProfile | null;
}

/** Payload for `POST /broadcast/support/message-read`. */
export interface BroadcastMessageReadPayload {
  ticketId: string;
  messageIds: string[];
  readBy: 'user' | 'support';
}

/** Payload for `POST /broadcast/profile/comment`. */
export interface BroadcastCommentPayload {
  profileId: string;
  comment: ProfileComment;
}

/** Notification payload for real-time delivery to user rooms. */
export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  count: number;
  related_ticket_id?: string | null;
  created_at: string;
}

/** Payload for `POST /broadcast/notification`. */
export interface BroadcastNotificationPayload {
  userId: string;
  notification: NotificationPayload;
}

/** Payload for `POST /broadcast/system`. */
export interface BroadcastSystemPayload {
  message: string;
  type?: 'info' | 'warning' | 'error';
}
