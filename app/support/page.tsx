import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole } from '@/lib/auth/user-roles';
import { supabaseAdmin } from '@/lib/database/supabase';
import SupportClient from '@/components/support/SupportClient';
import { UserData } from '@/types';
import type { RawTicketApi, RawMessageApi } from '@/lib/types/support-api';

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ ticketId?: string }>;
}) {
  const headersList = await headers();
  const authResult = await checkAuth({ headers: headersList }, { readOnly: true });
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  // If token exists but auth fails, clear cookies via restore route (which handles invalid tokens)
  if (token && (!authResult.isAuthenticated || !authResult.user)) {
    redirect(`/api/auth/restore?redirect=/support`);
  }

  if (!authResult.isAuthenticated || !authResult.user) {
    // Redirect to login if not authenticated
    // Or pass null to client which will handle it (show empty state or redirect)
    // Given the previous client logic, it expected userData to be null and then did nothing?
    // Actually lines 382-384: if (!user_id) setUserData(null); setIsSupport(false);
    // So client can handle null.
    return (
      <SupportClient
        initialUserData={null}
        initialTickets={[]}
        initialActiveTicket={null}
        initialMessages={[]}
      />
    );
  }

  const user = authResult.user;

  // Check user roles
  const isSupport = await hasUserRole(user.id, 'support');
  const isAdmin = await hasUserRole(user.id, 'admin');

  // Construct UserData object expected by client
  const userData: UserData = {
    id: user.id,
    user_id: user.user_id,
    username: user.username,
    avatar: user.avatar,
    banner: user.banner,
    token: token || user.token,
    isSupport,
    isAdmin,
    created_at: user.created_at,
    pex: isAdmin ? 'a' : isSupport ? 's' : 'u',
  };

  // Fetch tickets for the user
  // Replicating logic from /api/support/tickets with forUser=true
  let ticketsData: RawTicketApi[] = [];
  let selectedTicket: RawTicketApi | null = null;
  let selectedTicketMessages: RawMessageApi[] = [];

  try {
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('support_tickets')
        .select(
          `
          *,
          last_message:support_messages(
            id,
            message_text,
            created_at,
            sender_id,
            is_read
          )
        `,
        )
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching tickets:', error);
      } else {
        ticketsData = (data || []) as RawTicketApi[];

        // Post-process last_message to be a single object instead of array
        ticketsData = ticketsData.map((t) => ({
          ...t,
          last_message:
            Array.isArray(t.last_message) && t.last_message.length > 0 ? t.last_message[0] : null,
        }));
      }

      // Fetch selected ticket details if present
      const { ticketId } = await searchParams;
      if (ticketId) {
        // Find in already fetched tickets first to save DB call
        selectedTicket = ticketsData.find((t) => t.id === ticketId) ?? null;

        // If not in the list (e.g. might be closed/archived if we filtered them, but here we fetch all for user)
        // But if we paginate, it might be missing. For now we fetch all for user so it should be there.
        // If not found, we could fetch it explicitly, but let's assume it's in the list or access denied.

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
    console.error('Unexpected error fetching tickets:', err);
  }

  return (
    <SupportClient
      initialUserData={userData}
      initialTickets={ticketsData}
      initialActiveTicket={selectedTicket}
      initialMessages={selectedTicketMessages}
    />
  );
}
