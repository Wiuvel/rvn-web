/**
 * HTTP client for broadcasting events via the external WebSocket server
 * (`rvn-socketio-server`). Replaces direct socket.io server calls.
 *
 * Все типы payload-ов вынесены в `lib/websocket/types.ts` и зеркалят
 * серверный `src/types.ts` (rvn-socketio-server).
 */

import type {
  WsSupportMessage,
  WsTicketUpdate,
  WsProfileComment,
  WsNotificationPayload,
  WsUserProfile,
  BroadcastMessagePayload,
  BroadcastTicketUpdatePayload,
  BroadcastTicketAssignedPayload,
  BroadcastMessageReadPayload,
  BroadcastCommentPayload,
  BroadcastNotificationPayload,
} from './types';

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

export function broadcastNewMessage(ticketId: string, message: WsSupportMessage): void {
  const payload: BroadcastMessagePayload = { ticketId, message };
  broadcast('/broadcast/support/message', payload);
}

export function broadcastTicketUpdate(ticketId: string, ticket: WsTicketUpdate): void {
  const payload: BroadcastTicketUpdatePayload = { ticketId, ticket };
  broadcast('/broadcast/support/ticket-update', payload);
}

export function broadcastTicketAssignment(
  ticketId: string,
  assignedTo: string | null,
  assignedUser: WsUserProfile | null,
): void {
  const payload: BroadcastTicketAssignedPayload = { ticketId, assignedTo, assignedUser };
  broadcast('/broadcast/support/ticket-assigned', payload);
}

export function broadcastMessageRead(
  ticketId: string,
  messageIds: string[],
  readBy: 'user' | 'support',
): void {
  const payload: BroadcastMessageReadPayload = { ticketId, messageIds, readBy };
  broadcast('/broadcast/support/message-read', payload);
}

/** Sends a notification to a specific user via WebSocket user room */
export function broadcastNotification(userId: string, notification: WsNotificationPayload): void {
  const payload: BroadcastNotificationPayload = { userId, notification };
  broadcast('/broadcast/notification', payload);
}

export function broadcastNewComment(profileId: string, comment: WsProfileComment): void {
  const payload: BroadcastCommentPayload = { profileId, comment };
  broadcast('/broadcast/profile/comment', payload);
}
