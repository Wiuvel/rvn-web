'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { gsap } from 'gsap';
import { translateError } from '@/lib/error-translations';
import RateLimitCaptcha from '@/components/RateLimitCaptcha';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE } from '@/lib/constants';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getGradientClasses } from '@/lib/avatar-gradients';

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
  user?: {
    id: string;
    username: string;
    user_id: string;
    avatar_gradient?: string | null;
  };
  assigned_to?: string | null;
  assigned_user?: {
    id: string;
    username: string;
    user_id: string;
    avatar_gradient?: string | null;
  } | null;
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
    avatar_gradient?: string | null;
  };
}

interface Notification {
  message: string;
  type: 'error';
  show: boolean;
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
  isInitialLoad = false
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
      gsap.fromTo(messageRef.current,
        { opacity: 0, y: 10, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out" }
      );
    }
  }, [message.id, isInitialLoad]);

  return (
    <div ref={messageRef}>
      {showDate && (
        <div className="text-center text-xs text-neutral-500 my-4">
          {formatDate(message.created_at)}
        </div>
      )}
      {/* Логика: саппорт справа (items-end), пользователь слева (items-start), системные сообщения слева */}
      {isSystemMessage ? (
        <div className="flex flex-col items-start w-full">
          {/* Заголовок с именем "Система" */}
          <div className="mb-1.5 px-1 flex items-baseline gap-1.5">
            <span className="text-sm font-medium text-yellow-400 bg-white/10 px-2 py-1 rounded">Система</span>
          </div>
          
          {/* Сообщение */}
          <div className="max-w-[70%] min-w-0 flex-shrink-0 rounded-2xl px-4 py-3 bg-neutral-700/50 text-neutral-300" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.message_text}
            </p>
            <div className="flex items-center gap-2 text-xs mt-1.5 text-neutral-400">
              <span>{formatTime(message.created_at)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex flex-col ${isSupport ? 'items-end' : 'items-start'} ${isSupport ? 'ml-auto max-w-[75%]' : ''}`}>
          {/* Заголовок с именем */}
          {isUser && message.sender && (
            <div className="mb-1.5 px-1 flex items-baseline gap-1.5">
              <span className="text-sm font-medium text-white bg-white/10 px-2 py-1 rounded">{message.sender.username}</span>
              <span className="text-xs text-neutral-400">#{message.sender.user_id}</span>
            </div>
          )}
          {isSupport && message.sender && (
            <div className="mb-1.5 px-1 flex items-baseline gap-1.5">
              <span className="text-sm font-medium text-white bg-white/10 px-2 py-1 rounded">{message.sender.username}</span>
              <span className="text-xs text-white">Поддержка</span>
            </div>
          )}
          
          {/* Сообщение с аватаркой */}
          <div className={`flex items-end gap-3 ${isSupport ? 'flex-row-reverse' : 'flex-row'} ${isSupport ? 'w-full' : 'w-full'}`}>
            {/* Аватарка для пользователя (слева) */}
            {isUser && message.sender && (
              <div className={`w-10 h-10 rounded-full ${getGradientClasses(message.sender.avatar_gradient)} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 mb-1`}>
                {getInitial(message.sender.username)}
              </div>
            )}
            
            {/* Пузырь сообщения */}
            <div className={`${isSupport ? 'max-w-[60%]' : 'max-w-[70%]'} min-w-0 flex-shrink-0 rounded-2xl px-4 py-3 ${
              isSupport
                ? message.is_read
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-neutral-800 text-neutral-100 rounded-br-sm'
                : 'bg-neutral-800 text-neutral-100 rounded-bl-sm'
            }`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.message_text}
              </p>
              <div className={`flex items-center gap-2 text-xs mt-1.5 ${
                isSupport
                  ? message.is_read
                    ? 'text-blue-100'
                    : 'text-neutral-400'
                  : 'text-neutral-400'
              }`}>
                <span>{formatTime(message.created_at)}</span>
                {/* Индикация прочитанных сообщений саппорта пользователем */}
                {isSupport && message.is_read && (
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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

export default function SupportPanel() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    hasSupportAccess: false,
    username: null,
    userId: null,
    user_id: null
  });
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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
  const [notification, setNotification] = useState<Notification>({ message: '', type: 'error', show: false });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showRateLimitCaptcha, setShowRateLimitCaptcha] = useState(false);
  const isCaptchaOpenRef = useRef(false);
  const [isFilterChanging, setIsFilterChanging] = useState(false);
  const [showCloseReasonModal, setShowCloseReasonModal] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [ticketToClose, setTicketToClose] = useState<string | null>(null);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState(''); // Поисковый запрос для архива
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // Поисковый запрос для активных тикетов
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(() => {
    // На мобильных устройствах панель свернута по умолчанию
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });

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
      // Проверяем при монтировании
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [rightPanelCollapsed]);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [shouldRenderMobileActions, setShouldRenderMobileActions] = useState(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  
  // Анимация мобильного меню действий
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (mobileActionsOpen && activeTicket) {
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
            scale: 0.95
          });
          gsap.to(mobileActionsRef.current, {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: GSAP_DEFAULT_EASE
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
            ease: "power2.in",
            onComplete: () => {
              setShouldRenderMobileActions(false);
            }
          });
        } else {
          // Если элемент еще не создан, просто закрываем
          setShouldRenderMobileActions(false);
        }
      }
    }
  }, [mobileActionsOpen, activeTicket, shouldRenderMobileActions]);
  
  // Очередь запросов вместо одного callback - исправляет race condition
  const pendingRequestsQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingCaptchaRef = useRef(false); // Флаг обработки капчи - предотвращает повторные открытия
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentTicketIdRef = useRef<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const currentFilterRef = useRef<'active' | 'archive'>('active');
  const fetchTicketsAbortControllerRef = useRef<AbortController | null>(null);
  const isInitialMessagesLoadRef = useRef(true); // Флаг первой загрузки сообщений
  
  // Функция для получения инициалов
  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  // Автоскролл при новых сообщениях
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
          console.error('Rate limit still active after CAPTCHA - immunity may not be working');
        } else {
          console.error('Error retrying request after rate limit clear:', error);
        }
      }
    }
    
    // Сбрасываем флаг обработки только после обработки всех запросов
    isProcessingCaptchaRef.current = false;
  };

  useEffect(() => {
    checkAuthStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      fetchTickets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.hasSupportAccess, statusFilter]);

  // Восстанавливаем последний открытый тикет после загрузки тикетов
  useEffect(() => {
    if (authState.hasSupportAccess && tickets.length > 0 && !activeTicket) {
      if (typeof window !== 'undefined') {
        const lastTicketId = localStorage.getItem('support_panel_last_ticket_id');
        if (lastTicketId) {
          const ticket = tickets.find(t => t.id === lastTicketId);
          if (ticket) {
            setActiveTicket(ticket);
            currentTicketIdRef.current = ticket.id;
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets.length, authState.hasSupportAccess]);

  // Умное обновление сообщений: только когда страница активна и только проверка новых
  useEffect(() => {
    if (!activeTicket || !authState.hasSupportAccess) return;

    // Обновляем ref текущего тикета
    currentTicketIdRef.current = activeTicket.id;

    let interval: NodeJS.Timeout | null = null;
    let lastMessageCount = messages.length;
    // Хэш последних сообщений для оптимизации проверки изменений
    let lastMessagesHash = '';

    // Простая функция хэширования для сравнения сообщений
    const hashMessages = (msgs: Message[]): string => {
      return msgs.map(m => `${m.id}-${m.created_at}`).join('|');
    };

    // Инициализируем хэш при первом запуске
    if (messages.length > 0) {
      lastMessagesHash = hashMessages(messages);
    }

    const checkForNewMessages = async () => {
      // Проверяем только если страница видима и тикет не изменился
      if (document.hidden || !activeTicket || currentTicketIdRef.current !== activeTicket.id) return;

      try {
        const response = await fetchWithRateLimit(
          `/api/support/tickets/${activeTicket.id}`,
          {
            credentials: 'include'
          },
          async () => {
            // Retry callback - проверяем, что тикет не изменился
            if (!activeTicket || currentTicketIdRef.current !== activeTicket.id) return;
            const retryResponse = await fetch(`/api/support/tickets/${activeTicket.id}`, {
              credentials: 'include'
            });
            const retryData = await retryResponse.json();
            if (retryResponse.ok && activeTicket && currentTicketIdRef.current === activeTicket.id) {
              setMessages(retryData.messages || []);
              if (retryData.ticket && activeTicket && activeTicket.id === retryData.ticket.id) {
                if (activeTicket.status !== retryData.ticket.status) {
                  setActiveTicket({ ...activeTicket, status: retryData.ticket.status });
                }
              }
            }
          }
        );
        const data = await response.json();
        
        // Проверяем, что тикет не изменился во время запроса
        if (currentTicketIdRef.current !== activeTicket.id) return;
        
        if (response.ok && data.ticket && data.messages) {
          const currentMessageCount = data.messages.length;
          const currentMessagesHash = hashMessages(data.messages);
          
          // Обновляем статус тикета (может измениться)
          const statusChanged = activeTicket.status !== data.ticket.status;
          
          // Проверяем переход между активными и архивными статусами
          const wasActive = activeTicket.status === 'open' || activeTicket.status === 'pending';
          const isNowActive = data.ticket.status === 'open' || data.ticket.status === 'pending';
          const statusCategoryChanged = wasActive !== isNowActive;
          
          // Обновляем только если появились новые сообщения, изменился статус или хэш сообщений
          if (currentMessageCount > lastMessageCount || statusChanged || currentMessagesHash !== lastMessagesHash) {
            // Еще раз проверяем, что тикет не изменился
            if (currentTicketIdRef.current !== activeTicket.id) return;
            
            setMessages(data.messages || []);
            lastMessageCount = currentMessageCount;
            lastMessagesHash = currentMessagesHash;
            
            // Обновляем статус тикета
            if (statusChanged && activeTicket && currentTicketIdRef.current === activeTicket.id) {
              setActiveTicket({ ...activeTicket, status: data.ticket.status });
            }
            
            // Обновляем список тикетов только при переходе между активными и архивными статусами
            // (тикет должен переместиться в другую категорию)
            if (statusCategoryChanged) {
              fetchTickets();
            } else if (statusChanged) {
              // Если статус изменился, но остался в той же категории - обновляем только конкретный тикет
              updateTicketInList(activeTicket.id, {
                status: data.ticket.status,
                updated_at: data.ticket.updated_at
              });
            }
            
            // Отмечаем сообщения как прочитанные (debounced)
            markMessagesAsRead(activeTicket.id);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          // Rate limit обрабатывается через капчу, не показываем ошибку
          return;
        }
        console.error('Error checking for new messages:', error);
      }
    };

    // Проверяем каждые 5 секунд для более динамичного обновления статуса
    interval = setInterval(checkForNewMessages, 5000);

    // Отмечаем сообщения как прочитанные при открытии тикета (debounced)
    markMessagesAsRead(activeTicket.id);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      // Очищаем таймер при размонтировании
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
      }
      // Отменяем запросы при размонтировании
      if (fetchTicketsAbortControllerRef.current) {
        fetchTicketsAbortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id, authState.hasSupportAccess, messages.length]);

  // Отметка сообщений как прочитанных с debounce
  const markMessagesAsRead = async (ticketId: string) => {
    // Очищаем предыдущий таймер
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
    }
    
    // Устанавливаем новый таймер (debounce 2 секунды)
    markReadTimeoutRef.current = setTimeout(async () => {
      // Проверяем, что тикет не изменился
      if (currentTicketIdRef.current !== ticketId) {
        return;
      }
      
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
          console.error('Error marking messages as read:', error);
        }
      }
    }, 2000);
  };

  useEffect(() => {
    if (activeTicket) {
      // Сбрасываем флаг первой загрузки при смене тикета
      isInitialMessagesLoadRef.current = true;
      fetchMessages(activeTicket.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id]);

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
          ease: "power2.in",
          onComplete: () => {
            setNotification({ message: '', type: 'error', show: false });
          }
        });
      } else {
        setNotification({ message: '', type: 'error', show: false });
      }
    }, 3000);
  };

  // Анимация появления уведомления
  useEffect(() => {
    if (notification.show && notificationRef.current) {
      gsap.fromTo(notificationRef.current,
        { opacity: 0, y: -20, scale: 0.9 },
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

  const checkAuthStatus = async () => {
    try {
      const response = await fetchWithRateLimit(
        '/api/support/check',
        {},
        checkAuthStatus // Retry callback
      );
      const data = await response.json();
      
      if (!data.isAuthenticated) {
        router.push('/auth');
        return;
      }

      // Проверка на ошибку БД (500 или отсутствие данных)
      // НЕ показываем ошибку БД если это RATE_LIMIT_EXCEEDED
      if (response.status === 500 || (data.error && data.error.includes('Database'))) {
        setAuthState({
          isAuthenticated: true,
          hasSupportAccess: false,
          username: data.username || null,
          userId: data.userId || null,
          user_id: data.user_id || null
        });
        setLoading(false);
        return; // Не редиректим, показываем сообщение на странице
      }

      if (!data.hasSupportAccess) {
        setAuthState({
          isAuthenticated: true,
          hasSupportAccess: false,
          username: data.username || null,
          userId: data.userId || null,
          user_id: data.user_id || null
        });
        setLoading(false);
        return; // Не редиректим, показываем сообщение на странице
      }

      setAuthState({
        isAuthenticated: true,
        hasSupportAccess: true,
        username: data.username,
        userId: data.userId,
        user_id: data.user_id || null
      });
      setLoading(false);
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        // Rate limit обрабатывается через капчу, не показываем ошибку БД
        setLoading(false);
        return;
      }
      console.error('Error checking auth status:', error);
      // При ошибке сети тоже показываем сообщение, а не редиректим
      setAuthState({
        isAuthenticated: true,
        hasSupportAccess: false,
        username: null,
        userId: null,
        user_id: null
      });
      setLoading(false);
    }
  };

  const fetchTickets = async () => {
    // Отменяем предыдущий запрос, если он еще выполняется
    if (fetchTicketsAbortControllerRef.current) {
      fetchTicketsAbortControllerRef.current.abort();
    }
    
    // Создаем новый AbortController для этого запроса
    const abortController = new AbortController();
    fetchTicketsAbortControllerRef.current = abortController;
    
    // Проверяем, что фильтр не изменился во время запроса
    const filterAtStart = currentFilterRef.current;
    
    setTicketsLoading(true);
    try {
      // Проверяем актуальность фильтра перед запросом
      if (currentFilterRef.current !== filterAtStart) {
        setTicketsLoading(false);
        return; // Фильтр изменился, отменяем запрос
      }
      
      if (statusFilter === 'archive') {
        // Для архива получаем закрытые тикеты
        const closedRes = await fetchWithRateLimit('/api/support/tickets?status=closed', { credentials: 'include' }, fetchTickets);
        
        // Проверяем актуальность фильтра после запроса
        if (currentFilterRef.current !== 'archive' || abortController.signal.aborted) {
          setTicketsLoading(false);
          return; // Фильтр изменился или запрос отменен
        }
        
        const closedData = await closedRes.json();
        
        // Еще раз проверяем актуальность перед обработкой данных
        if (currentFilterRef.current !== 'archive' || abortController.signal.aborted) {
          setTicketsLoading(false);
          return;
        }
        
        let tickets = (closedData.tickets || []).map((t: {
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
        }) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          priority: t.priority || 'normal',
          created_at: t.created_at,
          updated_at: t.updated_at,
          last_message_at: t.last_message_at,
          closed_at: t.closed_at,
          user: t.user,
          assigned_to: t.assigned_to,
          assigned_user: t.assigned_user
        }));
        
        // Для архива сортируем по дате обновления/закрытия (убывание - новые сверху)
        tickets = tickets.sort((a: Ticket, b: Ticket) => {
          const dateA = new Date(a.updated_at || a.closed_at || a.created_at).getTime();
          const dateB = new Date(b.updated_at || b.closed_at || b.created_at).getTime();
          return dateB - dateA;
        });
        
        // Финальная проверка перед обновлением состояния
        if (currentFilterRef.current !== 'archive' || abortController.signal.aborted) {
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
                }, 50);
              }
            }
          }
        }
        setTicketsLoading(false);
        return;
      } else {
        // Для активных получаем открытые и в ожидании
        const [openRes, pendingRes] = await Promise.all([
          fetchWithRateLimit('/api/support/tickets?status=open', { credentials: 'include' }, fetchTickets),
          fetchWithRateLimit('/api/support/tickets?status=pending', { credentials: 'include' }, fetchTickets)
        ]);
        
        // Проверяем актуальность фильтра после запросов
        if (currentFilterRef.current !== 'active' || abortController.signal.aborted) {
          setTicketsLoading(false);
          return; // Фильтр изменился или запрос отменен
        }
        
        const openData = await openRes.json();
        const pendingData = await pendingRes.json();
        
        // Еще раз проверяем актуальность перед обработкой данных
        if (currentFilterRef.current !== 'active' || abortController.signal.aborted) {
          setTicketsLoading(false);
          return;
        }
        
        let tickets = [
          ...(openData.tickets || []),
          ...(pendingData.tickets || [])
        ].map((t: {
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
        }) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          priority: t.priority || 'normal',
          created_at: t.created_at,
          updated_at: t.updated_at,
          last_message_at: t.last_message_at,
          closed_at: t.closed_at,
          user: t.user,
          assigned_to: t.assigned_to,
          assigned_user: t.assigned_user
        }));
        
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
                }, 50);
              }
            }
          }
        }
        setTicketsLoading(false);
        return;
      }
    } catch (error) {
      // Игнорируем ошибки отмененных запросов
      if (error instanceof Error && error.name === 'AbortError') {
        setTicketsLoading(false);
        return;
      }
      // Rate limit обрабатывается через капчу, не сбрасываем loading и не показываем ошибку
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        return;
      }
      // Проверяем актуальность фильтра перед показом ошибки
      if (currentFilterRef.current !== filterAtStart) {
        setTicketsLoading(false);
        return;
      }
      console.error('Error fetching tickets:', error);
      setTicketsLoading(false);
      // Устанавливаем пустой список и сбрасываем скелетон
      setTickets([]);
      setSkeletonCount(null);
      showNotification(translateError('Ошибка загрузки тикетов'), 'error');
    }
  };

  const fetchMessages = async (ticketId: string) => {
    // Обновляем ref текущего тикета
    currentTicketIdRef.current = ticketId;
    
    // Определяем, является ли это первой загрузкой сообщений для этого тикета
    const isFirstLoad = isInitialMessagesLoadRef.current;
    
    // Не блокируем загрузку сообщений заранее - мы должны получать актуальные данные с сервера
    // даже если тикет занят другим саппортом, чтобы корректно обновить состояние UI
    
    setMessagesLoading(true);
    try {
      const response = await fetchWithRateLimit(
        `/api/support/tickets/${ticketId}`,
        {
          credentials: 'include'
        },
        async () => {
          // Retry callback - проверяем, что тикет не изменился
          if (currentTicketIdRef.current === ticketId) {
            await fetchMessages(ticketId);
          }
        }
      );
      const data = await response.json();
      
      // Проверяем, что тикет не изменился во время запроса
      if (currentTicketIdRef.current !== ticketId) {
        setMessagesLoading(false);
        return;
      }
      
      if (response.ok) {
        setMessages(data.messages || []);
        
        // После первой загрузки сбрасываем флаг
        if (isFirstLoad) {
          // Используем setTimeout, чтобы дать React время отрендерить сообщения без анимации
          setTimeout(() => {
            isInitialMessagesLoadRef.current = false;
          }, 100);
        }
        
        // После первой загрузки сбрасываем флаг
        if (isFirstLoad) {
          // Используем setTimeout, чтобы дать React время отрендерить сообщения без анимации
          setTimeout(() => {
            isInitialMessagesLoadRef.current = false;
          }, 100);
        }
        
        // Обновляем activeTicket с актуальными данными тикета (статус, назначение и т.д.)
        // чтобы UI корректно отображал состояние тикета после получения новых сообщений
        // Это особенно важно, когда приходит системное сообщение о взятии тикета
        if (data.ticket && currentTicketIdRef.current === ticketId) {
          setActiveTicket((prev) => {
            if (prev && prev.id === ticketId) {
              // ВАЖНО: всегда обновляем assigned_to и assigned_user из ответа API
              // даже если они null - это означает, что тикет не назначен
              // Используем явную проверку на undefined, чтобы не потерять данные
              return {
                ...prev,
                status: data.ticket.status,
                user: data.ticket.user || prev.user,
                // КРИТИЧНО: API всегда возвращает assigned_to и assigned_user в ответе
                // Используем их напрямую, даже если они null (тикет не назначен)
                // Это гарантирует, что UI всегда синхронизирован с сервером
                assigned_to: data.ticket.assigned_to ?? null,
                assigned_user: data.ticket.assigned_user ?? null,
                updated_at: data.ticket.updated_at,
                closed_at: 'closed_at' in data.ticket ? data.ticket.closed_at : prev.closed_at
              };
            } else if (data.ticket) {
              return {
                ...data.ticket,
                assigned_to: data.ticket.assigned_to ?? null,
                assigned_user: data.ticket.assigned_user ?? null
              };
            }
            return prev;
          });
          
          // Также обновляем тикет в списке, чтобы данные были синхронизированы
          updateTicketInList(ticketId, {
            status: data.ticket.status,
            assigned_to: data.ticket.assigned_to ?? null,
            assigned_user: data.ticket.assigned_user ?? null,
            updated_at: data.ticket.updated_at,
            closed_at: data.ticket.closed_at ?? undefined
          });
        }
        
        // Отмечаем сообщения как прочитанные (debounced)
        markMessagesAsRead(ticketId);
      } else {
        const errorMessage = data.error || 'Ошибка загрузки сообщений';
        showNotification(translateError(errorMessage), 'error');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        // Rate limit обрабатывается через капчу, не показываем ошибку
        setMessagesLoading(false);
        return;
      }
      console.error('Error fetching messages:', error);
      showNotification(translateError('Ошибка загрузки сообщений'), 'error');
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeTicket || !messageText.trim()) return;

    try {
      const response = await fetchWithRateLimit(
        `/api/support/tickets/${activeTicket.id}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ message: messageText.trim() })
        },
        handleSendMessage // Retry callback
      );

      const data = await response.json();

      if (response.ok) {
        setMessageText('');
        // Обновляем сообщения после отправки
        const ticketResponse = await fetchWithRateLimit(
          `/api/support/tickets/${activeTicket.id}`,
          {
            credentials: 'include'
          },
          async () => {
            // Retry callback
            const retryResponse = await fetch(`/api/support/tickets/${activeTicket.id}`, {
              credentials: 'include'
            });
            const retryData = await retryResponse.json();
            if (retryResponse.ok && currentTicketIdRef.current === activeTicket.id) {
              setMessages(retryData.messages || []);
              markMessagesAsRead(activeTicket.id);
            }
          }
        );
        const ticketData = await ticketResponse.json();
        if (ticketResponse.ok && currentTicketIdRef.current === activeTicket.id) {
          setMessages(ticketData.messages || []);
          // Отмечаем сообщения как прочитанные (debounced)
          markMessagesAsRead(activeTicket.id);
          // Обновляем только last_message_at в списке тикетов, без полного перезапроса
          setTickets((prevTickets) =>
            prevTickets.map((ticket) =>
              ticket.id === activeTicket.id
                ? { ...ticket, last_message_at: ticketData.ticket?.last_message_at || ticket.last_message_at }
                : ticket
            )
          );
        }
        // Сообщение отправлено успешно - уведомление не показываем
      } else {
        const errorMessage = data.error || 'Ошибка отправки сообщения';
        showNotification(translateError(errorMessage), 'error');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        // Rate limit обрабатывается через капчу, не показываем ошибку
        return;
      }
      console.error('Error sending message:', error);
      showNotification(translateError('Ошибка отправки сообщения'), 'error');
    }
  };

  // Функция для обновления конкретного тикета в списке
  const updateTicketInList = (ticketId: string, updates: Partial<Ticket>) => {
    setTickets((prevTickets) =>
      prevTickets.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, ...updates } : ticket
      )
    );
  };

  // Функция для закрепления/отвязывания тикета за саппортом
  const handleAssignTicket = async (ticketId: string, userId: string) => {
    try {
      const currentTicket = tickets.find(t => t.id === ticketId) || activeTicket;
      
      // Архивные тикеты (closed) не могут быть закреплены/отвязаны
      if (currentTicket && currentTicket.status === 'closed') {
        showNotification('Архивные тикеты не могут быть закреплены или отвязаны', 'error');
        return;
      }
      
      // Если тикет уже взят текущим саппортом - отвязываем его
      if (currentTicket?.assigned_to === userId) {
        const response = await fetchWithRateLimit(
          `/api/support/tickets/${ticketId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ assignedTo: null })
          },
          () => handleAssignTicket(ticketId, userId) // Retry callback
        );

        const data = await response.json();

        if (response.ok && data.ticket) {
          // Тикет отвязан успешно - уведомление не показываем
          // Обновляем активный тикет
          if (activeTicket?.id === ticketId) {
            setActiveTicket((prev) => {
              if (prev && prev.id === ticketId) {
                return { 
                  ...prev, 
                  assigned_to: null,
                  assigned_user: null
                };
              }
              return prev;
            });
          }
          // Обновляем только конкретный тикет в списке
          updateTicketInList(ticketId, {
            assigned_to: null,
            assigned_user: null
          });
        } else {
          const errorMessage = data.error || 'Ошибка при отвязывании тикета';
          showNotification(translateError(errorMessage), 'error');
        }
        return;
      }

      // Проверяем, не занят ли тикет другим саппортом
      if (currentTicket?.assigned_to && currentTicket.assigned_to !== userId) {
        showNotification('Тикет уже занят другим специалистом поддержки', 'error');
        return;
      }

      // Закрепляем тикет за саппортом и меняем статус на "В работе"
      const response = await fetchWithRateLimit(
        `/api/support/tickets/${ticketId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ assignedTo: userId, status: 'pending' })
        },
        () => handleAssignTicket(ticketId, userId) // Retry callback
      );

      const data = await response.json();

      if (response.ok && data.ticket) {
        // Тикет успешно взят - уведомление не показываем
        // Обновляем активный тикет с данными о назначенном пользователе и статусом
        if (activeTicket?.id === ticketId) {
          setActiveTicket((prev) => {
            if (prev && prev.id === ticketId) {
              return { 
                ...prev, 
                assigned_to: data.ticket.assigned_to || null,
                assigned_user: data.ticket.assigned_user || null,
                status: data.ticket.status || 'pending'
              };
            }
            return prev;
          });
        }
        // Обновляем только конкретный тикет в списке
        updateTicketInList(ticketId, {
          assigned_to: data.ticket.assigned_to || null,
          assigned_user: data.ticket.assigned_user || null,
          status: data.ticket.status || 'pending'
        });
        
        // ВАЖНО: Обновляем сообщения, чтобы показать системное сообщение о взятии тикета
        // Это обновит activeTicket с актуальными данными из API, включая assigned_to и assigned_user
        if (activeTicket?.id === ticketId) {
          await fetchMessages(ticketId);
        }
      } else {
        const errorMessage = data.error || 'Ошибка при взятии тикета';
        showNotification(translateError(errorMessage), 'error');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        return;
      }
      console.error('Error assigning ticket:', error);
      showNotification('Ошибка при взятии тикета', 'error');
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

  const handleUpdateTicketStatus = async (ticketId: string, status: string, closeReason?: string) => {
    try {
      // Проверяем, не является ли текущий тикет архивным
      const currentTicket = tickets.find(t => t.id === ticketId) || activeTicket;
      if (currentTicket && currentTicket.status === 'closed') {
        showNotification('Статус архивных тикетов нельзя изменить', 'error');
        return;
      }
      
      const response = await fetchWithRateLimit(
        `/api/support/tickets/${ticketId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ status, closeReason })
        },
        () => handleUpdateTicketStatus(ticketId, status, closeReason) // Retry callback
      );

      const data = await response.json();

      if (response.ok && data.ticket) {
        const newStatus = status as 'open' | 'pending' | 'closed';
        const wasActive = activeTicket?.status === 'open' || activeTicket?.status === 'pending';
        const isNowActive = newStatus === 'open' || newStatus === 'pending';
        const statusCategoryChanged = wasActive !== isNowActive;

        // Обновляем активный тикет с полными данными (включая assigned_to)
        if (activeTicket?.id === ticketId) {
          setActiveTicket({ 
            ...activeTicket, 
            status: newStatus,
            assigned_to: data.ticket.assigned_to || null,
            assigned_user: data.ticket.assigned_user || null
          });
        }

        // Обновляем только конкретный тикет в списке
        updateTicketInList(ticketId, {
          status: newStatus,
          updated_at: data.ticket.updated_at,
          closed_at: data.ticket.closed_at,
          assigned_to: data.ticket.assigned_to || null,
          assigned_user: data.ticket.assigned_user || null
        });

        // Если статус изменился между активными и архивными - обновляем весь список
        // (тикет должен переместиться в другую категорию)
        if (statusCategoryChanged) {
          // Если тикет перешел из архива в активные - переключаем фильтр
          if (isNowActive && statusFilter === 'archive') {
            setStatusFilter('active');
            // Обновляем скелетон лоадер для нового фильтра
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
            // useEffect автоматически вызовет fetchTickets() при изменении statusFilter
          }
          // Если тикет перешел из активных в архив - переключаем фильтр
          else if (!isNowActive && statusFilter === 'active') {
            setStatusFilter('archive');
            // Устанавливаем скелетон лоадер для нового фильтра
            setSkeletonCount(3);
            // useEffect автоматически вызовет fetchTickets() при изменении statusFilter
          } else if (!isNowActive && statusFilter === 'archive') {
            // Если тикет уже в архиве и мы в архиве - просто обновляем список
            await fetchTickets();
          } else {
            // Если фильтр уже правильный, просто обновляем список
            await fetchTickets();
          }
        } else if (newStatus === 'closed') {
          // Если тикет закрыт, но мы уже в архиве - просто обновляем список
          // чтобы новый тикет появился в архиве
          if (statusFilter === 'archive') {
            await fetchTickets();
          } else if (statusFilter === 'active') {
            // Если мы в активных, а тикет закрыт - переключаемся в архив
            setStatusFilter('archive');
            setSkeletonCount(3);
            // useEffect автоматически вызовет fetchTickets() при изменении statusFilter
          }
        }

        // Обновляем сообщения, чтобы показать системное сообщение о смене статуса
        // ВАЖНО: fetchMessages также обновит activeTicket с актуальными данными о назначении
        if (activeTicket?.id === ticketId) {
          // Загружаем сообщения, которые обновят activeTicket с актуальными данными
          // включая assigned_to и assigned_user из ответа API
          await fetchMessages(ticketId);
        }

        // Статус тикета обновлен успешно - уведомление не показываем
      } else {
        const errorMessage = data.error || 'Ошибка обновления статуса';
        // Специальная обработка ошибок валидации статусов
        if (errorMessage.includes('status transition') || errorMessage.includes('Invalid status')) {
          showNotification('Недопустимый переход статуса. Проверьте правила изменения статусов.', 'error');
        } else if (errorMessage.includes('not assigned') || errorMessage.includes('assigned')) {
          showNotification('Тикет должен быть назначен вам для изменения статуса', 'error');
        } else {
          showNotification(translateError(errorMessage), 'error');
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        // Rate limit обрабатывается через капчу, не показываем ошибку
        return;
      }
      console.error('Error updating ticket status:', error);
      showNotification(translateError('Ошибка обновления статуса'), 'error');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
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

  // Получить цвет индикатора давности тикета
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getTicketUrgencyColor = (_ticket: Ticket): string => {
    // Убрали glow эффект
    return '';
  };

  // Проверка, является ли тикет старым (37+ минут без ответа)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isTicketOld = (_ticket: Ticket): boolean => {
    if (_ticket.status === 'closed') return false;
    
    const lastMessageTime = new Date(_ticket.last_message_at).getTime();
    const now = Date.now();
    const minutesSinceLastMessage = (now - lastMessageTime) / (1000 * 60);
    
    return minutesSinceLastMessage >= 37;
  };

  // Получить цвет для надписи "UP" в зависимости от давности тикета
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getUpLabelColor = (_ticket: Ticket): string => {
    if (_ticket.status === 'closed') return '';
    
    const lastMessageTime = new Date(_ticket.last_message_at).getTime();
    const now = Date.now();
    const minutesSinceLastMessage = (now - lastMessageTime) / (1000 * 60);
    
    // 2 часа = 120 минут - красный
    if (minutesSinceLastMessage >= 120) {
      return 'text-red-400';
    }
    // 37 минут - желтый
    if (minutesSinceLastMessage >= 37) {
      return 'text-yellow-400';
    }
    
    return '';
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
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Доступ ограничен</h1>
            <p className="text-neutral-400 mb-6">
              У вас нет доступа к панели поддержки. Обратитесь к администратору для получения прав доступа или попробуйте позже.
            </p>
            <Link
              href="/ui/panel"
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Вернуться к выбору панели
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Notification */}
      {notification.show && (
        <div 
          ref={notificationRef}
          className="hidden lg:block fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg bg-red-500/20 text-red-400 border border-red-500/30"
        >
          {notification.message}
        </div>
      )}

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Левое меню со списком тикетов */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50 lg:z-auto
        w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="p-6 border-b border-neutral-800">
          <h1 className="text-lg font-semibold text-white">Панель поддержки</h1>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-neutral-800 space-y-3">
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
              className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === 'active'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
              } ${(isFilterChanging || ticketsLoading) ? 'opacity-50' : ''}`}
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
              className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === 'archive'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
              } ${(isFilterChanging || ticketsLoading) ? 'opacity-50' : ''}`}
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
                className="w-full px-3 py-2 pl-10 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {archiveSearchQuery && (
                <button
                  onClick={() => setArchiveSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                className="w-full px-3 py-2 pl-10 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {activeSearchQuery && (
                <button
                  onClick={() => setActiveSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tickets List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {ticketsLoading ? (
            skeletonCount === null ? (
              // Если последний раз тикетов не было, не показываем скелетоны
              <div className="text-center py-8 text-neutral-400 text-sm">
                Загрузка...
              </div>
            ) : (
              <div className="space-y-2">
                {[...Array(skeletonCount)].map((_, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg border bg-neutral-800/50 border-neutral-700"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="h-4 skeleton-shimmer rounded flex-1"></div>
                      <div className="h-5 w-16 skeleton-shimmer rounded ml-2"></div>
                    </div>
                    <div className="h-3 skeleton-shimmer rounded w-24 mb-1"></div>
                    <div className="h-3 skeleton-shimmer rounded w-32"></div>
                  </div>
                ))}
              </div>
            )
          ) : filteredTickets.length === 0 ? (
            (statusFilter === 'archive' ? archiveSearchQuery.trim() : activeSearchQuery.trim()) ? (
              <div className="text-center py-8 text-neutral-400 text-sm">
                Ничего не найдено
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-400 text-sm">
                Нет тикетов
              </div>
            )
          ) : (
            filteredTickets.map((ticket) => {
              const urgencyColor = getTicketUrgencyColor(ticket);
              const urgencyText = getTicketUrgencyText(ticket);
              const urgencyTextColor = getTicketUrgencyTextColor(ticket);
              
              return (
                <div
                  key={ticket.id}
                  onClick={() => {
                    if (ticketsLoading) return; // Блокируем только во время загрузки
                    // Для архивных тикетов (closed) не проверяем привязку - они доступны всем саппортам
                    const isArchived = ticket.status === 'closed';
                    // Проверяем, не занят ли тикет другим саппортом (только для активных тикетов)
                    if (!isArchived && ticket.assigned_to && ticket.assigned_to !== authState.userId) {
                      showNotification('Данный тикет уже закреплен за другим саппортом', 'error');
                      return;
                    }
                    currentTicketIdRef.current = ticket.id;
                    setActiveTicket(ticket);
                    // Сохраняем ID последнего открытого тикета
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('support_panel_last_ticket_id', ticket.id);
                    }
                  }}
                  className={`p-4 rounded-lg border transition-all select-none ${
                    // Для архивных тикетов не блокируем, для активных - только если назначен другому
                    ticket.status === 'closed' || 
                    !(ticket.assigned_to && ticket.assigned_to !== authState.userId)
                      ? 'cursor-pointer'
                      : ''
                  } ${
                    activeTicket?.id === ticket.id
                      ? 'bg-blue-500/10 border-blue-500/50 shadow-lg'
                      : `bg-neutral-800/50 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600 ${urgencyColor}`
                  }`}
                >
                  <div className={`flex items-start justify-between mb-2 ${
                    // Применяем opacity только к заголовку и статусу, если тикет назначен другому
                    ticket.status !== 'closed' && 
                    ticket.assigned_to && ticket.assigned_to !== authState.userId
                      ? 'opacity-50'
                      : ''
                  }`}>
                    <h3 className="text-sm font-medium text-white line-clamp-1 flex-1">
                      {ticket.subject}
                    </h3>
                    <span className={`ml-2 px-2 py-0.5 text-xs rounded border flex-shrink-0 ${getStatusColor(ticket.status)}`}>
                      {ticket.status === 'open' ? 'Открыт' :
                       ticket.status === 'pending' ? 'В работе' :
                       'Закрыт'}
                    </span>
                  </div>
                  {ticket.user && (
                    <div className={`flex items-baseline gap-1 mb-1 ${
                      // Применяем opacity к информации о пользователе, если тикет назначен другому
                      ticket.status !== 'closed' && 
                      ticket.assigned_to && ticket.assigned_to !== authState.userId
                        ? 'opacity-50'
                        : ''
                    }`}>
                      <span className="text-xs font-medium text-white">{ticket.user.username}</span>
                      <span className="text-xs text-neutral-400">#{ticket.user.user_id}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className={`text-xs text-neutral-500 ${
                      // Применяем opacity к дате, если тикет назначен другому
                      ticket.status !== 'closed' && 
                      ticket.assigned_to && ticket.assigned_to !== authState.userId
                        ? 'opacity-50'
                        : ''
                    }`}>
                      {formatDate(ticket.last_message_at)}
                    </p>
                    <div className="flex items-center gap-2">
                      {ticket.assigned_user && statusFilter === 'active' && (
                        <span className="text-xs text-blue-400">Отвечает: <span className="uppercase">{ticket.assigned_user.username}</span></span>
                      )}
                      {urgencyText && (
                        <span className={`text-xs font-medium ${urgencyTextColor}`}>
                          {urgencyText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="bg-neutral-900 border-b border-neutral-800 px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                aria-label="Открыть меню"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h2 className="text-lg sm:text-xl font-semibold text-white">
                {activeTicket ? activeTicket.subject : 'Тикеты'}
              </h2>
            </div>
            {activeTicket && (
              <button
                onClick={() => setMobileActionsOpen(!mobileActionsOpen)}
                className="lg:hidden p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                aria-label="Управление тикетом"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            )}
          </div>
          {/* Мобильное меню действий */}
          {activeTicket && shouldRenderMobileActions && (
            <div ref={mobileActionsRef} className="lg:hidden mt-4 p-4 bg-neutral-800 rounded-lg border border-neutral-700">
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
                      className={`w-full px-4 py-2 text-white text-sm rounded-lg transition-colors font-medium ${
                        activeTicket.assigned_to === authState.userId
                          ? 'bg-orange-600 hover:bg-orange-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {activeTicket.assigned_to === authState.userId ? 'Отвязать тикет' : 'Взять тикет'}
                    </button>
                    <button
                      onClick={() => {
                        handleCloseTicket(activeTicket.id);
                        setMobileActionsOpen(false);
                      }}
                      className="w-full px-4 py-2 text-white text-sm rounded-lg transition-colors font-medium bg-red-600 hover:bg-red-700"
                    >
                      Закрыть тикет
                    </button>
                  </>
                )}
                {/* Селект статуса доступен только для активных тикетов */}
                {(activeTicket.status === 'open' || activeTicket.status === 'pending') ? (
                  <select
                    value={activeTicket.status}
                    onChange={(e) => {
                      handleUpdateTicketStatus(activeTicket.id, e.target.value);
                      setMobileActionsOpen(false);
                    }}
                    className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="open">Открыт</option>
                    <option value="pending">В работе</option>
                    <option value="closed">Закрыт</option>
                  </select>
                ) : (
                  <div className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-white text-sm">
                    Закрыт
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Chat Area - Центральная часть с чатом */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {activeTicket ? (
            <>
              {/* Основной контент (сообщения и input) */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* User Actions Block */}
                {activeTicket.user && (
                  <div className="border-b border-neutral-800 p-3 bg-neutral-900/50 flex-shrink-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full ${getGradientClasses(activeTicket.user.avatar_gradient)} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-glow`}>
                      {getInitial(activeTicket.user.username)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{activeTicket.user.username}</div>
                      <div className="text-xs text-neutral-400">#{activeTicket.user.user_id}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors border border-neutral-700">
                      Заблокировать создание тикетов
                    </button>
                    <button className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors border border-neutral-700">
                      Продлить подписку
                    </button>
                    <button className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors border border-neutral-700">
                      Добавить
                    </button>
                  </div>
                </div>
              )}
              
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="spinner mx-auto"></div>
                      <p className="mt-2 text-sm text-neutral-400">Загрузка сообщений...</p>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400 text-sm">
                    Нет сообщений
                  </div>
                ) : (
                  messages.map((message, index) => {
                    // Проверяем, является ли сообщение системным (автоматическим или о смене статуса)
                    const SYSTEM_MESSAGE_TEXT = 'Спасибо за ваше сообщение. Мы получили ваш запрос и ответим в ближайшее время.';
                    const isStatusChangeMessage = message.message_text.includes('Статус тикета изменен') || 
                      message.message_text.includes('Ваше обращение приняли в обработку') ||
                      message.message_text.includes('Ваше обращение было закрыто');
                    const isSystemMessage = (message.message_text === SYSTEM_MESSAGE_TEXT || isStatusChangeMessage) && 
                      message.sender_type === 'support';
                    
                    // Показываем дату если это первое сообщение или дата изменилась
                    const showDate = index === 0 || 
                      new Date(message.created_at).getDate() !== 
                      new Date(messages[index - 1].created_at).getDate();
                    
                    const formatTime = (dateString: string) => {
                      return new Intl.DateTimeFormat('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
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
                          month: 'long'
                        });
                      }
                    };
                    
                    // Перевернутая логика: саппорт слева, пользователь справа
                    const isSupport = message.sender_type === 'support' && !isSystemMessage;
                    const isUser = message.sender_type === 'user';
                    
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
                      />
                    );
                  })
                )}
                  <div ref={messagesEndRef} />
                </div>
                
                {/* Input */}
                {activeTicket.status !== 'closed' && (
                  <>
                    {/* Для активных тикетов проверяем привязку, для архивных - не проверяем */}
                    {activeTicket.assigned_to && activeTicket.assigned_to !== authState.userId ? (
                      <div className="border-t border-neutral-800 p-3 bg-neutral-900/50 flex-shrink-0">
                        <div className="text-center py-2">
                          <p className="text-sm text-neutral-400">Тикет занят другим специалистом поддержки</p>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-neutral-800 p-3 bg-neutral-900/50 flex-shrink-0">
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
                            className="flex-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                          />
                          <button
                            onClick={handleSendMessage}
                            disabled={!messageText.trim()}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 text-white rounded-lg transition-colors font-medium text-sm sm:text-base"
                          >
                            Отправить
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {activeTicket.status === 'closed' && (
                  <div className="border-t border-neutral-800 p-3 bg-neutral-900/50 flex-shrink-0">
                    <div className="text-center py-2">
                      <p className="text-sm text-neutral-400">Тикет закрыт. Новые сообщения недоступны.</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-neutral-400">Выберите тикет из списка</p>
            </div>
          )}
          
          {/* Правая панель с кнопками управления - третья колонка на ПК (всегда видна) */}
          {isLargeScreen ? (
            <div className={`bg-neutral-900 border-l border-neutral-800 transition-all duration-300 flex-shrink-0 ${
              rightPanelCollapsed ? 'w-12' : 'w-64'
            } flex flex-col ${
              rightPanelCollapsed ? 'items-center' : ''
            }`}>
            {rightPanelCollapsed ? (
              <button
                onClick={() => setRightPanelCollapsed(false)}
                className="p-3 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                title="Развернуть панель"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <>
                {!activeTicket && !rightPanelCollapsed && (
                  <div className="p-4 flex items-center justify-between border-b border-neutral-800">
                    <button
                      onClick={() => setRightPanelCollapsed(true)}
                      className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                      title="Свернуть панель"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  </div>
                )}
                {activeTicket && (
                  <div className="p-4 flex items-center justify-between border-b border-neutral-800">
                    <span className="text-sm font-medium text-white">Управление</span>
                    <button
                      onClick={() => setRightPanelCollapsed(true)}
                      className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                      title="Свернуть панель"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
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
                      className={`w-full px-4 py-2 text-white text-sm rounded-lg transition-colors font-medium ${
                        activeTicket.assigned_to === authState.userId
                          ? 'bg-orange-600 hover:bg-orange-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {activeTicket.assigned_to === authState.userId ? 'Отвязать тикет' : 'Взять тикет'}
                    </button>
                    <button
                      onClick={() => {
                        // Динамическая проверка перед закрытием
                        if (activeTicket.status !== 'pending') {
                          showNotification('Тикет должен быть в статусе "В работе" для закрытия', 'error');
                          return;
                        }
                        if (activeTicket.assigned_to !== authState.userId) {
                          showNotification('Тикет должен быть назначен вам для закрытия', 'error');
                          return;
                        }
                        handleCloseTicket(activeTicket.id);
                      }}
                      disabled={activeTicket.assigned_to !== authState.userId || activeTicket.status !== 'pending'}
                      className={`w-full px-4 py-2 text-white text-sm rounded-lg transition-colors font-medium ${
                        activeTicket.assigned_to !== authState.userId || activeTicket.status !== 'pending'
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
                  <div className="mt-3 bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-neutral-700">
                      <span className="text-xs text-neutral-400">Укажите статус:</span>
                    </div>
                    <select
                      value={activeTicket.status}
                      onChange={(e) => {
                        handleUpdateTicketStatus(activeTicket.id, e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-transparent border-0 text-white text-sm focus:outline-none"
                    >
                      <option value="open" className="bg-neutral-800 text-white">Открыт</option>
                      <option value="pending" className="bg-neutral-800 text-white">В работе</option>
                      <option value="closed" className="bg-neutral-800 text-white">Закрыт</option>
                    </select>
                  </div>
                )}
                {/* Для архивных тикетов показываем только информацию о статусе */}
                {activeTicket.status === 'closed' && (
                  <div className="mt-3 bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-neutral-700">
                      <span className="text-xs text-neutral-400">Статус:</span>
                    </div>
                    <div className="px-3 py-2 text-white text-sm">
                      Закрыт
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {messagesLoading ? (
                  <>
                    {/* Скелетон лоадеры для кнопок */}
                    <div className="space-y-3">
                      <div className="h-10 bg-neutral-800 skeleton-shimmer rounded-lg"></div>
                      <div className="h-10 bg-neutral-800 skeleton-shimmer rounded-lg"></div>
                    </div>
                    {/* Скелетон лоадер для карточки выпадающего меню */}
                    <div className="mt-3 bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 border-b border-neutral-700">
                        <div className="h-4 bg-neutral-700 skeleton-shimmer rounded w-24"></div>
                      </div>
                      <div className="px-3 py-2">
                        <div className="h-8 bg-neutral-700 skeleton-shimmer rounded"></div>
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

      {/* Модальное окно для указания причины закрытия тикета */}
      {showCloseReasonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Закрыть тикет</h3>
            <p className="text-sm text-neutral-400 mb-4">Укажите причину закрытия тикета:</p>
            <textarea
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              placeholder="Введите причину закрытия..."
              rows={4}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleConfirmCloseTicket}
                disabled={!closeReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors font-medium"
              >
                Закрыть
              </button>
              <button
                onClick={() => {
                  setShowCloseReasonModal(false);
                  setCloseReason('');
                  setTicketToClose(null);
                }}
                className="flex-1 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition-colors font-medium"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

