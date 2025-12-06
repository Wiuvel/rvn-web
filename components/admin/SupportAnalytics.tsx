'use client';

import { useState, useEffect, useCallback } from 'react';

interface SupportAnalytics {
  totalTicketsCreated: number;
  totalTicketsClosed: number;
  totalMessagesSent: number;
  ticketsByStatus: Record<string, number>;
  avgResponseTime: number;
  avgResolutionTime: number;
  ticketsCreatedDaily: Array<{ date: string; count: number }>;
  ticketsClosedDaily: Array<{ date: string; count: number }>;
  messagesSentDaily: Array<{ date: string; count: number }>;
  ticketsCreatedHourly: Array<{ hour: number; count: number }>;
  messagesSentHourly: Array<{ hour: number; count: number }>;
  websocketConnections: number;
  websocketMessages: number;
}

export default function SupportAnalytics() {
  const [analytics, setAnalytics] = useState<SupportAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/support/analytics?days=${days}`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Ошибка загрузки аналитики');
        setAnalytics(null);
        return;
      }

      setAnalytics(data.analytics);
    } catch {
      setError('Ошибка загрузки аналитики');
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} мин`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}ч ${mins}мин`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-neutral-500 text-center py-8">
        Данные аналитики недоступны
      </div>
    );
  }

  // Находим максимальное значение для масштабирования графиков
  const maxDailyTickets = Math.max(
    ...analytics.ticketsCreatedDaily.map(d => d.count),
    ...analytics.ticketsClosedDaily.map(d => d.count),
    1
  );
  const maxDailyMessages = Math.max(
    ...analytics.messagesSentDaily.map(d => d.count),
    1
  );
  const maxHourlyTickets = Math.max(
    ...analytics.ticketsCreatedHourly.map(h => h.count),
    1
  );
  const maxHourlyMessages = Math.max(
    ...analytics.messagesSentHourly.map(h => h.count),
    1
  );

  return (
    <div className="space-y-6">
      {/* Заголовок с выбором периода */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Аналитика системы поддержки</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-400">Период:</label>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={60}>60 дней</option>
            <option value={90}>90 дней</option>
          </select>
        </div>
      </div>

      {/* Общие метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">Всего тикетов</div>
          <div className="text-2xl font-bold text-white">{analytics.totalTicketsCreated}</div>
          <div className="text-xs text-neutral-500 mt-1">Создано</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">Закрыто тикетов</div>
          <div className="text-2xl font-bold text-white">{analytics.totalTicketsClosed}</div>
          <div className="text-xs text-neutral-500 mt-1">Всего закрыто</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">Сообщений отправлено</div>
          <div className="text-2xl font-bold text-white">{analytics.totalMessagesSent}</div>
          <div className="text-xs text-neutral-500 mt-1">Всего сообщений</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">WebSocket соединений</div>
          <div className="text-2xl font-bold text-white">{analytics.websocketConnections}</div>
          <div className="text-xs text-neutral-500 mt-1">Всего подключений</div>
        </div>
      </div>

      {/* Средние значения */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">Среднее время ответа</div>
          <div className="text-2xl font-bold text-blue-400">{formatTime(analytics.avgResponseTime)}</div>
          <div className="text-xs text-neutral-500 mt-1">Время до первого ответа поддержки</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">Среднее время решения</div>
          <div className="text-2xl font-bold text-green-400">{formatTime(analytics.avgResolutionTime)}</div>
          <div className="text-xs text-neutral-500 mt-1">Время до закрытия тикета</div>
        </div>
      </div>

      {/* Тикеты по статусам */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-4">Тикеты по статусам</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(analytics.ticketsByStatus).map(([status, count]) => (
            <div key={status} className="text-center">
              <div className="text-2xl font-bold text-white">{count}</div>
              <div className="text-sm text-neutral-400 capitalize">{status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* График тикетов по дням */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-4">Тикеты по дням</h4>
        <div className="space-y-2">
          {analytics.ticketsCreatedDaily.map((day, index) => {
            const closed = analytics.ticketsClosedDaily[index]?.count || 0;
            const createdHeight = (day.count / maxDailyTickets) * 100;
            const closedHeight = (closed / maxDailyTickets) * 100;
            
            return (
              <div key={day.date} className="flex items-end gap-1">
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '60px' }}>
                    <div
                      className="bg-blue-500 w-full rounded-t"
                      style={{ height: `${createdHeight}%`, minHeight: day.count > 0 ? '2px' : '0' }}
                      title={`Создано: ${day.count}`}
                    />
                    <div
                      className="bg-green-500 w-full rounded-t"
                      style={{ height: `${closedHeight}%`, minHeight: closed > 0 ? '2px' : '0' }}
                      title={`Закрыто: ${closed}`}
                    />
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">{formatDate(day.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>Создано</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Закрыто</span>
          </div>
        </div>
      </div>

      {/* График сообщений по дням */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-4">Сообщения по дням</h4>
        <div className="space-y-2">
          {analytics.messagesSentDaily.map((day) => {
            const height = (day.count / maxDailyMessages) * 100;
            
            return (
              <div key={day.date} className="flex items-end gap-1">
                <div className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-purple-500 rounded-t"
                    style={{ height: `${height}%`, minHeight: day.count > 0 ? '2px' : '0', maxHeight: '60px' }}
                    title={`Сообщений: ${day.count}`}
                  />
                  <div className="text-xs text-neutral-500 mt-1">{formatDate(day.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* График тикетов по часам (сегодня) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-4">Тикеты по часам (сегодня)</h4>
        <div className="flex items-end gap-1">
          {analytics.ticketsCreatedHourly.map((hour) => {
            const height = (hour.count / maxHourlyTickets) * 100;
            
            return (
              <div key={hour.hour} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-blue-500 rounded-t"
                  style={{ height: `${height}%`, minHeight: hour.count > 0 ? '2px' : '0', maxHeight: '100px' }}
                  title={`${hour.hour}:00 - ${hour.count} тикетов`}
                />
                <div className="text-xs text-neutral-500 mt-1">{hour.hour}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* График сообщений по часам (сегодня) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-4">Сообщения по часам (сегодня)</h4>
        <div className="flex items-end gap-1">
          {analytics.messagesSentHourly.map((hour) => {
            const height = (hour.count / maxHourlyMessages) * 100;
            
            return (
              <div key={hour.hour} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-purple-500 rounded-t"
                  style={{ height: `${height}%`, minHeight: hour.count > 0 ? '2px' : '0', maxHeight: '100px' }}
                  title={`${hour.hour}:00 - ${hour.count} сообщений`}
                />
                <div className="text-xs text-neutral-500 mt-1">{hour.hour}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* WebSocket метрики */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-4">WebSocket метрики</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-neutral-400 mb-1">Всего соединений</div>
            <div className="text-xl font-bold text-white">{analytics.websocketConnections}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-400 mb-1">Всего сообщений</div>
            <div className="text-xl font-bold text-white">{analytics.websocketMessages}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

