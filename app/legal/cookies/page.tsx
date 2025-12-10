'use client';

import Link from 'next/link';
import { useFadeIn } from '@/hooks/useGSAP';
import { useState, useEffect } from 'react';
import LegalNavigation from '@/components/navigation/Legal';
import Skeleton from '@/components/ui/Skeleton';
export default function CookiePolicyPage() {
  const titleRef = useFadeIn(0.1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="legal-page">
      <div className="legal-container">
        
        <main className="mt-8">
          <div ref={titleRef} className="page-title">
            <h1>Политика использования Cookies</h1>
            <p className="subtitle">
              Информация об использовании cookie-файлов сервисом.
            </p>
          </div>
          
          <div className="legal-content-wrapper">
            <div className="legal-main-content">
              <LegalNavigation />
              {isLoading ? (
                <Skeleton />
              ) : (
              <div className="policy-card">
            <h2><strong>1. Общие положения</strong></h2>
            <p>
              Настоящая Политика использования cookie-файлов (далее — «Политика») определяет порядок применения cookie-файлов 
              и аналогичных технологий на интернет-сайте, расположенном по адресу <a href="https://rvn.market">https://rvn.market</a> (далее — «Сайт»), 
              а также содержит информацию о целях их использования, категориях обрабатываемой информации, правах Пользователя и способах управления cookie.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>2. Что такое cookie-файлы</strong></h2>
            <p>
              Куки (англ. cookie) — это небольшие текстовые файлы, сохраняемые на вашем устройстве при посещении веб-сайтов. 
              Они помогают сайтам запоминать ваши предпочтения и обеспечивают корректную работу функций. 
              Куки не являются программами и не могут нанести вред вашему устройству.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>3. Типы используемых данных</strong></h2>
            
            <h3>3.1. Необходимые</h3>
            <p>
              Обеспечивают базовую функциональность и безопасность: аутентификацию, защиту от атак, 
              работу форм. Срок хранения: сессионные (до закрытия браузера) или до 1 года.
            </p>
            
            <h3>3.2. Функциональные</h3>
            <p>
              Запоминают ваши настройки: язык интерфейса, предпочтения отображения, уведомления. 
              Срок хранения: до 1 года.
            </p>
            
            <h3>3.3. Безопасности</h3>
            <p>
              Защищают от CSRF-атак, перехвата сессий, ботов. Срок хранения: сессионные или до 30 дней.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>4. Cloudflare Turnstile</strong></h2>
            <p>
              Мы используем{' '}
              <a href="https://www.cloudflare.com/products/turnstile/" target="_blank" rel="noopener noreferrer">
                Cloudflare Turnstile
              </a>{' '}
              для защиты от ботов. Этот сервис может устанавливать собственные куки. Подробнее — в{' '}
              <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">
                Политике конфиденциальности Cloudflare
              </a>.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>5. Управление cookie-файлами</strong></h2>
            <p>
              Вы можете управлять куки через настройки браузера: просматривать, удалять, блокировать установку, 
              настраивать исключения для сайтов. <strong>Важно:</strong> Отключение необходимых куки может 
              привести к некорректной работе Сайта и невозможности авторизации.
            </p>
            <p>
              Инструкции для популярных браузеров: Chrome (Настройки → Конфиденциальность → Файлы cookie), 
              Firefox (Настройки → Приватность → Файлы cookie), Safari (Настройки → Конфиденциальность → 
              Управлять данными веб-сайтов), Edge (Настройки → Файлы cookie и разрешения сайтов).
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>6. Локальное хранилище</strong></h2>
            <p>
              Помимо куки, мы используем LocalStorage и SessionStorage для сохранения настроек и предпочтений. 
              LocalStorage хранит данные до явного удаления, SessionStorage — только в течение сессии. 
              Данные хранятся только на вашем устройстве и не передаются автоматически на серверы. 
              Вы можете очистить их через настройки браузера.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>7. Сторонние сервисы</strong></h2>
            <p>
              Мы не используем сторонние аналитические или рекламные сервисы, устанавливающие дополнительные куки. 
              Единственный сторонний сервис — Cloudflare Turnstile, используемый исключительно для безопасности.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>8. Безопасность</strong></h2>
            <p>
              Мы применяем меры безопасности: защищенные флаги (Secure, HttpOnly) для критичных куки, 
              шифрование данных, ограничение доступа только с нашего домена, регулярное обновление механизмов безопасности.
            </p>
            
            <div className="divider"></div>
            
            <h2><strong>9. Изменения в политике</strong></h2>
            <p>
              Мы можем обновлять настоящую Политику. О значимых изменениях уведомляем через сайт, личный кабинет 
              или по электронной почте. Продолжение использования Сайта означает принятие обновленной Политики.
            </p>

            
            <div className="last-updated">
              Последнее обновление: {new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
              </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
