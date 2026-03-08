import ProtectionClient from '@/components/protection/ProtectionClient';

/**
 * Статическая страница: IP запроса получается на клиенте через /api/request-ip,
 * чтобы не конфликтовать с nextConfig.cacheComponents (без dynamic segment config).
 */
export default function ProtectionPage() {
  return <ProtectionClient />;
}
