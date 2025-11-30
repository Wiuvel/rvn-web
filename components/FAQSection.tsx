'use client';

import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

export default function FAQSection() {
  // GSAP refs
  const leftRef = useFadeIn(0.1);
  const faqItemsRef = useStaggeredFadeIn(0.2, 0.05);

  const faqs = [
    {
      question: "Как начать пользоваться сервисом?",
      answer: "Зарегистрируйтесь на сайте, после чего вы получите доступ к личному кабинету. В личном кабинете вы сможете выбрать и оплатить подходящий тариф. После оплаты вы получите готовые профили для подключения и подробные инструкции по настройке для всех поддерживаемых платформ."
    },
    {
      question: "Какие протоколы и технологии используются?",
      answer: "Мы используем современные протоколы VLESS и Hysteria с шифрованием AES-256 и TLS. Эти технологии обеспечивают высокую скорость, стабильность соединения и эффективную маскировку трафика под обычный интернет-трафик. Мы придерживаемся политики нулевых логов и не собираем данные о вашей активности."
    },
    {
      question: "Как работает гарантия возврата средств?",
      answer: "Мы предоставляем 7-дневную гарантию возврата средств. Если сервис не подошел по любой причине, вы можете вернуть полную стоимость подписки в течение недели после покупки."
    }
  ];


  return (
    <section id="faq" className="fade-in isolate">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start relative">
          {/* Левая часть */}
          <div ref={leftRef} className="space-y-6">
            <Badge variant="outline" className="bg-neutral-800/50 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800/50">
              <BookOpen className="h-4 w-4 mr-2" />
              FAQ
            </Badge>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-white leading-tight">
              Ответы на частые вопросы
            </h2>
            <p className="text-base md:text-lg text-neutral-300 mt-4">
              Сборник самых популярных вопросов о нашем сервисе.
            </p>
          </div>

          {/* Правая часть - вопросы */}
          <div ref={faqItemsRef}>
            <Accordion type="single" collapsible className="w-full space-y-3">
              {faqs.map((faq, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 transition-colors duration-200 hover:border-neutral-700 data-[state=open]:border-neutral-700"
                >
                  <AccordionTrigger className="text-left font-medium text-white hover:no-underline py-4">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-neutral-400 text-sm leading-relaxed pb-4">
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

