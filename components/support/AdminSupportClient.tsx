'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { onRateLimited } from '@/lib/trpc/rate-limit-link';
import { gsap } from 'gsap';
import { translateError } from '@/lib/utils/error-translations';
import RateLimitCaptcha from '@/components/auth/RateLimitCaptcha';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE } from '@/lib/utils/constants';
import {
  getLastMessageLabelForAttachments,
  messageTextForBubble,
  normalizeLastMessageDisplayText,
} from '@/lib/utils/support-messages';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import { useWebSocket } from '@/hooks/useWebSocket';
import TicketSkeleton from '@/components/ui/TicketSkeleton';
import { FileText } from 'lucide-react';
import ImageViewer from '@/components/support/ImageViewer';
import ImageWithBlur from '@/components/support/ImageWithBlur';
import { debugPerformanceAsync, debugStart, debugEnd, debugError } from '@/lib/utils/debug';
import type { RawTicketApi, RawMessageApi } from '@/lib/types/support-api';

interface AuthState {
  isAuthenticated: boolean;
  hasSupportAccess: boolean;
  username: string | null;
  userId: string | null;
  user_id: string | null;
}

interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'closed' | 'pending';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  last_message_at: string;
  closed_at?: string | null;
  user_id?: string; // ID пользователя, которому принадлежит тикет
  user?: {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
  };
  assigned_to?: string | null;
  assigned_user?: {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
  } | null;
  last_message?: {
    id: string;
    message_text: string;
    sender_type: 'user' | 'support' | 'system';
    created_at: string;
    is_read: boolean;
  } | null;
  unread_count?: number;
}

interface MessageAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_url: string;
  storage_path?: string;
  blur_hash?: string;
  width?: number;
  height?: number;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: 'user' | 'support';
  message_text: string;
  is_read: boolean;
  created_at: string;
  sender?: {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
  };
  attachments?: MessageAttachment[];
}

interface Notification {
  message: string;
  type: 'error';
  show: boolean;
}

// Функция-помощник для обработки вложений с формированием storage_url
function processAttachments(
  attachments?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    storage_url?: string;
    storage_path?: string;
    blur_hash?: string;
    width?: number;
    height?: number;
  }>,
): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;

  return attachments.map((att) => ({
    id: att.id,
    file_name: att.file_name,
    file_type: att.file_type,
    file_size: att.file_size,
    storage_path: att.storage_path,
    storage_url:
      att.storage_url ||
      (att.storage_path ? `/support/files/${encodeURIComponent(att.storage_path)}` : ''),
    blur_hash: att.blur_hash,
    width: att.width,
    height: att.height,
  }));
}

// Компонент для анимированного сообщения
function MessageItem({
  message,
  showDate,
  isSystemMessage,
  isSupport,
  isUser,
  formatDate,
  formatTime,
  getInitial,
  isInitialLoad = false,
  onImageClick,
  formatFileSize,
}: {
  message: Message;
  showDate: boolean;
  isSystemMessage: boolean;
  isSupport: boolean;
  isUser: boolean;
  formatDate: (date: string) => string;
  formatTime: (date: string) => string;
  getInitial: (username: string) => string;
  isInitialLoad?: boolean;
  onImageClick?: (url: string, alt: string) => void;
  formatFileSize: (bytes: number) => string;
}) {
  const messageRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    // При первой загрузке не анимируем, чтобы избежать дергания
    if (isInitialLoad) {
      if (messageRef.current) {
        gsap.set(messageRef.current, { opacity: 1, y: 0, scale: 1 });
      }
      return;
    }

    // Анимируем только новые сообщения (не при первой загрузке)
    if (messageRef.current && typeof window !== 'undefined' && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      gsap.fromTo(
        messageRef.current,
        { opacity: 0, y: 10, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power2.out' },
      );
    }
  }, [message.id, isInitialLoad]);

  return (
    <div ref={messageRef}>
      {showDate && (
        <div className="my-4 text-center text-xs text-neutral-500">
          {formatDate(message.created_at)}
        </div>
      )}
      {/* Логика: саппорт справа (items-end), пользователь слева (items-start), системные сообщения слева */}
      {isSystemMessage ? (
        <div className="flex w-full flex-col items-start">
          {/* Заголовок с именем "Система" */}
          <div className="mb-1.5 flex items-baseline gap-1.5 px-1">
            <span className="rounded bg-white/10 px-2 py-1 text-sm font-medium text-yellow-400">
              Система
            </span>
          </div>

          {/* Сообщение */}
          <div
            className="min-w-0 max-w-[70%] flex-shrink-0 rounded-2xl bg-neutral-700/50 px-4 py-3 text-neutral-300"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {(() => {
              const bubbleText = messageTextForBubble(
                message.message_text || '',
                !!(message.attachments && message.attachments.length),
              );
              return bubbleText ? (
                <p className="whitespace-pre-wrap break-words text-sm">{bubbleText}</p>
              ) : null;
            })()}
            <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400">
              <span>{formatTime(message.created_at)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col ${isSupport ? 'items-end' : 'items-start'} ${isSupport ? 'ml-auto max-w-[75%]' : ''}`}
        >
          {/* Заголовок с именем */}
          {isUser && message.sender && (
            <div className="mb-1.5 flex items-baseline gap-1.5 px-1">
              <span className="rounded bg-white/10 px-2 py-1 text-sm font-medium text-white">
                {message.sender.username}
              </span>
              <span className="text-xs text-neutral-400">#{message.sender.user_id}</span>
            </div>
          )}
          {isSupport && message.sender && (
            <div className="mb-1.5 flex items-baseline gap-1.5 px-1">
              <span className="rounded bg-white/10 px-2 py-1 text-sm font-medium text-white">
                {message.sender.username}
              </span>
              <span className="text-xs text-white">Поддержка</span>
            </div>
          )}

          {/* Сообщение с аватаркой */}
          <div
            className={`flex items-end gap-3 ${isSupport ? 'flex-row-reverse' : 'flex-row'} ${isSupport ? 'w-full' : 'w-full'}`}
          >
            {/* Аватарка для пользователя (слева) */}
            {isUser &&
              message.sender &&
              (() => {
                const avatarUrl = getAvatarUrl(message.sender.avatar);
                const gradientClasses = getGradientClasses(message.sender.avatar);

                return (
                  <div
                    className={`h-10 w-10 overflow-hidden rounded-full ${avatarUrl ? '' : gradientClasses} mb-1 flex flex-shrink-0 items-center justify-center text-sm font-semibold text-white`}
                  >
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt={message.sender.username}
                        width={40}
                        height={40}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      getInitial(message.sender.username)
                    )}
                  </div>
                );
              })()}

            {/* Пузырь сообщения */}
            <div
              className={`${isSupport ? 'max-w-[60%]' : 'max-w-[70%]'} min-w-0 flex-shrink-0 rounded-2xl px-4 py-3 ${
                isSupport
                  ? message.is_read
                    ? 'rounded-br-sm bg-blue-600 text-white'
                    : 'rounded-br-sm bg-neutral-800 text-neutral-100'
                  : 'rounded-bl-sm bg-neutral-800 text-neutral-100'
              }`}
              style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
            >
              {(() => {
                const bubbleText = messageTextForBubble(
                  message.message_text || '',
                  !!(message.attachments && message.attachments.length),
                );
                return bubbleText ? (
                  <p className="whitespace-pre-wrap break-words text-sm">{bubbleText}</p>
                ) : null;
              })()}

              {/* Вложения */}
              {message.attachments &&
                message.attachments.length > 0 &&
                (() => {
                  const images = message.attachments!.filter((a) =>
                    a.file_type.startsWith('image/'),
                  );
                  const documents = message.attachments!.filter(
                    (a) => !a.file_type.startsWith('image/'),
                  );
                  const bubbleText = messageTextForBubble(message.message_text || '', true);

                  return (
                    <div className={`space-y-2 ${bubbleText ? 'mt-2' : ''}`}>
                      {/* Группировка изображений */}
                      {images.length > 0 && (
                        <div
                          className={`grid w-full gap-1.5 ${images.length === 1 ? 'max-w-[29rem]' : 'max-w-[37.5rem] grid-cols-2'}`}
                        >
                          {images.map((attachment) => (
                            <button
                              key={attachment.id}
                              onClick={() =>
                                onImageClick?.(attachment.storage_url, attachment.file_name)
                              }
                              className="block w-full min-w-0 cursor-pointer overflow-hidden rounded-lg transition-opacity hover:opacity-90"
                            >
                              <ImageWithBlur
                                src={attachment.storage_url}
                                alt={attachment.file_name}
                                className="rounded-lg"
                                isRead={message.is_read}
                                blurHash={attachment.blur_hash}
                                width={attachment.width}
                                height={attachment.height}
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Документы */}
                      {documents.length > 0 && (
                        <div className="space-y-1.5">
                          {documents.map((attachment) => (
                            <a
                              key={attachment.id}
                              href={attachment.storage_url}
                              download={attachment.file_name}
                              className="flex cursor-pointer items-center gap-2 rounded-lg bg-neutral-700/50 p-2 transition-colors hover:bg-neutral-700/70"
                            >
                              <FileText className="h-4 w-4 flex-shrink-0 text-neutral-300" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">
                                  {attachment.file_name}
                                </p>
                                <p className="text-[10px] text-neutral-400">
                                  {formatFileSize(attachment.file_size)}
                                </p>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

              <div
                className={`mt-1.5 flex items-center gap-2 text-xs ${
                  isSupport
                    ? message.is_read
                      ? 'text-blue-100'
                      : 'text-neutral-400'
                    : 'text-neutral-400'
                }`}
              >
                <span>{formatTime(message.created_at)}</span>
                {/* Индикация прочитанных сообщений саппорта пользователем */}
                {isSupport && message.is_read && (
                  <svg
                    className="h-3.5 w-3.5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AdminSupportClientProps {
  initialAuthState: AuthState;
  initialWsToken?: string;
  initialTickets: RawTicketApi[];
  initialActiveTicket?: RawTicketApi | null;
  initialMessages?: RawMessageApi[];
}

const EMPTY_RAW_TICKETS: RawTicketApi[] = [];
const EMPTY_RAW_MESSAGES: RawMessageApi[] = [];
const CACHE_PREFIX = 'support_panel_messages_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

export default function AdminSupportClient({
  initialAuthState,
  initialWsToken,
  initialTickets = EMPTY_RAW_TICKETS,
  initialActiveTicket = null,
  initialMessages = EMPTY_RAW_MESSAGES,
}: AdminSupportClientProps) {
  const [authState] = useState<AuthState>(initialAuthState);
  const [loading] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    return initialTickets.map((t) => {
      const lm = t.last_message;
      const lastMessage: Ticket['last_message'] =
        lm == null
          ? null
          : {
              id: lm.id,
              message_text: lm.message_text,
              sender_type: lm.sender_type ?? 'user',
              created_at: lm.created_at,
              is_read: lm.is_read ?? false,
            };
      return {
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority || 'normal',
        created_at: t.created_at,
        updated_at: t.updated_at ?? t.created_at,
        last_message_at: t.last_message_at ?? t.updated_at ?? t.created_at,
        closed_at: t.closed_at,
        user_id: t.user_id,
        user: t.user,
        assigned_to: t.assigned_to,
        assigned_user: t.assigned_user,
        last_message: lastMessage,
      };
    });
  });
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(() => {
    if (!initialActiveTicket) return null;
    const lm = initialActiveTicket.last_message;
    const lastMessage: Ticket['last_message'] =
      lm == null
        ? null
        : {
            id: lm.id,
            message_text: lm.message_text,
            sender_type: lm.sender_type ?? 'user',
            created_at: lm.created_at,
            is_read: lm.is_read ?? false,
          };
    return {
      id: initialActiveTicket.id,
      subject: initialActiveTicket.subject,
      status: initialActiveTicket.status,
      priority: initialActiveTicket.priority || 'normal',
      created_at: initialActiveTicket.created_at,
      updated_at: initialActiveTicket.updated_at ?? initialActiveTicket.created_at,
      last_message_at:
        initialActiveTicket.last_message_at ??
        initialActiveTicket.updated_at ??
        initialActiveTicket.created_at,
      closed_at: initialActiveTicket.closed_at,
      user_id: initialActiveTicket.user_id,
      user: initialActiveTicket.user,
      assigned_to: initialActiveTicket.assigned_to,
      assigned_user: initialActiveTicket.assigned_user,
      last_message: lastMessage,
    };
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    if (!initialMessages || initialMessages.length === 0) return [];
    return initialMessages.map((m) => {
      const s = m.sender;
      const sender = s == null ? undefined : Array.isArray(s) ? s[0] : s;
      return {
        id: m.id,
        ticket_id: m.ticket_id,
        sender_id: m.sender_id,
        sender_type: m.sender_type,
        message_text: m.message_text,
        is_read: m.is_read ?? false,
        created_at: m.created_at,
        sender,
        attachments: processAttachments(m.attachments),
      };
    });
  });
  const [messageText, setMessageText] = useState('');
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archive'>('active');
  const [skeletonCount, setSkeletonCount] = useState<number | null>(() => {
    // Загружаем из localStorage или используем 3 по умолчанию
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(`support_panel_tickets_count_${statusFilter}`);
      if (cached !== null) {
        const parsed = parseInt(cached, 10);
        if (!isNaN(parsed)) {
          // Если 0, возвращаем null (не показываем скелетоны)
          return parsed === 0 ? null : parsed;
        }
      }
    }
    return 3; // По умолчанию показываем 3, если нет данных
  });
  const [notification, setNotification] = useState<Notification>({
    message: '',
    type: 'error',
    show: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showRateLimitCaptcha, setShowRateLimitCaptcha] = useState(false);
  const isCaptchaOpenRef = useRef(false);
  const [isFilterChanging, setIsFilterChanging] = useState(false);
  const [showCloseReasonModal, setShowCloseReasonModal] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [ticketToClose, setTicketToClose] = useState<string | null>(null);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState(''); // Поисковый запрос для архива
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // Поисковый запрос для активных тикетов
  const [viewingImage, setViewingImage] = useState<{ url: string; alt: string } | null>(null);

  // Инициализируем false для SSR, обновляем на клиенте
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Эффект для инициализации состояния экрана только на клиенте
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      setRightPanelCollapsed(width < 768);
      setIsLargeScreen(width >= 1024);
    }
  }, []);

  // Отслеживаем изменение размера экрана для правильного позиционирования панели
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const isLarge = width >= 1024;
      setIsLargeScreen(isLarge);
      // Если экран стал меньше 1024px, скрываем правую панель
      if (!isLarge && !rightPanelCollapsed) {
        setRightPanelCollapsed(true);
      }
      // Если экран меньше 1020px, скрываем правую панель полностью
      if (width < 1020) {
        setIsLargeScreen(false);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [rightPanelCollapsed]);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [shouldRenderMobileActions, setShouldRenderMobileActions] = useState(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);

  // Анимация мобильного меню действий
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (mobileActionsOpen && activeTicket?.id) {
      // Если меню должно быть открыто, начинаем рендеринг
      if (!shouldRenderMobileActions) {
        setShouldRenderMobileActions(true);
      }

      requestAnimationFrame(() => {
        if (mobileActionsRef.current) {
          // Убиваем любые активные анимации на элементе
          gsap.killTweensOf(mobileActionsRef.current);

          gsap.set(mobileActionsRef.current, {
            opacity: 0,
            y: -10,
            scale: 0.95,
          });
          gsap.to(mobileActionsRef.current, {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: GSAP_DEFAULT_EASE,
          });
        }
      });
    } else {
      // Если меню должно быть закрыто и оно рендерится - запускаем анимацию закрытия
      if (shouldRenderMobileActions) {
        if (mobileActionsRef.current) {
          // Убиваем любые активные анимации на элементе
          gsap.killTweensOf(mobileActionsRef.current);

          gsap.to(mobileActionsRef.current, {
            opacity: 0,
            y: -10,
            scale: 0.95,
            duration: 0.15,
            ease: 'power2.in',
            onComplete: () => {
              setShouldRenderMobileActions(false);
            },
          });
        } else {
          // Если элемент еще не создан, просто закрываем
          setShouldRenderMobileActions(false);
        }
      }
    }
  }, [mobileActionsOpen, activeTicket?.id, shouldRenderMobileActions]);

  const rateLimitRetryRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentTicketIdRef = useRef<string | null>(null);
  const activeTicketRef = useRef<Ticket | null>(null); // Ref для актуального activeTicket в обработчиках WebSocket (избегаем переподписок при каждом обновлении)
  activeTicketRef.current = activeTicket;
  const notificationRef = useRef<HTMLDivElement>(null);
  const currentFilterRef = useRef<'active' | 'archive'>('active');
  const fetchTicketsAbortControllerRef = useRef<AbortController | null>(null);
  const isInitialMessagesLoadRef = useRef(true); // Флаг первой загрузки сообщений
  const isRestoringScrollRef = useRef(false); // Флаг восстановления скролла
  const scrollSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Функция для получения инициалов
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  // Функции кэширования сообщений
  const getCacheKey = (ticketId: string) => `${CACHE_PREFIX}${ticketId}`;

  const saveMessagesToCache = useCallback((ticketId: string, messages: Message[]) => {
    if (typeof window === 'undefined') return;

    try {
      const cacheData = {
        messages,
        timestamp: Date.now(),
      };
      localStorage.setItem(getCacheKey(ticketId), JSON.stringify(cacheData));
    } catch (error) {
      // Игнорируем ошибки localStorage (quota exceeded и т.д.)
      console.warn('Failed to cache messages:', error);
    }
  }, []);

  const loadMessagesFromCache = useCallback((ticketId: string): Message[] | null => {
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem(getCacheKey(ticketId));
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      const age = Date.now() - cacheData.timestamp;

      // Проверяем TTL
      if (age > CACHE_TTL_MS) {
        localStorage.removeItem(getCacheKey(ticketId));
        return null;
      }

      // Обрабатываем вложения при загрузке из кэша
      const messages = (cacheData.messages || []).map((msg: any) => ({
        ...msg,
        attachments: processAttachments(msg.attachments),
      }));

      return messages;
    } catch {
      // Игнорируем ошибки парсинга
      localStorage.removeItem(getCacheKey(ticketId));
      return null;
    }
  }, []);

  // Сохранение позиции скролла
  const saveScrollPosition = useCallback((ticketId: string) => {
    if (
      !messagesContainerRef.current ||
      isRestoringScrollRef.current ||
      typeof window === 'undefined'
    )
      return;

    const scrollTop = messagesContainerRef.current.scrollTop;
    const scrollHeight = messagesContainerRef.current.scrollHeight;
    const clientHeight = messagesContainerRef.current.clientHeight;

    // Сохраняем только если не в самом низу (с небольшим допуском)
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (isAtBottom) {
      // Если внизу, сохраняем специальный маркер
      localStorage.setItem(`support_panel_scroll_${ticketId}`, 'bottom');
    } else {
      // Сохраняем позицию скролла
      localStorage.setItem(`support_panel_scroll_${ticketId}`, scrollTop.toString());
    }
  }, []);

  // Восстановление позиции скролла
  const restoreScrollPosition = useCallback((ticketId: string) => {
    if (!messagesContainerRef.current || typeof window === 'undefined') return;

    const savedPosition = localStorage.getItem(`support_panel_scroll_${ticketId}`);

    // Функция для выполнения скролла после загрузки всех элементов
    const performScroll = () => {
      if (!messagesContainerRef.current) return;

      isRestoringScrollRef.current = true;

      if (savedPosition === 'bottom' || savedPosition === null) {
        // Если был внизу или нет сохраненной позиции, скроллим к самому новому сообщению
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
            } else if (messagesContainerRef.current) {
              // Если messagesEndRef еще не готов, скроллим в самый низ контейнера
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
            setTimeout(() => {
              isRestoringScrollRef.current = false;
            }, 200);
          });
        });
      } else {
        // Восстанавливаем сохраненную позицию
        const scrollTop = parseInt(savedPosition, 10);
        if (!isNaN(scrollTop)) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = scrollTop;
              }
              setTimeout(() => {
                isRestoringScrollRef.current = false;
              }, 200);
            });
          });
        }
      }
    };

    // Ждем загрузки всех изображений перед восстановлением скролла
    const images = messagesContainerRef.current.querySelectorAll('img[src*="/support/files/"]');
    if (images.length === 0) {
      // Нет изображений, можно сразу скроллить
      setTimeout(performScroll, 100);
      return;
    }

    let loadedCount = 0;
    const totalImages = images.length;
    let scrollPerformed = false;

    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount >= totalImages && !scrollPerformed) {
        scrollPerformed = true;
        performScroll();
      }
    };

    images.forEach((img) => {
      if ((img as HTMLImageElement).complete) {
        checkAllLoaded();
      } else {
        img.addEventListener('load', checkAllLoaded, { once: true });
        img.addEventListener('error', checkAllLoaded, { once: true });
      }
    });

    // Таймаут на случай, если изображения не загрузятся
    setTimeout(() => {
      if (!scrollPerformed) {
        scrollPerformed = true;
        performScroll();
      }
    }, 2000);
  }, []);

  // Автоскролл при новых сообщениях с учетом загрузки изображений
  useEffect(() => {
    if (!messages || messages.length === 0 || isRestoringScrollRef.current) return;

    // Проверяем, есть ли сохраненная позиция скролла
    if (typeof window !== 'undefined' && activeTicket?.id) {
      const savedPosition = localStorage.getItem(`support_panel_scroll_${activeTicket.id}`);
      // Если есть сохраненная позиция и это не 'bottom', не скроллим автоматически
      if (savedPosition && savedPosition !== 'bottom') {
        return;
      }
    }

    // Ждем загрузки всех изображений перед скроллом
    const scrollToBottom = () => {
      if (messagesEndRef.current && !isRestoringScrollRef.current) {
        // Используем requestAnimationFrame для плавного скролла после рендера
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (messagesEndRef.current && !isRestoringScrollRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100); // Небольшая задержка для загрузки изображений
        });
      }
    };

    // Проверяем, загружены ли все изображения
    const images = document.querySelectorAll('img[src*="/support/files/"]');
    if (images.length === 0) {
      scrollToBottom();
      return;
    }

    let loadedCount = 0;
    const totalImages = images.length;

    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount >= totalImages) {
        scrollToBottom();
      }
    };

    images.forEach((img) => {
      if ((img as HTMLImageElement).complete) {
        checkAllLoaded();
      } else {
        img.addEventListener('load', checkAllLoaded, { once: true });
        img.addEventListener('error', checkAllLoaded, { once: true });
      }
    });

    // Таймаут на случай, если изображения не загрузятся
    const timeout = setTimeout(scrollToBottom, 2000);

    return () => {
      clearTimeout(timeout);
      images.forEach((img) => {
        img.removeEventListener('load', checkAllLoaded);
        img.removeEventListener('error', checkAllLoaded);
      });
    };
  }, [messages, activeTicket?.id]);

  // tRPC utils for imperative fetching & cache invalidation
  const utils = trpc.useUtils();

  const csrfQuery = trpc.auth.csrf.useQuery({ scope: 'user' });
  const updateTicketMutation = trpc.support.tickets.update.useMutation();
  const sendMessageMutation = trpc.support.tickets.sendMessage.useMutation();
  const markAsReadMutation = trpc.support.tickets.markAsRead.useMutation();

  // Subscribe to tRPC rate-limit link events → open captcha
  useEffect(() => {
    return onRateLimited((retry) => {
      rateLimitRetryRef.current = retry;
      if (!isCaptchaOpenRef.current) {
        isCaptchaOpenRef.current = true;
        setShowRateLimitCaptcha(true);
      }
    });
  }, []);

  const handleRateLimitSuccess = () => {
    isCaptchaOpenRef.current = false;
    setShowRateLimitCaptcha(false);
    rateLimitRetryRef.current?.();
    rateLimitRetryRef.current = null;
  };

  const archiveQuery = trpc.support.tickets.list.useQuery(
    { status: 'closed' },
    {
      enabled: authState.hasSupportAccess && statusFilter === 'archive',
    },
  );

  useEffect(() => {
    if (statusFilter !== 'archive' || !archiveQuery.data?.tickets) return;
    setTicketsLoading(archiveQuery.isLoading);
    let list = (archiveQuery.data.tickets || []).map((t: any) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority || 'normal',
      created_at: t.created_at,
      updated_at: t.updated_at,
      last_message_at: t.last_message_at,
      closed_at: t.closed_at,
      user_id: t.user_id,
      user: t.user,
      assigned_to: t.assigned_to,
      assigned_user: t.assigned_user,
      last_message: t.last_message || null,
    }));
    list = list.sort((a: Ticket, b: Ticket) => {
      const dateA = new Date(a.updated_at || a.closed_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.closed_at || b.created_at).getTime();
      return dateB - dateA;
    });
    setTickets(list);
    if (typeof window !== 'undefined') {
      localStorage.setItem('support_panel_tickets_count_archive', list.length.toString());
      setSkeletonCount(list.length === 0 ? null : list.length);
      if (!activeTicket && list.length > 0) {
        const lastTicketId = localStorage.getItem('support_panel_last_ticket_id');
        if (lastTicketId) {
          const ticket = list.find((t: Ticket) => t.id === lastTicketId);
          if (ticket) {
            setTimeout(() => {
              setActiveTicket(ticket);
              currentTicketIdRef.current = ticket.id;
              isInitialMessagesLoadRef.current = true;
              fetchMessages(ticket.id);
            }, 50);
          }
        }
      }
    }
    // oxlint-disable-next-line
  }, [statusFilter, archiveQuery.data, archiveQuery.isLoading]);

  // Получаем токен из ответа API для WebSocket
  // ВАЖНО: token установлен как httpOnly cookie, поэтому JavaScript не может его прочитать из cookies
  // Токен получается из API ответа и хранится только в памяти компонента (React state)
  // НЕ сохраняем токен в localStorage/sessionStorage для безопасности
  const [wsToken] = useState<string | undefined>(initialWsToken);

  // Инициализация WebSocket
  const { socket, isConnected } = useWebSocket({
    enabled: authState.hasSupportAccess && !!wsToken,
    userId: authState.userId || undefined,
    ticketId: activeTicket?.id,
    isSupport: true,
    token: wsToken,
  });

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (authState.hasSupportAccess) {
      // Обновляем ref текущего фильтра
      currentFilterRef.current = statusFilter;
      // Загружаем количество скелетонов для текущего фильтра из localStorage
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(`support_panel_tickets_count_${statusFilter}`);
        if (cached !== null) {
          const parsed = parseInt(cached, 10);
          if (!isNaN(parsed)) {
            // Если 0, устанавливаем null (не показываем скелетоны)
            setSkeletonCount(parsed === 0 ? null : parsed);
          } else {
            setSkeletonCount(3);
          }
        } else {
          setSkeletonCount(3);
        }
      }
      // Сбрасываем isFilterChanging при изменении фильтра
      setIsFilterChanging(false);

      if (isInitialMount.current) {
        isInitialMount.current = false;
        // Skip fetch on initial mount
      } else {
        fetchTickets();
      }
    }
    // oxlint-disable-next-line
  }, [authState.hasSupportAccess, statusFilter]);

  // Восстанавливаем последний открытый тикет после загрузки тикетов
  useEffect(() => {
    if (authState.hasSupportAccess && tickets.length > 0 && !activeTicket) {
      if (typeof window !== 'undefined') {
        const lastTicketId = localStorage.getItem('support_panel_last_ticket_id');
        if (lastTicketId) {
          const ticket = tickets.find((t) => t.id === lastTicketId);
          if (ticket) {
            setActiveTicket(ticket);
            currentTicketIdRef.current = ticket.id;
          }
        }
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets.length, authState.hasSupportAccess]);

  // Отметка сообщений как прочитанных с debounce
  const markMessagesAsRead = useCallback(async (ticketId: string) => {
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
    }

    markReadTimeoutRef.current = setTimeout(async () => {
      if (currentTicketIdRef.current !== ticketId) {
        return;
      }

      try {
        await markAsReadMutation.mutateAsync({ ticketId });
      } catch {
        // Errors (including rate-limit) handled by tRPC link / captcha
      }
    }, 2000);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket: присоединение/отсоединение от тикета теперь обрабатывается автоматически в useWebSocket
  // joinTicket и leaveTicket вызываются автоматически при изменении ticketId в useWebSocket

  // Ref для хранения текущих сообщений (для проверки в WebSocket обработчиках)
  const messagesRef = useRef<Message[]>([]);

  // Синхронизируем ref с state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // WebSocket: обработка новых сообщений и обновлений тикетов
  useEffect(() => {
    if (!socket || !activeTicket || !authState.hasSupportAccess) return;

    const handleNewMessage = (data: { ticketId: string; message: any }) => {
      if (data.ticketId !== activeTicketRef.current?.id) return;

      // Проверяем, что сообщение еще не добавлено (используем ref для актуальных данных)
      const messageExists = messagesRef.current.some((m) => m.id === data.message.id);
      if (messageExists) return;

      // Маппим вложения для нового сообщения (оптимизировано - используем данные из WebSocket)
      const mappedMessage: Message = {
        id: data.message.id,
        ticket_id: data.ticketId,
        sender_id: data.message.sender?.id || '',
        sender_type: data.message.sender_type,
        message_text: data.message.message_text,
        is_read: data.message.is_read,
        created_at: data.message.created_at,
        sender: data.message.sender,
        attachments: processAttachments(data.message.attachments),
      };

      // Добавляем новое сообщение
      setMessages((prev) => {
        const updated = [...prev, mappedMessage];
        messagesRef.current = updated; // Обновляем ref сразу
        // Кэшируем обновленные сообщения
        if (data.ticketId) {
          saveMessagesToCache(data.ticketId, updated);
        }
        return updated;
      });

      let lastMessageText = data.message.message_text || '';
      if (!lastMessageText && data.message.attachments && data.message.attachments.length > 0) {
        lastMessageText = getLastMessageLabelForAttachments(data.message.attachments);
      } else if (lastMessageText) {
        lastMessageText = normalizeLastMessageDisplayText(lastMessageText);
      }

      // Обновляем last_message_at и last_message в списке тикетов
      updateTicketInList(data.ticketId, {
        last_message_at: data.message.created_at,
        last_message: {
          id: data.message.id,
          message_text: lastMessageText,
          sender_type: data.message.sender_type,
          created_at: data.message.created_at,
          is_read: data.message.is_read,
        },
      });

      // Отмечаем сообщение как прочитанное
      markMessagesAsRead(data.ticketId);
    };

    const handleTicketUpdate = (data: {
      ticketId: string;
      ticket: {
        status: 'open' | 'closed' | 'pending';
        updated_at: string;
        closed_at?: string | null;
      };
    }) => {
      // ОПТИМИЗАЦИЯ: Обновляем тикет в списке всегда, даже если он не активный
      // Это обеспечивает мгновенное обновление UI без дополнительных запросов
      updateTicketInList(data.ticketId, {
        status: data.ticket.status,
        updated_at: data.ticket.updated_at,
        closed_at: data.ticket.closed_at,
      });

      // Обновляем активный тикет только если это текущий тикет
      if (data.ticketId === activeTicketRef.current?.id) {
        setActiveTicket((prev) => {
          if (!prev || prev.id !== data.ticketId) return prev;
          return {
            ...prev,
            status: data.ticket.status,
            updated_at: data.ticket.updated_at,
            closed_at: data.ticket.closed_at,
          };
        });
      }
    };

    const handleTicketAssignment = (data: {
      ticketId: string;
      assignedTo: string | null;
      assignedUser: {
        id: string;
        username: string;
        user_id: string;
        avatar?: string | null;
      } | null;
    }) => {
      // ОПТИМИЗАЦИЯ: Обновляем тикет в списке всегда для мгновенного обновления UI
      updateTicketInList(data.ticketId, {
        assigned_to: data.assignedTo,
        assigned_user: data.assignedUser,
      });

      // Обновляем активный тикет только если это текущий тикет
      if (data.ticketId === activeTicketRef.current?.id) {
        setActiveTicket((prev) => {
          if (!prev || prev.id !== data.ticketId) return prev;
          return {
            ...prev,
            assigned_to: data.assignedTo,
            assigned_user: data.assignedUser,
          };
        });
      }
    };

    const handleMessageRead = (data: {
      ticketId: string;
      messageIds: string[];
      readBy: 'user' | 'support';
    }) => {
      if (data.ticketId !== activeTicketRef.current?.id) return;

      // Обновляем статус прочитанности сообщений
      setMessages((prev) => {
        const messageIds = data.messageIds || [];
        return prev.map((msg) => (messageIds.includes(msg.id) ? { ...msg, is_read: true } : msg));
      });
    };

    socket.on('support:message:new', handleNewMessage);
    socket.on('support:ticket:updated', handleTicketUpdate);
    socket.on('support:ticket:assigned', handleTicketAssignment);
    socket.on('support:message:read', handleMessageRead);

    return () => {
      socket.off('support:message:new', handleNewMessage);
      socket.off('support:ticket:updated', handleTicketUpdate);
      socket.off('support:ticket:assigned', handleTicketAssignment);
      socket.off('support:message:read', handleMessageRead);
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, activeTicket?.id, authState.hasSupportAccess, markMessagesAsRead]);

  // Простая функция хэширования для сравнения сообщений
  const hashMessages = useCallback((msgs: Message[]): string => {
    return msgs.map((m) => `${m.id}-${m.created_at}`).join('|');
  }, []);

  // Умное обновление сообщений: polling как fallback когда WebSocket недоступен
  const shouldPoll =
    activeTicket &&
    authState.hasSupportAccess &&
    (!isConnected || !socket?.connected) &&
    !document.hidden;

  const pollingQuery = trpc.support.tickets.get.useQuery(
    { ticketId: activeTicket?.id ?? '', limit: 100, offset: 0 },
    {
      enabled: !!shouldPoll && !!activeTicket?.id,
      refetchInterval: 30000,
    },
  );
  const polledData = pollingQuery.data;

  // Эффект для обработки данных от tRPC polling
  useEffect(() => {
    if (!polledData || !polledData.ticket || !polledData.messages || !activeTicket) return;
    if (currentTicketIdRef.current !== activeTicket.id) return;

    const currentMessages = messagesRef.current;
    const currentMessageCount = polledData.messages.length;
    const currentMessagesHash = hashMessages(polledData.messages);
    const lastMessageCount = currentMessages.length;
    const lastMessagesHash = hashMessages(currentMessages);

    // Обновляем статус тикета (может измениться)
    const statusChanged = activeTicket.status !== polledData.ticket.status;

    // Проверяем переход между активными и архивными статусами
    const wasActive = activeTicket.status === 'open' || activeTicket.status === 'pending';
    const isNowActive =
      polledData.ticket.status === 'open' || polledData.ticket.status === 'pending';
    const statusCategoryChanged = wasActive !== isNowActive;

    // Обновляем только если появились новые сообщения, изменился статус или хэш сообщений
    if (
      currentMessageCount > lastMessageCount ||
      statusChanged ||
      currentMessagesHash !== lastMessagesHash
    ) {
      // Маппим сообщения с вложениями
      const mappedMessages = (polledData.messages || []).map((m: any) => ({
        id: m.id,
        ticket_id: activeTicket.id,
        sender_id: m.sender?.id || '',
        sender_type: m.sender_type,
        message_text: m.message_text,
        is_read: m.is_read,
        created_at: m.created_at,
        sender: m.sender,
        attachments: processAttachments(m.attachments),
      }));

      setMessages(mappedMessages);
      // Ref messagesRef обновится автоматически через useEffect

      // Обновляем статус тикета
      if (statusChanged) {
        setActiveTicket((prev) => (prev ? { ...prev, status: polledData.ticket.status } : null));
      }

      // Обновляем список тикетов
      if (statusCategoryChanged) {
        fetchTickets();
      } else if (statusChanged) {
        updateTicketInList(activeTicket.id, {
          status: polledData.ticket.status,
          updated_at: polledData.ticket.updated_at,
        });
      }

      // Отмечаем сообщения как прочитанные (debounced)
      markMessagesAsRead(activeTicket.id);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [polledData, activeTicket, hashMessages, markMessagesAsRead]); // updateTicketInList и fetchTickets исключены из deps

  // Эффект для инициализации и очистки при смене тикета
  useEffect(() => {
    if (!activeTicket || !authState.hasSupportAccess) return;

    // Обновляем ref текущего тикета
    currentTicketIdRef.current = activeTicket.id;

    // Отмечаем сообщения как прочитанные при открытии тикета (debounced)
    markMessagesAsRead(activeTicket.id);

    return () => {
      // Очищаем таймер при размонтировании
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
      }
      // Отменяем запросы при размонтировании
      if (fetchTicketsAbortControllerRef.current) {
        fetchTicketsAbortControllerRef.current.abort();
      }
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id, authState.hasSupportAccess, markMessagesAsRead]);

  // useEffect(() => {
  //   if (activeTicket) {
  //     // Сбрасываем флаг первой загрузки при смене тикета
  //     isInitialMessagesLoadRef.current = true;
  //     fetchMessages(activeTicket.id);
  //   }
  //
  // }, [activeTicket?.id]);

  const showNotification = (message: string, type: 'error' = 'error') => {
    setNotification({ message, type, show: true });
    setTimeout(() => {
      // Анимация исчезновения
      if (notificationRef.current) {
        gsap.to(notificationRef.current, {
          opacity: 0,
          y: -20,
          scale: 0.95,
          duration: GSAP_DEFAULT_DURATION * 0.6,
          ease: 'power2.in',
          onComplete: () => {
            setNotification({ message: '', type: 'error', show: false });
          },
        });
      } else {
        setNotification({ message: '', type: 'error', show: false });
      }
    }, 3000);
  };

  // Анимация появления уведомления
  useEffect(() => {
    if (notification.show && notificationRef.current) {
      gsap.fromTo(
        notificationRef.current,
        { opacity: 0, y: -20, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: GSAP_DEFAULT_DURATION,
          ease: GSAP_DEFAULT_EASE,
        },
      );
    }
  }, [notification.show]);

  const fetchTickets = async () => {
    if (statusFilter === 'archive') {
      await archiveQuery.refetch();
      return;
    }
    return debugPerformanceAsync('fetchTickets', async () => {
      if (fetchTicketsAbortControllerRef.current) {
        fetchTicketsAbortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      fetchTicketsAbortControllerRef.current = abortController;

      const filterAtStart = currentFilterRef.current;

      setTicketsLoading(true);
      try {
        debugStart('fetchTickets', { statusFilter, filterAtStart });
        if (currentFilterRef.current !== filterAtStart) {
          setTicketsLoading(false);
          return;
        }

        const [openData, pendingData] = await Promise.all([
          utils.support.tickets.list.fetch({ status: 'open' }),
          utils.support.tickets.list.fetch({ status: 'pending' }),
        ]);

        if (currentFilterRef.current !== 'active' || abortController.signal.aborted) {
          setTicketsLoading(false);
          return;
        }

        let tickets = [...(openData.tickets || []), ...(pendingData.tickets || [])].map(
          (t: {
            id: string;
            subject: string;
            status: 'open' | 'closed' | 'pending';
            priority?: 'low' | 'normal' | 'high' | 'urgent';
            created_at: string;
            updated_at: string;
            last_message_at: string;
            closed_at?: string | null;
            user?: {
              id: string;
              username: string;
              user_id: string;
            };
            assigned_to?: string | null;
            assigned_user?: {
              id: string;
              username: string;
              user_id: string;
            } | null;
            last_message?: {
              id: string;
              message_text: string;
              sender_type: 'user' | 'support' | 'system';
              created_at: string;
              is_read: boolean;
            } | null;
          }) => ({
            id: t.id,
            subject: t.subject,
            status: t.status,
            priority: t.priority || 'normal',
            created_at: t.created_at,
            updated_at: t.updated_at,
            last_message_at: t.last_message_at,
            closed_at: t.closed_at,
            user_id: (t as any).user_id, // Сохраняем user_id для проверки прав
            user: t.user,
            assigned_to: t.assigned_to,
            assigned_user: t.assigned_user,
            last_message: t.last_message || null,
          }),
        );

        // Для активных сортируем по давности последнего ответа (убывание - старые сверху)
        tickets = tickets.sort((a: Ticket, b: Ticket) => {
          const dateA = new Date(a.last_message_at).getTime();
          const dateB = new Date(b.last_message_at).getTime();
          return dateA - dateB; // Старые сверху (дольше без ответа)
        });

        // Финальная проверка перед обновлением состояния
        if (currentFilterRef.current !== 'active' || abortController.signal.aborted) {
          setTicketsLoading(false);
          return;
        }

        setTickets(tickets);
        // Сохраняем количество тикетов в localStorage для скелетонов (отдельно для каждого фильтра)
        if (typeof window !== 'undefined') {
          const count = tickets.length;
          localStorage.setItem(`support_panel_tickets_count_${statusFilter}`, count.toString());
          // Если тикетов нет (0), не показываем скелетоны (null)
          setSkeletonCount(count === 0 ? null : count);

          // Восстанавливаем последний открытый тикет после загрузки
          if (!activeTicket && count > 0) {
            const lastTicketId = localStorage.getItem('support_panel_last_ticket_id');
            if (lastTicketId) {
              const ticket = tickets.find((t: Ticket) => t.id === lastTicketId);
              if (ticket) {
                // Небольшая задержка для корректного обновления state
                setTimeout(() => {
                  setActiveTicket(ticket);
                  currentTicketIdRef.current = ticket.id;
                  isInitialMessagesLoadRef.current = true;
                  fetchMessages(ticket.id);
                }, 50);
              }
            }
          }
        }
        debugEnd('fetchTickets', {
          statusFilter,
          ticketsCount: tickets.length,
        });
        setTicketsLoading(false);
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setTicketsLoading(false);
          return;
        }
        if (currentFilterRef.current !== filterAtStart) {
          setTicketsLoading(false);
          return;
        }
        debugError('fetchTickets', { statusFilter, error });
        setTicketsLoading(false);
        setTickets([]);
        setSkeletonCount(null);
        showNotification(translateError('Ошибка загрузки тикетов'), 'error');
      }
    });
  };

  const fetchMessages = async (ticketId: string) => {
    // Обновляем ref текущего тикета
    currentTicketIdRef.current = ticketId;

    // Определяем, является ли это первой загрузкой сообщений для этого тикета
    const isFirstLoad = isInitialMessagesLoadRef.current;

    // Загружаем кэшированные сообщения для мгновенного отображения
    const cachedMessages = loadMessagesFromCache(ticketId);
    if (cachedMessages && cachedMessages.length > 0) {
      setMessages(cachedMessages);
      // Восстанавливаем позицию скролла после загрузки кэша
      requestAnimationFrame(() => {
        restoreScrollPosition(ticketId);
      });
    }

    // Не блокируем загрузку сообщений заранее - мы должны получать актуальные данные с сервера
    // даже если тикет занят другим саппортом, чтобы корректно обновить состояние UI

    return debugPerformanceAsync('fetchMessages', async () => {
      setMessagesLoading(true);
      try {
        debugStart('fetchMessages', { ticketId });
        const data = await utils.support.tickets.get.fetch({
          ticketId,
          limit: 100,
          offset: 0,
        });

        if (currentTicketIdRef.current !== ticketId) {
          setMessagesLoading(false);
          return;
        }

        const mappedMessages: Message[] = (data.messages || []).map(
          (m: {
            id: string;
            message_text: string;
            sender_type: string;
            created_at: string;
            is_read: boolean;
            sender?: { id: string; username: string; user_id: string; avatar?: string | null };
            attachments?: Array<{
              id: string;
              file_name: string;
              file_type: string;
              file_size: number;
              storage_url?: string;
              storage_path?: string;
            }>;
          }) => ({
            id: m.id,
            ticket_id: ticketId,
            sender_id: m.sender?.id || '',
            sender_type: m.sender_type as 'user' | 'support',
            message_text: m.message_text,
            is_read: m.is_read,
            created_at: m.created_at,
            sender: m.sender,
            attachments: processAttachments(m.attachments),
          }),
        );

        setMessages(mappedMessages);

        saveMessagesToCache(ticketId, mappedMessages);

        if (isFirstLoad) {
          setTimeout(() => {
            isInitialMessagesLoadRef.current = false;
            if (!cachedMessages || cachedMessages.length === 0) {
              restoreScrollPosition(ticketId);
            }
          }, 100);
        }

        if (data.ticket && currentTicketIdRef.current === ticketId) {
          setActiveTicket((prev) => {
            if (prev && prev.id === ticketId) {
              return {
                ...prev,
                status: data.ticket.status,
                user_id: data.ticket.user_id ?? prev.user_id,
                user: data.ticket.user || prev.user,
                assigned_to: data.ticket.assigned_to ?? null,
                assigned_user: data.ticket.assigned_user ?? null,
                updated_at: data.ticket.updated_at,
                closed_at: 'closed_at' in data.ticket ? data.ticket.closed_at : prev.closed_at,
              };
            } else if (data.ticket) {
              return {
                ...data.ticket,
                user_id: data.ticket.user_id,
                assigned_to: data.ticket.assigned_to ?? null,
                assigned_user: data.ticket.assigned_user ?? null,
              };
            }
            return prev;
          });

          updateTicketInList(ticketId, {
            status: data.ticket.status,
            assigned_to: data.ticket.assigned_to ?? null,
            assigned_user: data.ticket.assigned_user ?? null,
            updated_at: data.ticket.updated_at,
            closed_at: data.ticket.closed_at ?? undefined,
          });
        }

        markMessagesAsRead(ticketId);
        debugEnd('fetchMessages', {
          ticketId,
          messagesCount: mappedMessages.length,
        });
      } catch (error) {
        debugError('fetchMessages', { ticketId, error });
        showNotification(translateError('Ошибка загрузки сообщений'), 'error');
      } finally {
        setMessagesLoading(false);
      }
    });
  };

  const handleSendMessage = async () => {
    if (!activeTicket || !messageText.trim()) return;

    try {
      let csrfToken = csrfQuery.data?.csrfToken ?? '';
      if (!csrfToken) {
        const result = await csrfQuery.refetch();
        csrfToken = result.data?.csrfToken ?? '';
      }
      if (!csrfToken) {
        showNotification(translateError('Ошибка загрузки. Обновите страницу.'), 'error');
        return;
      }

      await sendMessageMutation.mutateAsync({
        ticketId: activeTicket.id,
        message: messageText.trim(),
        csrfToken,
      });

      setMessageText('');

      const ticketData = await utils.support.tickets.get.fetch({
        ticketId: activeTicket.id,
        limit: 100,
        offset: 0,
      });
      if (currentTicketIdRef.current === activeTicket.id) {
        setMessages(ticketData.messages || []);
        markMessagesAsRead(activeTicket.id);
        setTickets((prevTickets) =>
          prevTickets.map((ticket) =>
            ticket.id === activeTicket.id
              ? {
                  ...ticket,
                  last_message_at: ticketData.ticket?.last_message_at || ticket.last_message_at,
                }
              : ticket,
          ),
        );
        // Прокрутка вниз после отправки своего сообщения
        if (typeof window !== 'undefined' && activeTicket.id) {
          localStorage.setItem(`support_panel_scroll_${activeTicket.id}`, 'bottom');
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messagesEndRef.current && !isRestoringScrollRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          });
        });
      }
    } catch (error) {
      const msg =
        error instanceof Error && 'data' in error
          ? (error as any).message
          : 'Ошибка отправки сообщения';
      showNotification(translateError(msg), 'error');
    }
  };

  // Функция для обновления конкретного тикета в списке
  const updateTicketInList = (ticketId: string, updates: Partial<Ticket>) => {
    setTickets((prevTickets) =>
      prevTickets.map((ticket) => (ticket.id === ticketId ? { ...ticket, ...updates } : ticket)),
    );
  };

  const handleAssignTicket = async (ticketId: string, userId: string) => {
    try {
      const currentTicket = tickets.find((t) => t.id === ticketId) || activeTicket;

      if (currentTicket && currentTicket.status === 'closed') {
        showNotification('Архивные тикеты не могут быть закреплены или отвязаны', 'error');
        return;
      }

      if (currentTicket?.assigned_to === userId) {
        const data = await updateTicketMutation.mutateAsync({
          ticketId,
          assignedTo: null,
        });

        if (data.ticket) {
          if (activeTicket?.id === ticketId) {
            setActiveTicket((prev) => {
              if (prev && prev.id === ticketId) {
                return {
                  ...prev,
                  assigned_to: null,
                  assigned_user: null,
                };
              }
              return prev;
            });
          }
          updateTicketInList(ticketId, {
            assigned_to: null,
            assigned_user: null,
          });
        }
        return;
      }

      if (currentTicket?.assigned_to && currentTicket.assigned_to !== userId) {
        showNotification('Тикет уже занят другим специалистом поддержки', 'error');
        return;
      }

      const data = await updateTicketMutation.mutateAsync({
        ticketId,
        assignedTo: userId,
        status: 'pending',
      });

      if (data.ticket) {
        if (activeTicket?.id === ticketId) {
          setActiveTicket((prev) => {
            if (prev && prev.id === ticketId) {
              return {
                ...prev,
                assigned_to: data.ticket.assigned_to || null,
                assigned_user: data.ticket.assigned_user || null,
                status: data.ticket.status || 'pending',
              };
            }
            return prev;
          });
        }
        updateTicketInList(ticketId, {
          assigned_to: data.ticket.assigned_to || null,
          assigned_user: data.ticket.assigned_user || null,
          status: data.ticket.status || 'pending',
        });

        if (activeTicket?.id === ticketId) {
          await fetchMessages(ticketId);
        }
      }
    } catch (error) {
      const msg =
        error instanceof Error && 'data' in error
          ? (error as any).message
          : 'Ошибка при взятии тикета';
      showNotification(translateError(msg), 'error');
    }
  };

  const handleCloseTicket = (ticketId: string) => {
    setTicketToClose(ticketId);
    setShowCloseReasonModal(true);
    setCloseReason('');
  };

  const handleConfirmCloseTicket = async () => {
    if (!ticketToClose || !closeReason.trim()) {
      showNotification('Укажите причину закрытия тикета', 'error');
      return;
    }

    await handleUpdateTicketStatus(ticketToClose, 'closed', closeReason.trim());
    setShowCloseReasonModal(false);
    setCloseReason('');
    setTicketToClose(null);
  };

  const handleUpdateTicketStatus = async (
    ticketId: string,
    status: string,
    closeReason?: string,
  ) => {
    try {
      const currentTicket = tickets.find((t) => t.id === ticketId) || activeTicket;
      if (currentTicket && currentTicket.status === 'closed') {
        showNotification('Статус архивных тикетов нельзя изменить', 'error');
        return;
      }

      const data = await updateTicketMutation.mutateAsync({
        ticketId,
        status: status as 'open' | 'closed' | 'pending' | 'resolved',
        closeReason,
      });

      if (data.ticket) {
        const newStatus = status as 'open' | 'pending' | 'closed';
        const wasActive = activeTicket?.status === 'open' || activeTicket?.status === 'pending';
        const isNowActive = newStatus === 'open' || newStatus === 'pending';
        const statusCategoryChanged = wasActive !== isNowActive;

        if (activeTicket?.id === ticketId) {
          setActiveTicket({
            ...activeTicket,
            status: newStatus,
            assigned_to: data.ticket.assigned_to || null,
            assigned_user: data.ticket.assigned_user || null,
          });
        }

        updateTicketInList(ticketId, {
          status: newStatus,
          updated_at: data.ticket.updated_at,
          closed_at: data.ticket.closed_at,
          assigned_to: data.ticket.assigned_to || null,
          assigned_user: data.ticket.assigned_user || null,
        });

        if (statusCategoryChanged) {
          if (isNowActive && statusFilter === 'archive') {
            setStatusFilter('active');
            const cached = localStorage.getItem(`support_panel_tickets_count_active`);
            if (cached !== null) {
              const parsed = parseInt(cached, 10);
              if (!isNaN(parsed)) {
                setSkeletonCount(parsed === 0 ? null : parsed);
              } else {
                setSkeletonCount(3);
              }
            } else {
              setSkeletonCount(3);
            }
          } else if (!isNowActive && statusFilter === 'active') {
            setStatusFilter('archive');
            setSkeletonCount(3);
          } else if (!isNowActive && statusFilter === 'archive') {
            await fetchTickets();
          } else {
            await fetchTickets();
          }
        } else if (newStatus === 'closed') {
          if (statusFilter === 'archive') {
            await fetchTickets();
          } else if (statusFilter === 'active') {
            setStatusFilter('archive');
            setSkeletonCount(3);
          }
        }

        if (activeTicket?.id === ticketId) {
          await fetchMessages(ticketId);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка обновления статуса';
      if (errorMessage.includes('status transition') || errorMessage.includes('Invalid status')) {
        showNotification(
          'Недопустимый переход статуса. Проверьте правила изменения статусов.',
          'error',
        );
      } else if (errorMessage.includes('not assigned') || errorMessage.includes('assigned')) {
        showNotification('Тикет должен быть назначен вам для изменения статуса', 'error');
      } else {
        showNotification(translateError(errorMessage), 'error');
      }
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'closed':
        return 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  // Получить цвет индикатора для тикета (желтый или красный)
  // Получить текст индикатора давности
  const getTicketUrgencyText = (ticket: Ticket): string => {
    if (statusFilter === 'archive') return '';
    if (ticket.status === 'closed') return '';

    const lastMessageTime = new Date(ticket.last_message_at).getTime();
    const now = Date.now();
    const minutesSinceLastMessage = (now - lastMessageTime) / (1000 * 60);

    // 37+ минут - показываем "UP!"
    if (minutesSinceLastMessage >= 37) {
      return 'UP!';
    }

    return '';
  };

  // Получить цвет текста индикатора
  const getTicketUrgencyColor = (ticket: Ticket): string => {
    if (statusFilter === 'archive') return '';
    if (ticket.status === 'closed') return '';

    const lastMessageTime = new Date(ticket.last_message_at).getTime();
    const now = Date.now();
    const minutesSinceLastMessage = (now - lastMessageTime) / (1000 * 60);

    if (minutesSinceLastMessage >= 120) {
      return 'border-red-500/50';
    }
    if (minutesSinceLastMessage >= 30) {
      return 'border-yellow-500/50';
    }

    return '';
  };

  const getTicketUrgencyTextColor = (ticket: Ticket): string => {
    if (statusFilter === 'archive') return '';
    if (ticket.status === 'closed') return '';

    const lastMessageTime = new Date(ticket.last_message_at).getTime();
    const now = Date.now();
    const minutesSinceLastMessage = (now - lastMessageTime) / (1000 * 60);

    if (minutesSinceLastMessage >= 120) {
      return 'text-red-400';
    }
    if (minutesSinceLastMessage >= 30) {
      return 'text-yellow-400';
    }

    return '';
  };

  // Фильтруем тикеты по поисковому запросу (для архива и активных)
  const filteredTickets = (() => {
    const searchQuery = statusFilter === 'archive' ? archiveSearchQuery : activeSearchQuery;
    if (!searchQuery.trim()) return tickets;

    const query = searchQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter === 'archive') {
        // Для архива: поиск по логину и теме тикета
        const matchesUsername = ticket.user?.username?.toLowerCase().includes(query) || false;
        const matchesSubject = ticket.subject?.toLowerCase().includes(query) || false;
        return matchesUsername || matchesSubject;
      } else {
        // Для активных: поиск по ID тикета, логину и user_id
        const matchesId = ticket.id.toLowerCase().includes(query);
        const matchesUsername = ticket.user?.username?.toLowerCase().includes(query) || false;
        const matchesUserId = ticket.user?.user_id?.toLowerCase().includes(query) || false;
        return matchesId || matchesUsername || matchesUserId;
      }
    });
  })();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!authState.hasSupportAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
              <svg
                className="h-10 w-10 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">Доступ ограничен</h1>
            <p className="mb-6 text-neutral-400">
              У вас нет доступа к данной странице. Возможно произошла ошибка или вы не авторизованы
              в системе.
            </p>
            <Link
              href="/ui/panel"
              prefetch={false}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Вернуться к выбору панели
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Notification */}
      {notification.show && (
        <div
          ref={notificationRef}
          className="fixed left-1/2 top-4 z-50 hidden -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-3 text-red-400 shadow-lg lg:block"
        >
          {notification.message}
        </div>
      )}

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setMobileMenuOpen(false);
            }
          }}
          aria-label="Закрыть меню"
        />
      )}

      {/* Sidebar - Левое меню со списком тикетов */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-80 flex-shrink-0 transform flex-col border-r border-neutral-800 bg-neutral-900 transition-transform duration-300 ease-in-out lg:static lg:z-auto ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} `}
      >
        {/* Header */}
        <div className="border-b border-neutral-800 p-6">
          <h1 className="text-lg font-semibold text-white">Панель поддержки</h1>
        </div>

        {/* Filters */}
        <div className="space-y-3 border-b border-neutral-800 p-4">
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (isFilterChanging || ticketsLoading) return; // Блокируем, если идет переключение или загрузка
                if (statusFilter === 'active') return; // Уже активен
                setIsFilterChanging(true);
                // Очищаем активный тикет и список тикетов при переключении
                setActiveTicket(null);
                setMessages([]);
                setTickets([]); // Очищаем список для устранения глитча
                currentTicketIdRef.current = null;
                setArchiveSearchQuery(''); // Очищаем поиск при переключении
                setActiveSearchQuery(''); // Очищаем поиск активных при переключении
                // Отменяем текущие запросы
                if (fetchTicketsAbortControllerRef.current) {
                  fetchTicketsAbortControllerRef.current.abort();
                }
                setStatusFilter('active');
                // Разблокируем после небольшой задержки, чтобы дать время useEffect сработать
                setTimeout(() => {
                  setIsFilterChanging(false);
                }, 100);
              }}
              disabled={isFilterChanging || ticketsLoading}
              className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                statusFilter === 'active'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
              } ${isFilterChanging || ticketsLoading ? 'opacity-50' : ''}`}
            >
              Активные
            </button>
            <button
              onClick={() => {
                if (isFilterChanging || ticketsLoading) return; // Блокируем, если идет переключение или загрузка
                if (statusFilter === 'archive') return; // Уже активен
                setIsFilterChanging(true);
                // Очищаем активный тикет и список тикетов при переключении
                setActiveTicket(null);
                setMessages([]);
                setTickets([]); // Очищаем список для устранения глитча
                currentTicketIdRef.current = null;
                setArchiveSearchQuery(''); // Очищаем поиск при переключении
                // Отменяем текущие запросы
                if (fetchTicketsAbortControllerRef.current) {
                  fetchTicketsAbortControllerRef.current.abort();
                }
                setStatusFilter('archive');
                setActiveSearchQuery(''); // Очищаем поиск активных при переключении
                // Разблокируем после небольшой задержки, чтобы дать время useEffect сработать
                setTimeout(() => {
                  setIsFilterChanging(false);
                }, 100);
              }}
              disabled={isFilterChanging || ticketsLoading}
              className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                statusFilter === 'archive'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
              } ${isFilterChanging || ticketsLoading ? 'opacity-50' : ''}`}
            >
              Архив
            </button>
          </div>

          {/* Поиск в архиве */}
          {statusFilter === 'archive' && (
            <div className="relative">
              <input
                type="text"
                value={archiveSearchQuery}
                onChange={(e) => setArchiveSearchQuery(e.target.value)}
                placeholder="Поиск по логину или теме"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pl-10 text-sm text-white placeholder-neutral-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {archiveSearchQuery && (
                <button
                  onClick={() => setArchiveSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transform text-neutral-500 transition-colors hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Поиск в активных тикетах */}
          {statusFilter === 'active' && (
            <div className="relative">
              <input
                type="text"
                value={activeSearchQuery}
                onChange={(e) => setActiveSearchQuery(e.target.value)}
                placeholder="Поиск по логину или ID"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pl-10 text-sm text-white placeholder-neutral-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {activeSearchQuery && (
                <button
                  onClick={() => setActiveSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transform text-neutral-500 transition-colors hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tickets List */}
        <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-4">
          {ticketsLoading ? (
            skeletonCount === null ? (
              // Если последний раз тикетов не было, не показываем скелетоны
              <div className="py-8 text-center text-sm text-neutral-400">Загрузка...</div>
            ) : (
              <div className="space-y-2">
                <TicketSkeleton count={skeletonCount} variant="user" />
              </div>
            )
          ) : filteredTickets.length === 0 ? (
            (statusFilter === 'archive' ? archiveSearchQuery.trim() : activeSearchQuery.trim()) ? (
              <div className="py-8 text-center text-sm text-neutral-400">Ничего не найдено</div>
            ) : (
              <div className="py-8 text-center text-sm text-neutral-400">Нет тикетов</div>
            )
          ) : (
            filteredTickets.map((ticket) => {
              const urgencyColor = getTicketUrgencyColor(ticket);
              const urgencyText = getTicketUrgencyText(ticket);
              const urgencyTextColor = getTicketUrgencyTextColor(ticket);

              const handleTicketClick = () => {
                if (ticketsLoading) return;
                const isArchived = ticket.status === 'closed';
                if (!isArchived && ticket.assigned_to && ticket.assigned_to !== authState.userId) {
                  showNotification('Данный тикет уже закреплен за другим саппортом', 'error');
                  return;
                }
                if (activeTicket?.id === ticket.id) return;
                currentTicketIdRef.current = ticket.id;
                setActiveTicket(ticket);
                isInitialMessagesLoadRef.current = true;
                fetchMessages(ticket.id);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('support_panel_last_ticket_id', ticket.id);
                }
              };
              return (
                <div
                  key={ticket.id}
                  role="button"
                  tabIndex={0}
                  onClick={handleTicketClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTicketClick();
                    }
                  }}
                  className={`select-none rounded-lg border p-4 transition-all ${
                    // Для архивных тикетов не блокируем, для активных - только если назначен другому
                    ticket.status === 'closed' ||
                    !(ticket.assigned_to && ticket.assigned_to !== authState.userId)
                      ? 'cursor-pointer'
                      : ''
                  } ${
                    activeTicket?.id === ticket.id
                      ? 'border-blue-500/50 bg-blue-500/10 shadow-lg'
                      : `border-neutral-700 bg-neutral-800/50 hover:border-neutral-600 hover:bg-neutral-800 ${urgencyColor}`
                  }`}
                >
                  <div
                    className={`mb-2 flex items-start justify-between ${
                      // Применяем opacity только к заголовку и статусу, если тикет назначен другому
                      ticket.status !== 'closed' &&
                      ticket.assigned_to &&
                      ticket.assigned_to !== authState.userId
                        ? 'opacity-50'
                        : ''
                    }`}
                  >
                    <h3 className="line-clamp-1 flex-1 text-sm font-medium text-white">
                      {ticket.subject}
                    </h3>
                    <span
                      className={`ml-2 flex-shrink-0 rounded border px-2 py-0.5 text-xs ${getStatusColor(ticket.status)}`}
                    >
                      {ticket.status === 'open'
                        ? 'Открыт'
                        : ticket.status === 'pending'
                          ? 'В работе'
                          : 'Закрыт'}
                    </span>
                  </div>
                  {ticket.user && (
                    <div
                      className={`mb-1 flex items-baseline gap-1 ${
                        // Применяем opacity к информации о пользователе, если тикет назначен другому
                        ticket.status !== 'closed' &&
                        ticket.assigned_to &&
                        ticket.assigned_to !== authState.userId
                          ? 'opacity-50'
                          : ''
                      }`}
                    >
                      <span className="text-xs font-medium text-white">{ticket.user.username}</span>
                      <span className="text-xs text-neutral-400">#{ticket.user.user_id}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-xs text-neutral-500 ${
                        // Применяем opacity к дате, если тикет назначен другому
                        ticket.status !== 'closed' &&
                        ticket.assigned_to &&
                        ticket.assigned_to !== authState.userId
                          ? 'opacity-50'
                          : ''
                      }`}
                    >
                      {formatDate(ticket.last_message_at)}
                    </p>
                    <div className="flex items-center gap-2">
                      {ticket.assigned_user && statusFilter === 'active' && (
                        <span className="text-xs text-blue-400">
                          Отвечает:{' '}
                          <span className="uppercase">{ticket.assigned_user.username}</span>
                        </span>
                      )}
                      {urgencyText && (
                        <span className={`text-xs font-medium ${urgencyTextColor}`}>
                          {urgencyText}
                        </span>
                      )}
                    </div>
                  </div>
                  {ticket.last_message &&
                    ticket.status !== 'closed' &&
                    statusFilter !== 'archive' &&
                    (() => {
                      const SYSTEM_MESSAGE_TEXT =
                        'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';
                      const lastMessageText = ticket.last_message.message_text || '';
                      const isStatusChangeMessage =
                        lastMessageText.includes('Статус тикета изменен') ||
                        lastMessageText.includes('Ваше обращение приняли в обработку') ||
                        lastMessageText.includes('Ваше обращение было закрыто');
                      // Используем trim() для надежного сравнения
                      const isSystemMessage =
                        lastMessageText.trim() === SYSTEM_MESSAGE_TEXT.trim() ||
                        isStatusChangeMessage;

                      return (
                        <div className="mt-1.5 flex items-center gap-2 truncate text-xs text-neutral-500">
                          <span className="flex-shrink-0 text-neutral-600">
                            {isSystemMessage
                              ? 'Система:'
                              : ticket.last_message.sender_type === 'user'
                                ? 'Пользователь:'
                                : 'Поддержка:'}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {normalizeLastMessageDisplayText(
                              ticket.last_message.message_text || '',
                            ) || '—'}
                          </span>
                          {ticket.last_message.is_read === false &&
                            ticket.last_message.sender_type === 'user' &&
                            !isSystemMessage && (
                              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"></span>
                            )}
                        </div>
                      );
                    })()}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Top Bar */}
        <header className="border-b border-neutral-800 bg-neutral-900 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white lg:hidden"
                aria-label="Открыть меню"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-white sm:text-xl">
                {activeTicket ? activeTicket.subject : 'Тикеты'}
              </h2>
            </div>
            {activeTicket && (
              <button
                onClick={() => setMobileActionsOpen(!mobileActionsOpen)}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white lg:hidden"
                aria-label="Управление тикетом"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                  />
                </svg>
              </button>
            )}
          </div>
          {/* Мобильное меню действий */}
          {activeTicket && shouldRenderMobileActions && (
            <div
              ref={mobileActionsRef}
              className="mt-4 rounded-lg border border-neutral-700 bg-neutral-800 p-4 lg:hidden"
            >
              <div className="flex flex-col gap-2">
                {(activeTicket.status === 'open' || activeTicket.status === 'pending') && (
                  <>
                    <button
                      onClick={() => {
                        if (authState.userId) {
                          handleAssignTicket(activeTicket.id, authState.userId);
                          setMobileActionsOpen(false);
                        }
                      }}
                      className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                        activeTicket.assigned_to === authState.userId
                          ? 'bg-orange-600 hover:bg-orange-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {activeTicket.assigned_to === authState.userId
                        ? 'Отвязать тикет'
                        : 'Взять тикет'}
                    </button>
                    <button
                      onClick={() => {
                        handleCloseTicket(activeTicket.id);
                        setMobileActionsOpen(false);
                      }}
                      className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                      Закрыть тикет
                    </button>
                  </>
                )}
                {/* Селект статуса доступен только для активных тикетов */}
                {activeTicket.status === 'open' || activeTicket.status === 'pending' ? (
                  <select
                    value={activeTicket.status}
                    onChange={(e) => {
                      handleUpdateTicketStatus(activeTicket.id, e.target.value);
                      setMobileActionsOpen(false);
                    }}
                    className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="open">Открыт</option>
                    <option value="pending">В работе</option>
                    <option value="closed">Закрыт</option>
                  </select>
                ) : (
                  <div className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white">
                    Закрыт
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Chat Area - Центральная часть с чатом */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {activeTicket ? (
            <>
              {/* Основной контент (сообщения и input) */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* User Actions Block */}
                {activeTicket.user && (
                  <div className="flex-shrink-0 border-b border-neutral-800 bg-neutral-900/50 p-3">
                    <div className="mb-3 flex items-center gap-3">
                      {(() => {
                        const avatarUrl = getAvatarUrl(activeTicket.user.avatar);
                        const gradientClasses = getGradientClasses(activeTicket.user.avatar);

                        return (
                          <div
                            className={`h-10 w-10 overflow-hidden rounded-full ${avatarUrl ? '' : gradientClasses} flex flex-shrink-0 items-center justify-center text-sm font-semibold text-white`}
                          >
                            {avatarUrl ? (
                              <Image
                                src={avatarUrl}
                                alt={activeTicket.user.username}
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                                unoptimized
                              />
                            ) : (
                              getInitial(activeTicket.user.username)
                            )}
                          </div>
                        );
                      })()}
                      <div>
                        <div className="text-sm font-medium text-white">
                          {activeTicket.user.username}
                        </div>
                        <div className="text-xs text-neutral-400">#{activeTicket.user.user_id}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300 transition-colors hover:bg-neutral-700 sm:px-3 sm:py-1.5 sm:text-xs">
                        Заблокировать создание тикетов
                      </button>
                      <button className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300 transition-colors hover:bg-neutral-700 sm:px-3 sm:py-1.5 sm:text-xs">
                        Продлить подписку
                      </button>
                      <button className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300 transition-colors hover:bg-neutral-700 sm:px-3 sm:py-1.5 sm:text-xs">
                        Добавить
                      </button>
                    </div>
                  </div>
                )}

                {/* Messages */}
                <div
                  ref={messagesContainerRef}
                  className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
                  onScroll={() => {
                    // Debounce сохранения позиции скролла
                    if (isRestoringScrollRef.current || !activeTicket) return;

                    if (scrollSaveTimeoutRef.current) {
                      clearTimeout(scrollSaveTimeoutRef.current);
                    }

                    scrollSaveTimeoutRef.current = setTimeout(() => {
                      if (activeTicket) {
                        saveScrollPosition(activeTicket.id);
                      }
                    }, 300);
                  }}
                >
                  {messagesLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <div className="spinner mx-auto"></div>
                        <p className="mt-2 text-sm text-neutral-400">Загрузка сообщений...</p>
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-8 text-center text-sm text-neutral-400">Нет сообщений</div>
                  ) : (
                    messages.map((message, index) => {
                      // Проверяем, является ли сообщение системным (автоматическим или о смене статуса)
                      const SYSTEM_MESSAGE_TEXT =
                        'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';
                      const messageText = message.message_text || '';
                      const isStatusChangeMessage =
                        messageText.includes('Статус тикета изменен') ||
                        messageText.includes('Ваше обращение приняли в обработку') ||
                        messageText.includes('Ваше обращение было закрыто');
                      // Системное сообщение определяется по тексту, независимо от sender_type
                      // Используем trim() для надежного сравнения
                      const isSystemMessage =
                        messageText.trim() === SYSTEM_MESSAGE_TEXT.trim() || isStatusChangeMessage;

                      // Показываем дату если это первое сообщение или дата изменилась
                      const showDate =
                        index === 0 ||
                        new Date(message.created_at).getDate() !==
                          new Date(messages[index - 1].created_at).getDate();

                      const formatTime = (dateString: string) => {
                        return new Intl.DateTimeFormat('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(dateString));
                      };

                      const formatMessageDate = (dateString: string) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const messageDate = new Date(dateString);
                        messageDate.setHours(0, 0, 0, 0);
                        const diffTime = today.getTime() - messageDate.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays === 0) {
                          return 'Сегодня';
                        } else if (diffDays === 1) {
                          return 'Вчера';
                        } else {
                          return messageDate.toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'long',
                          });
                        }
                      };

                      // Перевернутая логика: саппорт слева, пользователь справа
                      // Fallback: если sender_type не определен, определяем по sender_id
                      // (в админ-панели текущий пользователь всегда саппорт)
                      const senderType =
                        message.sender_type || (authState.hasSupportAccess ? 'support' : 'user');
                      const isSupport = senderType === 'support' && !isSystemMessage;
                      const isUser = senderType === 'user';

                      return (
                        <MessageItem
                          key={message.id}
                          message={message}
                          showDate={showDate}
                          isSystemMessage={isSystemMessage}
                          isSupport={isSupport}
                          isUser={isUser}
                          formatDate={formatMessageDate}
                          formatTime={formatTime}
                          getInitial={getInitial}
                          isInitialLoad={isInitialMessagesLoadRef.current}
                          onImageClick={(url, alt) => setViewingImage({ url, alt })}
                          formatFileSize={formatFileSize}
                        />
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                {activeTicket.status === 'closed' ? (
                  <div className="flex-shrink-0 border-t border-neutral-800 bg-neutral-900/50 p-3">
                    <div className="py-2 text-center">
                      <p className="text-sm text-neutral-400">
                        Тикет закрыт. Новые сообщения недоступны.
                      </p>
                    </div>
                  </div>
                ) : authState.hasSupportAccess &&
                  authState.userId &&
                  (activeTicket.user_id === authState.userId ||
                    activeTicket.user?.id === authState.userId) ? (
                  <div className="flex-shrink-0 border-t border-neutral-800 bg-neutral-900/50 p-3">
                    <div className="py-2 text-center">
                      <p className="text-sm text-neutral-400">
                        Вы не можете отправлять сообщения в свои старые тикеты.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Для активных тикетов проверяем привязку, для архивных - не проверяем */}
                    {activeTicket.assigned_to && activeTicket.assigned_to !== authState.userId ? (
                      <div className="flex-shrink-0 border-t border-neutral-800 bg-neutral-900/50 p-3">
                        <div className="py-2 text-center">
                          <p className="text-sm text-neutral-400">
                            Тикет занят другим специалистом поддержки
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-shrink-0 border-t border-neutral-800 bg-neutral-900/50 p-3">
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                              }
                            }}
                            placeholder="Введите сообщение..."
                            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none sm:text-base"
                          />
                          <button
                            onClick={handleSendMessage}
                            disabled={!messageText.trim()}
                            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-neutral-700 sm:text-base"
                          >
                            Отправить
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-neutral-400">Выберите тикет из списка</p>
            </div>
          )}

          {/* Правая панель с кнопками управления - третья колонка на ПК (всегда видна) */}
          {isLargeScreen ? (
            <div
              className={`flex-shrink-0 border-l border-neutral-800 bg-neutral-900 transition-all duration-300 ${
                rightPanelCollapsed ? 'w-12' : 'w-64'
              } flex flex-col ${rightPanelCollapsed ? 'items-center' : ''}`}
            >
              {rightPanelCollapsed ? (
                <button
                  onClick={() => setRightPanelCollapsed(false)}
                  className="p-3 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                  title="Развернуть панель"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ) : (
                <>
                  {!activeTicket && !rightPanelCollapsed && (
                    <div className="flex items-center justify-between border-b border-neutral-800 p-4">
                      <button
                        onClick={() => setRightPanelCollapsed(true)}
                        className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                        title="Свернуть панель"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                  {activeTicket && (
                    <div className="flex items-center justify-between border-b border-neutral-800 p-4">
                      <span className="text-sm font-medium text-white">Управление</span>
                      <button
                        onClick={() => setRightPanelCollapsed(true)}
                        className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                        title="Свернуть панель"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                    {activeTicket ? (
                      <>
                        {(activeTicket.status === 'open' || activeTicket.status === 'pending') && (
                          <>
                            <button
                              onClick={() => {
                                if (authState.userId) {
                                  handleAssignTicket(activeTicket.id, authState.userId);
                                }
                              }}
                              className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                                activeTicket.assigned_to === authState.userId
                                  ? 'bg-orange-600 hover:bg-orange-700'
                                  : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                            >
                              {activeTicket.assigned_to === authState.userId
                                ? 'Отвязать тикет'
                                : 'Взять тикет'}
                            </button>
                            <button
                              onClick={() => {
                                // Динамическая проверка перед закрытием
                                if (activeTicket.status !== 'pending') {
                                  showNotification(
                                    'Тикет должен быть в статусе "В работе" для закрытия',
                                    'error',
                                  );
                                  return;
                                }
                                if (activeTicket.assigned_to !== authState.userId) {
                                  showNotification(
                                    'Тикет должен быть назначен вам для закрытия',
                                    'error',
                                  );
                                  return;
                                }
                                handleCloseTicket(activeTicket.id);
                              }}
                              disabled={
                                activeTicket.assigned_to !== authState.userId ||
                                activeTicket.status !== 'pending'
                              }
                              className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                                activeTicket.assigned_to !== authState.userId ||
                                activeTicket.status !== 'pending'
                                  ? 'bg-neutral-700 opacity-50'
                                  : 'bg-red-600 hover:bg-red-700'
                              }`}
                            >
                              Закрыть тикет
                            </button>
                          </>
                        )}
                        {/* Селект статуса доступен только для активных тикетов */}
                        {(activeTicket.status === 'open' || activeTicket.status === 'pending') && (
                          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800">
                            <div className="border-b border-neutral-700 px-3 py-2">
                              <span className="text-xs text-neutral-400">Укажите статус:</span>
                            </div>
                            <select
                              value={activeTicket.status}
                              onChange={(e) => {
                                handleUpdateTicketStatus(activeTicket.id, e.target.value);
                              }}
                              className="w-full border-0 bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
                            >
                              <option value="open" className="bg-neutral-800 text-white">
                                Открыт
                              </option>
                              <option value="pending" className="bg-neutral-800 text-white">
                                В работе
                              </option>
                              <option value="closed" className="bg-neutral-800 text-white">
                                Закрыт
                              </option>
                            </select>
                          </div>
                        )}
                        {/* Для архивных тикетов показываем только информацию о статусе */}
                        {activeTicket.status === 'closed' && (
                          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800">
                            <div className="border-b border-neutral-700 px-3 py-2">
                              <span className="text-xs text-neutral-400">Статус:</span>
                            </div>
                            <div className="px-3 py-2 text-sm text-white">Закрыт</div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {messagesLoading ? (
                          <>
                            {/* Скелетон лоадеры для кнопок */}
                            <div className="space-y-3">
                              <div className="skeleton-shimmer h-10 rounded-lg bg-neutral-800"></div>
                              <div className="skeleton-shimmer h-10 rounded-lg bg-neutral-800"></div>
                            </div>
                            {/* Скелетон лоадер для карточки выпадающего меню */}
                            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800">
                              <div className="border-b border-neutral-700 px-3 py-2">
                                <div className="skeleton-shimmer h-4 w-24 rounded bg-neutral-700"></div>
                              </div>
                              <div className="px-3 py-2">
                                <div className="skeleton-shimmer h-8 rounded bg-neutral-700"></div>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {showRateLimitCaptcha && (
        <RateLimitCaptcha
          isOpen={showRateLimitCaptcha}
          onSuccess={handleRateLimitSuccess}
          onClose={() => {
            isCaptchaOpenRef.current = false;
            setShowRateLimitCaptcha(false);
            rateLimitRetryRef.current = null;
          }}
        />
      )}

      {/* Модальное окно для указания причины закрытия тикета */}
      {showCloseReasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Закрыть тикет</h3>
            <label htmlFor="close-reason" className="mb-4 block text-sm text-neutral-400">
              Укажите причину закрытия тикета:
            </label>
            <textarea
              id="close-reason"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              placeholder="Введите причину закрытия..."
              rows={4}
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleConfirmCloseTicket}
                disabled={!closeReason.trim()}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:bg-neutral-700 disabled:text-neutral-500"
              >
                Закрыть
              </button>
              <button
                onClick={() => {
                  setShowCloseReasonModal(false);
                  setCloseReason('');
                  setTicketToClose(null);
                }}
                className="flex-1 rounded-lg bg-neutral-700 px-4 py-2 font-medium text-white transition-colors hover:bg-neutral-600"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ImageViewer для просмотра изображений */}
      {viewingImage && (
        <ImageViewer
          isOpen={!!viewingImage}
          onClose={() => setViewingImage(null)}
          imageUrl={viewingImage.url}
          alt={viewingImage.alt}
        />
      )}
    </div>
  );
}
