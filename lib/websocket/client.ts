/**
 * HTTP client for broadcasting events via the external WebSocket server.
 * Replaces direct socket.io server calls.
 */

const WS_SERVER_URL = process.env.WEBSOCKET_SERVER_URL || 'http://localhost:3002';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

async function broadcast(path: string, data: unknown): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${WS_SERVER_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-api-key': INTERNAL_API_KEY,
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
      console.error(`[ws-client] Broadcast ${path} failed: ${res.status}`);
    } catch (error) {
      console.error(
        `[ws-client] Broadcast ${path} error (attempt ${attempt + 1}):`,
        error instanceof Error ? error.message : error,
      );
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
}

export function broadcastNewMessage(
  ticketId: string,
  message: {
    id: string;
    ticket_id: string;
    sender_id: string;
    sender_type: 'user' | 'support';
    message_text: string;
    is_read: boolean;
    created_at: string;
    sender?: { id: string; username: string; user_id: string; avatar?: string | null };
    attachments?: Array<{
      id: string;
      file_name: string;
      file_type: string;
      file_size: number;
      storage_path: string;
      storage_url?: string;
    }>;
  },
): void {
  broadcast('/broadcast/support/message', { ticketId, message });
}

export function broadcastTicketUpdate(
  ticketId: string,
  ticket: {
    id: string;
    status: 'open' | 'closed' | 'pending';
    assigned_to?: string | null;
    updated_at: string;
    closed_at?: string | null;
  },
): void {
  broadcast('/broadcast/support/ticket-update', { ticketId, ticket });
}

export function broadcastTicketAssignment(
  ticketId: string,
  assignedTo: string | null,
  assignedUser: { id: string; username: string; user_id: string; avatar?: string | null } | null,
): void {
  broadcast('/broadcast/support/ticket-assigned', { ticketId, assignedTo, assignedUser });
}

export function broadcastMessageRead(
  ticketId: string,
  messageIds: string[],
  readBy: 'user' | 'support',
): void {
  broadcast('/broadcast/support/message-read', { ticketId, messageIds, readBy });
}

/** Sends a notification to a specific user via WebSocket user room */
export function broadcastNotification(
  userId: string,
  notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    is_read: boolean;
    count: number;
    related_ticket_id?: string | null;
    created_at: string;
  },
): void {
  broadcast('/broadcast/notification', { userId, notification });
}

export function broadcastNewComment(
  profileId: string,
  comment: {
    id: string;
    profile_id: string;
    author_id: string;
    parent_id?: string | null;
    content: string;
    is_pinned: boolean;
    created_at: string;
    author: { id: string; username: string; user_id: string; avatar?: string | null };
  },
): void {
  broadcast('/broadcast/profile/comment', { profileId, comment });
}
