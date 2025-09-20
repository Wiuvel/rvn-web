'use client';

import Link from 'next/link';
import { useFadeIn } from '@/hooks/useGSAP';

export default function CookiePolicyPage() {
  const titleRef = useFadeIn(0.1);
  const contentRef = useFadeIn(0.2);

  return (
    <div className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <Link href="/" className="back-btn">
            ← На главную
          </Link>
          <div className="logo">Raven Private</div>
        </header>
        
        <main>
          <div ref={titleRef} className="page-title">
            <h1>Политика использования Cookie</h1>
            <p className="subtitle">
              Узнайте, как мы используем файлы Cookie для обеспечения безопасности и работы сервиса.
            </p>
          </div>
          
          <div ref={contentRef} className="policy-card">
            <h2><strong>1. Что такое Cookie</strong></h2>
            <p>
              Cookie — это небольшие текстовые файлы, которые сохраняются на вашем устройстве 
              при посещении веб-сайтов. Они помогают сайтам запоминать информацию о ваших 
              предпочтениях и обеспечивают корректную работу различных функций.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>2. Как мы используем Cookie</strong></h2>
            <p>
              Raven Private использует Cookie исключительно для обеспечения безопасности и 
              корректной работы сервиса. Мы не используем Cookie для отслеживания вашей 
              активности или сбора персональных данных.
            </p>
            
            <h3>Типы используемых Cookie:</h3>
            <ul>
              <li>
                <strong>Необходимые Cookie</strong> — обеспечивают базовую функциональность 
                сайта и безопасность
              </li>
              <li>
                <strong>Функциональные Cookie</strong> — запоминают ваши настройки и предпочтения
              </li>
              <li>
                <strong>Безопасностные Cookie</strong> — защищают от атак и обеспечивают 
                безопасность сессий
              </li>
            </ul>
            
            <div className="divider"></div>
            
            <h2><strong>3. Cloudflare Turnstile</strong></h2>
            <p>
              Мы используем сервис Cloudflare Turnstile для защиты от автоматизированных 
              действий (ботов). Этот сервис может устанавливать собственные Cookie для 
              обеспечения безопасности.
            </p>
            <p>
              Подробнее о том, как Cloudflare использует Cookie, вы можете узнать в их{' '}
              <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">
                Политике конфиденциальности
              </a>.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>4. Управление Cookie</strong></h2>
            <p>
              Вы можете управлять Cookie через настройки вашего браузера. Однако отключение 
              некоторых Cookie может привести к некорректной работе сайта.
            </p>
            
            <h3>Как отключить Cookie в популярных браузерах:</h3>
            <ul>
              <li>
                <strong>Chrome:</strong> Настройки → Конфиденциальность и безопасность → 
                Файлы cookie и другие данные сайтов
              </li>
              <li>
                <strong>Firefox:</strong> Настройки → Приватность и защита → 
                Файлы cookie и данные сайтов
              </li>
              <li>
                <strong>Safari:</strong> Настройки → Конфиденциальность → 
                Управлять данными веб-сайтов
              </li>
              <li>
                <strong>Edge:</strong> Настройки → Файлы cookie и разрешения сайтов → 
                Управлять и удалять файлы cookie
              </li>
            </ul>
            
            <div className="divider"></div>
            
            <h2><strong>5. Сторонние сервисы</strong></h2>
            <p>
              Мы не используем сторонние аналитические или рекламные сервисы, которые 
              могли бы устанавливать дополнительные Cookie для отслеживания.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>6. Изменения в политике</strong></h2>
            <p>
              Мы можем обновлять данную политику по мере необходимости. О значимых изменениях 
              мы уведомляем через уведомления на сайте или в личном кабинете.
            </p>
            
            <div className="last-updated">
              Последнее обновление: 11 сентября 2025 г.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

