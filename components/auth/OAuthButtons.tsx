import Image from 'next/image';
import iconVk from '@/public/static/icons/oauth/vk.svg';
import iconYandex from '@/public/static/icons/oauth/yandex.svg';
import iconTelegram from '@/public/static/icons/oauth/telegram.svg';
import iconGoogle from '@/public/static/icons/oauth/google.svg';
import iconTwitch from '@/public/static/icons/oauth/twitch.svg';

interface OAuthButtonsProps {
  isLoading: boolean;
  isPopupOpen: boolean;
  activeProvider: string | null;
  onOAuthLogin: (provider: string) => void;
}

export const OAuthButtons = ({
  isLoading,
  isPopupOpen,
  activeProvider,
  onOAuthLogin,
}: OAuthButtonsProps) => {
  const providers = [
    { id: 'vk', name: 'VK ID', icon: iconVk },
    { id: 'yandex', name: 'Yandex ID', icon: iconYandex },
    { id: 'telegram', name: 'Telegram', icon: iconTelegram },
    { id: 'google', name: 'Google', icon: iconGoogle },
    { id: 'twitch', name: 'Twitch', icon: iconTwitch },
  ];

  return (
    <div className="oauth-grid">
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
          onClick={() => onOAuthLogin(provider.id)}
          disabled={isLoading || isPopupOpen}
          title={`Войти через ${provider.name}`}
          aria-label={`Войти через ${provider.name}`}
        >
          {activeProvider === provider.id ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"></div>
          ) : (
            <Image
              src={provider.icon}
              alt={provider.name}
              width={20}
              height={20}
              className="oauth-icon"
            />
          )}
        </button>
      ))}
    </div>
  );
};
