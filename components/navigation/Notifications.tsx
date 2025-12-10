'use client';

import { useEffect } from 'react';
import { Notification } from '@/types';
import { useMenuAnimation } from '@/hooks/useMenuAnimation';

interface NotificationsMenuProps {
  notifications: Notification[];
  readNotifications: Set<string>;
  isOpen: boolean;
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
  menuRef?: React.RefObject<HTMLDivElement | null>; // Для клика вне меню
  isMobile?: boolean; // Флаг для мобильной версии
}

export function NotificationsMenu({
  notifications,
  readNotifications,
  isOpen,
  onClose: _onClose, // eslint-disable-line @typescript-eslint/no-unused-vars
  onMarkAsRead,
  menuRef: externalMenuRef,
  isMobile = false
}: NotificationsMenuProps) {
  const { shouldRender, menuRef: animatedMenuRef } = useMenuAnimation(isOpen);
  
  // Синхронизируем refs
  useEffect(() => {
    if (animatedMenuRef.current && externalMenuRef && 'current' in externalMenuRef) {
      (externalMenuRef as React.MutableRefObject<HTMLDivElement | null>).current = animatedMenuRef.current;
    }
  }, [shouldRender, animatedMenuRef, externalMenuRef]);

  if (!shouldRender) return null;

  // Стили для мобильного меню (как мобильное меню профиля)
  if (isMobile) {
    return (
      <div 
        ref={animatedMenuRef}
        className="lg:hidden mt-4 py-4 bg-black/50 backdrop-blur-xl rounded-2xl border border-white/10"
      >
        <div className="px-4 space-y-2">
          <div className="p-4 border-b border-white/10 mx-2">
            <h3 className="text-white font-semibold text-sm">Уведомления</h3>
          </div>
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-neutral-400 text-sm">
              Нет уведомлений
            </div>
          ) : (
            <div className="py-2 max-h-96 overflow-y-auto">
              {notifications.map((notification) => {
                const isRead = readNotifications.has(notification.id);
                return (
                  <div
                    key={notification.id}
                    onClick={() => onMarkAsRead(notification.id)}
                    className={`px-4 py-3 mx-2 my-1 rounded-xl cursor-pointer transition-colors duration-200 ${
                      !isRead 
                        ? 'bg-blue-500/10 hover:bg-blue-500/20 border-l-2 border-blue-500' 
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!isRead && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium text-sm mb-1">
                          {notification.title}
                        </div>
                        <div className="text-neutral-400 text-xs">
                          {notification.message}
                        </div>
                        <div className="text-neutral-500 text-xs mt-1">
                          {new Date(notification.created_at).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Стили для ПК (как UserMenu)
  return (
    <div 
      ref={animatedMenuRef}
      className="absolute -right-3 top-full mt-4 w-64 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50"
    >
      <div>
        <div className="p-4 border-b border-white/10 mx-2">
          <h3 className="text-white font-semibold text-sm">Уведомления</h3>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-neutral-400 text-sm">
              Нет уведомлений
            </div>
          ) : (
            <div className="py-2">
              {notifications.map((notification) => {
                const isRead = readNotifications.has(notification.id);
                return (
                  <div
                    key={notification.id}
                    onClick={() => onMarkAsRead(notification.id)}
                    className={`px-4 py-3 mx-2 my-1 rounded-xl cursor-pointer transition-colors duration-200 ${
                      !isRead 
                        ? 'bg-blue-500/10 hover:bg-blue-500/20 border-l-2 border-blue-500' 
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!isRead && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium text-sm mb-1">
                          {notification.title}
                        </div>
                        <div className="text-neutral-400 text-xs">
                          {notification.message}
                        </div>
                        <div className="text-neutral-500 text-xs mt-1">
                          {new Date(notification.created_at).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

