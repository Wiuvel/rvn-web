-- Postgres-only objects that cannot be expressed in lib/database/schema.ts
-- (extensions, CHECK constraints, triggers, plpgsql functions).
-- These are intentionally maintained by hand and run after the auto-generated
-- DDL in 0000_initial.sql. Re-runs are safe (CREATE OR REPLACE / IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--> statement-breakpoint

-- ============================================================================
-- CHECK constraints (enum-style columns)
-- ============================================================================
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE "user_roles"
  ADD CONSTRAINT user_roles_role_check
  CHECK ("role" IN ('user', 'support', 'admin'));
--> statement-breakpoint

ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE "support_tickets"
  ADD CONSTRAINT support_tickets_status_check
  CHECK ("status" IN ('open', 'pending', 'closed'));
--> statement-breakpoint

ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS support_tickets_priority_check;
ALTER TABLE "support_tickets"
  ADD CONSTRAINT support_tickets_priority_check
  CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
--> statement-breakpoint

ALTER TABLE "support_messages" DROP CONSTRAINT IF EXISTS support_messages_sender_type_check;
ALTER TABLE "support_messages"
  ADD CONSTRAINT support_messages_sender_type_check
  CHECK ("sender_type" IN ('user', 'support'));
--> statement-breakpoint

ALTER TABLE "profile_comments" DROP CONSTRAINT IF EXISTS profile_comments_content_check;
ALTER TABLE "profile_comments"
  ADD CONSTRAINT profile_comments_content_check
  CHECK (length("content") > 0 AND length("content") <= 1000);
--> statement-breakpoint

ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE "subscriptions"
  ADD CONSTRAINT subscriptions_status_check
  CHECK ("status" IN ('pending', 'active', 'expired', 'disabled', 'limited', 'cancelled'));
--> statement-breakpoint

ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS subscriptions_traffic_strategy_check;
ALTER TABLE "subscriptions"
  ADD CONSTRAINT subscriptions_traffic_strategy_check
  CHECK ("traffic_limit_strategy" IN ('NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING'));
--> statement-breakpoint

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE "payments"
  ADD CONSTRAINT payments_status_check
  CHECK ("status" IN ('pending', 'completed', 'failed', 'refunded'));
--> statement-breakpoint

-- ============================================================================
-- updated_at trigger function + per-table triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_admins_updated_at ON "admins";
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON "admins"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_users_updated_at ON "users";
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_user_devices_updated_at ON "user_devices";
CREATE TRIGGER update_user_devices_updated_at BEFORE UPDATE ON "user_devices"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_user_roles_updated_at ON "user_roles";
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON "user_roles"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON "support_tickets";
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON "support_tickets"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_trusted_github_developers_updated_at ON "trusted_github_developers";
CREATE TRIGGER update_trusted_github_developers_updated_at BEFORE UPDATE ON "trusted_github_developers"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_profile_comments_updated_at ON "profile_comments";
CREATE TRIGGER update_profile_comments_updated_at BEFORE UPDATE ON "profile_comments"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_panel_settings_updated_at ON "panel_settings";
CREATE TRIGGER update_panel_settings_updated_at BEFORE UPDATE ON "panel_settings"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON "subscriptions";
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON "subscriptions"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS update_payments_updated_at ON "payments";
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON "payments"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

-- ============================================================================
-- support_tickets.last_message_at bump
-- ============================================================================
CREATE OR REPLACE FUNCTION update_ticket_last_message_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE "support_tickets" SET last_message_at = NEW.created_at WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trigger_update_ticket_last_message_at ON "support_messages";
CREATE TRIGGER trigger_update_ticket_last_message_at
    AFTER INSERT ON "support_messages"
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_last_message_at();
--> statement-breakpoint

-- ============================================================================
-- RPC: get_last_messages_for_tickets
-- ============================================================================
DROP FUNCTION IF EXISTS get_last_messages_for_tickets(UUID[]);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_last_messages_for_tickets(ticket_ids UUID[])
RETURNS TABLE (
    ticket_id UUID,
    id UUID,
    message_text TEXT,
    sender_id UUID,
    sender_type TEXT,
    created_at TIMESTAMPTZ,
    is_read BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH ranked_messages AS (
        SELECT sm.ticket_id, sm.id, sm.message_text, sm.sender_id, sm.sender_type, sm.created_at, sm.is_read,
               ROW_NUMBER() OVER (PARTITION BY sm.ticket_id ORDER BY sm.created_at DESC) as rn
        FROM "support_messages" sm
        WHERE sm.ticket_id = ANY(ticket_ids)
    )
    SELECT rm.ticket_id, rm.id, rm.message_text, rm.sender_id, rm.sender_type, rm.created_at, rm.is_read
    FROM ranked_messages rm
    WHERE rm.rn = 1;
END;
$$;
--> statement-breakpoint

-- ============================================================================
-- RPC: create_ticket_with_message
-- ============================================================================
CREATE OR REPLACE FUNCTION create_ticket_with_message(
    p_user_id UUID,
    p_subject TEXT,
    p_message_text TEXT
)
RETURNS TABLE (
    ticket_id UUID,
    ticket_created_at TIMESTAMPTZ,
    message_id UUID,
    message_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket_id UUID;
    v_message_id UUID;
    v_ticket_created_at TIMESTAMPTZ;
    v_message_created_at TIMESTAMPTZ;
BEGIN
    INSERT INTO "support_tickets" (user_id, subject, status)
    VALUES (p_user_id, p_subject, 'open')
    RETURNING id, created_at INTO v_ticket_id, v_ticket_created_at;

    INSERT INTO "support_messages" (ticket_id, sender_id, message_text, sender_type)
    VALUES (v_ticket_id, p_user_id, p_message_text, 'user')
    RETURNING id, created_at INTO v_message_id, v_message_created_at;

    RETURN QUERY SELECT v_ticket_id, v_ticket_created_at, v_message_id, v_message_created_at;
EXCEPTION
    WHEN OTHERS THEN RAISE;
END;
$$;
--> statement-breakpoint

-- ============================================================================
-- profile_comments: limit and self-comment guard
-- ============================================================================
CREATE OR REPLACE FUNCTION check_comment_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    comment_count INTEGER;
BEGIN
    -- Forbid top-level comments on the author's own profile (replies are allowed)
    IF NEW.parent_id IS NULL AND NEW.profile_id = NEW.author_id THEN
        RAISE EXCEPTION 'Cannot comment on your own profile';
    END IF;
    -- Hidden cap: maximum 5 comments per profile from the same author
    SELECT COUNT(*) INTO comment_count
      FROM "profile_comments"
      WHERE profile_id = NEW.profile_id AND author_id = NEW.author_id;
    IF comment_count >= 5 THEN
        RAISE EXCEPTION 'Comment limit reached for this profile';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trigger_check_comment_limit ON "profile_comments";
CREATE TRIGGER trigger_check_comment_limit
    BEFORE INSERT ON "profile_comments"
    FOR EACH ROW
    EXECUTE FUNCTION check_comment_limit();
