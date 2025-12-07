'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Простой Skeleton компонент для загрузки
const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-neutral-800 rounded ${className || ''}`} />
);
import type { AnalyticsPeriod } from '@/lib/analytics/support-analytics';

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
  period: AnalyticsPeriod;
}

const PERIODS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: 'hour', label: '1 час' },
  { value: 'day', label: '1 день' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

export default function SupportAnalytics() {
  const [analytics, setAnalytics] = useState<SupportAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');

  const fetchAnalytics = useCallback(async (selectedPeriod: AnalyticsPeriod) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/support/analytics?period=${selectedPeriod}`, {
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
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} мин`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}ч ${mins}мин`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-neutral-900 border-neutral-800">
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-500/10 border-red-500/30">
        <CardContent className="pt-6">
          <p className="text-red-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card className="bg-neutral-900 border-neutral-800">
        <CardContent className="pt-6">
          <p className="text-neutral-500 text-center">Данные аналитики недоступны</p>
        </CardContent>
      </Card>
    );
  }

  // Находим максимальные значения для масштабирования графиков
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
        <div>
          <h3 className="text-2xl font-semibold text-white">Аналитика поддержки</h3>
          <p className="text-sm text-neutral-400 mt-1">Статистика системы поддержки</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              variant={period === p.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p.value)}
              className={period === p.value ? '' : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Основные метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-3">
            <CardDescription className="text-neutral-400">Создано тикетов</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{analytics.totalTicketsCreated}</div>
            <p className="text-xs text-neutral-500 mt-1">За выбранный период</p>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-3">
            <CardDescription className="text-neutral-400">Закрыто тикетов</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">{analytics.totalTicketsClosed}</div>
            <p className="text-xs text-neutral-500 mt-1">За выбранный период</p>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-3">
            <CardDescription className="text-neutral-400">Сообщений</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">{analytics.totalMessagesSent}</div>
            <p className="text-xs text-neutral-500 mt-1">За выбранный период</p>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-3">
            <CardDescription className="text-neutral-400">WebSocket</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-400">{analytics.websocketConnections}</div>
            <p className="text-xs text-neutral-500 mt-1">Активных соединений</p>
          </CardContent>
        </Card>
      </div>

      {/* Средние значения */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-lg">Среднее время ответа</CardTitle>
            <CardDescription>Время до первого ответа поддержки</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-blue-400">{formatTime(analytics.avgResponseTime)}</div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-lg">Среднее время решения</CardTitle>
            <CardDescription>Время до закрытия тикета</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-400">{formatTime(analytics.avgResolutionTime)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Тикеты по статусам */}
      {Object.keys(analytics.ticketsByStatus).length > 0 && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-lg">Тикеты по статусам</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(analytics.ticketsByStatus).map(([status, count]) => (
                <Badge key={status} variant="secondary" className="bg-neutral-800 text-neutral-200 border-neutral-700 px-4 py-2 text-sm">
                  <span className="font-semibold mr-2">{count}</span>
                  <span className="capitalize">{status}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* График тикетов */}
      {analytics.ticketsCreatedDaily.length > 0 && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-lg">Тикеты по дням</CardTitle>
            <CardDescription>Создано и закрыто тикетов</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.ticketsCreatedDaily.map((day, index) => {
                const closed = analytics.ticketsClosedDaily[index]?.count || 0;
                const createdHeight = (day.count / maxDailyTickets) * 100;
                const closedHeight = (closed / maxDailyTickets) * 100;
                
                return (
                  <div key={day.date} className="flex items-end gap-2">
                    <div className="flex-1">
                      <div className="flex items-end gap-1 h-20">
                        <div
                          className="bg-blue-500 rounded-t flex-1 transition-all"
                          style={{ height: `${createdHeight}%`, minHeight: day.count > 0 ? '2px' : '0' }}
                          title={`Создано: ${day.count}`}
                        />
                        <div
                          className="bg-green-500 rounded-t flex-1 transition-all"
                          style={{ height: `${closedHeight}%`, minHeight: closed > 0 ? '2px' : '0' }}
                          title={`Закрыто: ${closed}`}
                        />
                      </div>
                      <div className="text-xs text-neutral-500 mt-2 text-center">{formatDate(day.date)}</div>
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
          </CardContent>
        </Card>
      )}

      {/* График сообщений */}
      {analytics.messagesSentDaily.length > 0 && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-lg">Сообщения по дням</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1">
              {analytics.messagesSentDaily.map((day) => {
                const height = (day.count / maxDailyMessages) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-purple-500 rounded-t transition-all"
                      style={{ height: `${height}%`, minHeight: day.count > 0 ? '2px' : '0', maxHeight: '120px' }}
                      title={`${formatDate(day.date)}: ${day.count} сообщений`}
                    />
                    <div className="text-xs text-neutral-500 mt-2">{formatDate(day.date)}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* График по часам */}
      {analytics.ticketsCreatedHourly.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-lg">Тикеты по часам</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1">
                {analytics.ticketsCreatedHourly.map((hour) => {
                  const height = (hour.count / maxHourlyTickets) * 100;
                  return (
                    <div key={hour.hour} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-blue-500 rounded-t transition-all"
                        style={{ height: `${height}%`, minHeight: hour.count > 0 ? '2px' : '0', maxHeight: '100px' }}
                        title={`${formatHour(hour.hour)}: ${hour.count} тикетов`}
                      />
                      <div className="text-xs text-neutral-500 mt-2">{formatHour(hour.hour)}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-lg">Сообщения по часам</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1">
                {analytics.messagesSentHourly.map((hour) => {
                  const height = (hour.count / maxHourlyMessages) * 100;
                  return (
                    <div key={hour.hour} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-purple-500 rounded-t transition-all"
                        style={{ height: `${height}%`, minHeight: hour.count > 0 ? '2px' : '0', maxHeight: '100px' }}
                        title={`${formatHour(hour.hour)}: ${hour.count} сообщений`}
                      />
                      <div className="text-xs text-neutral-500 mt-2">{formatHour(hour.hour)}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
