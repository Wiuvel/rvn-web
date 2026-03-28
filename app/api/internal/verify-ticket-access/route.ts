import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/db';
import { supportTickets } from '@/lib/database/schema';
import { eq } from 'drizzle-orm';

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

    if (!db) {
      return NextResponse.json({ allowed: false });
    }

    const rows = await db
      .select({ id: supportTickets.id, userId: supportTickets.userId })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    const ticket = rows[0];
    if (!ticket) {
      return NextResponse.json({ allowed: false });
    }

    return NextResponse.json({ allowed: ticket.userId === userId });
  } catch (error) {
    console.error('[internal/verify-ticket-access] Error:', error);
    return NextResponse.json({ allowed: false }, { status: 500 });
  }
}
