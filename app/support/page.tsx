'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { gsap } from 'gsap';
import { MESSAGE_MAX_LENGTH, TICKET_SUBJECT_MAX_LENGTH, MAX_TICKETS_PER_USER, MESSAGE_TIMEOUT, AUTH_FETCH_TIMEOUT, GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE, MARK_AS_READ_DEBOUNCE } from '@/lib/utils/constants';
import { translateError } from '@/lib/utils/error-translations';
import { getGradientClasses } from '@/lib/utils/avatar-gradients';

// Lazy load RateLimitCaptcha для оптимизации bundle size
const RateLimitCaptcha = dynamic(() => import('@/components/RateLimitCaptcha'), {
  ssr: false,
  loading: () => null
});

interface UserData {
  id: string;
  user_id: string;
  username: string;
  dashboard_token: string;
  created_at: string;
  last_login?: string;
  avatar_gradient?: string | null;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'support';
  timestamp: Date;
  isRead?: boolean;
  senderData?: {
    id: string;
    username: string;
    user_id: string;
  };
}

interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'closed' | 'pending';
  createdAt: Date;
  messages: Message[];
}

// Компонент для сообщения
function MessageItem({ 
  message, 
  showDate, 
  userData, 
  formatDate, 
  formatTime,
  isInitialLoad = false
}: { 
  message: Message; 
  showDate: boolean; 
  userData: UserData | null;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
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

  // Определяем, является ли сообщение системным
  const SYSTEM_MESSAGE_TEXT = 'Спасибо за ваше сообщение. Мы получили ваш запрос и ответим в ближайшее время.';
  const isStatusChangeMessage = message.text.includes('Статус тикета изменен') || 
    message.text.includes('Ваше обращение приняли в обработку') ||
    message.text.includes('Ваше обращение было закрыто');
  const isSystemMessage = (message.text === SYSTEM_MESSAGE_TEXT || isStatusChangeMessage) && 
    message.sender === 'support';

  return (
    <div ref={messageRef}>
      {showDate && (
        <div className="text-center text-xs text-neutral-500 my-4">
          {formatDate(message.timestamp)}
        </div>
      )}
      {isSystemMessage ? (
        <div className="flex flex-col items-start w-full">
          {/* Заголовок с именем "Система" */}
          <div className="mb-1 px-1 flex items-baseline gap-1">
            <span className="text-xs sm:text-sm font-medium text-yellow-400 bg-white/10 px-1.5 sm:px-2 py-0.5 rounded">Система</span>
          </div>
          
          {/* Сообщение */}
          <div className="max-w-[85%] sm:max-w-[70%] min-w-0 flex-shrink-0 rounded-2xl px-3 py-2 sm:px-4 bg-neutral-700/50 text-neutral-300" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
            <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">
              {message.text}
            </p>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs mt-1 text-neutral-400">
              <span>{formatTime(message.timestamp)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
          {message.sender === 'user' && userData && (
            <div className="mb-1 px-1 flex items-baseline gap-1">
              <span className="text-xs sm:text-sm font-medium text-white bg-white/10 px-1.5 sm:px-2 py-0.5 rounded">{userData.username}</span>
              <span className="text-[10px] sm:text-xs text-neutral-400">#{userData.user_id}</span>
            </div>
          )}
          {message.sender === 'support' && message.senderData && (
            <div className="mb-1 px-1 flex items-baseline gap-1">
              <span className="text-xs sm:text-sm font-medium text-white bg-white/10 px-1.5 sm:px-2 py-0.5 rounded">{message.senderData.username}</span>
              <span className="text-[10px] sm:text-xs text-white">Поддержка</span>
            </div>
          )}
          <div className={`flex items-end gap-2 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'} w-full`}>
            {message.sender === 'support' && (
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0 mb-1">
                <Image 
                  src="/static/logo.svg" 
                  alt="Support" 
                  width={256} 
                  height={256} 
                  className="w-5 h-5 sm:w-9 sm:h-9"
                />
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[70%] min-w-0 flex-shrink-0 rounded-2xl px-3 py-2 sm:px-4 ${
              message.sender === 'user'
                ? message.isRead !== false
                  ? 'bg-primary-500 text-white rounded-br-sm'
                  : 'bg-neutral-600 text-white rounded-br-sm'
                : 'bg-neutral-800 text-neutral-100 rounded-bl-sm'
            }`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">
                {message.text}
              </p>
              <div className={`text-[10px] sm:text-xs mt-1 ${
                message.sender === 'user' 
                  ? message.isRead !== false 
                    ? 'text-primary-100' 
                    : 'text-neutral-300'
                  : 'text-neutral-400'
              }`}>
                <span>{formatTime(message.timestamp)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [shouldRenderMenu, setShouldRenderMenu] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSupport, setIsSupport] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState(''); // Отдельное состояние для сообщения нового тикета
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState<number | null>(null);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(0);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false); // Флаг для блокировки кнопки создания тикета
  const [isSendingMessage, setIsSendingMessage] = useState(false); // Флаг для блокировки повторной отправки сообщений
  const [messagesSentCount, setMessagesSentCount] = useState<number>(0);
  const [notification, setNotification] = useState<{ message: string; show: boolean }>({ message: '', show: false });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  // Подсчет активных тикетов (только open и pending)
  const activeTicketsCount = tickets.filter(t => t.status === 'open' || t.status === 'pending').length;
  const userMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null); // Для формы создания нового тикета
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const newTicketFormRef = useRef<HTMLDivElement>(null); // Ref для формы создания тикета (для анимаций)
  const chatAreaRef = useRef<HTMLDivElement>(null); // Ref для области чата (для анимаций)
  const fetchingTicketIdRef = useRef<string | null>(null);
  const loadedMessagesRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef<boolean>(false);
  const [showRateLimitCaptcha, setShowRateLimitCaptcha] = useState(false);
  const isCaptchaOpenRef = useRef(false);
  // Очередь запросов вместо одного callback - исправляет race condition
  const pendingRequestsQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingCaptchaRef = useRef(false); // Флаг обработки капчи - предотвращает повторные открытия
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Лимиты символов (используем константы из lib/constants.ts)
  
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
  
  // Функция для показа notification
  const showNotification = (message: string) => {
    setNotification({ message, show: true });
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
            if (data.authenticated === false || !data.dashboard_token) {
              setUserData(null);
              setIsSupport(false);
            } else {
              setUserData(data);
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

  // Загрузка тикетов при монтировании
  useEffect(() => {
    if (userData) {
      fetchTickets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

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
      fetchTicketMessages(activeTicket.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id]);

  // Умное обновление сообщений: только когда страница активна и только проверка новых
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

      try {
        const response = await fetchWithRateLimit(
          `/api/support/tickets/${activeTicket.id}`,
          {
            credentials: 'include'
          },
          async () => {
            // Retry callback для обновления сообщений
            if (activeTicket) {
              await fetchTicketMessages(activeTicket.id);
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
            const mappedMessages = data.messages.map((m: { id: string; message_text: string; sender_type: string; created_at: string; is_read: boolean; sender?: { id: string; username: string; user_id: string } }) => ({
              id: m.id,
              text: m.message_text,
              sender: m.sender_type,
              timestamp: new Date(m.created_at),
              isRead: m.is_read,
              senderData: m.sender
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

    // Проверяем каждые 5 секунд для более динамичного обновления статуса
    interval = setInterval(checkForNewMessages, 5000);

    // Отмечаем сообщения как прочитанные при открытии тикета
    markMessagesAsRead(activeTicket.id);

    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id, userData, activeTicket?.status]);

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
          console.error('Error marking messages as read:', error);
        }
      }
    }, MARK_AS_READ_DEBOUNCE);
  }, []); // Пустой массив зависимостей, так как функция не зависит от состояния

  // Очистка таймера при размонтировании компонента
  useEffect(() => {
    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = null;
      }
    };
  }, []);

  // Обработка открытия/закрытия меню профиля
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (userMenuOpen) {
      setShouldRenderMenu(true);
      if (menuRef.current) {
        gsap.fromTo(menuRef.current,
          { opacity: 0, y: -10, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "power2.out" }
        );
      }
      document.body.style.overflow = 'hidden';
    } else {
      if (menuRef.current) {
        gsap.to(menuRef.current, {
          opacity: 0,
          y: -10,
          scale: 0.95,
          duration: 0.15,
          ease: "power2.in",
          onComplete: () => {
            setShouldRenderMenu(false);
          }
        });
      } else {
        setShouldRenderMenu(false);
      }
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [userMenuOpen]);

  // Обработка кликов вне меню
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST'
      });
      if (response.ok) {
        router.push('/auth');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  // Автопрокрутка к последнему сообщению
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTicket?.messages]);

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
                messages: (retryData.messages || []).map((m: { id: string; message_text: string; sender_type: string; created_at: string; is_read: boolean; sender?: { id: string; username: string; user_id: string } }) => ({
                  id: m.id,
                  text: m.message_text,
                  sender: m.sender_type,
                  timestamp: new Date(m.created_at),
                  isRead: m.is_read,
                  senderData: m.sender
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
            messages: (ticketData.messages || []).map((m: { id: string; message_text: string; sender_type: string; created_at: string; is_read: boolean; sender?: { id: string; username: string; user_id: string } }) => ({
              id: m.id,
              text: m.message_text,
              sender: m.sender_type,
              timestamp: new Date(m.created_at),
              isRead: m.is_read,
              senderData: m.sender
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
        showNotification('Обращение создано');
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
      console.error('Error creating ticket:', error);
      showNotification('Ошибка создания обращения');
    } finally {
      // Сбрасываем флаг создания тикета в любом случае
      setIsCreatingTicket(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeTicket) return;
    
    // Проверка статуса тикета - нельзя отправлять сообщения в закрытые тикеты
    if (activeTicket.status === 'closed') {
      showNotification('Нельзя отправлять сообщения в закрытый тикет');
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
      const response = await fetchWithRateLimit(
        `/api/support/tickets/${activeTicket.id}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            message: messageText.trim()
          })
        },
        handleSendMessage // Retry callback
      );

      const data = await response.json();

      if (response.ok && data.message) {
        setMessageText('');
        
        // Увеличиваем счетчик отправленных сообщений
        const newCount = messagesSentCount + 1;
        setMessagesSentCount(newCount);
        
        // Устанавливаем тайм-аут только после второго сообщения
        if (newCount >= 2) {
          setLastMessageTime(Date.now());
          setTimeoutSeconds(MESSAGE_TIMEOUT / 1000);
        }
        
        // Загружаем сообщения заново
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
            if (retryResponse.ok) {
              const mappedMessages = (retryData.messages || []).map((m: { id: string; message_text: string; sender_type: string; created_at: string; is_read: boolean; sender?: { id: string; username: string; user_id: string } }) => ({
                id: m.id,
                text: m.message_text,
                sender: m.sender_type,
                timestamp: new Date(m.created_at),
                isRead: m.is_read,
                senderData: m.sender
              }));
              
              // Отмечаем новые сообщения
              mappedMessages.forEach((m: { id: string }) => {
                if (!loadedMessagesRef.current.has(m.id)) {
                  loadedMessagesRef.current.add(m.id);
                }
              });
              
              setActiveTicket({
                ...activeTicket,
                messages: mappedMessages
              });
              markMessagesAsRead(activeTicket.id);
            }
          }
        );
        const ticketData = await ticketResponse.json();
        if (ticketResponse.ok) {
          const mappedMessages = (ticketData.messages || []).map((m: { id: string; message_text: string; sender_type: string; created_at: string; is_read: boolean; sender?: { id: string; username: string; user_id: string } }) => ({
            id: m.id,
            text: m.message_text,
            sender: m.sender_type,
            timestamp: new Date(m.created_at),
            isRead: m.is_read,
            senderData: m.sender
          }));
          
          // Отмечаем новые сообщения (после отправки)
          mappedMessages.forEach((m: { id: string }) => {
            if (!loadedMessagesRef.current.has(m.id)) {
              loadedMessagesRef.current.add(m.id);
            }
          });
          
          setActiveTicket({
            ...activeTicket,
            messages: mappedMessages
          });
          
          // Отмечаем сообщения как прочитанные
          markMessagesAsRead(activeTicket.id);
        }
        // Обновляем список тикетов
        await fetchTickets();
      } else {
        const errorMessage = data.error || 'Ошибка отправки сообщения';
        showNotification(translateError(errorMessage));
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        // Rate limit обрабатывается через капчу, не показываем ошибку
        return;
      }
      console.error('Error sending message:', error);
      showNotification('Ошибка отправки сообщения');
    } finally {
      // Сбрасываем флаг отправки в любом случае
      setIsSendingMessage(false);
    }
  };

  const fetchTickets = async () => {
    setTicketsLoading(true);
    try {
      const response = await fetchWithRateLimit(
        '/api/support/tickets?status=all&forUser=true',
        {
          credentials: 'include'
        },
        fetchTickets // Retry callback
      );
      const data = await response.json();
      
      if (response.ok) {
        const mappedTickets = (data.tickets || []).map((t: { id: string; subject: string; status: string; created_at: string }) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          createdAt: new Date(t.created_at),
          messages: []
        }));
        setTickets(mappedTickets);
        
        // Восстанавливаем последний открытый тикет после загрузки списка
        if (typeof window !== 'undefined' && !activeTicket) {
          const lastTicketId = localStorage.getItem('support_last_ticket_id');
          if (lastTicketId) {
            const lastTicket = mappedTickets.find((t: Ticket) => t.id === lastTicketId);
            if (lastTicket) {
              // Небольшая задержка для корректного обновления state
              setTimeout(() => {
                setActiveTicket(lastTicket);
                // Загружаем сообщения для восстановленного тикета
                fetchTicketMessages(lastTicket.id);
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
      console.error('Error fetching tickets:', error);
      showNotification('Ошибка загрузки обращений');
    } finally {
      setTicketsLoading(false);
    }
  };

  const fetchTicketMessages = async (ticketId: string) => {
    // Предотвращаем дублирующиеся запросы
    if (fetchingTicketIdRef.current === ticketId) {
      return;
    }
    
    try {
      fetchingTicketIdRef.current = ticketId;
      
      const response = await fetchWithRateLimit(
        `/api/support/tickets/${ticketId}`,
        {
          credentials: 'include'
        },
        () => fetchTicketMessages(ticketId) // Retry callback
      );
      const data = await response.json();
      
      if (response.ok) {
        // Проверяем, что тикет все еще активный (не изменился во время запроса)
        setActiveTicket(prev => {
          // Если тикет изменился во время запроса, не обновляем
          if (prev && prev.id && prev.id !== ticketId) {
            fetchingTicketIdRef.current = null;
            return prev;
          }
          
          const mappedMessages = (data.messages || []).map((m: { id: string; message_text: string; sender_type: string; created_at: string; is_read: boolean; sender?: { id: string; username: string; user_id: string } }) => ({
            id: m.id,
            text: m.message_text,
            sender: m.sender_type,
            timestamp: new Date(m.created_at),
            isRead: m.is_read,
            senderData: m.sender // Добавляем данные отправителя
          }));
          
          // Отмечаем все загруженные сообщения как уже загруженные (первая загрузка тикета)
          mappedMessages.forEach((m: { id: string }) => {
            loadedMessagesRef.current.add(m.id);
          });
          
          const ticket = {
            id: data.ticket.id,
            subject: data.ticket.subject,
            status: data.ticket.status,
            createdAt: new Date(data.ticket.created_at),
            messages: mappedMessages
          };
          
          // Сохраняем ID последнего открытого тикета
          if (typeof window !== 'undefined') {
            localStorage.setItem('support_last_ticket_id', ticket.id);
          }
          
          // Устанавливаем флаг первой загрузки после небольшой задержки, чтобы сообщения успели отрендериться
          setTimeout(() => {
            initialLoadRef.current = false;
          }, 100);
          
          return ticket;
        });
        
        // Отмечаем сообщения как прочитанные после загрузки
        markMessagesAsRead(ticketId);
      } else {
        fetchingTicketIdRef.current = null;
        const errorMessage = data.error || 'Ошибка загрузки сообщений';
        showNotification(translateError(errorMessage));
      }
    } catch (error) {
      console.error('Error fetching ticket messages:', error);
      showNotification('Ошибка загрузки сообщений');
    }
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
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center py-8 px-4">
        <div className="max-w-md w-full mx-auto text-center">
          <h1 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-white">Требуется авторизация</h1>
          <p className="text-sm sm:text-base text-neutral-400 mb-6 sm:mb-8 px-2">
            Не можете войти в аккаунт? Проблемы с оплатой? Мы также предоставляем поддержку в Telegram.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="https://t.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-neutral-800/60 hover:bg-neutral-700/60 border border-white/10 rounded-xl text-white transition-colors text-sm sm:text-base"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9.999 15.17l-.394 5.556c.562 0 .805-.241 1.099-.529l2.635-2.516 5.461 4.043c1.001.551 1.716.264 1.96-.924l3.555-16.725c.314-1.46-.527-2.03-1.49-1.675L1.51 9.043c-1.438.56-1.416 1.364-.245 1.733l5.688 1.769L18.631 5.59c.6-.394 1.149-.176.698.217"/>
              </svg>
              <span>Телеграм</span>
            </a>
            <Link
              href={`/auth?retpatch=${encodeURIComponent('/support/')}`}
              className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-primary-500 hover:bg-primary-400 rounded-xl text-white transition-colors text-sm sm:text-base"
            >
              <Image 
                src="/static/icons/accounts/log-in.svg" 
                alt="Авторизация" 
                width={18} 
                height={18} 
                className="w-[18px] h-[18px] flex-shrink-0"
              />
              <span>Авторизация</span>
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
              <Image src="/static/logo.svg" alt="Raven Logo" width={256} height={256} className="w-6 h-6" priority/>
              <span className="font-semibold text-white">Raven Private</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-8 text-sm text-neutral-300">
              <Link href="/" className="hover:text-white transition">Главная</Link>
              <Link href="/auth" className="hover:text-white transition">Профиль</Link>
            </nav>
            {userData && (
              <div className="hidden lg:flex items-center gap-2 relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className={`w-10 h-10 rounded-full ${getGradientClasses(userData.avatar_gradient)} flex items-center justify-center text-white font-semibold text-sm shadow-glow transition-transform duration-200 hover:scale-110 cursor-pointer`}
                  title={userData.username}
                  aria-label="Меню пользователя"
                  aria-expanded={userMenuOpen}
                >
                  {getInitial(userData.username)}
                </button>
                {shouldRenderMenu && (
                  <div 
                    ref={menuRef}
                    className="absolute -right-3 top-full mt-4 w-64 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50"
                  >
                    <Link
                      href={`/dashboard/${userData.dashboard_token}`}
                      onClick={() => setUserMenuOpen(false)}
                      className="block p-4 border-b border-white/10 hover:bg-white/5 transition-colors duration-200 cursor-pointer mx-2 my-1 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full ${getGradientClasses(userData.avatar_gradient)} flex items-center justify-center text-white font-semibold text-base flex-shrink-0`}>
                          {getInitial(userData.username)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-white font-medium truncate">{userData.username}</div>
                          <div className="text-neutral-400 text-xs truncate">ID: {userData.user_id}</div>
                        </div>
                      </div>
                    </Link>
                    <div className="py-2">
                      <Link
                        href={`/dashboard/${userData.dashboard_token}`}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                      >
                        <Image 
                          src="/static/icons/accounts/users.svg" 
                          alt="Профиль" 
                          width={20} 
                          height={20} 
                          className="w-5 h-5"
                        />
                        <span>Профиль</span>
                      </Link>
                      <Link
                        href={`/dashboard/${userData.dashboard_token}#subscriptions`}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                      >
                        <Image 
                          src="/static/icons/accounts/wallet.svg" 
                          alt="Мои тарифы" 
                          width={20} 
                          height={20} 
                          className="w-5 h-5"
                        />
                        <span>Мои тарифы</span>
                      </Link>
                      <div className="border-t border-white/10 my-1 mx-2"></div>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors duration-200"
                      >
                        <Image 
                          src="/static/icons/accounts/log-out.svg" 
                          alt="Выйти" 
                          width={20} 
                          height={20} 
                          className="w-5 h-5"
                        />
                        <span>Выйти</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button 
              onClick={() => setOpen(!open)} 
              className="lg:hidden p-2 text-white/80 hover:text-white transition-colors duration-300" 
              aria-label="Открыть меню"
            >
              {!open ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              )}
            </button>
          </div>
          {/* Mobile menu */}
          {open && userData && (
            <div className="lg:hidden mt-4 py-4 bg-black/50 backdrop-blur-lg rounded-2xl border border-white/10" style={{animation: 'fadeIn 0.2s ease-out'}}>
              <div className="px-4 space-y-2">
                <Link
                  href={`/dashboard/${userData.dashboard_token}`}
                  onClick={() => setOpen(false)}
                  className="block p-4 border-b border-white/10 hover:bg-white/5 transition-colors duration-200 cursor-pointer mx-2 my-1 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full ${getGradientClasses(userData.avatar_gradient)} flex items-center justify-center text-white font-semibold text-base flex-shrink-0`}>
                      {getInitial(userData.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-white font-medium truncate">{userData.username}</div>
                    </div>
                  </div>
                </Link>
                <div className="py-2">
                  <Link
                    href={`/dashboard/${userData.dashboard_token}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                  >
                    <Image 
                      src="/static/icons/accounts/users.svg" 
                      alt="Профиль" 
                      width={20} 
                      height={20} 
                      className="w-5 h-5"
                    />
                    <span>Профиль</span>
                  </Link>
                  <Link
                    href={`/dashboard/${userData.dashboard_token}#subscriptions`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                  >
                    <Image 
                      src="/static/icons/accounts/wallet.svg" 
                      alt="Мои тарифы" 
                      width={20} 
                      height={20} 
                      className="w-5 h-5"
                    />
                    <span>Мои тарифы</span>
                  </Link>
                  <div className="border-t border-white/10 my-1 mx-2"></div>
                  <button
                    onClick={() => {
                      setOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors duration-200"
                  >
                    <Image 
                      src="/static/icons/accounts/log-out.svg" 
                      alt="Выйти" 
                      width={20} 
                      height={20} 
                      className="w-5 h-5"
                    />
                    <span>Выйти</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-24 pb-4 overflow-hidden min-h-0">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-8 h-full flex flex-col overflow-hidden">
          <div className="mb-3 sm:mb-6 hidden sm:block">
            <p className="text-xs sm:text-sm text-neutral-400">Обратитесь в службу поддержки. Создайте новое обращение или выберите существующее для продолжения диалога.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6 flex-1 min-h-0">
            {/* Список тикетов - меньше на мобильном */}
            <div className="lg:col-span-1 flex flex-col min-h-0">
              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-2 sm:p-4 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2 sm:mb-4 flex-shrink-0">
                  <h2 className="text-base sm:text-lg font-semibold">Мои тикеты</h2>
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

                {!isSupport && (
                  <div 
                    ref={newTicketFormRef} 
                    className={`mb-4 p-3 bg-neutral-800/50 rounded-xl border border-white/10 flex-shrink-0 space-y-3 ${!showNewTicketForm ? 'hidden' : ''}`}
                    style={!showNewTicketForm ? { height: 0, marginBottom: 0, opacity: 0, overflow: 'hidden' } : {}}
                  >
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
                        placeholder="Тема обращения..."
                        className="w-full px-3 py-2 bg-neutral-900 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            // Не создаем тикет по Enter, только переходим к полю сообщения
                          }
                        }}
                        autoFocus
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
                        placeholder="Опишите свою проблему..."
                        rows={3}
                        className="w-full px-3 py-2 bg-neutral-900 border border-white/10 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-primary-500 resize-none"
                        onKeyPress={(e) => {
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
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateTicket}
                        disabled={!newTicketSubject.trim() || !newTicketMessage.trim() || isCreatingTicket}
                        className="flex-1 px-3 py-1.5 bg-primary-500 hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm rounded-lg transition-colors"
                      >
                        {isCreatingTicket ? 'Создание...' : 'Создать'}
                      </button>
                      <button
                        onClick={() => {
                          setShowNewTicketForm(false);
                          // Поля очистятся автоматически после анимации
                        }}
                        className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-sm rounded-lg transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}

                <div className="support-tickets-list flex-1 overflow-y-auto min-h-0">
                  {tickets.length === 0 ? (
                    <div className="text-center text-neutral-400 text-sm py-8">
                      Нет открытых тикетов.
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        onClick={async () => {
                          // Предотвращаем клик на уже выбранный тикет
                          if (activeTicket?.id === ticket.id) {
                            return;
                          }
                          
                          // Сразу загружаем сообщения при выборе тикета (даже если закрыт)
                          const ticketData = {
                            id: ticket.id,
                            subject: ticket.subject,
                            status: ticket.status,
                            createdAt: ticket.createdAt,
                            messages: []
                          };
                          setActiveTicket(ticketData);
                          // Сохраняем ID последнего открытого тикета
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('support_last_ticket_id', ticket.id);
                          }
                          // Сбрасываем счетчик сообщений при смене тикета
                          setMessagesSentCount(0);
                          setLastMessageTime(null);
                          setTimeoutSeconds(0);
                          // Загружаем сообщения асинхронно
                          await fetchTicketMessages(ticket.id);
                        }}
                        disabled={activeTicket?.id === ticket.id}
                        className={`w-full text-left p-3 rounded-xl transition-colors ${
                          activeTicket?.id === ticket.id
                            ? 'bg-primary-500/20 border border-primary-500/50 cursor-default'
                            : 'bg-neutral-800/50 hover:bg-neutral-800 border border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span className="text-sm font-medium text-white truncate flex-1">
                            {ticket.subject}
                          </span>
                          <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                            ticket.status === 'open' 
                              ? 'bg-green-500/20 text-green-400' 
                              : ticket.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-neutral-700 text-neutral-400'
                          }`}>
                            {ticket.status === 'open' ? 'Открыт' : ticket.status === 'pending' ? 'В работе' : 'Закрыт'}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-400">
                          {formatDate(ticket.createdAt)}, {formatTime(ticket.createdAt)}
                        </div>
                        {ticket.messages && Array.isArray(ticket.messages) && ticket.messages.length > 0 && (
                          <div className="text-xs text-neutral-500 mt-1 truncate">
                            {ticket.messages[ticket.messages.length - 1].text}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Чат - больше на мобильном */}
            <div className="lg:col-span-2 flex flex-col min-h-0">
              <div className="bg-neutral-900 border border-white/10 rounded-2xl flex-1 flex flex-col overflow-hidden">
                {activeTicket ? (
                  <>
                    <div ref={chatAreaRef} className="flex-1 flex flex-col min-h-0 overflow-hidden transition-opacity duration-200">
                      <div className="p-3 sm:p-4 border-b border-white/10 flex-shrink-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm sm:text-lg font-semibold truncate">{activeTicket.subject}</h3>
                          <p className="text-xs sm:text-sm text-neutral-400">
                            Создан {formatDateShort(activeTicket.createdAt)}
                          </p>
                        </div>
                        <span className={`px-3 py-1 text-xs rounded-full ${
                          activeTicket.status === 'open' 
                            ? 'bg-green-500/20 text-green-400' 
                            : activeTicket.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-neutral-700 text-neutral-400'
                        }`}>
                          {activeTicket.status === 'open' ? 'Открыт' : activeTicket.status === 'pending' ? 'В работе' : 'Закрыт'}
                        </span>
                      </div>
                    </div>

                    <div className="support-chat-messages flex-1 overflow-y-auto min-h-0 relative">
                      {ticketsLoading && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 text-neutral-400 text-sm z-10">
                          <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
                          <span>Загрузка...</span>
                        </div>
                      )}
                      <div key={`messages-${activeTicket.id}`} className="p-2 sm:p-4 flex flex-col gap-3 sm:gap-4 min-h-full">
                        {activeTicket.messages && Array.isArray(activeTicket.messages) && activeTicket.messages.length > 0 ? (
                          <>
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

                    <div className="p-2 sm:p-4 border-t border-white/10 flex-shrink-0">
                      {activeTicket.status === 'closed' ? (
                        <div className="text-center py-4 px-4 bg-neutral-800/50 border border-neutral-700 rounded-xl">
                          <p className="text-neutral-400 text-sm">Этот тикет закрыт. Вы не можете отправлять сообщения в закрытые тикеты.</p>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <input
                              ref={messageInputRef}
                              type="text"
                              value={messageText}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value.length <= MESSAGE_MAX_LENGTH) {
                                  setMessageText(value);
                                } else {
                                  showNotification(`Максимальная длина сообщения: ${MESSAGE_MAX_LENGTH} символов`);
                                  triggerShake('message');
                                }
                              }}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && !isSendingMessage) {
                                  handleSendMessage();
                                }
                              }}
                              placeholder={timeoutSeconds > 0 ? "Ожидание.." : "Напишите сообщение..."}
                              disabled={timeoutSeconds > 0}
                              className="w-full min-w-0 px-3 py-2 sm:px-4 text-sm sm:text-base bg-neutral-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary-500 disabled:opacity-50 pr-10"
                            />
                            {timeoutSeconds === 0 && (
                              <div className="absolute bottom-1 right-3 text-[10px] text-neutral-500">
                                {messageText.length}/{MESSAGE_MAX_LENGTH}
                              </div>
                            )}
                            {timeoutSeconds > 0 && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-neutral-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-xs font-medium">{timeoutSeconds}с</span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={handleSendMessage}
                            disabled={!messageText.trim() || timeoutSeconds > 0 || isSendingMessage}
                            className="px-4 sm:px-6 py-2 bg-primary-500 hover:bg-primary-400 disabled:bg-neutral-700 text-white rounded-xl transition-colors text-sm sm:text-base"
                          >
                            {isSendingMessage ? 'Отправка...' : 'Отправить'}
                          </button>
                        </div>
                      )}
                    </div>
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
        <div ref={notificationRef} className="fixed bottom-4 left-4 z-[1000]">
          <div className="bg-neutral-900 border border-red-500/50 rounded-xl px-4 py-3 shadow-xl backdrop-blur-xl">
            <p className="text-sm text-white">{notification.message}</p>
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
    </div>
  );
}
