-- ============================================
-- SQL Schema for Raven Private Support System
-- ============================================

-- Таблица для хранения ролей пользователей
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'support', 'admin')),
    granted_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Частичный уникальный индекс для активных ролей (заменяет UNIQUE constraint с WHERE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_active ON user_roles(user_id, role) WHERE is_active = TRUE;

-- Индексы для быстрого поиска активных ролей
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_active ON user_roles(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_roles_role_active ON user_roles(role, is_active) WHERE is_active = TRUE;

-- Таблица для тикетов поддержки
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed', 'resolved')),
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL, -- ID специалиста поддержки
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE NULL,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для тикетов
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_at ON support_tickets(last_message_at DESC);

-- Таблица для сообщений в тикетах
CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'support')),
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для сообщений
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id ON support_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_is_read ON support_messages(is_read) WHERE is_read = FALSE;

-- Функция для автоматического обновления updated_at
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

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_messages_updated_at BEFORE UPDATE ON support_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Функция для обновления last_message_at в тикете при добавлении сообщения
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

-- Триггер для обновления last_message_at
CREATE TRIGGER update_ticket_last_message_trigger
    AFTER INSERT ON support_messages
    FOR EACH ROW EXECUTE FUNCTION update_ticket_last_message();

-- Функция для автоматического закрытия тикета при последнем сообщении от поддержки
-- (опционально, можно реализовать позже)

-- Представление для удобного получения тикетов с информацией о пользователе
CREATE OR REPLACE VIEW support_tickets_view AS
SELECT 
    t.id,
    t.user_id,
    u.username as user_username,
    u.user_id as user_internal_id,
    t.subject,
    t.status,
    t.priority,
    t.assigned_to,
    s.username as assigned_username,
    t.created_at,
    t.updated_at,
    t.closed_at,
    t.last_message_at,
    (SELECT COUNT(*) FROM support_messages WHERE ticket_id = t.id) as message_count,
    (SELECT COUNT(*) FROM support_messages WHERE ticket_id = t.id AND is_read = FALSE) as unread_count
FROM support_tickets t
LEFT JOIN users u ON t.user_id = u.id
LEFT JOIN users s ON t.assigned_to = s.id;

-- Представление для сообщений с информацией об отправителе
CREATE OR REPLACE VIEW support_messages_view AS
SELECT 
    m.id,
    m.ticket_id,
    m.sender_id,
    m.sender_type,
    u.username as sender_username,
    u.user_id as sender_internal_id,
    m.message_text,
    m.is_read,
    m.read_at,
    m.created_at,
    m.updated_at
FROM support_messages m
LEFT JOIN users u ON m.sender_id = u.id;

-- Устанавливаем security_invoker для views (исправляет SECURITY DEFINER)
ALTER VIEW support_tickets_view SET (security_invoker = true);
ALTER VIEW support_messages_view SET (security_invoker = true);

-- Функция для очистки истекших сессий (если используется)
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

-- RLS (Row Level Security) политики
-- Если RLS включен, но политики не нужны, отключите RLS:
-- ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE support_tickets DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE support_messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Или добавьте политики, если RLS нужен:
-- ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Пример политик (настройте под ваши требования):
-- ВАЖНО: Используйте (select auth.uid()) вместо auth.uid() для оптимизации производительности
-- CREATE POLICY "Users can view their own roles" ON user_roles
--     FOR SELECT USING ((select auth.uid()) = user_id);
-- 
-- CREATE POLICY "Support can view all tickets" ON support_tickets
--     FOR SELECT USING (
--         EXISTS (SELECT 1 FROM user_roles WHERE user_id = (select auth.uid()) AND role = 'support' AND is_active = TRUE)
--     );
-- 
-- CREATE POLICY "Users can view their own tickets" ON support_tickets
--     FOR SELECT USING ((select auth.uid()) = user_id);

-- Примеры запросов:

-- Получить все открытые тикеты для специалиста поддержки
-- SELECT * FROM support_tickets_view 
-- WHERE status = 'open' 
-- ORDER BY last_message_at DESC;

-- Получить тикеты пользователя
-- SELECT * FROM support_tickets_view 
-- WHERE user_id = 'user-uuid-here' 
-- ORDER BY last_message_at DESC;

-- Получить сообщения тикета
-- SELECT * FROM support_messages_view 
-- WHERE ticket_id = 'ticket-uuid-here' 
-- ORDER BY created_at ASC;

-- Проверить права доступа пользователя
-- SELECT role FROM user_roles 
-- WHERE user_id = 'user-uuid-here' 
-- AND is_active = TRUE 
-- AND (revoked_at IS NULL OR revoked_at > NOW());

