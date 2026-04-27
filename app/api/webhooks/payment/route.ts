import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/db';
import { payments } from '@/lib/database/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/utils/secure-logger';

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest) {
  if (!db) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const secret = req.headers.get('x-webhook-secret');
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    logger.warn('[webhook/payment] Invalid or missing webhook secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      paymentId?: string;
      status?: string;
      providerPaymentId?: string;
    };

    if (!body.paymentId || !body.status) {
      return NextResponse.json({ error: 'Missing paymentId or status' }, { status: 400 });
    }

    const validStatuses = ['completed', 'failed'];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const [payment] = await db
      .select({ id: payments.id, status: payments.status })
      .from(payments)
      .where(eq(payments.id, body.paymentId))
      .limit(1);

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (payment.status !== 'pending') {
      return NextResponse.json({ error: 'Payment already processed' }, { status: 409 });
    }

    await db
      .update(payments)
      .set({
        status: body.status,
        providerPaymentId: body.providerPaymentId || null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, body.paymentId));

    logger.info(`[webhook/payment] Payment ${body.paymentId} → ${body.status}`);
    /*
     * TODO: If status === 'completed', activate the subscription:
     * 1. Create a Remnawave user (rwCreateUser);
     * 2. Assign Squad (addUsersToSquad);
     * 3. Update subscription (status → 'active');
     * 4. Invalidate the authorization cache.
     */
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[webhook/payment] Error', { error: message });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
