import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase';

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-internal-api-key');
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ allowed: false }, { status: 401 });
  }

  try {
    const { ticketId, userId, isSupport } = (await req.json()) as {
      ticketId: string;
      userId: string;
      isSupport: boolean;
    };

    if (!ticketId || !userId) {
      return NextResponse.json({ allowed: false });
    }

    // Support can access any ticket
    if (isSupport) {
      return NextResponse.json({ allowed: true });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ allowed: false });
    }

    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id')
      .eq('id', ticketId)
      .single();

    if (error || !ticket) {
      return NextResponse.json({ allowed: false });
    }

    return NextResponse.json({ allowed: ticket.user_id === userId });
  } catch (error) {
    console.error('[internal/verify-ticket-access] Error:', error);
    return NextResponse.json({ allowed: false }, { status: 500 });
  }
}
