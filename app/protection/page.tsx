import { headers } from 'next/headers';
import ProtectionClient from '@/components/protection/ProtectionClient';

/**
 * Страница защиты от ботов и DDoS атак
 *
 * Функциональность:
 * - Отображает Cloudflare Turnstile CAPTCHA для проверки человечности
 * - Показывает IP адрес пользователя (с возможностью раскрытия)
 * - После успешной проверки устанавливает куки доступа на 12 часов
 * - Автоматически перенаправляет на исходную страницу после проверки
 */
export default async function ProtectionPage() {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const cfConnectingIp = headersList.get('cf-connecting-ip');

  const ip = forwardedFor?.split(',')[0]?.trim() || realIp || cfConnectingIp || null;

  return <ProtectionClient initialIp={ip} />;
}
