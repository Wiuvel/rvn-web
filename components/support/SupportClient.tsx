'use client';

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
import { onRateLimited } from '@/lib/trpc/rate-limit-link';
import { useSupportState } from '@/hooks/useSupportState';
import { gsap } from 'gsap';
import {
  MESSAGE_MAX_LENGTH,
  TICKET_SUBJECT_MAX_LENGTH,
  MAX_TICKETS_PER_USER,
  MESSAGE_TIMEOUT,
  GSAP_DEFAULT_DURATION,
  GSAP_DEFAULT_EASE,
  MARK_AS_READ_DEBOUNCE,
} from '@/lib/utils/constants';
import {
  getLastMessageLabelForAttachments,
  normalizeLastMessageDisplayText,
} from '@/lib/support/messages';
import { translateError } from '@/lib/utils/error-translations';
import { useWebSocket } from '@/hooks/useWebSocket';
import type {
  BroadcastMessagePayload,
  BroadcastMessageReadPayload,
  BroadcastTicketUpdatePayload,
} from '@/lib/websocket/types';
import { debugPerformanceAsync, debugStart, debugEnd, debugError } from '@/lib/utils/debug';
import TicketSkeleton from '@/components/ui/TicketSkeleton';
import FileUploadModal from '@/components/support/FileUploadModal';
import MessageInput from '@/components/support/MessageInput';
import ChatHeader from '@/components/support/ChatHeader';
import ConnectionBanner from '@/components/support/ConnectionBanner';
import MessageItem from '@/components/support/MessageItem';
import TicketListItem from '@/components/support/TicketListItem';
import CreateTicketForm from '@/components/support/CreateTicketForm';
import { PanelLeftClose, PanelLeft, Plus, Ticket as TicketIcon } from 'lucide-react';
import ImageViewer from '@/components/support/ImageViewer';
import { SupportLoadingState } from '@/components/support/SupportLoadingState';
import { SupportUnauthorizedState } from '@/components/support/SupportUnauthorizedState';
import Header from '@/components/layout/Header';
import { useAuth } from '@/hooks/useAuth';
import type { Message, Ticket, UploadedFile } from '@/components/support/types';
import type { RawTicketApi } from '@/lib/support/types';
import { mapRawTicketsToUi, mapWsAttachments } from '@/lib/support/mappers';

// Lazy load RateLimitCaptcha для оптимизации bundle size
// Убираем loading state, чтобы избежать показа модального окна при загрузке страницы
const RateLimitCaptcha = dynamic(() => import('@/components/auth/RateLimitCaptcha'), {
  ssr: false,
});

function mapApiTicketsToState(rawTickets: RawTicketApi[]): Ticket[] {
  return mapRawTicketsToUi(rawTickets);
}

export default function SupportClient() {
  const { userData: authUserData } = useAuth({
    requireAuth: false,
  });

  const { state, dispatch } = useSupportState(null, [], null, []);

  // Sync auth data into support state
  useEffect(() => {
    if (authUserData) {
      dispatch({ type: 'SET_USER_DATA', payload: authUserData });
    }
  }, [authUserData, dispatch]);

  // Ref for accessing current state in callbacks/effects without triggering re-renders
  const stateRef = useRef(state);
  stateRef.current = state;

  const {
    userData,
    loading,
    isSupport,
    tickets,
    activeTicket,
    messageText,
    showNewTicketForm,
    showCreateTicketModal,
    newTicketSubject,
    newTicketMessage,
    ticketsLoading,
    skeletonCount,
    lastMessageTime,
    timeoutSeconds,
    isCreatingTicket,
    isSendingMessage,
    messagesSentCount,
    notification,
    hasMoreMessages,
    isLoadingOlderMessages,
    loadedMessageCount,
  } = state;

  // Adapters for legacy useState calls
  const setUserMenuOpen = useCallback(
    (val: boolean | ((prev: boolean) => boolean)) => {
      const currentVal = stateRef.current.userMenuOpen;
      const newVal = typeof val === 'function' ? val(currentVal) : val;
      dispatch({ type: 'TOGGLE_USER_MENU', payload: newVal });
    },
    [dispatch],
  );

  const setTickets = useCallback(
    (val: Ticket[] | ((prev: Ticket[]) => Ticket[])) => {
      dispatch({ type: 'SET_TICKETS', payload: val });
    },
    [dispatch],
  );

  const setActiveTicket = useCallback(
    (val: Ticket | null | ((prev: Ticket | null) => Ticket | null)) => {
      dispatch({ type: 'SET_ACTIVE_TICKET', payload: val });
    },
    [dispatch],
  );

  const setMessageText = useCallback(
    (val: string) => dispatch({ type: 'SET_MESSAGE_TEXT', payload: val }),
    [dispatch],
  );
  const setShowNewTicketForm = useCallback(
    (val: boolean) => dispatch({ type: 'SET_SHOW_NEW_TICKET_FORM', payload: val }),
    [dispatch],
  );
  const setShowCreateTicketModal = useCallback(
    (val: boolean) => dispatch({ type: 'SET_SHOW_CREATE_TICKET_MODAL', payload: val }),
    [dispatch],
  );
  const setNewTicketSubject = useCallback(
    (val: string) => dispatch({ type: 'SET_NEW_TICKET_SUBJECT', payload: val }),
    [dispatch],
  );
  const setNewTicketMessage = useCallback(
    (val: string) => dispatch({ type: 'SET_NEW_TICKET_MESSAGE', payload: val }),
    [dispatch],
  );
  const setTicketsLoading = useCallback(
    (val: boolean) => dispatch({ type: 'SET_TICKETS_LOADING', payload: val }),
    [dispatch],
  );
  const setSkeletonCount = useCallback(
    (val: number | null) => dispatch({ type: 'SET_SKELETON_COUNT', payload: val }),
    [dispatch],
  );
  const setLastMessageTime = useCallback(
    (val: number | null) =>
      dispatch({ type: 'UPDATE_RATE_LIMIT', payload: { lastMessageTime: val } }),
    [dispatch],
  );
  const setTimeoutSeconds = useCallback(
    (val: number) => dispatch({ type: 'UPDATE_RATE_LIMIT', payload: { timeoutSeconds: val } }),
    [dispatch],
  );
  const setIsCreatingTicket = useCallback(
    (val: boolean) => dispatch({ type: 'SET_IS_CREATING_TICKET', payload: val }),
    [dispatch],
  );
  const setIsSendingMessage = useCallback(
    (val: boolean) => dispatch({ type: 'SET_IS_SENDING_MESSAGE', payload: val }),
    [dispatch],
  );
  const setMessagesSentCount = useCallback(
    (val: number) => dispatch({ type: 'UPDATE_RATE_LIMIT', payload: { messagesSentCount: val } }),
    [dispatch],
  );

  const setNotification = useCallback(
    (val: { message: string; show: boolean; type?: 'error' | 'info' }) => {
      if (val.show)
        dispatch({
          type: 'SHOW_NOTIFICATION',
          payload: { message: val.message, type: val.type },
        });
      else dispatch({ type: 'HIDE_NOTIFICATION' });
    },
    [dispatch],
  );

  const setHasMoreMessages = useCallback(
    (val: boolean | ((prev: boolean) => boolean)) => {
      const currentVal = stateRef.current.hasMoreMessages;
      const newVal = typeof val === 'function' ? val(currentVal) : val;
      dispatch({ type: 'SET_PAGINATION', payload: { hasMoreMessages: newVal } });
    },
    [dispatch],
  );

  const setIsLoadingOlderMessages = useCallback(
    (val: boolean | ((prev: boolean) => boolean)) => {
      const currentVal = stateRef.current.isLoadingOlderMessages;
      const newVal = typeof val === 'function' ? val(currentVal) : val;
      dispatch({ type: 'SET_PAGINATION', payload: { isLoadingOlderMessages: newVal } });
    },
    [dispatch],
  );

  const setLoadedMessageCount = useCallback(
    (val: number | ((prev: number) => number)) => {
      const currentVal = stateRef.current.loadedMessageCount;
      const newVal = typeof val === 'function' ? val(currentVal) : val;
      dispatch({ type: 'SET_PAGINATION', payload: { loadedMessageCount: newVal } });
    },
    [dispatch],
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const isRestoringScrollRef = useRef(false);
  const [scrollRestored, setScrollRestored] = useState(true);

  // Закрытие десктоп-меню при переключении viewport (DevTools / resize)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      if (!e.matches) setUserMenuOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Подсчет активных тикетов (только open и pending)
  const activeTicketsCount = tickets.filter(
    (t) => t.status === 'open' || t.status === 'pending',
  ).length;

  const notificationRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null); // Для формы создания нового тикета
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const newTicketFormRef = useRef<HTMLDivElement>(null); // Ref для формы создания тикета (для анимаций)
  const chatAreaRef = useRef<HTMLDivElement>(null); // Ref для области чата (для анимаций)
  const fetchingTicketIdRef = useRef<string | null>(null);
  const loadedMessagesRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef<boolean>(true);
  const activeTicketMessagesRef = useRef<Message[]>([]); // Ref для актуальных сообщений активного тикета
  const activeTicketRef = useRef<Ticket | null>(null); // Ref для актуального activeTicket в обработчиках WebSocket (избегаем переподписок при каждом обновлении сообщений)
  activeTicketRef.current = activeTicket;

  const {
    showRateLimitCaptcha,
    sidebarCollapsed,
    showFileUploadModal,
    uploadedFiles,
    filePreviews,
    fileErrors,
    viewingImage,
  } = state;

  const isCaptchaOpenRef = useRef(false);
  const lastShownErrorRef = useRef<string | null>(null);

  const setShowRateLimitCaptcha = useCallback(
    (val: boolean) => dispatch({ type: 'SET_SHOW_RATE_LIMIT_CAPTCHA', payload: val }),
    [dispatch],
  );

  const setSidebarCollapsed = useCallback(
    (val: boolean | ((prev: boolean) => boolean)) => {
      const currentVal = stateRef.current.sidebarCollapsed;
      const newVal = typeof val === 'function' ? val(currentVal) : val;
      dispatch({ type: 'SET_SIDEBAR_COLLAPSED', payload: newVal });
    },
    [dispatch],
  );

  const setShowFileUploadModal = useCallback(
    (val: boolean) => dispatch({ type: 'SET_SHOW_FILE_UPLOAD_MODAL', payload: val }),
    [dispatch],
  );
  const setUploadedFiles = useCallback(
    (val: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      const currentVal = stateRef.current.uploadedFiles;
      const newVal = typeof val === 'function' ? val(currentVal) : val;
      dispatch({ type: 'SET_UPLOADED_FILES', payload: newVal });
    },
    [dispatch],
  );

  const setFilePreviews = useCallback(
    (val: Map<string, string> | ((prev: Map<string, string>) => Map<string, string>)) => {
      const currentVal = stateRef.current.filePreviews;
      const newVal = typeof val === 'function' ? val(currentVal) : val;
      dispatch({ type: 'SET_FILE_PREVIEWS', payload: newVal });
    },
    [dispatch],
  );

  const setFileErrors = useCallback(
    (val: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const currentVal = stateRef.current.fileErrors;
      const newVal = typeof val === 'function' ? val(currentVal) : val;
      dispatch({ type: 'SET_FILE_ERRORS', payload: newVal });
    },
    [dispatch],
  );

  const setViewingImage = useCallback(
    (val: { url: string; alt: string } | null) =>
      dispatch({ type: 'SET_VIEWING_IMAGE', payload: val }),
    [dispatch],
  );

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined')
        localStorage.setItem('support_sidebar_collapsed', String(next));
      return next;
    });
  }, [setSidebarCollapsed]);

  // Init sidebarCollapsed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('support_sidebar_collapsed');
      if (cached !== null) {
        setSidebarCollapsed(cached === 'true');
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Загружаем превью для изображений после загрузки файлов
  useEffect(() => {
    uploadedFiles.forEach((file) => {
      if (
        file.fileType.startsWith('image/') &&
        !filePreviews.has(file.storageUrl) &&
        !fileErrors.has(file.storageUrl)
      ) {
        // Превью уже есть в storageUrl, просто добавляем в Map
        setFilePreviews((prev) => new Map(prev).set(file.storageUrl, file.storageUrl));
      }
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFiles]);
  const rateLimitRetriesRef = useRef<Array<() => void>>([]);
  const isProcessingCaptchaRef = useRef(false);
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Лимиты символов (используем константы из lib/constants.ts)

  // Функции кэширования сообщений
  const CACHE_PREFIX = 'support_messages_';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

  const getCacheKey = (ticketId: string) => `${CACHE_PREFIX}${ticketId}`;

  const saveMessagesToCache = useCallback((ticketId: string, messages: Message[]) => {
    if (typeof window === 'undefined') return;

    try {
      // Don't cache optimistic/pending messages — they have temp IDs and may lack server data
      const persistableMessages = messages.filter((m) => !m.isPending && !m.id.startsWith('temp-'));
      const cacheData = {
        messages: persistableMessages,
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

      const cacheData = JSON.parse(cached) as {
        timestamp: number;
        messages?: Array<Message & { timestamp?: Date | string }>;
      };
      const age = Date.now() - cacheData.timestamp;

      // Проверяем TTL
      if (age > CACHE_TTL_MS) {
        localStorage.removeItem(getCacheKey(ticketId));
        return null;
      }

      const messages: Message[] = (cacheData.messages || []).map((msg) => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp ?? 0),
      }));

      return messages;
    } catch {
      // Игнорируем ошибки парсинга
      localStorage.removeItem(getCacheKey(ticketId));
      return null;
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsub = onRateLimited((retry) => {
      rateLimitRetriesRef.current.push(retry);
      if (!isCaptchaOpenRef.current && !isProcessingCaptchaRef.current) {
        isCaptchaOpenRef.current = true;
        dispatch({ type: 'SET_SHOW_RATE_LIMIT_CAPTCHA', payload: true });
      }
    });
    return unsub;
  }, [dispatch]);

  const handleRateLimitSuccess = useCallback(async () => {
    isProcessingCaptchaRef.current = true;
    isCaptchaOpenRef.current = false;
    dispatch({ type: 'SET_SHOW_RATE_LIMIT_CAPTCHA', payload: false });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const retries = [...rateLimitRetriesRef.current];
    rateLimitRetriesRef.current = [];
    for (const retry of retries) {
      retry();
    }

    isProcessingCaptchaRef.current = false;
  }, [dispatch]);

  const utils = trpc.useUtils();
  const {
    data: ticketsData,
    isLoading: ticketsSwrLoading,
    error: ticketsSwrError,
  } = trpc.support.tickets.list.useQuery(
    { status: 'all', forUser: 'true' },
    { enabled: !!userData, staleTime: 30_000, refetchOnWindowFocus: true },
  );
  const createTicketMutation = trpc.support.tickets.create.useMutation({
    onSuccess: () => utils.support.tickets.list.invalidate(),
  });
  const sendMessageMutation = trpc.support.tickets.sendMessage.useMutation();
  const markAsReadMutation = trpc.support.tickets.markAsRead.useMutation();
  const markNotifGroupReadMutation = trpc.notification.markGroupRead.useMutation({
    onSuccess: () => utils.notification.unreadCount.invalidate(),
  });

  useEffect(() => {
    if (activeTicket?.id) {
      markNotifGroupReadMutation.mutate({ relatedTicketId: activeTicket.id });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id]);

  const hasRestoredLastTicketRef = useRef(false);

  // Функция для показа notification
  const showNotification = useCallback(
    (message: string, type: 'error' | 'info' = 'error') => {
      setNotification({ message, show: true, type });
      setTimeout(() => {
        // Анимация исчезновения
        if (notificationRef.current) {
          gsap.to(notificationRef.current, {
            opacity: 0,
            y: -10,
            scale: 0.95,
            duration: GSAP_DEFAULT_DURATION * 0.6,
            ease: 'power2.in',
            onComplete: () => {
              setNotification({ message: '', show: false });
            },
          });
        } else {
          setNotification({ message: '', show: false });
        }
      }, 3000);
    },
    [setNotification],
  );

  // Синхронизация tRPC → reducer
  useEffect(() => {
    if (stateRef.current.ticketsLoading !== ticketsSwrLoading) {
      setTicketsLoading(ticketsSwrLoading);
    }

    if (ticketsSwrError) {
      const errorMessage = translateError(ticketsSwrError.message) || 'Ошибка загрузки обращений';
      if (lastShownErrorRef.current !== errorMessage) {
        showNotification(errorMessage);
        lastShownErrorRef.current = errorMessage;
      }
      return;
    } else {
      lastShownErrorRef.current = null;
    }

    if (!ticketsData?.tickets) return;

    const mappedTickets = mapApiTicketsToState(ticketsData.tickets);

    const currentTickets = stateRef.current.tickets;
    const hasChanged = JSON.stringify(mappedTickets) !== JSON.stringify(currentTickets);

    if (hasChanged) {
      setTickets(mappedTickets);
      if (typeof window !== 'undefined') {
        const count = mappedTickets.length;
        localStorage.setItem('support_tickets_count', count.toString());
        if (stateRef.current.skeletonCount !== count) {
          setSkeletonCount(count === 0 ? null : count);
        }
      }
    }
  }, [
    ticketsData,
    ticketsSwrLoading,
    ticketsSwrError,
    setTicketsLoading,
    setTickets,
    setSkeletonCount,
    showNotification,
  ]);

  // Анимация появления уведомления
  useEffect(() => {
    if (notification.show && notificationRef.current) {
      gsap.fromTo(
        notificationRef.current,
        { opacity: 0, y: 20, scale: 0.9 },
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

  // Закрытие модального окна создания тикета по Escape
  useEffect(() => {
    if (!showCreateTicketModal) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCreateTicketModal(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateTicketModal]);

  // Функция для анимации тряски с GSAP
  const triggerShake = (inputType: 'message' | 'subject') => {
    if (typeof window === 'undefined') return;

    const inputElement =
      inputType === 'message'
        ? messageTextareaRef.current || messageInputRef.current
        : subjectInputRef.current;
    if (!inputElement) return;

    const tl = gsap.timeline();
    tl.to(inputElement, { x: -3, duration: 0.05, ease: 'power2.out' })
      .to(inputElement, { x: 3, duration: 0.05, ease: 'power2.out' })
      .to(inputElement, { x: -2, duration: 0.05, ease: 'power2.out' })
      .to(inputElement, { x: 2, duration: 0.05, ease: 'power2.out' })
      .to(inputElement, { x: -1, duration: 0.05, ease: 'power2.out' })
      .to(inputElement, { x: 1, duration: 0.05, ease: 'power2.out' })
      .to(inputElement, { x: 0, duration: 0.05, ease: 'power2.out' });
  };

  // Инициализация WebSocket
  // ВАЖНО: Токен передается только после загрузки userData для предотвращения преждевременных подключений
  // Токен хранится только в памяти компонента, не в localStorage/sessionStorage для безопасности
  const { socket, isConnected: isWebSocketConnected } = useWebSocket({
    enabled: !!userData && !!userData.token,
    userId: userData?.id,
    ticketId: activeTicket?.id,
    isSupport: false,
    token: userData?.token, // Передаем токен для аутентификации WebSocket
  });

  const markMessagesAsRead = useCallback(async (ticketId: string) => {
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
      markReadTimeoutRef.current = null;
    }

    markReadTimeoutRef.current = setTimeout(async () => {
      markReadTimeoutRef.current = null;
      try {
        await markAsReadMutation.mutateAsync({ ticketId });
      } catch {
        // Rate limits handled by rateLimitLink
      }
    }, MARK_AS_READ_DEBOUNCE);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = null;
      }
    };
  }, []);

  // WebSocket: присоединение/отсоединение от тикета теперь обрабатывается автоматически в useWebSocket
  // Очищаем ref при изменении активного тикета
  useEffect(() => {
    if (!activeTicket) {
      activeTicketMessagesRef.current = [];
    }
  }, [activeTicket]);

  // WebSocket: always-on handler for ticket list updates (subscribed even when no activeTicket)
  useEffect(() => {
    if (!socket) return;

    const handleNewMessageGlobal = (data: BroadcastMessagePayload) => {
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
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      setTickets((prev) =>
        prev.map((t) => (t.id === data.ticketId ? { ...t, last_message: lastMessageData } : t)),
      );
    };

    const handleTicketUpdateGlobal = (data: BroadcastTicketUpdatePayload) => {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === data.ticketId
            ? {
                ...t,
                status: data.ticket.status,
                updated_at: data.ticket.updated_at || t.updated_at,
              }
            : t,
        ),
      );
    };

    socket.on('support:message:new', handleNewMessageGlobal);
    socket.on('support:ticket:updated', handleTicketUpdateGlobal);

    return () => {
      socket.off('support:message:new', handleNewMessageGlobal);
      socket.off('support:ticket:updated', handleTicketUpdateGlobal);
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // WebSocket: active ticket message handlers (only when a ticket is open)
  useEffect(() => {
    if (!socket || !activeTicket) return;

    const handleNewMessage = (data: BroadcastMessagePayload) => {
      if (data.ticketId !== activeTicketRef.current?.id) return;

      const existingMessage = activeTicketMessagesRef.current.find((m) => m.id === data.message.id);

      if (existingMessage) {
        startTransition(() => {
          setActiveTicket((prev) => {
            if (!prev || prev.id !== data.ticketId) return prev;

            const updatedMessages = prev.messages.map((m) =>
              m.id === data.message.id
                ? {
                    ...m,
                    isPending: false,
                    isRead: data.message.is_read,
                    attachments: mapWsAttachments(data.message.attachments) ?? m.attachments,
                  }
                : m,
            );

            activeTicketMessagesRef.current = updatedMessages;
            saveMessagesToCache(data.ticketId, updatedMessages);

            return { ...prev, messages: updatedMessages };
          });
        });
        return;
      }

      const optimisticMatch = activeTicketMessagesRef.current.find(
        (m) =>
          m.isPending &&
          m.sender === data.message.sender_type &&
          (m.text === data.message.message_text ||
            Math.abs(new Date(data.message.created_at).getTime() - m.timestamp.getTime()) < 60_000),
      );
      if (optimisticMatch) {
        startTransition(() => {
          setActiveTicket((prev) => {
            if (!prev || prev.id !== data.ticketId) return prev;
            const updatedMessages = prev.messages.map((m) =>
              m.id === optimisticMatch.id
                ? {
                    id: data.message.id,
                    text: data.message.message_text,
                    sender: data.message.sender_type as 'user' | 'support',
                    timestamp: new Date(data.message.created_at),
                    isRead: data.message.is_read,
                    isPending: false,
                    _renderKey: optimisticMatch._renderKey ?? optimisticMatch.id,
                    senderData: data.message.sender,
                    attachments: mapWsAttachments(data.message.attachments),
                  }
                : m,
            );
            activeTicketMessagesRef.current = updatedMessages;
            saveMessagesToCache(data.ticketId, updatedMessages);
            return { ...prev, messages: updatedMessages };
          });
        });
        return;
      }

      const newMessage: Message = {
        id: data.message.id,
        text: data.message.message_text,
        sender: data.message.sender_type as 'user' | 'support',
        timestamp: new Date(data.message.created_at),
        isRead: data.message.is_read,
        senderData: data.message.sender,
        attachments: mapWsAttachments(data.message.attachments),
      };

      startTransition(() => {
        setActiveTicket((prev) => {
          if (!prev || prev.id !== data.ticketId) return prev;
          if (prev.messages.some((m) => m.id === data.message.id)) return prev;

          const updatedMessages = [...(prev.messages || []), newMessage];
          activeTicketMessagesRef.current = updatedMessages;
          saveMessagesToCache(data.ticketId, updatedMessages);

          return { ...prev, messages: updatedMessages };
        });
      });

      void utils.support.tickets.get.invalidate({ ticketId: data.ticketId });

      markMessagesAsRead(data.ticketId);
    };

    const handleTicketUpdate = (data: BroadcastTicketUpdatePayload) => {
      if (data.ticketId !== activeTicketRef.current?.id) return;

      setActiveTicket((prev) => {
        if (!prev || prev.id !== data.ticketId) return prev;
        return { ...prev, status: data.ticket.status };
      });
    };

    const handleMessageRead = (data: BroadcastMessageReadPayload) => {
      if (data.ticketId !== activeTicketRef.current?.id) return;

      setActiveTicket((prev) => {
        if (!prev || prev.id !== data.ticketId) return prev;
        const messageIds = data.messageIds || [];
        return {
          ...prev,
          messages: (prev.messages || []).map((msg) =>
            messageIds.includes(msg.id) ? { ...msg, isRead: true } : msg,
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, activeTicket?.id, markMessagesAsRead]);

  // Анимация появления/исчезновения формы создания тикета
  useEffect(() => {
    if (typeof window === 'undefined' || !newTicketFormRef.current) return;

    if (showNewTicketForm) {
      gsap.fromTo(
        newTicketFormRef.current,
        { opacity: 0, y: -10, height: 0, marginBottom: 0, overflow: 'hidden' },
        {
          opacity: 1,
          y: 0,
          height: 'auto',
          marginBottom: '1rem',
          overflow: 'visible',
          duration: 0.3,
          ease: 'power2.out',
        },
      );
    } else {
      gsap.to(newTicketFormRef.current, {
        opacity: 0,
        y: -10,
        height: 0,
        marginBottom: 0,
        overflow: 'hidden',
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => {
          setNewTicketSubject('');
          setNewTicketMessage('');
        },
      });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewTicketForm]);

  // Анимация перехода между чатами
  // Убрали GSAP анимацию для плавной смены тикетов без дерганий

  // Загрузка сообщений при выборе тикета - удалено, так как вызывается явно при клике

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
      return messages.map((m) => `${m.id}-${m.created_at}`).join('|');
    };

    const checkForNewMessages = async () => {
      if (document.hidden) return;

      try {
        const data = await utils.support.tickets.get.fetch({
          ticketId: activeTicket.id,
          limit: 100,
          offset: 0,
        });

        if (data.ticket && data.messages) {
          const currentMessageCount = data.messages.length;
          const currentMessagesHash = hashMessages(data.messages);

          // Обновляем статус тикета (может измениться в панели поддержки)
          const statusChanged = activeTicket.status !== data.ticket.status;

          // Проверяем переход между активными и архивными статусами
          const wasActive = activeTicket.status === 'open' || activeTicket.status === 'pending';
          const isNowActive = data.ticket.status === 'open' || data.ticket.status === 'pending';
          const statusCategoryChanged = wasActive !== isNowActive;

          // Обновляем только если появились новые сообщения, изменился статус или хэш сообщений
          if (
            currentMessageCount > lastMessageCount ||
            statusChanged ||
            currentMessagesHash !== lastMessagesHash
          ) {
            const mappedMessages = data.messages.map(
              (m: {
                id: string;
                message_text: string;
                sender_type: string;
                created_at: string;
                is_read: boolean;
                sender?: {
                  id: string;
                  username: string;
                  user_id: string | null;
                  avatar?: string | null;
                } | null;
                attachments?: Array<{
                  id: string;
                  file_name: string;
                  file_type: string;
                  file_size: number;
                  storage_path?: string;
                  storage_url?: string;
                  blur_hash?: string | null;
                  width?: number | null;
                  height?: number | null;
                }>;
              }) => ({
                id: m.id,
                text: m.message_text,
                sender: m.sender_type as 'user' | 'support',
                timestamp: new Date(m.created_at),
                isRead: m.is_read ?? false,
                senderData: m.sender
                  ? {
                      id: m.sender.id,
                      username: m.sender.username,
                      user_id: m.sender.user_id,
                      avatar: m.sender.avatar || null,
                    }
                  : undefined,
                attachments: mapWsAttachments(m.attachments) ?? [],
              }),
            );

            // Отмечаем новые сообщения (которые еще не были загружены)
            mappedMessages.forEach((m: { id: string }) => {
              if (!loadedMessagesRef.current.has(m.id)) {
                loadedMessagesRef.current.add(m.id);
              }
            });

            setActiveTicket({
              ...activeTicket,
              status: data.ticket.status, // Обновляем статус
              messages: mappedMessages,
            });
            lastMessageCount = currentMessageCount;
            lastMessagesHash = currentMessagesHash;

            if (statusChanged || statusCategoryChanged) {
              utils.support.tickets.list.invalidate();
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
      lastMessagesHash = hashMessages(
        activeTicket.messages.map((m) => ({
          id: m.id,
          created_at: m.timestamp.toISOString(),
        })),
      );
    }

    // Polling как safety net: 60s при активном WS, 15s без WS
    const pollInterval = isWebSocketConnected && socket?.connected ? 60000 : 15000;
    interval = setInterval(checkForNewMessages, pollInterval);

    // Отмечаем сообщения как прочитанные при открытии тикета
    markMessagesAsRead(activeTicket.id);

    return () => {
      if (interval) clearInterval(interval);
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id, userData, activeTicket?.status, isWebSocketConnected, socket?.connected]);

  // Автопрокрутка к последнему сообщению только для новых сообщений (не при первой загрузке)
  useEffect(() => {
    if (
      !activeTicket?.messages ||
      activeTicket.messages.length === 0 ||
      isRestoringScrollRef.current
    )
      return;

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

    const done = () => {
      isRestoringScrollRef.current = false;
      setScrollRestored(true);
    };

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
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
            setTimeout(done, 200);
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
              setTimeout(done, 200);
            });
          });
        } else {
          done();
        }
      }
    };

    // Ждем загрузки всех изображений перед восстановлением позиции
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

  // Сбрасываем флаг видимости при смене тикета, чтобы не показывать контент до восстановления скролла
  useEffect(() => {
    if (activeTicket?.id) setScrollRestored(false);
  }, [activeTicket?.id]);

  // Fallback: показываем контент через 800ms, если восстановление скролла не сработало
  useEffect(() => {
    if (!activeTicket?.messages?.length || scrollRestored) return;
    const t = setTimeout(() => setScrollRestored(true), 800);
    return () => clearTimeout(t);
  }, [activeTicket?.messages?.length, scrollRestored]);

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
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
      { rootMargin: '100px' }, // Начинаем загрузку за 100px до появления индикатора
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
      const createResult = await createTicketMutation.mutateAsync({
        subject: newTicketSubject.trim(),
        message: newTicketMessage.trim(),
      });

      if (createResult.ticket) {
        setActiveTicket(null);
        fetchingTicketIdRef.current = null;

        setMessagesSentCount(0);
        setLastMessageTime(null);
        setTimeoutSeconds(0);

        const ticketDetail = await utils.support.tickets.get.fetch({
          ticketId: createResult.ticket.id,
          limit: 100,
          offset: 0,
        });

        if (ticketDetail.ticket) {
          fetchingTicketIdRef.current = createResult.ticket.id;
          setActiveTicket({
            id: ticketDetail.ticket.id,
            subject: ticketDetail.ticket.subject,
            status: ticketDetail.ticket.status,
            createdAt: new Date(ticketDetail.ticket.created_at),
            user_id: ticketDetail.ticket.user_id,
            messages: (ticketDetail.messages || []).map(
              (m: {
                id: string;
                message_text: string;
                sender_type: string;
                created_at: string;
                is_read: boolean;
                sender?: {
                  id: string;
                  username: string;
                  user_id: string | null;
                  avatar?: string | null;
                } | null;
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
                sender: m.sender_type as 'user' | 'support',
                timestamp: new Date(m.created_at),
                isRead: m.is_read ?? false,
                senderData: m.sender
                  ? {
                      id: m.sender.id,
                      username: m.sender.username,
                      user_id: m.sender.user_id,
                      avatar: m.sender.avatar || null,
                    }
                  : undefined,
                attachments: m.attachments || [],
              }),
            ),
          });

          if (typeof window !== 'undefined') {
            localStorage.setItem('support_last_ticket_id', createResult.ticket.id);
          }

          markMessagesAsRead(createResult.ticket.id);
        }
        setNewTicketSubject('');
        setNewTicketMessage('');
        setShowNewTicketForm(false);
        setShowCreateTicketModal(false);
        showNotification('Обращение создано', 'info');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка создания обращения';
      showNotification(translateError(errorMessage));
      if (
        errorMessage.toLowerCase().includes('limit') ||
        errorMessage.toLowerCase().includes('лимит')
      ) {
        triggerShake('subject');
      }
    } finally {
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
    if (
      isSupport &&
      activeTicket.user_id &&
      userData?.id &&
      (activeTicket.user_id === userData.id || activeTicket.user_id === userData.user_id)
    ) {
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

    let tempId: string | null = null;

    try {
      // Invalidate cached CSRF token then fetch a fresh one so the token
      // matches the current session_id cookie (session may have rotated after login/register).
      await utils.auth.csrf.invalidate();
      const csrfResult = await utils.auth.csrf.fetch({ scope: 'user' });
      const csrfToken = csrfResult?.csrfToken ?? '';
      if (!csrfToken) {
        showNotification(translateError('Ошибка загрузки. Обновите страницу.'), 'error');
        return;
      }

      // Разделяем файлы на изображения и документы
      const images = uploadedFiles.filter((f) => f.fileType.startsWith('image/'));
      const documents = uploadedFiles.filter((f) => !f.fileType.startsWith('image/'));

      // Если есть и документы, и изображения - отправляем отдельными сообщениями
      if (documents.length > 0 && images.length > 0) {
        if (messageText.trim() || images.length > 0) {
          await sendMessageMutation.mutateAsync({
            ticketId: activeTicket.id,
            message: messageText.trim() || '',
            csrfToken,
            attachments: images.length > 0 ? images : undefined,
          });
        }

        for (const doc of documents) {
          await sendMessageMutation.mutateAsync({
            ticketId: activeTicket.id,
            message: '',
            csrfToken,
            attachments: [doc],
          });
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

      const sentText = messageText.trim();
      const sentFiles = [...uploadedFiles];
      tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Оптимистичное сообщение: показываем в UI до ответа сервера
      const optimisticMessage: Message = {
        id: tempId,
        text: sentText,
        sender: 'user' as const,
        timestamp: new Date(),
        isRead: false,
        isPending: true,
        senderData: userData
          ? {
              id: userData.id,
              username: userData.username,
              user_id: userData.user_id,
            }
          : undefined,
        attachments:
          sentFiles.length > 0
            ? sentFiles.map((f, idx) => ({
                id: `temp-att-${idx}`,
                file_name: f.fileName,
                file_type: f.fileType,
                file_size: f.fileSize,
                storage_url: f.storageUrl,
                blur_hash: f.blur_hash ?? undefined,
                width: f.width ?? undefined,
                height: f.height ?? undefined,
              }))
            : [],
      };

      const optimisticWithKey = { ...optimisticMessage, _renderKey: tempId ?? undefined };
      // Синхронное обновление ref — WS может прийти до flush React, optimisticMatch должен найти сообщение
      activeTicketMessagesRef.current = [
        ...(activeTicketMessagesRef.current || []),
        optimisticWithKey,
      ];
      setActiveTicket((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...(prev.messages || []), optimisticWithKey],
        };
      });
      // Не добавляем tempId в loadedMessagesRef — тогда эффект автопрокрутки сработает на «новое» сообщение

      const optimisticLastMessageText =
        sentText || (sentFiles.length > 0 ? getLastMessageLabelForAttachments(sentFiles) : '');
      setTickets((prev) =>
        prev.map((t) =>
          t.id === activeTicket.id
            ? {
                ...t,
                last_message: {
                  id: tempId ?? '',
                  message_text: optimisticLastMessageText,
                  sender_type: 'user' as const,
                  created_at: optimisticMessage.timestamp.toISOString(),
                  is_read: false,
                },
                last_message_at: optimisticMessage.timestamp.toISOString(),
              }
            : t,
        ),
      );

      setMessageText('');
      setUploadedFiles([]);
      setFilePreviews(new Map());
      setFileErrors(new Set());
      const newCount = messagesSentCount + 1;
      setMessagesSentCount(newCount);
      if (newCount >= 2) {
        setLastMessageTime(Date.now());
        setTimeoutSeconds(MESSAGE_TIMEOUT / 1000);
      }

      // Прокрутка вниз при отправке своего сообщения (после коммита DOM)
      if (typeof window !== 'undefined' && activeTicket.id) {
        localStorage.setItem(`support_scroll_${activeTicket.id}`, 'bottom');
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (messagesEndRef.current && !isRestoringScrollRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        });
      });

      const data = await sendMessageMutation.mutateAsync({
        ticketId: activeTicket.id,
        message: sentText,
        csrfToken,
        attachments: sentFiles.length > 0 ? sentFiles : undefined,
      });

      if (data.message) {
        loadedMessagesRef.current.delete(tempId);
        loadedMessagesRef.current.add(data.message.id);

        setActiveTicket((prev) => {
          if (!prev) return prev;
          const serverMessageMerged = {
            id: data.message.id,
            text: optimisticMessage.text,
            sender: 'user' as const,
            timestamp: optimisticMessage.timestamp,
            isRead: false,
            isPending: false,
            _renderKey: tempId ?? data.message.id,
            senderData: userData
              ? { id: userData.id, username: userData.username, user_id: userData.user_id }
              : undefined,
            attachments:
              mapWsAttachments(data.message.attachments) ?? optimisticMessage.attachments,
          };
          // Убираем оптимистичное (tempId), любой дубликат по data.message.id (мог прийти по WS),
          // и сообщения с _renderKey === tempId (WS мог заменить id, но сохранить _renderKey)
          const withoutOptimisticAndDuplicate = (prev.messages || []).filter(
            (m) => m.id !== tempId && m.id !== data.message.id && m._renderKey !== tempId,
          );
          const updatedMessages = [...withoutOptimisticAndDuplicate, serverMessageMerged];
          activeTicketMessagesRef.current = updatedMessages;
          saveMessagesToCache(activeTicket.id, updatedMessages);
          return { ...prev, messages: updatedMessages };
        });

        setTickets((prev) =>
          prev.map((t) =>
            t.id === activeTicket.id
              ? {
                  ...t,
                  last_message: {
                    id: data.message.id,
                    message_text: optimisticLastMessageText,
                    sender_type: 'user' as const,
                    created_at: optimisticMessage.timestamp.toISOString(),
                    is_read: false,
                  },
                  last_message_at: optimisticMessage.timestamp.toISOString(),
                }
              : t,
          ),
        );

        markMessagesAsRead(activeTicket.id);

        void utils.support.tickets.list.invalidate();
        void utils.support.tickets.get.invalidate({ ticketId: activeTicket.id });
      }
    } catch (error) {
      // Откат оптимистичного сообщения при ошибке
      if (tempId) {
        setActiveTicket((prev) => {
          if (!prev) return prev;
          const filtered = (prev.messages || []).filter((m) => m.id !== tempId);
          if (filtered.length === prev.messages?.length) return prev;
          activeTicketMessagesRef.current = filtered;
          return { ...prev, messages: filtered };
        });
        setTickets((prev) =>
          prev.map((t) => {
            if (t.id !== activeTicket.id) return t;
            const prevLast = t.last_message;
            if (!prevLast || prevLast.id !== tempId) return t;
            const prevMessages = stateRef.current.activeTicket?.messages ?? [];
            const lastReal = prevMessages.filter((m) => m.id !== tempId).pop();
            return {
              ...t,
              last_message: lastReal
                ? {
                    id: lastReal.id,
                    message_text: lastReal.text,
                    sender_type: 'user' as const,
                    created_at: lastReal.timestamp.toISOString(),
                    is_read: lastReal.isRead ?? false,
                  }
                : undefined,
            };
          }),
        );
        loadedMessagesRef.current.delete(tempId);
      }
      const errorMessage = error instanceof Error ? error.message : 'Ошибка отправки сообщения';
      showNotification(translateError(errorMessage));
    } finally {
      setIsSendingMessage(false);
    }
  };

  const fetchTicketMessages = useCallback(
    async (
      ticketId: string,
      limit: number = 25,
      offset: number = 0,
      restoreScroll: boolean = false,
    ) => {
      return debugPerformanceAsync('fetchTicketMessages', async () => {
        // Предотвращаем дублирующиеся запросы
        if (fetchingTicketIdRef.current === ticketId && !restoreScroll) {
          debugStart('fetchTicketMessages', { ticketId, reason: 'duplicate_request' });
          return;
        }

        // Suppress entrance animation for batch-loaded messages
        if (offset === 0) {
          initialLoadRef.current = true;
        }

        // Загружаем кэшированные сообщения для мгновенного отображения (только для первой загрузки)
        let cachedMessages: Message[] | null = null;
        if (offset === 0) {
          cachedMessages = loadMessagesFromCache(ticketId);
          if (cachedMessages && cachedMessages.length > 0) {
            // Обновляем сообщения из кэша
            setActiveTicket((prev) => {
              if (prev && prev.id === ticketId) {
                return {
                  ...prev,
                  messages: cachedMessages || [],
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

          const data = await utils.support.tickets.get.fetch({
            ticketId,
            limit,
            offset,
          });

          if (data) {
            // Маппим сообщения с вложениями (оптимизировано - используем данные с сервера)
            const mappedMessages = (data.messages || []).map(
              (m: {
                id: string;
                message_text: string;
                sender_type: string;
                created_at: string;
                is_read: boolean;
                sender?: {
                  id: string;
                  username: string;
                  user_id: string | null;
                  avatar?: string | null;
                } | null;
                attachments?: Array<{
                  id: string;
                  file_name: string;
                  file_type: string;
                  file_size: number;
                  storage_url: string;
                  storage_path?: string;
                  blur_hash?: string | null;
                  width?: number | null;
                  height?: number | null;
                }>;
              }) => ({
                id: m.id,
                text: m.message_text,
                sender: m.sender_type as 'user' | 'support',
                timestamp: new Date(m.created_at),
                isRead: m.is_read ?? false,
                senderData: m.sender
                  ? {
                      id: m.sender.id,
                      username: m.sender.username,
                      user_id: m.sender.user_id,
                      avatar: m.sender.avatar || null,
                    }
                  : undefined,
                attachments: mapWsAttachments(m.attachments),
              }),
            );

            // Проверяем, что тикет все еще активный (не изменился во время запроса)
            setActiveTicket((prev) => {
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
                const existingIds = new Set((prev?.messages || []).map((m) => m.id));
                const newOlderMessages = mappedMessages.filter(
                  (m: { id: string }) => !existingIds.has(m.id),
                );
                finalMessages = [
                  ...newOlderMessages,
                  ...(prev?.messages || []),
                ] as typeof mappedMessages;
                setLoadedMessageCount((prev) => prev + newOlderMessages.length);
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
                messages: finalMessages,
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

              // Reset the initial-load flag after messages have rendered so
              // subsequent messages arriving via WS get the entrance animation.
              if (offset === 0) {
                requestAnimationFrame(() => {
                  initialLoadRef.current = false;
                });
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
              hasMore: mappedMessages.length >= limit,
            });
          }
        } catch (error) {
          if (!restoreScroll) {
            fetchingTicketIdRef.current = null;
          }
          debugError('fetchTicketMessages', { ticketId, error });
          showNotification('Ошибка загрузки сообщений');
        }
      });
    },
    [
      loadMessagesFromCache,
      setActiveTicket,
      restoreScrollPosition,
      utils,
      setLoadedMessageCount,
      setHasMoreMessages,
      saveMessagesToCache,
      markMessagesAsRead,
      showNotification,
    ],
  );

  // Загрузка последнего тикета из localStorage (один раз)
  useEffect(() => {
    if (!ticketsData?.tickets || hasRestoredLastTicketRef.current || activeTicket) return;

    const mappedTickets = mapApiTicketsToState(ticketsData.tickets);
    if (mappedTickets.length > 0) {
      const lastTicketId = localStorage.getItem('support_last_ticket_id');
      if (lastTicketId) {
        const lastTicket = mappedTickets.find((t: Ticket) => t.id === lastTicketId);
        if (lastTicket) {
          hasRestoredLastTicketRef.current = true;
          setTimeout(() => {
            setActiveTicket(lastTicket);
            fetchTicketMessages(lastTicket.id, 25, 0, true);
          }, 50);
        }
      }
    }
  }, [ticketsData, activeTicket, setActiveTicket, fetchTicketMessages]);

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
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
        month: 'long',
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
      minute: '2-digit',
    });
    return `${day}.${month}.${year}, ${time}`;
  };

  if (loading) {
    return <SupportLoadingState />;
  }

  if (!userData) {
    return <SupportUnauthorizedState />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      <div className="hidden lg:block">
        <Header />
      </div>

      <ConnectionBanner isConnected={isWebSocketConnected} />

      {/* Main Content */}
      <main
        className={`min-h-0 flex-1 overflow-hidden pt-4 lg:pt-32 ${activeTicket ? 'pb-0.5 sm:pb-4' : 'pb-4'}`}
      >
        <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden px-3 sm:px-4 lg:px-8">
          <div className="mb-4 hidden lg:mb-8 lg:block">
            <p className="text-lg text-neutral-400">
              Обратитесь в службу поддержки. Создайте новое обращение или выберите существующее для
              продолжения диалога.
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-6 lg:flex-row">
            {/* Левая панель: на ПК при свёрнутом виде — узкая панель с номерами; иначе — полный список (на мобильном всегда список) */}
            <div
              className={`flex min-h-0 flex-col overflow-hidden transition-all duration-300 ease-in-out ${activeTicket ? 'hidden lg:flex' : 'flex'} ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-1/3'}`}
            >
              {sidebarCollapsed && (
                <div className="hidden w-16 flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 lg:flex">
                  <button
                    type="button"
                    onClick={toggleSidebarCollapsed}
                    className="flex-shrink-0 border-b border-white/10 p-2.5 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
                    title="Показать список тикетов"
                    aria-label="Показать список тикетов"
                  >
                    <PanelLeft className="mx-auto h-5 w-5" />
                  </button>
                  <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto overscroll-contain py-1">
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
                            messages: [],
                          };
                          setActiveTicket(ticketData);
                          if (typeof window !== 'undefined')
                            localStorage.setItem('support_last_ticket_id', ticket.id);
                          setMessagesSentCount(0);
                          setLastMessageTime(null);
                          setTimeoutSeconds(0);
                          await fetchTicketMessages(ticket.id, 25, 0, true);
                        }}
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
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
                      className="mx-auto mb-2 mt-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-600 text-white transition-colors hover:bg-neutral-500 disabled:bg-neutral-700 disabled:text-neutral-500"
                      title="Создать тикет"
                      aria-label="Создать тикет"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
              <div
                className={`flex min-w-[300px] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 p-2 sm:p-4 ${sidebarCollapsed ? 'lg:hidden' : ''}`}
              >
                <div className="mb-2 flex flex-shrink-0 items-center justify-between gap-2 pl-1 sm:mb-4 sm:pl-0">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSidebarCollapsed}
                      className="hidden flex-shrink-0 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white lg:flex"
                      title={
                        sidebarCollapsed
                          ? 'Показать список тикетов'
                          : 'Свернуть в панель с номерами'
                      }
                      aria-label={
                        sidebarCollapsed ? 'Показать список тикетов' : 'Свернуть список тикетов'
                      }
                    >
                      {sidebarCollapsed ? (
                        <PanelLeft className="h-5 w-5" />
                      ) : (
                        <PanelLeftClose className="h-5 w-5" />
                      )}
                    </button>
                    <TicketIcon className="h-5 w-5 flex-shrink-0 text-neutral-400 sm:hidden" />
                    <h2 className="truncate text-base font-semibold sm:text-lg">Мои тикеты</h2>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => {
                        if (activeTicketsCount >= MAX_TICKETS_PER_USER) {
                          alert('Вы можете создать максимум 2 активных обращения');
                          return;
                        }
                        setShowNewTicketForm(!showNewTicketForm);
                      }}
                      disabled={activeTicketsCount >= MAX_TICKETS_PER_USER || isSupport}
                      className="hidden rounded-lg bg-primary-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500 lg:block"
                      title={
                        isSupport ? 'Создание тикетов недоступно для сотрудников поддержки' : ''
                      }
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
                        showNotification(
                          `Максимальная длина темы: ${TICKET_SUBJECT_MAX_LENGTH} символов`,
                        );
                        triggerShake('subject');
                      }}
                      onMaxMessageLengthExceeded={() => {
                        showNotification(
                          `Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`,
                        );
                        triggerShake('message');
                      }}
                      variant="inline"
                      isVisible={showNewTicketForm}
                    />
                  </div>
                )}

                <div className="support-tickets-list flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:flex">
                  {ticketsLoading ? (
                    skeletonCount === null ? (
                      // Если последний раз тикетов не было, не показываем скелетоны
                      <div className="py-8 text-center text-sm text-neutral-400">Загрузка...</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <TicketSkeleton count={skeletonCount} variant="user" />
                      </div>
                    )
                  ) : tickets.length === 0 ? (
                    <div className="py-8 text-center text-sm text-neutral-400">
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
                              messages: [],
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

                {/* Mobile "+" button below ticket list */}
                {!isSupport && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeTicketsCount >= MAX_TICKETS_PER_USER) {
                        alert('Вы можете создать максимум 2 активных обращения');
                        return;
                      }
                      setShowNewTicketForm(!showNewTicketForm);
                    }}
                    disabled={activeTicketsCount >= MAX_TICKETS_PER_USER}
                    className="mx-auto mt-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition-colors hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500 lg:hidden"
                    title="Создать тикет"
                    aria-label="Создать тикет"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Чат — при свёрнутой панели занимает почти весь экран на ПК */}
            <div
              className={`flex min-h-0 flex-1 flex-col ${activeTicket ? 'flex' : 'hidden lg:flex'}`}
            >
              <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900">
                {activeTicket ? (
                  <>
                    <div
                      ref={chatAreaRef}
                      className="flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity duration-200"
                    >
                      <ChatHeader
                        ticket={activeTicket}
                        sidebarCollapsed={sidebarCollapsed}
                        onToggleSidebar={toggleSidebarCollapsed}
                        onBack={() => setActiveTicket(null)}
                        formatDateShort={formatDateShort}
                      />

                      <div
                        ref={messagesContainerRef}
                        className="support-chat-messages relative min-h-0 flex-1 overflow-y-auto pb-14 lg:pb-0"
                      >
                        {ticketsLoading && (
                          <div className="absolute right-4 top-4 z-10 flex items-center gap-2 text-sm text-neutral-400">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent"></div>
                            <span>Загрузка...</span>
                          </div>
                        )}
                        <div
                          className={`flex min-h-full flex-col gap-3 p-2 transition-opacity duration-150 sm:gap-4 sm:p-4 ${scrollRestored ? 'opacity-100' : 'opacity-0'}`}
                          style={scrollRestored ? undefined : { pointerEvents: 'none' }}
                        >
                          <div key={`messages-${activeTicket.id}`} className="contents">
                            {activeTicket.messages &&
                            Array.isArray(activeTicket.messages) &&
                            activeTicket.messages.length > 0 ? (
                              <>
                                {/* Индикатор загрузки старых сообщений */}
                                {hasMoreMessages && (
                                  <div ref={messagesTopRef} className="flex justify-center py-2">
                                    {isLoadingOlderMessages ? (
                                      <div className="flex items-center gap-2 text-sm text-neutral-400">
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent"></div>
                                        <span>Загрузка старых сообщений...</span>
                                      </div>
                                    ) : (
                                      <div className="h-1" />
                                    )}
                                  </div>
                                )}
                                {activeTicket.messages.map((message, index) => {
                                  const showDate =
                                    index === 0 ||
                                    new Date(message.timestamp).getDate() !==
                                      new Date(
                                        activeTicket.messages[index - 1].timestamp,
                                      ).getDate();

                                  // Определяем, является ли это первой загрузкой тикета
                                  // Если это первая загрузка, все сообщения должны быть без анимации
                                  const isInitialLoad =
                                    initialLoadRef.current &&
                                    loadedMessagesRef.current.has(message.id);

                                  return (
                                    <MessageItem
                                      key={message._renderKey ?? message.id}
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
                              <div className="flex flex-1 items-center justify-center">
                                <p className="text-sm text-neutral-500">Опишите свою проблему</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="fixed bottom-[60px] left-0 right-0 z-[1001] border-t border-white/[0.08] bg-neutral-950/95 backdrop-blur-xl lg:static lg:border-t-0 lg:bg-neutral-900 lg:backdrop-blur-none">
                      <MessageInput
                        messageText={messageText}
                        onMessageChange={setMessageText}
                        onSend={handleSendMessage}
                        onAttachClick={() => setShowFileUploadModal(true)}
                        uploadedFiles={uploadedFiles}
                        onRemoveFile={(index) => {
                          const file = uploadedFiles[index];
                          setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
                          if (file) {
                            setFilePreviews((prev) => {
                              const newMap = new Map(prev);
                              newMap.delete(file.storageUrl);
                              return newMap;
                            });
                            setFileErrors((prev) => {
                              const newSet = new Set(prev);
                              newSet.delete(file.storageUrl);
                              return newSet;
                            });
                          }
                        }}
                        isSending={isSendingMessage}
                        timeoutSeconds={timeoutSeconds}
                        isTicketClosed={activeTicket.status === 'closed'}
                        isSupportOwnTicket={
                          isSupport &&
                          activeTicket.user_id !== undefined &&
                          userData?.id !== undefined &&
                          (activeTicket.user_id === userData.id ||
                            activeTicket.user_id === userData.user_id)
                        }
                        maxLength={MESSAGE_MAX_LENGTH}
                        onMaxLengthExceeded={() => {
                          showNotification(
                            `Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`,
                          );
                          triggerShake('message');
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800">
                        <svg
                          className="h-8 w-8 text-neutral-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
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
        <div
          ref={notificationRef}
          className="fixed left-3 right-3 top-6 z-[1000] mx-auto max-w-xs sm:bottom-4 sm:left-4 sm:right-auto sm:top-auto sm:mx-0 sm:max-w-sm"
        >
          <div
            className={`rounded-md border px-2.5 py-1.5 shadow-xl backdrop-blur-xl sm:rounded-xl sm:px-4 sm:py-3 ${
              notification.type === 'error'
                ? 'border-red-400/50 bg-red-500/90 text-white'
                : 'border-blue-400/50 bg-blue-500/90 text-white'
            }`}
          >
            <div className="flex items-start gap-1.5 sm:gap-2">
              {notification.type === 'error' ? (
                <svg
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 sm:h-5 sm:w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 sm:h-5 sm:w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              <p className="break-words text-[11px] font-medium leading-tight sm:text-sm sm:leading-normal">
                {notification.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно создания тикета */}
      {showCreateTicketModal && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowCreateTicketModal(false)}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              setShowCreateTicketModal(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Закрыть модальное окно"
        >
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- модальная обёртка: обработчики закрытия по клику/Escape */}
          <div
            className="max-h-[90vh] w-full max-w-md cursor-default overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-ticket-modal-title"
          >
            <h2 id="create-ticket-modal-title" className="mb-4 text-lg font-semibold text-white">
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
                      showNotification(
                        `Максимальная длина темы: ${TICKET_SUBJECT_MAX_LENGTH} символов`,
                      );
                      triggerShake('subject');
                    }
                  }}
                  placeholder="Тема обращения.."
                  aria-label="Тема обращения"
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
                />
                <div className="mt-1 text-right text-xs text-neutral-500">
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
                      showNotification(
                        `Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`,
                      );
                      triggerShake('message');
                    }
                  }}
                  placeholder="Опишите свою проблему.."
                  aria-label="Описание проблемы"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      e.preventDefault();
                      handleCreateTicket();
                    }
                  }}
                />
                <div className="mt-1 text-right text-xs text-neutral-500">
                  {newTicketMessage.length}/{MESSAGE_MAX_LENGTH}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateTicket}
                  disabled={
                    !newTicketSubject.trim() || !newTicketMessage.trim() || isCreatingTicket
                  }
                  className="flex-1 rounded-lg bg-primary-500 px-3 py-2 text-sm text-white transition-colors hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500"
                >
                  {isCreatingTicket ? 'Создание...' : 'Создать'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateTicketModal(false);
                  }}
                  className="rounded-lg bg-neutral-700 px-3 py-2 text-sm text-white transition-colors hover:bg-neutral-600"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRateLimitCaptcha && (
        <RateLimitCaptcha
          isOpen={showRateLimitCaptcha}
          onSuccess={handleRateLimitSuccess}
          onClose={() => {
            // При закрытии очищаем очередь и сбрасываем все флаги
            isCaptchaOpenRef.current = false;
            isProcessingCaptchaRef.current = false;
            setShowRateLimitCaptcha(false);
            rateLimitRetriesRef.current = [];
          }}
        />
      )}

      {activeTicket && (
        <FileUploadModal
          isOpen={showFileUploadModal}
          onClose={() => setShowFileUploadModal(false)}
          onUploadComplete={(files) => {
            setUploadedFiles((prev) => [...prev, ...files]);
            // Превью для изображений — используем storageUrl (blob отзывается при закрытии модалки)
            files.forEach((file) => {
              if (file.fileType.startsWith('image/')) {
                setFilePreviews((prev) => new Map(prev).set(file.storageUrl, file.storageUrl));
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
