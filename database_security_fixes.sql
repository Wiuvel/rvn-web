-- ============================================
-- SQL Security Fixes for Raven Private Support System
-- Выполните эти команды для исправления проблем безопасности
-- ============================================

-- 1. Исправление Views: устанавливаем security_invoker вместо SECURITY DEFINER
ALTER VIEW IF EXISTS support_tickets_view SET (security_invoker = true);
ALTER VIEW IF EXISTS support_messages_view SET (security_invoker = true);

-- 2. Исправление функций: добавляем SET search_path
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

CREATE OR REPLACE FUNCTION update_ticket_last_message()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE support_tickets
    SET last_message_at = NEW.created_at
    WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$;

-- 3. Создание/исправление функции cleanup_expired_sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Здесь можно добавить логику очистки истекших сессий
    -- Например, удаление записей из таблицы sessions старше определенного времени
    -- DELETE FROM sessions WHERE expires_at < NOW();
    NULL;
END;
$$;

-- 4. Исправление производительности RLS политик для таблицы admins
-- Заменяем auth.uid() на (select auth.uid()) для оптимизации производительности
-- Это предотвращает переоценку функции для каждой строки

-- Исправление политики "Allow read access for authenticated users"
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON admins;
CREATE POLICY "Allow read access for authenticated users" ON admins
    FOR SELECT USING ((select auth.uid()) IS NOT NULL);

-- Исправление политики "Allow insert for authenticated users"
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON admins;
CREATE POLICY "Allow insert for authenticated users" ON admins
    FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);

-- Исправление политики "Allow update for authenticated users"
DROP POLICY IF EXISTS "Allow update for authenticated users" ON admins;
CREATE POLICY "Allow update for authenticated users" ON admins
    FOR UPDATE USING ((select auth.uid()) IS NOT NULL);

-- 5. RLS (Row Level Security) - отключение, если политики не нужны
-- Раскомментируйте эти строки, если RLS включен, но политики не используются:
-- ALTER TABLE IF EXISTS user_roles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS support_tickets DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS support_messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;

-- Или добавьте политики, если RLS нужен (примеры ниже):

-- Политики для user_roles (оптимизированные с (select auth.uid()))
-- CREATE POLICY IF NOT EXISTS "Users can view their own roles" ON user_roles
--     FOR SELECT USING ((select auth.uid()) = user_id);
-- 
-- CREATE POLICY IF NOT EXISTS "Admins can manage all roles" ON user_roles
--     FOR ALL USING (
--         EXISTS (SELECT 1 FROM user_roles WHERE user_id = (select auth.uid()) AND role = 'admin' AND is_active = TRUE)
--     );

-- Политики для support_tickets (оптимизированные с (select auth.uid()))
-- CREATE POLICY IF NOT EXISTS "Users can view their own tickets" ON support_tickets
--     FOR SELECT USING ((select auth.uid()) = user_id);
-- 
-- CREATE POLICY IF NOT EXISTS "Users can create their own tickets" ON support_tickets
--     FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
-- 
-- CREATE POLICY IF NOT EXISTS "Support can view all tickets" ON support_tickets
--     FOR SELECT USING (
--         EXISTS (SELECT 1 FROM user_roles WHERE user_id = (select auth.uid()) AND role = 'support' AND is_active = TRUE)
--     );
-- 
-- CREATE POLICY IF NOT EXISTS "Support can update assigned tickets" ON support_tickets
--     FOR UPDATE USING (
--         EXISTS (SELECT 1 FROM user_roles WHERE user_id = (select auth.uid()) AND role = 'support' AND is_active = TRUE)
--         AND (assigned_to = (select auth.uid()) OR assigned_to IS NULL)
--     );

-- Политики для support_messages (оптимизированные с (select auth.uid()))
-- CREATE POLICY IF NOT EXISTS "Users can view messages in their tickets" ON support_messages
--     FOR SELECT USING (
--         EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = (select auth.uid()))
--     );
-- 
-- CREATE POLICY IF NOT EXISTS "Users can create messages in their tickets" ON support_messages
--     FOR INSERT WITH CHECK (
--         EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = (select auth.uid()))
--     );
-- 
-- CREATE POLICY IF NOT EXISTS "Support can view all messages" ON support_messages
--     FOR SELECT USING (
--         EXISTS (SELECT 1 FROM user_roles WHERE user_id = (select auth.uid()) AND role = 'support' AND is_active = TRUE)
--     );
-- 
-- CREATE POLICY IF NOT EXISTS "Support can create messages" ON support_messages
--     FOR INSERT WITH CHECK (
--         EXISTS (SELECT 1 FROM user_roles WHERE user_id = (select auth.uid()) AND role = 'support' AND is_active = TRUE)
--     );

