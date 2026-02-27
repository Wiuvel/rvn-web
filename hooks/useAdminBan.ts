import { useState } from 'react';
import { PanelUser } from '@/types';

export function useAdminBan(setUserActionMessage: (msg: string) => void) {
  const [banUser, setBanUser] = useState<PanelUser | null>(null);
  const [banDuration, setBanDuration] = useState<number | 'forever'>(1);
  const [banReason, setBanReason] = useState<string>('');
  const [banLoading, setBanLoading] = useState(false);

  const handleBanUser = (user: PanelUser) => {
    setBanUser(user);
    setBanDuration(1);
    setBanReason('');
  };

  const handleBanSubmit = async () => {
    if (!banUser || !banReason.trim() || (typeof banDuration === 'number' && banDuration < 1))
      return;

    setBanLoading(true);
    try {
      // TODO: Реализовать API для бана пользователя
      // const response = await fetch('/api/admin/users/ban', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   credentials: 'include',
      //   body: JSON.stringify({
      //     userId: banUser.id,
      //     duration: banDuration,
      //     reason: banReason
      //   })
      // });

      const durationText =
        banDuration === 'forever'
          ? 'навсегда'
          : `${banDuration} ${banDuration === 1 ? 'день' : banDuration < 5 ? 'дня' : 'дней'}`;
      setUserActionMessage(
        `Пользователь ${banUser.username.toUpperCase()} заблокирован на ${durationText}`,
      );
      setTimeout(() => setUserActionMessage(''), 3000);
      setBanUser(null);
      setBanReason('');
      setBanDuration(1);
    } catch (error) {
      console.error('Error banning user:', error);
      setUserActionMessage('Ошибка при бане пользователя');
      setTimeout(() => setUserActionMessage(''), 3000);
    } finally {
      setBanLoading(false);
    }
  };

  return {
    banUser,
    setBanUser,
    banDuration,
    setBanDuration,
    banReason,
    setBanReason,
    banLoading,
    handleBanUser,
    handleBanSubmit,
  };
}
