import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole } from '@/lib/auth/user-roles';
import { supabaseAdmin } from '@/lib/database/supabase';
import AdminSupportClient from '@/components/support/AdminSupportClient';
import type { RawTicketApi, RawMessageApi } from '@/lib/types/support-api';

export default async function SupportPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ ticketId?: string }>;
}) {
  const headersList = await headers();
  const authResult = await checkAuth({ headers: headersList }, { readOnly: true });
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  // If token exists but auth fails, clear cookies via restore route
  if (token && (!authResult.isAuthenticated || !authResult.user)) {
    redirect(`/api/auth/restore?redirect=/ui/panel/support`);
  }

  if (!authResult.isAuthenticated || !authResult.user) {
    redirect('/auth/login?redirect=/ui/panel/support');
  }

  const user = authResult.user;
  const isSupport = await hasUserRole(user.id, 'support');
  const isAdmin = await hasUserRole(user.id, 'admin');

  if (!isSupport && !isAdmin) {
    redirect('/dashboard');
  }

  // Construct AuthState
  const authState = {
    isAuthenticated: true,
    hasSupportAccess: true,
    username: user.username,
    userId: user.user_id,
    user_id: user.user_id,
  };

  // Fetch tickets (initial status='active' -> open, pending)
  let tickets: RawTicketApi[] = [];
  let selectedTicketMessages: RawMessageApi[] = [];
  let selectedTicket: RawTicketApi | null = null;

  try {
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('support_tickets')
        .select(
          `
          *,
          user:users!support_tickets_user_id_fkey(id, username, user_id, avatar),
          assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar)
        `,
        )
        .in('status', ['open', 'pending'])
        .order('last_message_at', { ascending: false });

      if (!error && data) {
        tickets = data as RawTicketApi[];

        // Fetch last messages via RPC
        const ticketIds = tickets.map((t) => t.id);
        if (ticketIds.length > 0) {
          const { data: lastMessages, error: rpcError } = await supabaseAdmin.rpc(
            'get_last_messages_for_tickets',
            { ticket_ids: ticketIds },
          );

          if (!rpcError && lastMessages && Array.isArray(lastMessages)) {
            type RpcLastMessage = (typeof lastMessages)[number] & { ticket_id: string };
            const messagesMap = (lastMessages as RpcLastMessage[]).reduce<
              Record<string, RawTicketApi['last_message']>
            >((acc, m) => {
              acc[m.ticket_id] = m as RawTicketApi['last_message'];
              return acc;
            }, {} as Record<string, RawTicketApi['last_message']>);

            tickets = tickets.map((t) => ({
              ...t,
              last_message: messagesMap[t.id] || null,
            }));
          }
        }
      } else if (error) {
        console.error('Error fetching admin tickets:', error);
      }

      // Fetch selected ticket details if present
      const { ticketId } = await searchParams;
      if (ticketId) {
        // Find in already fetched tickets first to save DB call
        selectedTicket = tickets.find((t) => t.id === ticketId) ?? null;

        if (!selectedTicket) {
          // If not in the list (e.g. closed), fetch it
          const { data: ticketData, error: ticketError } = await supabaseAdmin
            .from('support_tickets')
            .select(
              `
                *,
                user:users!support_tickets_user_id_fkey(id, username, user_id, avatar),
                assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar)
              `,
            )
            .eq('id', ticketId)
            .single();

          if (!ticketError && ticketData) {
            selectedTicket = ticketData as RawTicketApi;
          }
        }

        if (selectedTicket) {
          const { data: messagesData, error: messagesError } = await supabaseAdmin
            .from('support_messages')
            .select(
              `
               id,
               ticket_id,
               sender_id,
               sender_type,
               message_text,
               is_read,
               created_at,
               sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar),
               attachments:message_attachments(*)
             `,
            )
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

          if (!messagesError && messagesData) {
            selectedTicketMessages = messagesData as RawMessageApi[];
          }
        }
      }
    }
  } catch (err) {
    console.error('Unexpected error fetching admin tickets:', err);
  }

  return (
    <AdminSupportClient
      key={JSON.stringify({
        activeTicketId: selectedTicket?.id,
        ticketsCount: tickets.length,
        firstTicketId: tickets[0]?.id,
      })}
      initialAuthState={authState}
      initialWsToken={token || user.token}
      initialTickets={tickets}
      initialActiveTicket={selectedTicket}
      initialMessages={selectedTicketMessages}
    />
  );
}
