'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AreaChart } from '@/components/admin/AreaChart';
import { trpc } from '@/lib/trpc/client';
const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-neutral-800 ${className || ''}`} />
);
import type { AnalyticsPeriod } from '@/lib/support/analytics';

const PERIODS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: 'hour', label: '1 час' },
  { value: 'day', label: '1 день' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

export default function SupportAnalytics() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');

  const {
    data: rawData,
    error: trpcError,
    isLoading: loading,
  } = trpc.admin.supportAnalytics.useQuery(
    { period },
    { staleTime: 10_000, refetchOnWindowFocus: false },
  );

  const analytics = rawData?.analytics ?? null;
  const error = trpcError?.message ?? '';

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {['stat-1', 'stat-2', 'stat-3', 'stat-4'].map((skeletonKey) => (
            <Card key={skeletonKey} className="border-neutral-800 bg-neutral-900">
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
      <Card className="border-red-500/30 bg-red-500/10">
        <CardContent className="pt-6">
          <p className="text-red-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card className="border-neutral-800 bg-neutral-900">
        <CardContent className="pt-6">
          <p className="text-center text-neutral-500">Данные аналитики недоступны</p>
        </CardContent>
      </Card>
    );
  }

  // Подготовка данных для графиков
  const ticketsChartData = analytics.ticketsCreatedDaily.map((day, index) => ({
    date: formatDate(day.date),
    created: day.count,
    closed: analytics.ticketsClosedDaily[index]?.count || 0,
  }));

  const messagesChartData = analytics.messagesSentDaily.map((day) => ({
    date: formatDate(day.date),
    messages: day.count,
  }));

  const ticketsHourlyChartData = analytics.ticketsCreatedHourly.map((hour) => ({
    hour: formatHour(hour.hour),
    tickets: hour.count,
  }));

  const messagesHourlyChartData = analytics.messagesSentHourly.map((hour) => ({
    hour: formatHour(hour.hour),
    messages: hour.count,
  }));

  return (
    <div className="space-y-4">
      {/* Заголовок с выбором периода */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Аналитика поддержки</h3>
          <p className="mt-0.5 text-xs text-neutral-400">Статистика системы поддержки</p>
        </div>
        <div className="flex items-center gap-1.5">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              variant={period === p.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p.value)}
              className={`h-7 px-2.5 py-1 text-xs ${period === p.value ? '' : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'}`}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Компактные метрики в одну строку */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-neutral-800 bg-neutral-900 p-3">
          <CardDescription className="mb-1 text-xs text-neutral-400">Создано</CardDescription>
          <div className="text-2xl font-bold text-white">{analytics.totalTicketsCreated}</div>
        </Card>

        <Card className="border-neutral-800 bg-neutral-900 p-3">
          <CardDescription className="mb-1 text-xs text-neutral-400">Закрыто</CardDescription>
          <div className="text-2xl font-bold text-green-400">{analytics.totalTicketsClosed}</div>
        </Card>

        <Card className="border-neutral-800 bg-neutral-900 p-3">
          <CardDescription className="mb-1 text-xs text-neutral-400">Сообщений</CardDescription>
          <div className="text-2xl font-bold text-blue-400">{analytics.totalMessagesSent}</div>
        </Card>

        <Card className="border-neutral-800 bg-neutral-900 p-3">
          <CardDescription className="mb-1 text-xs text-neutral-400">WebSocket</CardDescription>
          <div className="text-2xl font-bold text-purple-400">{analytics.websocketConnections}</div>
        </Card>
      </div>

      {/* Средние значения и статусы в одну строку */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="border-neutral-800 bg-neutral-900 p-3">
          <CardDescription className="mb-1 text-xs text-neutral-400">
            Среднее время ответа
          </CardDescription>
          <div className="text-xl font-bold text-blue-400">
            {formatTime(analytics.avgResponseTime)}
          </div>
        </Card>

        <Card className="border-neutral-800 bg-neutral-900 p-3">
          <CardDescription className="mb-1 text-xs text-neutral-400">
            Среднее время решения
          </CardDescription>
          <div className="text-xl font-bold text-green-400">
            {formatTime(analytics.avgResolutionTime)}
          </div>
        </Card>

        {Object.keys(analytics.ticketsByStatus).length > 0 && (
          <Card className="border-neutral-800 bg-neutral-900 p-3">
            <CardDescription className="mb-2 text-xs text-neutral-400">По статусам</CardDescription>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(analytics.ticketsByStatus)
                .slice(0, 3)
                .map(([status, count]) => (
                  <Badge
                    key={status}
                    variant="secondary"
                    className="border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200"
                  >
                    <span className="mr-1 font-semibold">{count}</span>
                    <span className="text-[10px] capitalize">{status}</span>
                  </Badge>
                ))}
            </div>
          </Card>
        )}
      </div>

      {/* График тикетов по дням с area chart */}
      {ticketsChartData.length > 0 && (
        <Card className="border-neutral-800 bg-neutral-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Тикеты по дням</CardTitle>
            <CardDescription className="text-xs">Создано и закрыто тикетов</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <AreaChart
              data={ticketsChartData}
              xKey="date"
              height={200}
              series={[
                { key: 'created', label: 'Создано', color: '#3b82f6' },
                { key: 'closed', label: 'Закрыто', color: '#10b981' },
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* График сообщений по дням */}
      {messagesChartData.length > 0 && (
        <Card className="border-neutral-800 bg-neutral-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Сообщения по дням</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AreaChart
              data={messagesChartData}
              xKey="date"
              height={200}
              series={[{ key: 'messages', label: 'Сообщений', color: '#8b5cf6' }]}
            />
          </CardContent>
        </Card>
      )}

      {/* Графики по часам в одну строку */}
      {ticketsHourlyChartData.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="border-neutral-800 bg-neutral-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Тикеты по часам</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <AreaChart
                data={ticketsHourlyChartData}
                xKey="hour"
                height={150}
                series={[{ key: 'tickets', label: 'Тикетов', color: '#3b82f6' }]}
              />
            </CardContent>
          </Card>

          <Card className="border-neutral-800 bg-neutral-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Сообщения по часам</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <AreaChart
                data={messagesHourlyChartData}
                xKey="hour"
                height={150}
                series={[{ key: 'messages', label: 'Сообщений', color: '#8b5cf6' }]}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
