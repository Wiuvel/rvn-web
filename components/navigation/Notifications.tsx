'use client';

import { useState, useEffect, useRef } from 'react';
import { useMenuAnimation } from '@/hooks/useMenuAnimation';
import { Bell as BellIcon } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

interface NotificationsWidgetProps {
  isMobile?: boolean;
}

/**
 * Унифицированный виджет уведомлений.
 * Содержит в себе кнопку (колокольчик) и выпадающее меню.
 * Инкапсулирует логику загрузки, хранения и отметки уведомлений.
 */
export function NotificationsWidget({ isMobile = false }: NotificationsWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());
  const [isMounted, setIsMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { shouldRender, menuRef: animatedMenuRef } = useMenuAnimation(isOpen);

  // Инициализация и загрузка данных
  useEffect(() => {
    setIsMounted(true);
    // Загружаем прочитанные уведомления из localStorage
    const storedRead = localStorage.getItem('readNotifications');
    const readSet = storedRead ? new Set<string>(JSON.parse(storedRead)) : new Set<string>();
    setReadNotifications(readSet);

    // TODO: Здесь должен быть запрос к API за уведомлениями
    // Пока мокаем пустой массив или тестовые данные
    setNotifications([]);
  }, []);

  // Закрытие при клике снаружи
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const markAsRead = (id: string) => {
    const newReadSet = new Set(readNotifications);
    newReadSet.add(id);
    setReadNotifications(newReadSet);
    localStorage.setItem('readNotifications', JSON.stringify(Array.from(newReadSet)));
  };

  const hasUnread = notifications.some((n) => !readNotifications.has(n.id));
  const unreadCount = notifications.filter((n) => !readNotifications.has(n.id)).length;

  if (!isMounted) return null;

  // Мобильная версия (рендерится только кнопка в хедере или встроенное меню)
  // В данном случае, если isMobile=true, мы предполагаем, что это часть мобильного меню
  // Но обычно кнопка колокольчика в мобилке тоже есть в навбаре.
  // Для унификации, этот компонент всегда рендерит кнопку + дропдаун (или развернутое меню для мобилки)

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="relative flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-800/60 text-white/80 transition-all duration-200 hover:scale-110 hover:bg-neutral-700/60 hover:text-white"
        title="Уведомления"
        aria-label="Уведомления"
        aria-expanded={isOpen}
      >
        <div className="relative">
          <BellIcon className="h-6 w-6" />
          {hasUnread && (
            <span className="absolute right-0 top-0 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-neutral-800" />
          )}
        </div>
      </button>

      {/* Выпадающее меню */}
      {shouldRender && (
        <div
          ref={animatedMenuRef}
          className={`absolute z-50 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/95 shadow-xl backdrop-blur-xl ${
            isMobile
              ? 'fixed left-4 right-4 top-[70px] mt-0 w-auto' // Мобильные стили (на весь экран по ширине)
              : '-right-3 top-full mt-5 w-80' // Десктопные стили
          } `}
        >
          <div className="mx-2 flex items-center justify-between border-b border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white">Уведомления</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary-500 px-2 py-0.5 text-xs font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800/50">
                  <svg
                    className="h-8 w-8 text-neutral-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </div>
                <p className="text-sm text-neutral-400">Нет уведомлений</p>
              </div>
            ) : (
              <div className="space-y-1 py-2">
                {notifications.map((notification) => {
                  const isRead = readNotifications.has(notification.id);
                  return (
                    <button
                      key={notification.id}
                      onClick={() => markAsRead(notification.id)}
                      className={`mx-2 w-full cursor-pointer rounded-xl px-4 py-3 text-left transition-colors duration-200 ${
                        !isRead
                          ? 'border-l-2 border-blue-500 bg-blue-500/10 hover:bg-blue-500/20'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {!isRead && (
                          <div className="mt-2 h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-blue-500"></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className={`mb-1 text-sm font-medium ${isRead ? 'text-white/90' : 'text-white'}`}
                          >
                            {notification.title}
                          </div>
                          <div className="mb-1 text-xs text-neutral-400">
                            {notification.message}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {new Date(notification.created_at).toLocaleDateString('ru-RU', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
