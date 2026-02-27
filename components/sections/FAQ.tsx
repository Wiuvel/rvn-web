'use client';

import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { BookOpen } from 'lucide-react';

export default function FAQSection() {
  const leftRef = useFadeIn(0.1);
  const faqItemsRef = useStaggeredFadeIn(0.2, 0.05);

  const faqs = [
    {
      question: 'Как начать пользоваться сервисом?',
      answer:
        'Зарегистрируйтесь на сайте, после чего вы получите доступ к личному кабинету. В личном кабинете вы сможете выбрать и оплатить подходящий тариф. После оплаты вы получите готовые профили для подключения и подробные инструкции по настройке для всех поддерживаемых платформ.',
    },
    {
      question: 'Какие протоколы и технологии используются?',
      answer:
        'Мы используем современные протоколы VLESS и Hysteria с шифрованием AES-256 и TLS. Эти технологии обеспечивают высокую скорость, стабильность соединения и эффективную маскировку трафика под обычный интернет-трафик. Мы придерживаемся политики нулевых логов и не собираем данные о вашей активности.',
    },
    {
      question: 'Как работает гарантия возврата средств?',
      answer:
        'Мы предоставляем 7-дневную гарантию возврата средств. Если сервис не подошел по любой причине, вы можете вернуть полную стоимость подписки в течение недели после покупки.',
    },
  ];

  return (
    <section id="faq" className="fade-in relative isolate overflow-hidden">
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 hidden h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-primary-500/[0.03] blur-[120px] md:block"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="relative grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div ref={leftRef} className="space-y-6">
            <Badge
              variant="outline"
              className="border-neutral-700/50 bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800/50"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              FAQ
            </Badge>
            <h2 className="text-2xl font-semibold leading-tight text-white md:text-3xl lg:text-4xl">
              Ответы на частые <span className="text-primary-400">вопросы</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-400 md:text-lg">
              Сборник самых популярных вопросов о нашем сервисе.
            </p>

            {/* Decorative element */}
            <div className="hidden items-center gap-3 pt-4 text-xs text-neutral-600 lg:flex">
              <div className="h-px w-8 bg-gradient-to-r from-primary-500/30 to-transparent" />
              <span>Не нашли ответ? Напишите нам в поддержку</span>
            </div>
          </div>

          <div ref={faqItemsRef}>
            <Accordion type="single" collapsible className="w-full space-y-3">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={faq.question}
                  value={`item-${index}`}
                  className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-5 backdrop-blur-sm transition-all duration-300 hover:border-neutral-700/60 hover:bg-neutral-900/60 data-[state=open]:border-primary-500/20 data-[state=open]:bg-neutral-900/60"
                >
                  <AccordionTrigger className="py-4 text-left font-medium text-white hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 text-sm leading-relaxed text-neutral-400">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}
