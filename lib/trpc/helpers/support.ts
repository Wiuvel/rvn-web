import { supabaseAdmin } from '@/lib/database/supabase';
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
  tickets: Array<{ id: string; user_id: string }>,
): Promise<Record<string, LastMessage | null>> {
  const lastMessagesMap: Record<string, LastMessage | null> = {};
  if (ticketIds.length === 0 || !supabaseAdmin) return lastMessagesMap;

  const ticketUserMap = new Map<string, string>();
  for (const t of tickets) {
    if (t.id) ticketUserMap.set(t.id, t.user_id);
  }

  try {
    const { data: lastMessages, error: rpcError } = (await supabaseAdmin.rpc(
      'get_last_messages_for_tickets',
      { ticket_ids: ticketIds },
    )) as { data: RpcLastMessage[] | null; error: any };

    if (rpcError) {
      logger.warn('RPC function failed, using fallback', {
        error: rpcError.message,
        ticketCount: ticketIds.length,
      });
      return resolveLastMessagesFallback(ticketIds, ticketUserMap);
    }

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
      const { data: msgInfo } = await supabaseAdmin
        .from('support_messages')
        .select('id, ticket_id, sender_id, sender_type')
        .in('id', ids);
      if (msgInfo) {
        for (const mi of msgInfo) {
          if (mi.sender_type) {
            senderRolesMap.set(`_stype_${mi.id}`, mi.sender_type === 'support');
          }
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
      const { data: attData } = await supabaseAdmin
        .from('support_message_attachments')
        .select('message_id, id, file_name, file_type, file_size, storage_path')
        .in('message_id', ids);
      if (attData) {
        for (const att of attData) {
          if (!attachmentsMap[att.message_id]) attachmentsMap[att.message_id] = [];
          attachmentsMap[att.message_id].push({
            id: att.id,
            file_name: att.file_name,
            file_type: att.file_type,
            file_size: att.file_size,
            storage_path: att.storage_path,
          });
        }
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

async function resolveLastMessagesFallback(
  ticketIds: string[],
  ticketUserMap: Map<string, string>,
): Promise<Record<string, LastMessage | null>> {
  const result: Record<string, LastMessage | null> = {};
  if (!supabaseAdmin) return result;

  const BATCH_SIZE = 10;
  for (let i = 0; i < ticketIds.length; i += BATCH_SIZE) {
    const batch = ticketIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (ticketId) => {
        const { data: lastMessage } = await supabaseAdmin!
          .from('support_messages')
          .select(
            `id, message_text, sender_id, sender_type, created_at, is_read,
            attachments:support_message_attachments(id, file_name, file_type, file_size, storage_path)`,
          )
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { ticketId, lastMessage: lastMessage || null };
      }),
    );

    const messagesNeedingRoles = batchResults
      .map((r) => r.lastMessage)
      .filter((m): m is NonNullable<typeof m> => !!m && !m.sender_type);
    const senderIds = messagesNeedingRoles.map((m) => m.sender_id).filter(Boolean);
    const senderRolesMap =
      senderIds.length > 0
        ? await batchHasUserRole(senderIds, 'support')
        : new Map<string, boolean>();

    for (const { ticketId, lastMessage } of batchResults) {
      if (!lastMessage) {
        result[ticketId] = null;
        continue;
      }
      const ticketUserId = ticketUserMap.get(ticketId) || '';
      const senderType = resolveSenderType(lastMessage, ticketUserId, senderRolesMap);

      let attachments: Array<{
        id: string;
        file_name: string;
        file_type: string;
        file_size: number;
        storage_path: string;
      }> = [];
      if (Array.isArray(lastMessage.attachments)) {
        attachments = lastMessage.attachments.map((att: any) => ({
          id: att.id,
          file_name: att.file_name,
          file_type: att.file_type,
          file_size: att.file_size,
          storage_path: att.storage_path,
        }));
      }

      let displayText = lastMessage.message_text;
      if (!displayText && attachments.length > 0) {
        displayText = getLastMessageLabelForAttachments(attachments);
      }

      result[ticketId] = {
        id: lastMessage.id,
        message_text: displayText,
        sender_id: lastMessage.sender_id,
        sender_type: senderType,
        created_at: lastMessage.created_at,
        is_read: lastMessage.is_read,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }
  }

  return result;
}

export function invalidateTicketCaches(userId: string): void {
  cache.delete(`tickets:${userId}:user:all:all`);
  cache.delete(`tickets:${userId}:user:all:forUser`);
  cache.delete(`tickets:${userId}:user:open:all`);
  cache.delete(`tickets:${userId}:user:open:forUser`);
  cache.deleteByPattern(/^tickets:.*:support:.*$/);
}
