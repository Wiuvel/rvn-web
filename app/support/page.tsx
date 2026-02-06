'use client';

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { gsap } from 'gsap';
import { MESSAGE_MAX_LENGTH, TICKET_SUBJECT_MAX_LENGTH, MAX_TICKETS_PER_USER, MESSAGE_TIMEOUT, AUTH_FETCH_TIMEOUT, GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE, MARK_AS_READ_DEBOUNCE } from '@/lib/utils/constants';
import { getLastMessageLabelForAttachments, normalizeLastMessageDisplayText } from '@/lib/utils/support-messages';
import { translateError } from '@/lib/utils/error-translations';
import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import { useWebSocket } from '@/hooks/useWebSocket';
import { debugPerformanceAsync, debugStart, debugEnd, debugError } from '@/lib/utils/debug';
import TicketSkeleton from '@/components/ui/TicketSkeleton';
import FileUploadModal from '@/components/support/FileUploadModal';
import MessageInput from '@/components/support/MessageInput';
import ChatHeader from '@/components/support/ChatHeader';
import MessageItem from '@/components/support/MessageItem';
import TicketListItem from '@/components/support/TicketListItem';
import CreateTicketForm from '@/components/support/CreateTicketForm';
import { X, AlertCircle, PanelLeftClose, PanelLeft, Plus } from 'lucide-react';
import ImageViewer from '@/components/support/ImageViewer';
import { UserMenu } from '@/components/navigation/UserMenu';
import { UserData } from '@/types';
import type { Message, Ticket, MessageAttachment, UploadedFile } from '@/components/support/types';

// Lazy load RateLimitCaptcha для оптимизации bundle size
// Убираем loading state, чтобы избежать показа модального окна при загрузке страницы
const RateLimitCaptcha = dynamic(() => import('@/components/auth/RateLimitCaptcha'), {
  ssr: false
});

export default function SupportPage() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSupport, setIsSupport] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [showCreateTicketModal, setShowCreateTicketModal] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState(''); // Отдельное состояние для сообщения нового тикета
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [skeletonCount, setSkeletonCount] = useState<number | null>(() => {
    // Загружаем из localStorage или используем 3 по умолчанию
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('support_tickets_count');
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
  const [lastMessageTime, setLastMessageTime] = useState<number | null>(null);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(0);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false); // Флаг для блокировки кнопки создания тикета
  const [isSendingMessage, setIsSendingMessage] = useState(false); // Флаг для блокировки повторной отправки сообщений
  const [messagesSentCount, setMessagesSentCount] = useState<number>(0);
  const [notification, setNotification] = useState<{ message: string; show: boolean; type?: 'error' | 'info' }>({ message: '', show: false, type: 'error' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [loadedMessageCount, setLoadedMessageCount] = useState(0);
  const scrollPositionRef = useRef<number | null>(null);
  const isRestoringScrollRef = useRef(false);
  const router = useRouter();

  // Подсчет активных тикетов (только open и pending)
  const activeTicketsCount = tickets.filter(t => t.status === 'open' || t.status === 'pending').length;

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('support_sidebar_collapsed', String(next));
      return next;
    });
  }, []);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null); // Для формы создания нового тикета
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const newTicketFormRef = useRef<HTMLDivElement>(null); // Ref для формы создания тикета (для анимаций)
  const chatAreaRef = useRef<HTMLDivElement>(null); // Ref для области чата (для анимаций)
  const fetchingTicketIdRef = useRef<string | null>(null);
  const loadedMessagesRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef<boolean>(false);
  const activeTicketMessagesRef = useRef<Message[]>([]); // Ref для актуальных сообщений активного тикета
  const activeTicketRef = useRef<Ticket | null>(null); // Ref для актуального activeTicket в обработчиках WebSocket (избегаем переподписок при каждом обновлении сообщений)
  activeTicketRef.current = activeTicket;
  const [showRateLimitCaptcha, setShowRateLimitCaptcha] = useState(false);
  const isCaptchaOpenRef = useRef(false);
  const [ticketsListVisible, setTicketsListVisible] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('support_sidebar_collapsed') === 'true';
  });
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // Убрали лишнее состояние uploadingFiles, так как оно больше не нужно для оптимистичного UI в чате
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [filePreviews, setFilePreviews] = useState<Map<string, string>>(new Map());
  const [fileErrors, setFileErrors] = useState<Set<string>>(new Set());
  const [viewingImage, setViewingImage] = useState<{ url: string; alt: string } | null>(null);

  // Загружаем превью для изображений после загрузки файлов
  useEffect(() => {
    uploadedFiles.forEach((file) => {
      if (file.fileType.startsWith('image/') && !filePreviews.has(file.storageUrl) && !fileErrors.has(file.storageUrl)) {
        // Превью уже есть в storageUrl, просто добавляем в Map
        setFilePreviews(prev => new Map(prev).set(file.storageUrl, file.storageUrl));
      }
    });
  }, [uploadedFiles]);
  // Очередь запросов вместо одного callback - исправляет race condition
  const pendingRequestsQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingCaptchaRef = useRef(false); // Флаг обработки капчи - предотвращает повторные открытия
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Лимиты символов (используем константы из lib/constants.ts)

  // Функции кэширования сообщений
  const CACHE_PREFIX = 'support_messages_';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

  const getCacheKey = (ticketId: string) => `${CACHE_PREFIX}${ticketId}`;

  const saveMessagesToCache = useCallback((ticketId: string, messages: Message[]) => {
    if (typeof window === 'undefined') return;

    try {
      const cacheData = {
        messages,
        timestamp: Date.now()
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

      // Преобразуем timestamp строки обратно в Date объекты и проверяем вложения
      const messages = (cacheData.messages || []).map((msg: any) => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date
          ? msg.timestamp
          : new Date(msg.timestamp),
        // Убеждаемся, что вложения правильно обработаны
        attachments: msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0
          ? msg.attachments.map((att: any) => ({
            id: att.id,
            file_name: att.file_name,
            file_type: att.file_type,
            file_size: att.file_size,
            storage_path: att.storage_path,
            storage_url: att.storage_url || (att.storage_path
              ? `/support/files/${encodeURIComponent(att.storage_path)}`
              : ''),
            blur_hash: att.blur_hash,
            width: att.width,
            height: att.height
          }))
          : undefined
      }));

      return messages;
    } catch (error) {
      // Игнорируем ошибки парсинга
      localStorage.removeItem(getCacheKey(ticketId));
      return null;
    }
  }, []);

  // Обертка для fetch с обработкой rate limit
  const fetchWithRateLimit = async (
    url: string,
    options: RequestInit = {},
    retryCallback?: () => Promise<void>
  ): Promise<Response> => {
    const response = await fetch(url, options);

    if (response.status === 429) {
      // Добавляем callback в очередь вместо перезаписи - исправляет race condition
      if (retryCallback) {
        pendingRequestsQueueRef.current.push(retryCallback);
      }

      // Открываем модальное окно только если:
      // 1. Оно еще не открыто
      // 2. Капча не обрабатывается (предотвращает повторные открытия)
      if (!isCaptchaOpenRef.current && !isProcessingCaptchaRef.current) {
        isCaptchaOpenRef.current = true;
        setShowRateLimitCaptcha(true);
      }
      throw new Error('RATE_LIMIT_EXCEEDED');
    }

    return response;
  };

  const handleRateLimitSuccess = async () => {
    // Устанавливаем флаг обработки капчи - предотвращает повторные открытия
    isProcessingCaptchaRef.current = true;

    // Закрываем модальное окно
    isCaptchaOpenRef.current = false;
    setShowRateLimitCaptcha(false);

    // Увеличиваем задержку для гарантированного применения иммунитета на сервере
    // Cookie устанавливается сразу, но store может обновиться с небольшой задержкой
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Обрабатываем ВСЕ запросы из очереди последовательно
    const queue = [...pendingRequestsQueueRef.current];
    pendingRequestsQueueRef.current = []; // Очищаем очередь сразу

    for (const requestCallback of queue) {
      try {
        await requestCallback();
      } catch (error) {
        // Если запрос снова получил rate limit после иммунитета - это критическая ошибка
        // НЕ добавляем обратно в очередь и НЕ показываем капчу снова
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          // Rate limit все еще активен - не логируем
        } else {
          // Ошибка при повторном запросе - не логируем
        }
      }
    }

    // Сбрасываем флаг обработки только после обработки всех запросов
    isProcessingCaptchaRef.current = false;
  };

  // Функция для показа notification
  const showNotification = (message: string, type: 'error' | 'info' = 'error') => {
    setNotification({ message, show: true, type });
    setTimeout(() => {
      // Анимация исчезновения
      if (notificationRef.current) {
        gsap.to(notificationRef.current, {
          opacity: 0,
          y: -10,
          scale: 0.95,
          duration: GSAP_DEFAULT_DURATION * 0.6,
          ease: "power2.in",
          onComplete: () => {
            setNotification({ message: '', show: false });
          }
        });
      } else {
        setNotification({ message: '', show: false });
      }
    }, 3000);
  };

  // Анимация появления уведомления
  useEffect(() => {
    if (notification.show && notificationRef.current) {
      gsap.fromTo(notificationRef.current,
        { opacity: 0, y: 20, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: GSAP_DEFAULT_DURATION,
          ease: GSAP_DEFAULT_EASE
        }
      );
    }
  }, [notification.show]);

  // Закрытие модального окна создания тикета по Escape
  useEffect(() => {
    if (!showCreateTicketModal) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCreateTicketModal(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showCreateTicketModal]);

  // Функция для анимации тряски с GSAP
  const triggerShake = (inputType: 'message' | 'subject') => {
    if (typeof window === 'undefined') return;

    const inputElement = inputType === 'message'
      ? (messageTextareaRef.current || messageInputRef.current)
      : subjectInputRef.current;
    if (!inputElement) return;

    const tl = gsap.timeline();
    tl.to(inputElement, { x: -3, duration: 0.05, ease: "power2.out" })
      .to(inputElement, { x: 3, duration: 0.05, ease: "power2.out" })
      .to(inputElement, { x: -2, duration: 0.05, ease: "power2.out" })
      .to(inputElement, { x: 2, duration: 0.05, ease: "power2.out" })
      .to(inputElement, { x: -1, duration: 0.05, ease: "power2.out" })
      .to(inputElement, { x: 1, duration: 0.05, ease: "power2.out" })
      .to(inputElement, { x: 0, duration: 0.05, ease: "power2.out" });
  };

  // Проверка авторизации
  useEffect(() => {
    let isMounted = true;
    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchUserData = async () => {
      try {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller!.abort(), AUTH_FETCH_TIMEOUT);

        try {
          const response = await fetch('/api/auth/me', {
            signal: controller.signal
          });

          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!isMounted) return;

          if (response.ok) {
            const data = await response.json();
            // Проверяем, что пользователь авторизован
            if (data.authenticated === false || !data.user_id) {
              setUserData(null);
              setIsSupport(false);
            } else {
              setUserData(data);

              // Инициализируем CSRF токен при загрузке пользователя
              // Это обеспечит автоматическое обновление токена
              if (typeof window !== 'undefined') {
                import('@/lib/utils/csrf-client').then(({ getCSRFToken }) => {
                  getCSRFToken().catch(() => {
                    // Игнорируем ошибки при инициализации - токен будет получен при первой отправке
                  });
                });
              }
              // Проверяем, является ли пользователь саппортом (данные приходят из API)
              setIsSupport(data.isSupport === true);
            }
          } else {
            setUserData(null);
          }
        } catch (fetchError: unknown) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!isMounted) return;

          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            router.push('/error/500');
            return;
          }
          setUserData(null);
        }
      } catch (error) {
        if (!isMounted) return;
        // Ошибка получения данных пользователя
        console.error('Failed to fetch user data:', error);
        setUserData(null);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUserData();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (controller) {
        controller.abort();
      }
    };
  }, [router]);

  // Инициализация WebSocket
  // ВАЖНО: Токен передается только после загрузки userData для предотвращения преждевременных подключений
  // Токен хранится только в памяти компонента, не в localStorage/sessionStorage для безопасности
  const { socket, isConnected: isWebSocketConnected, joinTicket, leaveTicket } = useWebSocket({
    enabled: !!userData && !!userData.token,
    userId: userData?.id,
    ticketId: activeTicket?.id,
    isSupport: false,
    token: userData?.token, // Передаем токен для аутентификации WebSocket
  });

  // Отметка сообщений как прочитанных с улучшенным debounce
  // Используем useCallback для мемоизации функции и предотвращения лишних пересозданий
  const markMessagesAsRead = useCallback(async (ticketId: string) => {
    // Очищаем предыдущий таймер, если он существует
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
      markReadTimeoutRef.current = null;
    }

    // Устанавливаем новый таймер с debounce
    markReadTimeoutRef.current = setTimeout(async () => {
      // Очищаем ref после выполнения
      markReadTimeoutRef.current = null;

      try {
        await fetchWithRateLimit(
          `/api/support/tickets/${ticketId}/messages/read`,
          {
            method: 'POST',
            credentials: 'include'
          },
          () => markMessagesAsRead(ticketId) // Retry callback
        );
      } catch (error) {
        // Не логируем RATE_LIMIT_EXCEEDED, так как это обрабатывается через капчу
        if (error instanceof Error && error.message !== 'RATE_LIMIT_EXCEEDED') {
          // Ошибка отметки сообщений - не логируем
        }
      }
    }, MARK_AS_READ_DEBOUNCE);
  }, []); // Пустой массив зависимостей, так как функция не зависит от состояния

  // Загрузка тикетов при монтировании
  useEffect(() => {
    if (userData) {
      fetchTickets();
    }

    // Очистка таймера при размонтировании
    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // WebSocket: присоединение/отсоединение от тикета теперь обрабатывается автоматически в useWebSocket
  // Очищаем ref при изменении активного тикета
  useEffect(() => {
    if (!activeTicket) {
      activeTicketMessagesRef.current = [];
    }
  }, [activeTicket]);

  // WebSocket: обработка новых сообщений
  useEffect(() => {
    if (!socket || !activeTicket) return;

    // Обработчик новых сообщений через WebSocket (оптимизировано)
    const handleNewMessage = (data: {
      ticketId: string;
      message: {
        id: string;
        message_text: string;
        sender_type: 'user' | 'support';
        created_at: string;
        is_read: boolean;
        sender?: {
          id: string;
          username: string;
          user_id: string;
        };
        attachments?: Array<{
          id: string;
          file_name: string;
          file_type: string;
          file_size: number;
          storage_path: string;
          storage_url?: string;
        }>;
      };
    }) => {
      if (data.ticketId !== activeTicketRef.current?.id) return;

      // Проверяем, что сообщение уже существует (optimistic UI)
      const existingMessage = activeTicketMessagesRef.current.find(m => m.id === data.message.id);
      
      // Если сообщение уже существует (optimistic), обновляем его (убираем isPending)
      if (existingMessage) {
        startTransition(() => {
          setActiveTicket(prev => {
            if (!prev || prev.id !== data.ticketId) return prev;
            
            const updatedMessages = prev.messages.map(m => 
              m.id === data.message.id 
                ? { 
                    ...m, 
                    isPending: false, 
                    isRead: data.message.is_read,
                    // Обновляем вложения с серверными данными (включая blur_hash, width, height)
                    attachments: data.message.attachments && data.message.attachments.length > 0
                      ? data.message.attachments.map((att: any) => ({
                          id: att.id,
                          file_name: att.file_name,
                          file_type: att.file_type,
                          file_size: att.file_size,
                          storage_path: att.storage_path,
                          storage_url: att.storage_url || (att.storage_path
                            ? `/support/files/${encodeURIComponent(att.storage_path)}`
                            : ''),
                          blur_hash: att.blur_hash,
                          width: att.width,
                          height: att.height
                        }))
                      : m.attachments
                  } 
                : m
            );
            
            activeTicketMessagesRef.current = updatedMessages;
            saveMessagesToCache(data.ticketId, updatedMessages);
            
            return { ...prev, messages: updatedMessages };
          });
        });
        return;
      }

      // Оптимизация: объединяем обновления состояния в один переход
      const newMessage: Message = {
        id: data.message.id,
        text: data.message.message_text,
        sender: data.message.sender_type,
        timestamp: new Date(data.message.created_at),
        isRead: data.message.is_read,
        senderData: data.message.sender,
        // Вложения с полными метаданными (включая blur_hash, width, height)
        attachments: data.message.attachments && Array.isArray(data.message.attachments) && data.message.attachments.length > 0
          ? data.message.attachments.map((att: any) => ({
            id: att.id,
            file_name: att.file_name,
            file_type: att.file_type,
            file_size: att.file_size,
            storage_path: att.storage_path,
            storage_url: att.storage_url || (att.storage_path
              ? `/support/files/${encodeURIComponent(att.storage_path)}`
              : ''),
            blur_hash: att.blur_hash,
            width: att.width,
            height: att.height
          }))
          : undefined,
      };

      const attachments = data.message.attachments || [];
      let lastMessageText = data.message.message_text || '';
      if (!lastMessageText && attachments.length > 0) {
        lastMessageText = getLastMessageLabelForAttachments(attachments);
      } else if (lastMessageText) {
        lastMessageText = normalizeLastMessageDisplayText(lastMessageText);
      }

      const lastMessageData = {
        id: data.message.id,
        message_text: lastMessageText,
        sender_type: data.message.sender_type,
        created_at: data.message.created_at,
        is_read: data.message.is_read,
        attachments: attachments.length > 0 ? attachments : undefined
      };

      // Используем startTransition для неблокирующих обновлений
      startTransition(() => {
        // Добавляем новое сообщение
        setActiveTicket(prev => {
          if (!prev || prev.id !== data.ticketId) return prev;

          const updatedMessages = [...(prev.messages || []), newMessage];
          activeTicketMessagesRef.current = updatedMessages; // Обновляем ref сразу

          // Кэшируем обновленные сообщения
          saveMessagesToCache(data.ticketId, updatedMessages);

          return {
            ...prev,
            messages: updatedMessages,
          };
        });

        // Обновляем last_message в списке тикетов
        setTickets(prev => prev.map(t =>
          t.id === data.ticketId
            ? {
              ...t,
              last_message: lastMessageData
            }
            : t
        ));
      });

      // Отмечаем сообщение как прочитанное
      markMessagesAsRead(data.ticketId);
    };

    const handleTicketUpdate = (data: {
      ticketId: string;
      ticket: {
        status: 'open' | 'closed' | 'pending';
        updated_at?: string;
      };
    }) => {
      if (data.ticketId !== activeTicketRef.current?.id) {
        // Обновляем тикет в списке даже если он не активный
        setTickets(prev => prev.map(t =>
          t.id === data.ticketId
            ? { ...t, status: data.ticket.status, updated_at: data.ticket.updated_at || t.updated_at }
            : t
        ));
        return;
      }

      // Обновляем активный тикет
      setActiveTicket(prev => {
        if (!prev || prev.id !== data.ticketId) return prev;
        return {
          ...prev,
          status: data.ticket.status,
        };
      });

      // Обновляем тикет в списке
      setTickets(prev => prev.map(t =>
        t.id === data.ticketId
          ? { ...t, status: data.ticket.status, updated_at: data.ticket.updated_at }
          : t
      ));
    };

    const handleMessageRead = (data: {
      ticketId: string;
      messageIds: string[];
      readBy: 'user' | 'support';
    }) => {
      if (data.ticketId !== activeTicketRef.current?.id) return;

      // Обновляем статус прочитанности сообщений
      setActiveTicket(prev => {
        if (!prev || prev.id !== data.ticketId) return prev;
        const messageIds = data.messageIds || [];
        return {
          ...prev,
          messages: (prev.messages || []).map(msg =>
            messageIds.includes(msg.id)
              ? { ...msg, isRead: true }
              : msg
          ),
        };
      });
    };

    socket.on('support:message:new', handleNewMessage);
    socket.on('support:ticket:updated', handleTicketUpdate);
    socket.on('support:message:read', handleMessageRead);

    return () => {
      socket.off('support:message:new', handleNewMessage);
      socket.off('support:ticket:updated', handleTicketUpdate);
      socket.off('support:message:read', handleMessageRead);
    };
  }, [socket, activeTicket?.id, markMessagesAsRead]);

  // Анимация появления/исчезновения формы создания тикета
  useEffect(() => {
    if (typeof window === 'undefined' || !newTicketFormRef.current) return;

    if (showNewTicketForm) {
      // Анимация появления
      gsap.fromTo(newTicketFormRef.current,
        { opacity: 0, y: -10, height: 0, marginBottom: 0 },
        {
          opacity: 1,
          y: 0,
          height: 'auto',
          marginBottom: '1rem',
          duration: 0.3,
          ease: "power2.out"
        }
      );
    } else {
      // Анимация исчезновения
      gsap.to(newTicketFormRef.current, {
        opacity: 0,
        y: -10,
        height: 0,
        marginBottom: 0,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => {
          // Очищаем поля после анимации
          setNewTicketSubject('');
          setNewTicketMessage('');
        }
      });
    }
  }, [showNewTicketForm]);

  // Анимация перехода между чатами
  // Убрали GSAP анимацию для плавной смены тикетов без дерганий

  // Загрузка сообщений при выборе тикета
  useEffect(() => {
    if (!activeTicket || !activeTicket.id) {
      fetchingTicketIdRef.current = null;
      return;
    }

    // Загружаем сообщения только если тикет действительно изменился
    // Проверяем, что сообщения еще не загружены или тикет новый
    const shouldFetch = !activeTicket.messages || activeTicket.messages.length === 0;

    // Предотвращаем дублирующиеся запросы
    if (shouldFetch && fetchingTicketIdRef.current !== activeTicket.id) {
      fetchingTicketIdRef.current = activeTicket.id;
      // Очищаем загруженные сообщения при смене тикета
      loadedMessagesRef.current.clear();
      initialLoadRef.current = true;
      setLoadedMessageCount(0);
      setHasMoreMessages(false);
      // Загружаем сообщения с восстановлением позиции скролла
      fetchTicketMessages(activeTicket.id, 25, 0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id]);

  // Умное обновление сообщений: polling только как fallback когда WebSocket недоступен
  // ОПТИМИЗАЦИЯ: Отключаем polling при активном WebSocket для снижения нагрузки
  useEffect(() => {
    if (!activeTicket || !userData) return;

    let interval: NodeJS.Timeout | null = null;
    let lastMessageCount = activeTicket.messages?.length || 0;
    // Хэш последних сообщений для оптимизации проверки изменений
    let lastMessagesHash = '';

    // Простая функция хэширования для сравнения сообщений
    const hashMessages = (messages: Array<{ id: string; created_at: string }>): string => {
      return messages.map(m => `${m.id}-${m.created_at}`).join('|');
    };

    const checkForNewMessages = async () => {
      // Проверяем только если страница видима
      if (document.hidden) return;

      // ОПТИМИЗАЦИЯ: Если WebSocket подключен, не делаем polling
      // WebSocket обеспечивает мгновенное обновление с нулевой латентностью
      if (isWebSocketConnected && socket?.connected) {
        return;
      }

      try {
        const response = await fetchWithRateLimit(
          `/api/support/tickets/${activeTicket.id}`,
          {
            credentials: 'include'
          },
          async () => {
            // Retry callback для обновления сообщений
            if (activeTicket) {
              await fetchTicketMessages(activeTicket.id, 25, 0, false);
            }
          }
        );
        const data = await response.json();

        if (response.ok && data.ticket && data.messages) {
          const currentMessageCount = data.messages.length;
          const currentMessagesHash = hashMessages(data.messages);

          // Обновляем статус тикета (может измениться в панели поддержки)
          const statusChanged = activeTicket.status !== data.ticket.status;

          // Проверяем переход между активными и архивными статусами
          const wasActive = activeTicket.status === 'open' || activeTicket.status === 'pending';
          const isNowActive = data.ticket.status === 'open' || data.ticket.status === 'pending';
          const statusCategoryChanged = wasActive !== isNowActive;

          // Обновляем только если появились новые сообщения, изменился статус или хэш сообщений
          if (currentMessageCount > lastMessageCount || statusChanged || currentMessagesHash !== lastMessagesHash) {
            const mappedMessages = data.messages.map((m: {
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
                storage_url: string;
                blur_hash?: string;
                width?: number;
                height?: number;
              }>;
            }) => ({
              id: m.id,
              text: m.message_text,
              sender: m.sender_type,
              timestamp: new Date(m.created_at),
              isRead: m.is_read,
              senderData: m.sender ? {
                id: m.sender.id,
                username: m.sender.username,
                user_id: m.sender.user_id,
                avatar: m.sender.avatar || null
              } : undefined,
              attachments: m.attachments || []
            }));

            // Отмечаем новые сообщения (которые еще не были загружены)
            mappedMessages.forEach((m: { id: string }) => {
              if (!loadedMessagesRef.current.has(m.id)) {
                loadedMessagesRef.current.add(m.id);
              }
            });

            setActiveTicket({
              ...activeTicket,
              status: data.ticket.status, // Обновляем статус
              messages: mappedMessages
            });
            lastMessageCount = currentMessageCount;
            lastMessagesHash = currentMessagesHash;

            // Обновляем список тикетов при изменении статуса (особенно при переходе между активными и архивными)
            if (statusChanged || statusCategoryChanged) {
              // Немедленное обновление списка тикетов
              fetchTickets();
            }

            // Отмечаем сообщения как прочитанные
            markMessagesAsRead(activeTicket.id);
          }
        }
      } catch (error) {
        // Ошибка проверки новых сообщений
        console.error('Error checking for new messages:', error);
      }
    };

    // Инициализируем хэш при первом запуске
    if (activeTicket.messages && activeTicket.messages.length > 0) {
      lastMessagesHash = hashMessages(activeTicket.messages.map(m => ({
        id: m.id,
        created_at: m.timestamp.toISOString()
      })));
    }

    // ОПТИМИЗАЦИЯ: Polling только как fallback когда WebSocket недоступен
    // Используем увеличенный интервал (30 секунд) для снижения нагрузки
    // WebSocket обеспечивает мгновенные обновления, polling нужен только для резерва
    if (!isWebSocketConnected || !socket?.connected) {
      interval = setInterval(checkForNewMessages, 30000); // 30 секунд вместо 5
    }

    // Отмечаем сообщения как прочитанные при открытии тикета
    markMessagesAsRead(activeTicket.id);

    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id, userData, activeTicket?.status, isWebSocketConnected, socket?.connected]);

  // Очистка таймера при размонтировании компонента
  useEffect(() => {
    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = null;
      }
    };
  }, []);


  // Автопрокрутка к последнему сообщению только для новых сообщений (не при первой загрузке)
  useEffect(() => {
    if (!activeTicket?.messages || activeTicket.messages.length === 0 || isRestoringScrollRef.current) return;

    // Проверяем, есть ли сохраненная позиция скролла
    if (typeof window !== 'undefined' && activeTicket.id) {
      const savedPosition = localStorage.getItem(`support_scroll_${activeTicket.id}`);
      // Если есть сохраненная позиция и это не 'bottom', не скроллим автоматически
      if (savedPosition && savedPosition !== 'bottom') {
        return;
      }
    }

    // Скроллим вниз только если это новое сообщение (последнее сообщение не было загружено ранее)
    const lastMessage = activeTicket.messages[activeTicket.messages.length - 1];
    if (lastMessage && !loadedMessagesRef.current.has(lastMessage.id)) {
      // Ждем загрузки всех изображений перед скроллом
      const scrollToBottom = () => {
        if (messagesEndRef.current && !isRestoringScrollRef.current) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (messagesEndRef.current && !isRestoringScrollRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }, 100);
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

      const timeout = setTimeout(scrollToBottom, 2000);

      return () => {
        clearTimeout(timeout);
        images.forEach((img) => {
          img.removeEventListener('load', checkAllLoaded);
          img.removeEventListener('error', checkAllLoaded);
        });
      };
    }
  }, [activeTicket?.messages, activeTicket?.id]);

  // Сохранение позиции скролла
  const saveScrollPosition = useCallback((ticketId: string) => {
    if (!messagesContainerRef.current || isRestoringScrollRef.current) return;

    const scrollTop = messagesContainerRef.current.scrollTop;
    const scrollHeight = messagesContainerRef.current.scrollHeight;
    const clientHeight = messagesContainerRef.current.clientHeight;

    // Сохраняем только если не в самом низу (с небольшим допуском)
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (typeof window !== 'undefined') {
      if (isAtBottom) {
        // Если внизу, сохраняем специальный маркер
        localStorage.setItem(`support_scroll_${ticketId}`, 'bottom');
      } else {
        // Сохраняем позицию скролла
        localStorage.setItem(`support_scroll_${ticketId}`, scrollTop.toString());
      }
    }
  }, []);

  // Восстановление позиции скролла
  const restoreScrollPosition = useCallback((ticketId: string) => {
    if (!messagesContainerRef.current || typeof window === 'undefined') return;

    const savedPosition = localStorage.getItem(`support_scroll_${ticketId}`);

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

    // Ждем загрузки всех изображений перед восстановлением позиции
    const images = messagesContainerRef.current.querySelectorAll('img[src*="/api/support/files/"]');
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

  // Сохранение позиции скролла при прокрутке
  useEffect(() => {
    if (!messagesContainerRef.current || !activeTicket?.id) return;

    const container = messagesContainerRef.current;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (isRestoringScrollRef.current) return;

      // Debounce сохранения позиции
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        saveScrollPosition(activeTicket.id);
      }, 300);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [activeTicket?.id, saveScrollPosition]);

  // Загрузка старых сообщений при прокрутке вверх (activeTicket?.id в deps — объект activeTicket не в deps, чтобы избежать пересоздания callback при каждом обновлении сообщений)
  const loadOlderMessages = useCallback(async () => {
    const ticket = activeTicketRef.current;
    if (!ticket || isLoadingOlderMessages || !hasMoreMessages) return;

    return debugPerformanceAsync('loadOlderMessages', async () => {
      setIsLoadingOlderMessages(true);
      debugStart('loadOlderMessages', { ticketId: ticket.id, offset: loadedMessageCount });

      try {
        const currentScrollTop = messagesContainerRef.current?.scrollTop || 0;
        const currentScrollHeight = messagesContainerRef.current?.scrollHeight || 0;

        await fetchTicketMessages(ticket.id, 25, loadedMessageCount, false);

        // Восстанавливаем позицию скролла после добавления старых сообщений
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            const newScrollHeight = messagesContainerRef.current.scrollHeight;
            const scrollDiff = newScrollHeight - currentScrollHeight;
            messagesContainerRef.current.scrollTop = currentScrollTop + scrollDiff;
            debugEnd('loadOlderMessages', { scrollDiff, newHeight: newScrollHeight });
          }
        });
      } catch (error) {
        debugError('loadOlderMessages', { ticketId: ticket.id, error });
      } finally {
        setIsLoadingOlderMessages(false);
      }
    });
  }, [activeTicket?.id, isLoadingOlderMessages, hasMoreMessages, loadedMessageCount]);

  // Intersection Observer для загрузки старых сообщений при прокрутке вверх
  useEffect(() => {
    if (!messagesTopRef.current || !activeTicket?.id || !hasMoreMessages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoadingOlderMessages && hasMoreMessages) {
            loadOlderMessages();
          }
        });
      },
      { rootMargin: '100px' } // Начинаем загрузку за 100px до появления индикатора
    );

    observer.observe(messagesTopRef.current);

    return () => observer.disconnect();
  }, [activeTicket?.id, hasMoreMessages, isLoadingOlderMessages, loadOlderMessages]);

  // Таймер тайм-аута между сообщениями
  useEffect(() => {
    if (lastMessageTime === null || timeoutSeconds <= 0) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastMessageTime) / 1000);
      const remaining = MESSAGE_TIMEOUT / 1000 - elapsed;

      if (remaining <= 0) {
        setTimeoutSeconds(0);
        setLastMessageTime(null);
        setMessagesSentCount(0); // Сбрасываем счетчик после таймаута
      } else {
        setTimeoutSeconds(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastMessageTime, timeoutSeconds]);

  const handleCreateTicket = async () => {
    // Блокируем повторное создание тикета
    if (isCreatingTicket) return;

    if (!newTicketSubject.trim()) return;

    // Если есть текст сообщения, создаем тикет с первым сообщением
    if (!newTicketMessage.trim()) {
      showNotification('Введите сообщение для обращения');
      return;
    }

    // Проверка лимита символов
    if (newTicketSubject.length > TICKET_SUBJECT_MAX_LENGTH) {
      showNotification(`Максимальная длина темы: ${TICKET_SUBJECT_MAX_LENGTH} символов`);
      triggerShake('subject');
      return;
    }

    if (newTicketMessage.length > MESSAGE_MAX_LENGTH) {
      showNotification(`Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`);
      triggerShake('message');
      return;
    }

    // Устанавливаем флаг создания тикета
    setIsCreatingTicket(true);

    try {
      const response = await fetchWithRateLimit(
        '/api/support/tickets',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            subject: newTicketSubject.trim(),
            message: newTicketMessage.trim()
          })
        },
        handleCreateTicket // Retry callback
      );

      const data = await response.json();

      if (response.ok && data.ticket) {
        // Сначала очищаем старый тикет, чтобы избежать показа старой истории
        setActiveTicket(null);
        fetchingTicketIdRef.current = null;

        // Загружаем тикеты заново
        await fetchTickets();

        // Сбрасываем счетчик сообщений при создании нового тикета
        setMessagesSentCount(0);
        setLastMessageTime(null);
        setTimeoutSeconds(0);

        // Устанавливаем активный тикет напрямую, без вызова fetchTicketMessages
        // чтобы избежать дублирующихся запросов (useEffect не будет вызывать fetchTicketMessages,
        // так как сообщения уже будут загружены)
        const ticketResponse = await fetchWithRateLimit(
          `/api/support/tickets/${data.ticket.id}`,
          {
            credentials: 'include'
          },
          async () => {
            // Retry callback
            const retryResponse = await fetch(`/api/support/tickets/${data.ticket.id}`, {
              credentials: 'include'
            });
            const retryData = await retryResponse.json();
            if (retryResponse.ok) {
              fetchingTicketIdRef.current = data.ticket.id;
              setActiveTicket({
                id: retryData.ticket.id,
                subject: retryData.ticket.subject,
                status: retryData.ticket.status,
                createdAt: new Date(retryData.ticket.created_at),
                user_id: retryData.ticket.user_id, // Сохраняем user_id для проверки прав
                messages: (retryData.messages || []).map((m: {
                  id: string;
                  message_text: string;
                  sender_type: string;
                  created_at: string;
                  is_read: boolean;
                  sender?: { id: string; username: string; user_id: string };
                  attachments?: Array<{
                    id: string;
                    file_name: string;
                    file_type: string;
                    file_size: number;
                    storage_url: string;
                  }>;
                }) => ({
                  id: m.id,
                  text: m.message_text,
                  sender: m.sender_type,
                  timestamp: new Date(m.created_at),
                  isRead: m.is_read,
                  senderData: m.sender,
                  attachments: m.attachments || []
                }))
              });
              markMessagesAsRead(data.ticket.id);
            }
          }
        );
        const ticketData = await ticketResponse.json();
        if (ticketResponse.ok) {
          fetchingTicketIdRef.current = data.ticket.id;
          setActiveTicket({
            id: ticketData.ticket.id,
            subject: ticketData.ticket.subject,
            status: ticketData.ticket.status,
            createdAt: new Date(ticketData.ticket.created_at),
            user_id: ticketData.ticket.user_id, // Сохраняем user_id для проверки прав
            messages: (ticketData.messages || []).map((m: {
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
                storage_url: string;
              }>;
            }) => ({
              id: m.id,
              text: m.message_text,
              sender: m.sender_type,
              timestamp: new Date(m.created_at),
              isRead: m.is_read,
              senderData: m.sender ? {
                id: m.sender.id,
                username: m.sender.username,
                user_id: m.sender.user_id,
                avatar: m.sender.avatar || null
              } : undefined,
              attachments: m.attachments || []
            }))
          });

          // Сохраняем ID последнего открытого тикета
          if (typeof window !== 'undefined') {
            localStorage.setItem('support_last_ticket_id', data.ticket.id);
          }

          // Отмечаем сообщения как прочитанные
          markMessagesAsRead(data.ticket.id);
        }
        setNewTicketSubject('');
        setNewTicketMessage('');
        setShowNewTicketForm(false);
        setShowCreateTicketModal(false);
        showNotification('Обращение создано', 'info');
      } else {
        const errorMessage = data.error || 'Ошибка создания обращения';
        showNotification(translateError(errorMessage));
        if (data.error && (data.error.toLowerCase().includes('limit') || data.error.toLowerCase().includes('лимит'))) {
          triggerShake('subject');
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        // Rate limit обрабатывается через капчу, не показываем ошибку
        // НЕ сбрасываем флаг, так как после капчи запрос повторится
        return;
      }
      // Ошибка создания тикета - не логируем
      showNotification('Ошибка создания обращения');
    } finally {
      // Сбрасываем флаг создания тикета в любом случае
      setIsCreatingTicket(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeTicket) return;

    // Разрешаем отправку если есть текст или файлы
    if (!messageText.trim() && uploadedFiles.length === 0) return;

    // Проверка статуса тикета - нельзя отправлять сообщения в закрытые тикеты
    if (activeTicket.status === 'closed') {
      showNotification('Нельзя отправлять сообщения в закрытый тикет');
      return;
    }

    // Проверка: поддержка не может писать в свои старые тикеты
    if (isSupport && activeTicket.user_id && userData?.id && (activeTicket.user_id === userData.id || activeTicket.user_id === userData.user_id)) {
      showNotification('Вы не можете отправлять сообщения в свои старые тикеты');
      return;
    }

    // Защита от повторной отправки
    if (isSendingMessage) return;

    // Проверка лимита символов
    if (messageText.length > MESSAGE_MAX_LENGTH) {
      showNotification(`Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`);
      triggerShake('message');
      return;
    }

    // Проверка тайм-аута (разрешаем отправить 2 сообщения подряд, затем таймаут)
    if (timeoutSeconds > 0) {
      return;
    }

    // Устанавливаем флаг отправки
    setIsSendingMessage(true);

    try {
      // Получаем CSRF токен для защиты от спама
      const { getCSRFToken } = await import('@/lib/utils/csrf-client');
      const csrfToken = await getCSRFToken();

      // Разделяем файлы на изображения и документы
      const images = uploadedFiles.filter(f => f.fileType.startsWith('image/'));
      const documents = uploadedFiles.filter(f => !f.fileType.startsWith('image/'));

      // Если есть и документы, и изображения - отправляем отдельными сообщениями
      if (documents.length > 0 && images.length > 0) {
        // Сначала отправляем сообщение с текстом и изображениями (если есть)
        if (messageText.trim() || images.length > 0) {
          const response = await fetchWithRateLimit(
            `/api/support/tickets/${activeTicket.id}/messages`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({
                message: messageText.trim() || '',
                csrfToken,
                attachments: images.length > 0 ? images : undefined
              })
            },
            handleSendMessage
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ошибка отправки сообщения');
          }
        }

        // Затем отправляем документы отдельными сообщениями
        for (const doc of documents) {
          const docResponse = await fetchWithRateLimit(
            `/api/support/tickets/${activeTicket.id}/messages`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({
                message: '',
                csrfToken,
                attachments: [doc]
              })
            },
            handleSendMessage
          );

          if (!docResponse.ok) {
            const errorData = await docResponse.json();
            throw new Error(errorData.error || 'Ошибка отправки документа');
          }
        }

        // Обновляем UI после всех отправок
        setMessageText('');
        setUploadedFiles([]);
        setFilePreviews(new Map());
        setFileErrors(new Set());

        // Увеличиваем счетчик
        const newCount = messagesSentCount + 1 + documents.length;
        setMessagesSentCount(newCount);

        if (newCount >= 2) {
          setLastMessageTime(Date.now());
          setTimeoutSeconds(MESSAGE_TIMEOUT / 1000);
        }

        // Загружаем сообщения заново для отображения всех отправленных
        await fetchTicketMessages(activeTicket.id);
        return;
      }

      // Обычная отправка (только изображения или только документы, или без файлов)
      const response = await fetchWithRateLimit(
        `/api/support/tickets/${activeTicket.id}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            message: messageText.trim() || '',
            csrfToken,
            attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined
          })
        },
        handleSendMessage // Retry callback
      );

      const data = await response.json();

      if (response.ok && data.message) {
        const sentText = messageText.trim();
        const sentFiles = [...uploadedFiles];

        setMessageText('');
        setUploadedFiles([]); // Очищаем загруженные файлы после отправки
        setFilePreviews(new Map()); // Очищаем превью
        setFileErrors(new Set()); // Очищаем ошибки

        // Увеличиваем счетчик отправленных сообщений
        const newCount = messagesSentCount + 1;
        setMessagesSentCount(newCount);

        // Устанавливаем тайм-аут только после второго сообщения
        if (newCount >= 2) {
          setLastMessageTime(Date.now());
          setTimeoutSeconds(MESSAGE_TIMEOUT / 1000);
        }

        // ОПТИМИЗАЦИЯ: Не загружаем сообщения заново - WebSocket обновит их автоматически
        // Добавляем отправленное сообщение оптимистично в локальное состояние
        // WebSocket подтвердит и обновит при получении события support:message:new
        const optimisticMessage: Message = {
          id: data.message.id,
          text: sentText,
          sender: 'user' as const,
          timestamp: new Date(),
          isRead: false,
          isPending: true,
          senderData: userData ? {
            id: userData.id,
            username: userData.username,
            user_id: userData.user_id
          } : undefined,
          attachments: sentFiles.length > 0 ? sentFiles.map((f, idx) => ({
            id: `temp-${idx}`,
            file_name: f.fileName,
            file_type: f.fileType,
            file_size: f.fileSize,
            storage_url: f.previewUrl || f.storageUrl,
            blur_hash: f.blur_hash,
            width: f.width,
            height: f.height
          })) : []
        };

        setActiveTicket(prev => {
          if (!prev) return prev;
          // Проверяем, что сообщение еще не добавлено
          const messageExists = prev.messages?.some(m => m.id === optimisticMessage.id);
          if (messageExists) return prev;

          return {
            ...prev,
            messages: [...(prev.messages || []), optimisticMessage]
          };
        });

        // Отмечаем сообщение как загруженное
        loadedMessagesRef.current.add(optimisticMessage.id);

        // Сразу после успешного ответа сервера обновляем сообщение:
        // - Убираем isPending (сообщение доставлено)
        // - Обновляем attachments с серверными данными (blur_hash, width, height, правильные id)
        setTimeout(() => {
          setActiveTicket(prev => {
            if (!prev) return prev;
            
            const serverAttachments = data.message.attachments || [];
            const updatedMessages = prev.messages.map(m => {
              if (m.id !== data.message.id) return m;
              
              return {
                ...m,
                isPending: false,
                attachments: serverAttachments.length > 0 
                  ? serverAttachments.map((att: any) => ({
                      id: att.id,
                      file_name: att.file_name,
                      file_type: att.file_type,
                      file_size: att.file_size,
                      storage_path: att.storage_path,
                      storage_url: att.storage_url || `/support/files/${encodeURIComponent(att.storage_path)}`,
                      blur_hash: att.blur_hash,
                      width: att.width,
                      height: att.height
                    }))
                  : m.attachments
              };
            });
            
            activeTicketMessagesRef.current = updatedMessages;
            return { ...prev, messages: updatedMessages };
          });
        }, 100); // Небольшая задержка чтобы optimistic сообщение успело отрендериться

        // Отмечаем сообщения как прочитанные
        markMessagesAsRead(activeTicket.id);

        const optimisticLastMessageText = sentText || (sentFiles.length > 0 ? getLastMessageLabelForAttachments(sentFiles) : '');

        setTickets(prev => prev.map(t =>
          t.id === activeTicket.id
            ? {
              ...t,
              last_message: {
                id: optimisticMessage.id,
                message_text: optimisticLastMessageText,
                sender_type: 'user',
                created_at: optimisticMessage.timestamp.toISOString(),
                is_read: false
              },
              last_message_at: optimisticMessage.timestamp.toISOString()
            }
            : t
        ));
      } else {
        const errorMessage = data.error || 'Ошибка отправки сообщения';
        showNotification(translateError(errorMessage));
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        // Rate limit обрабатывается через капчу, не показываем ошибку
        return;
      }
      // Ошибка отправки сообщения - не логируем
      showNotification('Ошибка отправки сообщения');
    } finally {
      // Сбрасываем флаг отправки в любом случае
      setIsSendingMessage(false);
    }
  };

  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const response = await fetchWithRateLimit(
        '/api/support/tickets?status=all&forUser=true',
        {
          credentials: 'include'
        },
        () => fetchTickets() // Retry callback
      );
      const data = await response.json();

      if (response.ok) {
        const mappedTickets = (data.tickets || []).map((t: {
          id: string;
          subject: string;
          status: string;
          created_at: string;
          user_id?: string;
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
          createdAt: new Date(t.created_at),
          user_id: (t as any).user_id, // Сохраняем user_id для проверки прав
          messages: [],
          last_message: t.last_message || null
        }));
        setTickets(mappedTickets);

        // Сохраняем количество тикетов в localStorage для скелетонов
        if (typeof window !== 'undefined') {
          const count = mappedTickets.length;
          localStorage.setItem('support_tickets_count', count.toString());
          // Если тикетов нет (0), не показываем скелетоны (null)
          setSkeletonCount(count === 0 ? null : count);
        }

        // Восстанавливаем последний открытый тикет после загрузки списка
        if (typeof window !== 'undefined' && !activeTicket) {
          const lastTicketId = localStorage.getItem('support_last_ticket_id');
          if (lastTicketId) {
            const lastTicket = mappedTickets.find((t: Ticket) => t.id === lastTicketId);
            if (lastTicket) {
              // Небольшая задержка для корректного обновления state
              setTimeout(() => {
                setActiveTicket(lastTicket);
                // Загружаем сообщения для восстановленного тикета с восстановлением позиции
                fetchTicketMessages(lastTicket.id, 25, 0, true);
              }, 50);
            }
          }
        }
      } else {
        const errorMessage = data.error || 'Ошибка загрузки обращений';
        showNotification(translateError(errorMessage));
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        // Rate limit обрабатывается через капчу, не показываем ошибку
        setTicketsLoading(false);
        return;
      }
      // Ошибка получения тикетов - не логируем
      showNotification('Ошибка загрузки обращений');
    } finally {
      setTicketsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket, showNotification]);

  const fetchTicketMessages = async (ticketId: string, limit: number = 25, offset: number = 0, restoreScroll: boolean = false) => {
    return debugPerformanceAsync('fetchTicketMessages', async () => {
      // Предотвращаем дублирующиеся запросы
      if (fetchingTicketIdRef.current === ticketId && !restoreScroll) {
        debugStart('fetchTicketMessages', { ticketId, reason: 'duplicate_request' });
        return;
      }

      // Загружаем кэшированные сообщения для мгновенного отображения (только для первой загрузки)
      let cachedMessages: Message[] | null = null;
      if (offset === 0) {
        cachedMessages = loadMessagesFromCache(ticketId);
        if (cachedMessages && cachedMessages.length > 0) {
          // Обновляем сообщения из кэша
          setActiveTicket(prev => {
            if (prev && prev.id === ticketId) {
              return {
                ...prev,
                messages: cachedMessages || []
              };
            }
            return prev;
          });
          activeTicketMessagesRef.current = cachedMessages;
          // Восстанавливаем позицию скролла после загрузки кэша
          if (!restoreScroll) {
            requestAnimationFrame(() => {
              restoreScrollPosition(ticketId);
            });
          }
        }
      }

      try {
        if (!restoreScroll) {
          fetchingTicketIdRef.current = ticketId;
        }

        debugStart('fetchTicketMessages', { ticketId, limit, offset, restoreScroll });

        // Загружаем только последние N сообщений для оптимизации
        const response = await fetchWithRateLimit(
          `/api/support/tickets/${ticketId}?limit=${limit}&offset=${offset}`,
          {
            credentials: 'include'
          },
          () => fetchTicketMessages(ticketId, limit, offset, restoreScroll) // Retry callback
        );
        const data = await response.json();

        if (response.ok) {
          // Маппим сообщения с вложениями (оптимизировано - используем данные с сервера)
          const mappedMessages = (data.messages || []).map((m: {
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
              storage_url: string;
              storage_path?: string;
              blur_hash?: string;
              width?: number;
              height?: number;
            }>;
          }) => ({
            id: m.id,
            text: m.message_text,
            sender: m.sender_type,
            timestamp: new Date(m.created_at),
            isRead: m.is_read,
            senderData: m.sender ? {
              id: m.sender.id,
              username: m.sender.username,
              user_id: m.sender.user_id,
              avatar: m.sender.avatar || null
            } : undefined,
            // Вложения уже правильно сформированы на сервере, используем как есть
            // Проверяем, что вложения есть и это массив с элементами
            attachments: m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0
              ? m.attachments.map((att: any) => ({
                id: att.id,
                file_name: att.file_name,
                file_type: att.file_type,
                file_size: att.file_size,
                storage_path: att.storage_path,
                storage_url: att.storage_url || (att.storage_path
                  ? `/api/support/files/${encodeURIComponent(att.storage_path)}`
                  : ''),
                blur_hash: att.blur_hash,
                width: att.width,
                height: att.height
              }))
              : undefined
          }));

          // Проверяем, что тикет все еще активный (не изменился во время запроса)
          setActiveTicket(prev => {
            // Если тикет изменился во время запроса, не обновляем
            if (prev && prev.id && prev.id !== ticketId) {
              if (!restoreScroll) {
                fetchingTicketIdRef.current = null;
              }
              return prev;
            }

            // Если это первая загрузка (offset === 0), заменяем все сообщения
            // Если это загрузка старых сообщений (offset > 0), добавляем в начало
            let finalMessages: typeof mappedMessages;
            if (offset === 0) {
              finalMessages = mappedMessages;
              setLoadedMessageCount(mappedMessages.length);
              // Проверяем, есть ли еще сообщения для загрузки
              // Если загрузили меньше чем запросили, значит это все сообщения
              setHasMoreMessages(mappedMessages.length >= limit);
            } else {
              // Добавляем старые сообщения в начало
              finalMessages = [...mappedMessages, ...(prev?.messages || [])];
              setLoadedMessageCount(prev => prev + mappedMessages.length);
              // Если загрузили меньше чем запросили, значит больше нет старых сообщений
              setHasMoreMessages(mappedMessages.length >= limit);
            }

            // Отмечаем все загруженные сообщения как уже загруженные
            mappedMessages.forEach((m: { id: string }) => {
              loadedMessagesRef.current.add(m.id);
            });

            const ticket = {
              id: data.ticket.id,
              subject: data.ticket.subject,
              status: data.ticket.status,
              createdAt: new Date(data.ticket.created_at),
              user_id: prev?.user_id || data.ticket.user_id, // Сохраняем user_id из предыдущего значения или из API
              messages: finalMessages
            };

            // Обновляем ref с актуальными сообщениями
            activeTicketMessagesRef.current = finalMessages;

            // Кэшируем сообщения (только для первой загрузки)
            if (offset === 0) {
              saveMessagesToCache(ticketId, finalMessages);
            }

            // Сохраняем ID последнего открытого тикета
            if (typeof window !== 'undefined') {
              localStorage.setItem('support_last_ticket_id', ticket.id);
            }

            // Устанавливаем флаг первой загрузки после небольшой задержки, чтобы сообщения успели отрендериться
            if (offset === 0) {
              setTimeout(() => {
                initialLoadRef.current = false;
              }, 100);
            }

            return ticket;
          });

          // Восстанавливаем позицию скролла после первой загрузки
          // Используем двойной requestAnimationFrame для гарантии полного рендера
          if (offset === 0 && restoreScroll) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                // Дополнительная задержка для гарантии, что DOM полностью обновлен
                setTimeout(() => {
                  restoreScrollPosition(ticketId);
                }, 50);
              });
            });
          }

          // Отмечаем сообщения как прочитанные после загрузки
          if (offset === 0) {
            markMessagesAsRead(ticketId);
          }

          debugEnd('fetchTicketMessages', {
            ticketId,
            messagesCount: mappedMessages.length,
            hasMore: mappedMessages.length >= limit
          });
        } else {
          if (!restoreScroll) {
            fetchingTicketIdRef.current = null;
          }
          const errorMessage = data.error || 'Ошибка загрузки сообщений';
          debugError('fetchTicketMessages', { ticketId, error: errorMessage });
          showNotification(translateError(errorMessage));
        }
      } catch (error) {
        // Ошибка получения сообщений
        if (!restoreScroll) {
          fetchingTicketIdRef.current = null;
        }
        debugError('fetchTicketMessages', { ticketId, error });
        showNotification('Ошибка загрузки сообщений');
      }
    });
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messageDate = new Date(date);
    messageDate.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - messageDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Сегодня';
    } else if (diffDays === 1) {
      return 'Вчера';
    } else {
      // Формат: "11 ноября" (без года)
      return messageDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long'
      });
    }
  };

  const formatDateShort = (date: Date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const time = d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${day}.${month}.${year}, ${time}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!userData) {
    // Показываем заглушку с предложением авторизации
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Требуется авторизация</h1>
            <p className="text-neutral-400 mb-6">
              Для доступа к данной странице требуется авторизация. Войдите в аккаунт или обратитесь в Telegram Bot'а.
            </p>
            <Link
              href={`/auth?retpatch=${encodeURIComponent('/support/')}`}
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Войти в аккаунт
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 pt-4 z-[999]">
        <div className="mx-auto max-w-6xl px-4">
          <div className="backdrop-blur-lg bg-neutral-900/40 border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-lg">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/static/logo.svg" alt="Raven Logo" width={256} height={256} className="w-6 h-6" priority />
              <span className="font-semibold text-white">RVN</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-8 text-sm text-neutral-300">
              <Link href="/" className="hover:text-white transition">Главная</Link>
              <Link href="/auth" className="hover:text-white transition">Профиль</Link>
            </nav>
            {userData && (
              <div className="hidden lg:flex items-center gap-2 relative" ref={userMenuRef}>
                {(() => {
                  const avatarUrl = getAvatarUrl(userData.avatar);
                  const gradientClasses = getGradientClasses(userData.avatar);

                  return (
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className={`w-10 h-10 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-semibold text-sm transition-transform duration-200 hover:scale-110 cursor-pointer`}
                      title={userData.username}
                      aria-label="Меню пользователя"
                      aria-expanded={userMenuOpen}
                    >
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt={userData.username}
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        userData.username.charAt(0).toUpperCase()
                      )}
                    </button>
                  );
                })()}
                <UserMenu
                  userData={userData}
                  isOpen={userMenuOpen}
                  onClose={() => setUserMenuOpen(false)}
                  menuRef={userMenuRef}
                />
              </div>
            )}
            {userData && (
              <div className="lg:hidden flex items-center gap-2 relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className={`w-10 h-10 rounded-full overflow-hidden ${getAvatarUrl(userData.avatar) ? '' : getGradientClasses(userData.avatar)} flex items-center justify-center text-white font-semibold text-sm transition-transform duration-200 hover:scale-110 cursor-pointer`}
                  title={userData.username}
                  aria-label="Меню пользователя"
                  aria-expanded={userMenuOpen}
                >
                  {(() => {
                    const avatarUrl = getAvatarUrl(userData.avatar);
                    return avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt={userData.username}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      userData.username.charAt(0).toUpperCase()
                    );
                  })()}
                </button>
                <UserMenu
                  userData={userData}
                  isOpen={userMenuOpen}
                  onClose={() => setUserMenuOpen(false)}
                  showProfile={true}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-32 pb-4 overflow-hidden min-h-0">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-8 h-full flex flex-col overflow-hidden">
          <div className="mb-4 sm:mb-6 hidden sm:block">
            <p className="text-xs sm:text-sm text-neutral-400">Обратитесь в службу поддержки. Создайте новое обращение или выберите существующее для продолжения диалога.</p>
          </div>

          <div className="flex flex-col lg:flex-row gap-3 sm:gap-6 flex-1 min-h-0">
            {/* Левая панель: на ПК при свёрнутом виде — узкая панель с номерами; иначе — полный список (на мобильном всегда список) */}
            <div className={`flex flex-col min-h-0 transition-all duration-300 ease-in-out overflow-hidden ${activeTicket ? 'hidden lg:flex' : 'flex'} ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-1/3'}`}>
              {sidebarCollapsed && (
                <div className="hidden lg:flex flex-col w-16 flex-shrink-0 bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={toggleSidebarCollapsed}
                    className="flex-shrink-0 p-2.5 border-b border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                    title="Показать список тикетов"
                    aria-label="Показать список тикетов"
                  >
                    <PanelLeft className="w-5 h-5 mx-auto" />
                  </button>
                  <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 py-1 flex flex-col items-center gap-1">
                    {tickets.map((ticket, index) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={async () => {
                          if (activeTicket?.id === ticket.id) return;
                          const ticketData = {
                            id: ticket.id,
                            subject: ticket.subject,
                            status: ticket.status,
                            createdAt: ticket.createdAt,
                            user_id: ticket.user_id,
                            messages: []
                          };
                          setActiveTicket(ticketData);
                          if (typeof window !== 'undefined') localStorage.setItem('support_last_ticket_id', ticket.id);
                          setMessagesSentCount(0);
                          setLastMessageTime(null);
                          setTimeoutSeconds(0);
                          await fetchTicketMessages(ticket.id, 25, 0, true);
                        }}
                        className={`w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                          activeTicket?.id === ticket.id
                            ? ticket.status === 'open'
                              ? 'bg-green-500/90 text-white'
                              : ticket.status === 'pending'
                                ? 'bg-yellow-500/90 text-white'
                                : 'bg-red-500/90 text-white'
                            : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700'
                        }`}
                        title={ticket.subject}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                  {!isSupport && (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTicketsCount >= MAX_TICKETS_PER_USER) {
                          alert('Вы можете создать максимум 2 активных обращения');
                          return;
                        }
                        setShowCreateTicketModal(true);
                      }}
                      disabled={activeTicketsCount >= MAX_TICKETS_PER_USER}
                      className="flex-shrink-0 mt-2 mb-2 w-9 h-9 rounded-lg flex items-center justify-center bg-neutral-600 hover:bg-neutral-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white transition-colors mx-auto"
                      title="Создать тикет"
                      aria-label="Создать тикет"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}
              <div className={`bg-neutral-900 border border-white/10 rounded-2xl p-2 sm:p-4 flex-1 flex flex-col overflow-hidden min-w-[300px] ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                <div className="flex items-center justify-between gap-2 mb-2 sm:mb-4 flex-shrink-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={toggleSidebarCollapsed}
                      className="hidden lg:flex flex-shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                      title={sidebarCollapsed ? 'Показать список тикетов' : 'Свернуть в панель с номерами'}
                      aria-label={sidebarCollapsed ? 'Показать список тикетов' : 'Свернуть список тикетов'}
                    >
                      {sidebarCollapsed ? (
                        <PanelLeft className="w-5 h-5" />
                      ) : (
                        <PanelLeftClose className="w-5 h-5" />
                      )}
                    </button>
                    <h2 className="text-base sm:text-lg font-semibold truncate">Мои тикеты</h2>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                    onClick={() => {
                      if (activeTicketsCount >= MAX_TICKETS_PER_USER) {
                        alert('Вы можете создать максимум 2 активных обращения');
                        return;
                      }
                      setShowNewTicketForm(!showNewTicketForm);
                    }}
                    disabled={activeTicketsCount >= MAX_TICKETS_PER_USER || isSupport}
                    className="px-3 py-1.5 bg-primary-500 hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm rounded-lg transition-colors"
                    title={isSupport ? 'Создание тикетов недоступно для сотрудников поддержки' : ''}
                  >
                    + Новый
                  </button>
                  </div>
                </div>

                {!isSupport && (
                  <div ref={newTicketFormRef}>
                    <CreateTicketForm
                      subject={newTicketSubject}
                      message={newTicketMessage}
                      onSubjectChange={setNewTicketSubject}
                      onMessageChange={setNewTicketMessage}
                      onSubmit={handleCreateTicket}
                      onCancel={() => setShowNewTicketForm(false)}
                      isCreating={isCreatingTicket}
                      maxSubjectLength={TICKET_SUBJECT_MAX_LENGTH}
                      maxMessageLength={MESSAGE_MAX_LENGTH}
                      onMaxSubjectLengthExceeded={() => {
                        showNotification(`Максимальная длина темы: ${TICKET_SUBJECT_MAX_LENGTH} символов`);
                        triggerShake('subject');
                      }}
                      onMaxMessageLengthExceeded={() => {
                        showNotification(`Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`);
                        triggerShake('message');
                      }}
                      variant="inline"
                      isVisible={showNewTicketForm}
                    />
                  </div>
                )}

                <div className="support-tickets-list flex-1 overflow-y-auto overscroll-contain min-h-0 flex-col flex lg:flex">
                  {ticketsLoading ? (
                    skeletonCount === null ? (
                      // Если последний раз тикетов не было, не показываем скелетоны
                      <div className="text-center py-8 text-neutral-400 text-sm">
                        Загрузка...
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <TicketSkeleton count={skeletonCount} variant="user" />
                      </div>
                    )
                  ) : tickets.length === 0 ? (
                    <div className="text-center text-neutral-400 text-sm py-8">
                      Нет открытых тикетов.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {tickets.map((ticket) => (
                        <TicketListItem
                          key={ticket.id}
                          ticket={ticket}
                          isActive={activeTicket?.id === ticket.id}
                          onClick={async () => {
                            if (activeTicket?.id === ticket.id) return;
                            
                            const ticketData = {
                              id: ticket.id,
                              subject: ticket.subject,
                              status: ticket.status,
                              createdAt: ticket.createdAt,
                              user_id: ticket.user_id,
                              messages: []
                            };
                            setActiveTicket(ticketData);
                            if (typeof window !== 'undefined') {
                              localStorage.setItem('support_last_ticket_id', ticket.id);
                            }
                            setMessagesSentCount(0);
                            setLastMessageTime(null);
                            setTimeoutSeconds(0);
                            await fetchTicketMessages(ticket.id, 25, 0, true);
                          }}
                          formatDate={formatDate}
                          formatTime={formatTime}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Чат — при свёрнутой панели занимает почти весь экран на ПК */}
            <div className={`flex flex-col min-h-0 flex-1 ${activeTicket ? 'flex' : 'hidden lg:flex'}`}>
              <div className="bg-neutral-900 border border-white/10 rounded-2xl flex-1 flex flex-col overflow-hidden">
                {activeTicket ? (
                  <>
                    <div ref={chatAreaRef} className="flex-1 flex flex-col min-h-0 overflow-hidden transition-opacity duration-200">
                      <ChatHeader
                        ticket={activeTicket}
                        sidebarCollapsed={sidebarCollapsed}
                        onToggleSidebar={toggleSidebarCollapsed}
                        onBack={() => setActiveTicket(null)}
                        formatDateShort={formatDateShort}
                      />

                      <div
                        ref={messagesContainerRef}
                        className="support-chat-messages flex-1 overflow-y-auto min-h-0 relative"
                      >
                        {ticketsLoading && (
                          <div className="absolute top-4 right-4 flex items-center gap-2 text-neutral-400 text-sm z-10">
                            <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
                            <span>Загрузка...</span>
                          </div>
                        )}
                        <div key={`messages-${activeTicket.id}`} className="p-2 sm:p-4 flex flex-col gap-3 sm:gap-4 min-h-full">
                          {activeTicket.messages && Array.isArray(activeTicket.messages) && activeTicket.messages.length > 0 ? (
                            <>
                              {/* Индикатор загрузки старых сообщений */}
                              {hasMoreMessages && (
                                <div ref={messagesTopRef} className="flex justify-center py-2">
                                  {isLoadingOlderMessages ? (
                                    <div className="flex items-center gap-2 text-neutral-400 text-sm">
                                      <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
                                      <span>Загрузка старых сообщений...</span>
                                    </div>
                                  ) : (
                                    <div className="h-1" />
                                  )}
                                </div>
                              )}
                              {activeTicket.messages.map((message, index) => {
                                const showDate = index === 0 ||
                                  new Date(message.timestamp).getDate() !==
                                  new Date(activeTicket.messages[index - 1].timestamp).getDate();

                                // Определяем, является ли это первой загрузкой тикета
                                // Если это первая загрузка, все сообщения должны быть без анимации
                                const isInitialLoad = initialLoadRef.current &&
                                  loadedMessagesRef.current.has(message.id);

                                return (
                                  <MessageItem
                                    key={message.id}
                                    message={message}
                                    showDate={showDate}
                                    userData={userData}
                                    formatDate={formatDate}
                                    formatTime={formatTime}
                                    isInitialLoad={isInitialLoad}
                                    onImageClick={(url, alt) => setViewingImage({ url, alt })}
                                  />
                                );
                              })}
                              <div ref={messagesEndRef} />
                            </>
                          ) : (
                            <div className="flex-1 flex items-center justify-center">
                              <p className="text-neutral-500 text-sm">Опишите свою проблему</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <MessageInput
                        messageText={messageText}
                        onMessageChange={setMessageText}
                        onSend={handleSendMessage}
                        onAttachClick={() => setShowFileUploadModal(true)}
                        uploadedFiles={uploadedFiles}
                        onRemoveFile={(index) => {
                          const file = uploadedFiles[index];
                          setUploadedFiles(prev => prev.filter((_, i) => i !== index));
                          if (file) {
                            setFilePreviews(prev => {
                              const newMap = new Map(prev);
                              newMap.delete(file.storageUrl);
                              return newMap;
                            });
                            setFileErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(file.storageUrl);
                              return newSet;
                            });
                          }
                        }}
                        isSending={isSendingMessage}
                        timeoutSeconds={timeoutSeconds}
                        isTicketClosed={activeTicket.status === 'closed'}
                        isSupportOwnTicket={isSupport && activeTicket.user_id !== undefined && userData?.id !== undefined && (activeTicket.user_id === userData.id || activeTicket.user_id === userData.user_id)}
                        maxLength={MESSAGE_MAX_LENGTH}
                        onMaxLengthExceeded={() => {
                          showNotification(`Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`);
                          triggerShake('message');
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-800 flex items-center justify-center">
                        <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <p className="text-neutral-400">Выберите тикет или создайте новый</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Notification */}
      {notification.show && (
        <div ref={notificationRef} className="fixed bottom-4 left-2 right-2 sm:left-4 sm:right-auto z-[1000] max-w-sm sm:max-w-none">
          <div className={`rounded-lg sm:rounded-xl px-3 py-2 sm:px-4 sm:py-3 shadow-xl backdrop-blur-xl border ${notification.type === 'error'
              ? 'bg-red-500/90 border-red-400/50 text-white'
              : 'bg-blue-500/90 border-blue-400/50 text-white'
            }`}>
            <div className="flex items-start gap-2">
              {notification.type === 'error' ? (
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <p className="text-xs sm:text-sm font-medium break-words">{notification.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно создания тикета */}
      {showCreateTicketModal && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowCreateTicketModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-ticket-modal-title"
        >
          <div
            className="bg-neutral-900 border border-white/10 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="create-ticket-modal-title" className="text-lg font-semibold text-white mb-4">
              Новое обращение
            </h2>
            <div className="space-y-3">
              <div>
                <input
                  ref={subjectInputRef}
                  type="text"
                  value={newTicketSubject}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= TICKET_SUBJECT_MAX_LENGTH) {
                      setNewTicketSubject(value);
                    } else {
                      showNotification(`Максимальная длина темы: ${TICKET_SUBJECT_MAX_LENGTH} символов`);
                      triggerShake('subject');
                    }
                  }}
                  placeholder="Тема обращения.."
                  className="w-full px-3 py-2 bg-neutral-800 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                />
                <div className="text-xs text-neutral-500 mt-1 text-right">
                  {newTicketSubject.length}/{TICKET_SUBJECT_MAX_LENGTH}
                </div>
              </div>
              <div>
                <textarea
                  value={newTicketMessage}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= MESSAGE_MAX_LENGTH) {
                      setNewTicketMessage(value);
                    } else {
                      showNotification(`Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`);
                      triggerShake('message');
                    }
                  }}
                  placeholder="Опишите свою проблему.."
                  rows={4}
                  className="w-full px-3 py-2 bg-neutral-800 border border-white/10 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-primary-500 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      e.preventDefault();
                      handleCreateTicket();
                    }
                  }}
                />
                <div className="text-xs text-neutral-500 mt-1 text-right">
                  {newTicketMessage.length}/{MESSAGE_MAX_LENGTH}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateTicket}
                  disabled={!newTicketSubject.trim() || !newTicketMessage.trim() || isCreatingTicket}
                  className="flex-1 px-3 py-2 bg-primary-500 hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm rounded-lg transition-colors"
                >
                  {isCreatingTicket ? 'Создание...' : 'Создать'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateTicketModal(false);
                  }}
                  className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-sm rounded-lg transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RateLimitCaptcha
        isOpen={showRateLimitCaptcha}
        onSuccess={handleRateLimitSuccess}
        onClose={() => {
          // При закрытии очищаем очередь и сбрасываем все флаги
          isCaptchaOpenRef.current = false;
          isProcessingCaptchaRef.current = false;
          setShowRateLimitCaptcha(false);
          pendingRequestsQueueRef.current = [];
        }}
      />

      {activeTicket && (
        <FileUploadModal
          isOpen={showFileUploadModal}
          onClose={() => setShowFileUploadModal(false)}
          onUploadComplete={(files) => {
            setUploadedFiles(prev => [...prev, ...files]);
            // Генерируем превью для изображений
            files.forEach((file) => {
              if (file.fileType.startsWith('image/')) {
                // Если есть локальное превью (blob), сохраняем его
                const preview = file.previewUrl || file.storageUrl;
                setFilePreviews(prev => new Map(prev).set(file.storageUrl, preview));
              }
            });
            setShowFileUploadModal(false);
          }}
          ticketId={activeTicket?.id || ''}
          maxFiles={2}
        />
      )}

      {viewingImage?.url && (
        <ImageViewer
          isOpen={true}
          onClose={() => setViewingImage(null)}
          imageUrl={viewingImage.url}
          alt={viewingImage?.alt || ''}
        />
      )}
    </div>
  );
}
