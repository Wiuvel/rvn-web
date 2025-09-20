'use client';

import { useState } from 'react';
import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';

export default function FAQSection() {
  const [openItem, setOpenItem] = useState<number | null>(null);
  
  // GSAP refs
  const titleRef = useFadeIn(0.1);
  const faqItemsRef = useStaggeredFadeIn(0.2, 0.05);

  const faqs = [
    {
      question: "Как оформить покупку?",
      answer: "Просто выберите подходящий тариф в разделе «Тарифы» и нажмите «Купить». После оплаты вы получите доступ к панели с инструкциями и профилем для подключения."
    },
    {
      question: "Почему именно VLESS?",
      answer: "В последнее время в РФ значительно усилились ограничения сети и контроль над легко отслеживаемыми подключениями. VLESS — современный и гибкий протокол, который умело маскируется под обычный интернет-трафик и не зависит от стандартных сигнатур, обеспечивая стабильный и защищённый доступ."
    },
    {
      question: "Какие есть способы оплаты?",
      answer: "Сайт в разработке."
    },
    {
      question: "Существует ли гарантия?",
      answer: "Да. У нас действует 7-дневная гарантия возврата средств в случае, если сервис вам не подошел."
    }
  ];

  const toggleItem = (index: number) => {
    setOpenItem(openItem === index ? null : index);
  };

  return (
    <section id="faq" className="fade-in isolate">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
        <h2 ref={titleRef} className="text-3xl font-semibold text-center">Частые вопросы</h2>
        <div ref={faqItemsRef} className="mt-8 divide-y divide-neutral-800/70">
          {faqs.map((faq, index) => (
            <div key={index} className="py-4">
              <button 
                className="w-full flex justify-between items-center text-left faq-question" 
                onClick={() => toggleItem(index)}
                aria-expanded={openItem === index}
                aria-controls={`faq${index + 1}`}
                tabIndex={0}
              >
                <span className="font-medium">{faq.question}</span>
                <svg 
                  width="18" 
                  height="18" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  className={`faq-icon transition-transform duration-300 ${openItem === index ? 'faq-open' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
              </button>
              {openItem === index && (
                <div 
                  id={`faq${index + 1}`}
                  className="mt-2 text-neutral-400"
                  style={{
                    animation: 'fadeIn 0.3s ease-out'
                  }}
                >
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

