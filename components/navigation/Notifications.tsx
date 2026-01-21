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
  menuRef?: React.RefObject<HTMLDivElement | null>;
  isMobile?: boolean;
}

export function NotificationsMenu({
  notifications,
  readNotifications,
  isOpen,
  onClose: _onClose,
  onMarkAsRead,
  menuRef: externalMenuRef,
  isMobile = false
}: NotificationsMenuProps) {
  const { shouldRender, menuRef: animatedMenuRef } = useMenuAnimation(isOpen);
  
  useEffect(() => {
    if (animatedMenuRef.current && externalMenuRef && 'current' in externalMenuRef) {
      (externalMenuRef as React.MutableRefObject<HTMLDivElement | null>).current = animatedMenuRef.current;
    }
  }, [shouldRender, animatedMenuRef, externalMenuRef]);

  if (!shouldRender) return null;

  const unreadCount = notifications.filter(n => !readNotifications.has(n.id)).length;

  // Мобильная версия
  if (isMobile) {
    return (
      <div 
        ref={animatedMenuRef}
        className="lg:hidden mt-4 py-4 bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl"
        style={{
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
        }}
      >
        <div className="px-4">
          <div className="p-4 border-b border-white/10 mb-2">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-base">Уведомления</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold text-white bg-primary-500 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-800/50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <p className="text-neutral-400 text-sm">Нет уведомлений</p>
              </div>
            ) : (
              <div className="space-y-1">
                {notifications.map((notification) => {
                  const isRead = readNotifications.has(notification.id);
                  return (
                    <div
                      key={notification.id}
                      onClick={() => onMarkAsRead(notification.id)}
                      className={`group relative p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                        !isRead 
                          ? 'bg-gradient-to-r from-blue-500/15 to-blue-600/5 border-l-2 border-blue-500 hover:from-blue-500/20 hover:to-blue-600/10' 
                          : 'bg-neutral-800/30 hover:bg-neutral-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {!isRead && (
                          <div className="mt-1.5 flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm mb-1.5 ${isRead ? 'text-white/90' : 'text-white'}`}>
                            {notification.title}
                          </div>
                          <div className="text-neutral-400 text-xs leading-relaxed mb-2">
                            {notification.message}
                          </div>
                          <div className="text-neutral-500 text-xs">
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

  // Десктопная версия
  return (
    <div 
      ref={animatedMenuRef}
      className="absolute -right-3 top-full mt-4 w-80 max-w-[calc(100vw-2rem)] bg-neutral-900/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
      style={{
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
      }}
    >
      {/* Header */}
      <div className="p-5 bg-gradient-to-br from-neutral-800/50 to-neutral-900/50 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-base">Уведомления</h3>
          {unreadCount > 0 && (
            <span className="px-2.5 py-1 text-xs font-semibold text-white bg-primary-500 rounded-full animate-pulse">
              {unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-800/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-neutral-400 text-sm">Нет уведомлений</p>
            <p className="text-neutral-500 text-xs mt-1">Новые уведомления появятся здесь</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {notifications.map((notification) => {
              const isRead = readNotifications.has(notification.id);
              return (
                <div
                  key={notification.id}
                  onClick={() => onMarkAsRead(notification.id)}
                  className={`group relative p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                    !isRead 
                      ? 'bg-gradient-to-r from-blue-500/15 to-blue-600/5 border-l-2 border-blue-500 hover:from-blue-500/20 hover:to-blue-600/10' 
                      : 'bg-neutral-800/30 hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {!isRead && (
                      <div className="mt-1.5 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm mb-1.5 ${isRead ? 'text-white/90' : 'text-white'}`}>
                        {notification.title}
                      </div>
                      <div className="text-neutral-400 text-xs leading-relaxed mb-2">
                        {notification.message}
                      </div>
                      <div className="text-neutral-500 text-xs">
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
