import ProtectionClient from '@/components/protection/ProtectionClient';

/**
 * Статическая страница: IP запроса получается на клиенте через /api/request-ip,
 */
export default function ProtectionPage() {
  return <ProtectionClient />;
}
