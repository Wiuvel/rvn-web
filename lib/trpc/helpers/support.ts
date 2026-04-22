import { db } from '@/lib/database/db';
import { supportMessages, supportMessageAttachments } from '@/lib/database/schema';
import { inArray, sql } from 'drizzle-orm';
import { batchHasUserRole } from '@/lib/auth/user-roles';
import { getLastMessageLabelForAttachments } from '@/lib/utils/support-messages';
import { cache } from '@/lib/database/cache';
import { logger } from '@/lib/utils/secure-logger';

interface LastMessage {
  id: string;
  message_text: string;
  sender_id: string;
  sender_type: 'user' | 'support';
  created_at: string;
  is_read: boolean;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
  }>;
}

interface RpcLastMessage {
  ticket_id: string;
  id: string;
  message_text: string;
  sender_id: string;
  sender_type?: string | null;
  created_at: string;
  is_read: boolean;
}

export function resolveSenderType(
  msg: { sender_id: string; sender_type?: string | null },
  ticketUserId: string,
  senderRolesMap: Map<string, boolean>,
): 'user' | 'support' {
  if (msg.sender_type) {
    return msg.sender_type === 'support' ? 'support' : 'user';
  }
  if (ticketUserId === msg.sender_id) {
    return 'user';
  }
  return senderRolesMap.get(msg.sender_id) ? 'support' : 'user';
}

export async function resolveLastMessagesForTickets(
  ticketIds: string[],
  tickets: Array<{ id: string; userId: string }>,
): Promise<Record<string, LastMessage | null>> {
  const lastMessagesMap: Record<string, LastMessage | null> = {};
  if (ticketIds.length === 0 || !db) return lastMessagesMap;

  const ticketUserMap = new Map<string, string>();
  for (const t of tickets) {
    if (t.id) ticketUserMap.set(t.id, t.userId);
  }

  try {
    const rawLastMessages = await db.execute(sql`
      WITH ranked_messages AS (
        SELECT sm.ticket_id, sm.id, sm.message_text, sm.sender_id, sm.sender_type, sm.created_at, sm.is_read,
               ROW_NUMBER() OVER (PARTITION BY sm.ticket_id ORDER BY sm.created_at DESC) as rn
        FROM support_messages sm
        WHERE sm.ticket_id IN (${sql.join(
          ticketIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      )
      SELECT ticket_id, id, message_text, sender_id, sender_type, created_at, is_read
      FROM ranked_messages
      WHERE rn = 1
    `);

    const lastMessages: RpcLastMessage[] = (rawLastMessages as any[]).map((row: any) => ({
      ticket_id: row.ticket_id,
      id: row.id,
      message_text: row.message_text,
      sender_id: row.sender_id,
      sender_type: row.sender_type,
      created_at: row.created_at,
      is_read: row.is_read,
    }));

    if (!lastMessages || lastMessages.length === 0) {
      for (const id of ticketIds) lastMessagesMap[id] = null;
      return lastMessagesMap;
    }

    const messagesNeedingRoleCheck = lastMessages.filter((m) => !m.sender_type);
    const senderIds = messagesNeedingRoleCheck.map((m) => m.sender_id).filter(Boolean);
    const senderRolesMap =
      senderIds.length > 0
        ? await batchHasUserRole(senderIds, 'support')
        : new Map<string, boolean>();

    // For messages without sender_type, look up ticket info
    if (messagesNeedingRoleCheck.length > 0) {
      const ids = messagesNeedingRoleCheck.map((m) => m.id);
      const msgInfo = await db
        .select({
          id: supportMessages.id,
          ticketId: supportMessages.ticketId,
          senderId: supportMessages.senderId,
          senderType: supportMessages.senderType,
        })
        .from(supportMessages)
        .where(inArray(supportMessages.id, ids));
      for (const mi of msgInfo) {
        if (mi.senderType) {
          senderRolesMap.set(`_stype_${mi.id}`, mi.senderType === 'support');
        }
      }
    }

    const messagesNeedingAttachments = lastMessages.filter((m) => !m.message_text);
    let attachmentsMap: Record<
      string,
      Array<{
        id: string;
        file_name: string;
        file_type: string;
        file_size: number;
        storage_path: string;
      }>
    > = {};
    if (messagesNeedingAttachments.length > 0) {
      const ids = messagesNeedingAttachments.map((m) => m.id);
      const attData = await db
        .select({
          messageId: supportMessageAttachments.messageId,
          id: supportMessageAttachments.id,
          fileName: supportMessageAttachments.fileName,
          fileType: supportMessageAttachments.fileType,
          fileSize: supportMessageAttachments.fileSize,
          storagePath: supportMessageAttachments.storagePath,
        })
        .from(supportMessageAttachments)
        .where(inArray(supportMessageAttachments.messageId, ids));
      for (const att of attData) {
        if (!attachmentsMap[att.messageId]) attachmentsMap[att.messageId] = [];
        attachmentsMap[att.messageId].push({
          id: att.id,
          file_name: att.fileName,
          file_type: att.fileType,
          file_size: att.fileSize,
          storage_path: att.storagePath,
        });
      }
    }

    for (const msg of lastMessages) {
      const ticketUserId = ticketUserMap.get(msg.ticket_id) || '';
      const senderType = resolveSenderType(msg, ticketUserId, senderRolesMap);
      const attachments = attachmentsMap[msg.id] || [];
      let displayText = msg.message_text || '';
      if (!displayText && attachments.length > 0) {
        displayText = getLastMessageLabelForAttachments(attachments);
      }

      lastMessagesMap[msg.ticket_id] = {
        id: msg.id,
        message_text: displayText,
        sender_id: msg.sender_id,
        sender_type: senderType,
        created_at: msg.created_at,
        is_read: msg.is_read,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }

    for (const id of ticketIds) {
      if (!lastMessagesMap[id]) lastMessagesMap[id] = null;
    }
  } catch (error) {
    logger.error('Error in batch last messages fetch', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketCount: ticketIds.length,
    });
  }

  return lastMessagesMap;
}

export function invalidateTicketCaches(userId: string): void {
  cache.delete(`tickets:${userId}:user:all:all`);
  cache.delete(`tickets:${userId}:user:all:forUser`);
  cache.delete(`tickets:${userId}:user:open:all`);
  cache.delete(`tickets:${userId}:user:open:forUser`);
  cache.deleteByPattern(/^tickets:.*:support:.*$/);
}
