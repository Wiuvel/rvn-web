CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ТАБЛИЦА АДМИНИСТРАТОРОВ (admins)
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT, -- NULL для админов, созданных через GitHub OAuth
    token VARCHAR(64) UNIQUE, -- Токен безопасности для сессий
    is_root BOOLEAN NOT NULL DEFAULT false, -- true только для владельца, зарегистрированного через логин/пароль
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для admins
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
CREATE INDEX IF NOT EXISTS idx_admins_token ON admins(token);

-- ============================================
-- ТАБЛИЦА ДОВЕРЕННЫХ GITHUB РАЗРАБОТЧИКОВ
-- ============================================
CREATE TABLE IF NOT EXISTS trusted_github_developers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT,
    github_username TEXT NOT NULL,
    created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для trusted_github_developers
CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_github_email_unique ON trusted_github_developers(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_github_username_unique ON trusted_github_developers(github_username);
CREATE INDEX IF NOT EXISTS idx_trusted_github_email ON trusted_github_developers(email) WHERE email IS NOT NULL;

-- ============================================
-- 2. ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ (users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL UNIQUE, -- 7 цифр (0000000-9999999), публичный ID профиля
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT, -- NULL для OAuth пользователей
    avatar TEXT, -- Путь к аватару в S3 (формат: s3:avatars/userId/timestamp.ext) или короткий идентификатор (0-9)
    banner TEXT, -- Путь к баннеру профиля в S3 (формат: s3:banners/userId/timestamp.ext)
    balance INTEGER NOT NULL DEFAULT 0, -- Баланс в копейках
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для users
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- ============================================
-- 2.1. ТАБЛИЦА УСТРОЙСТВ (user_devices)
-- ============================================
-- Хранит активные сессии устройств для каждого пользователя
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, -- Хеш Refresh Token'а
    device_name TEXT NOT NULL, -- "Chrome on Windows 10", спаршенный из User-Agent
    ip_address TEXT, -- Последний IP
    location TEXT, -- Геолокация
    device_fp_hash TEXT, -- Layer 2: SHA256(User-Agent|IP|FPID) для группировки устройств
    last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для user_devices
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_token_hash ON user_devices(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_devices_last_active ON user_devices(last_active);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id_device_fp_hash
  ON user_devices (user_id, device_fp_hash)
  WHERE device_fp_hash IS NOT NULL;

-- Комментарии к таблице user_devices
COMMENT ON TABLE user_devices IS 'Таблица авторизованных устройств пользователей';
COMMENT ON COLUMN user_devices.token_hash IS 'Хеш долгоживущего Refresh Token';
COMMENT ON COLUMN user_devices.device_name IS 'Название устройства из User-Agent';

-- ============================================
-- 3. ТАБЛИЦА РОЛЕЙ ПОЛЬЗОВАТЕЛЕЙ (user_roles)
-- ============================================
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'support', 'admin')),
    granted_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_is_active ON user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role_active ON user_roles(user_id, role, is_active)
    WHERE is_active = true AND revoked_at IS NULL;

-- Уникальный индекс для предотвращения дубликатов ролей
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user_role_unique
    ON user_roles(user_id, role)
    WHERE is_active = true AND revoked_at IS NULL;

-- ============================================
-- 4. ТАБЛИЦА ТИКЕТОВ ПОДДЕРЖКИ (support_tickets)
-- ============================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
    priority TEXT CHECK (priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
    subject TEXT NOT NULL,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_at ON support_tickets(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets(user_id, status);

-- ============================================
-- 5. ТАБЛИЦА СООБЩЕНИЙ ПОДДЕРЖКИ (support_messages)
-- ============================================
CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    sender_type TEXT CHECK (sender_type IN ('user', 'support')) DEFAULT 'user',
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для support_messages
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id ON support_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_messages(ticket_id, created_at);

-- ============================================
-- 5.1. ТАБЛИЦА ВЛОЖЕНИЙ К СООБЩЕНИЯМ ПОДДЕРЖКИ (support_message_attachments)
-- ============================================
CREATE TABLE IF NOT EXISTS support_message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    blur_hash TEXT,
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для support_message_attachments
CREATE INDEX IF NOT EXISTS idx_support_attachments_message_id ON support_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_support_attachments_created_at ON support_message_attachments(created_at);

-- ============================================
-- 6. ТРИГГЕРЫ ДЛЯ ОБНОВЛЕНИЯ updated_at
-- ============================================
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

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_devices_updated_at BEFORE UPDATE ON user_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trusted_github_developers_updated_at BEFORE UPDATE ON trusted_github_developers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ТРИГГЕР ДЛЯ last_message_at
-- ============================================
CREATE OR REPLACE FUNCTION update_ticket_last_message_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE support_tickets SET last_message_at = NEW.created_at WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_ticket_last_message_at
    AFTER INSERT ON support_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_last_message_at();

-- ============================================
-- RPC: get_last_messages_for_tickets
-- ============================================
DROP FUNCTION IF EXISTS get_last_messages_for_tickets(UUID[]);
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
        FROM support_messages sm
        WHERE sm.ticket_id = ANY(ticket_ids)
    )
    SELECT rm.ticket_id, rm.id, rm.message_text, rm.sender_id, rm.sender_type, rm.created_at, rm.is_read
    FROM ranked_messages rm
    WHERE rm.rn = 1;
END;
$$;

-- ============================================
-- RPC: create_ticket_with_message
-- ============================================
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
    INSERT INTO support_tickets (user_id, subject, status)
    VALUES (p_user_id, p_subject, 'open')
    RETURNING id, created_at INTO v_ticket_id, v_ticket_created_at;

    INSERT INTO support_messages (ticket_id, sender_id, message_text, sender_type)
    VALUES (v_ticket_id, p_user_id, p_message_text, 'user')
    RETURNING id, created_at INTO v_message_id, v_message_created_at;

    RETURN QUERY SELECT v_ticket_id, v_ticket_created_at, v_message_id, v_message_created_at;
EXCEPTION
    WHEN OTHERS THEN RAISE;
END;
$$;

-- ============================================
-- 7. ТАБЛИЦА УВЕДОМЛЕНИЙ (notifications)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                    -- 'support_reply' | 'ticket_status' | ...
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    count INTEGER NOT NULL DEFAULT 1,      -- количество сгруппированных сообщений (UPSERT по тикету)
    related_ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read)
    WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- ============================================
-- 8. ТАБЛИЦА КОММЕНТАРИЕВ (profile_comments)
-- ============================================
CREATE TABLE IF NOT EXISTS profile_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES profile_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 1000),
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_comments_profile_id ON profile_comments(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_comments_author_id ON profile_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_profile_comments_parent_id ON profile_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_profile_comments_created_at ON profile_comments(created_at);

CREATE TRIGGER update_profile_comments_updated_at BEFORE UPDATE ON profile_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION check_comment_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE comment_count INTEGER;
BEGIN
    -- Запрет top-level комментариев на своём профиле (ответы разрешены)
    IF NEW.parent_id IS NULL AND NEW.profile_id = NEW.author_id THEN
        RAISE EXCEPTION 'Нельзя оставлять комментарии на своей странице';
    END IF;
    -- Скрытый лимит: максимум 5 комментариев на профиль от одного автора
    SELECT COUNT(*) INTO comment_count FROM profile_comments WHERE profile_id = NEW.profile_id AND author_id = NEW.author_id;
    IF comment_count >= 5 THEN RAISE EXCEPTION 'Достигнут лимит комментариев на этом профиле'; END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_check_comment_limit
    BEFORE INSERT ON profile_comments
    FOR EACH ROW
    EXECUTE FUNCTION check_comment_limit();

-- ============================================
-- 9. НАСТРОЙКИ ПАНЕЛИ (panel_settings)
-- ============================================
-- Key-value хранилище для подключения к Remnawave Panel
CREATE TABLE IF NOT EXISTS panel_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_panel_settings_updated_at BEFORE UPDATE ON panel_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. ПОДПИСКИ (subscriptions)
-- ============================================
-- VPN-подписки пользователей, привязанные к Remnawave Panel
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remnawave_uuid TEXT,                -- UUID пользователя в Remnawave Panel
    short_uuid TEXT,                    -- Короткий UUID для subscription URL
    subscription_url TEXT,              -- Полный URL подписки для VPN-клиента
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'disabled', 'limited', 'cancelled')),
    plan TEXT NOT NULL DEFAULT 'base-monthly',
    expire_at TIMESTAMPTZ,
    traffic_limit_bytes BIGINT DEFAULT 0,
    traffic_limit_strategy TEXT DEFAULT 'MONTH' CHECK (traffic_limit_strategy IN ('NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expire_at ON subscriptions(expire_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_remnawave_uuid ON subscriptions(remnawave_uuid);

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 11. ПЛАТЕЖИ (payments)
-- ============================================
-- Записи о платежах, суммы в копейках (INTEGER)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,            -- Сумма в копейках (30000 = 300 ₽)
    currency TEXT NOT NULL DEFAULT 'RUB',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    provider TEXT NOT NULL DEFAULT 'test',
    provider_payment_id TEXT,           -- ID платежа во внешней системе
    promo_code TEXT,
    metadata TEXT,                      -- JSON с доп. данными
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 12. ТРАНЗАКЦИИ БАЛАНСА (balance_transactions)
-- ============================================
-- Лог операций с балансом: положительные = пополнение, отрицательные = списание
CREATE TABLE IF NOT EXISTS balance_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,            -- Сумма в копейках
    type TEXT NOT NULL,                 -- 'topup', 'purchase', 'refund', 'bonus'
    description TEXT,
    related_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для balance_transactions
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_id ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_type ON balance_transactions(type);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at ON balance_transactions(created_at);
