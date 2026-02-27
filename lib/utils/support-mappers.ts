/**
 * Mappers from Support API (raw) types to UI types.
 */

import type {
  RawTicketApi,
  RawMessageApi,
  RawAttachmentApi,
  RawLastMessageApi,
} from '@/lib/types/support-api';
import type { Ticket, Message, MessageAttachment, LastMessagePreview } from '@/components/support/types';

function buildStorageUrl(storagePath: string | undefined): string {
  return storagePath ? `/support/files/${encodeURIComponent(storagePath)}` : '';
}

export function mapRawAttachmentToUi(raw: RawAttachmentApi): MessageAttachment {
  return {
    id: raw.id,
    file_name: raw.file_name,
    file_type: raw.file_type,
    file_size: raw.file_size,
    storage_path: raw.storage_path,
    storage_url: raw.storage_url ?? buildStorageUrl(raw.storage_path),
    blur_hash: raw.blur_hash,
    width: raw.width,
    height: raw.height,
  };
}

function normalizeSender(
  sender: RawMessageApi['sender'],
): { id: string; username: string; user_id: string; avatar?: string | null } | undefined {
  if (!sender) return undefined;
  const s = Array.isArray(sender) ? sender[0] : sender;
  return s
    ? {
        id: s.id,
        username: s.username,
        user_id: s.user_id,
        avatar: s.avatar ?? null,
      }
    : undefined;
}

export function mapRawMessageToUi(raw: RawMessageApi): Message {
  return {
    id: raw.id,
    text: raw.message_text,
    sender: raw.sender_type,
    timestamp: new Date(raw.created_at),
    isRead: raw.is_read,
    senderData: normalizeSender(raw.sender),
    attachments:
      raw.attachments && raw.attachments.length > 0
        ? raw.attachments.map(mapRawAttachmentToUi)
        : undefined,
  };
}

function normalizeLastMessage(
  lm: RawLastMessageApi | null | undefined,
): LastMessagePreview | null {
  if (!lm) return null;
  const attachments =
    lm.attachments?.map((a) => ({
      id: a.id,
      file_name: a.file_name,
      file_type: a.file_type,
      file_size: a.file_size,
      storage_path: a.storage_path ?? '',
    })) ?? undefined;
  return {
    id: lm.id,
    message_text: lm.message_text,
    sender_type: lm.sender_type ?? 'user',
    created_at: lm.created_at,
    is_read: lm.is_read ?? false,
    attachments: attachments?.length ? attachments : undefined,
  };
}

export function mapRawTicketToUi(raw: RawTicketApi, messages: Message[] = []): Ticket {
  return {
    id: raw.id,
    subject: raw.subject,
    status: raw.status,
    createdAt: new Date(raw.created_at ?? raw.id),
    user_id: raw.user_id,
    messages,
    last_message: normalizeLastMessage(raw.last_message),
    unread_count: raw.unread_count,
    updated_at: raw.updated_at,
  };
}

/**
 * Map raw tickets from API to UI tickets (list view - no messages loaded).
 */
export function mapRawTicketsToUi(rawTickets: RawTicketApi[]): Ticket[] {
  return rawTickets.map((t) => mapRawTicketToUi(t, []));
}

/**
 * Map raw ticket + raw messages to a single UI ticket with messages.
 */
export function mapRawTicketWithMessagesToUi(
  rawTicket: RawTicketApi,
  rawMessages: RawMessageApi[],
): Ticket {
  const messages = rawMessages.map(mapRawMessageToUi);
  return mapRawTicketToUi(rawTicket, messages);
}
