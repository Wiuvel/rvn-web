import Link from 'next/link';

export default function DashboardPreviewSection() {
  return (
    <section id="dashboard-preview" className="fade-in isolate relative z-0">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <h2 className="text-2xl md:text-3xl font-semibold">Удобная [Панель управления]</h2>
            <p className="mt-3 text-neutral-400 text-sm md:text-base max-w-xl mx-auto lg:mx-0">
              Простой старт без сложных настроек: подписка и ключи — на одной странице. Зарегистрируйтесь и начните пользоваться сервисом.
            </p>
            <div className="mt-4 md:mt-6 flex flex-wrap gap-3 md:gap-4 justify-center lg:justify-start">
              <Link 
                href="/auth" 
                className="rounded-xl border border-neutral-800 px-5 py-2.5 md:px-6 md:py-3 hover:bg-neutral-900 hover:scale-105 text-sm md:text-base transition-transform"
              >
                Авторизация
              </Link>
              <Link 
                href="#" 
                className="rounded-xl border border-neutral-800 px-5 py-2.5 md:px-6 md:py-3 hover:bg-neutral-900 hover:scale-105 text-sm md:text-base transition-transform"
              >
                Новости
              </Link>
              <Link 
                href="/dashboard" 
                className="rounded-xl border border-neutral-800 px-5 py-2.5 md:px-6 md:py-3 hover:bg-neutral-900 hover:scale-105 text-sm md:text-base transition-transform"
              >
                О проекте
              </Link>
            </div>
          </div>
          <div className="order-1 lg:order-2 hidden lg:block">
            <div className="rounded-2xl border border-neutral-800 bg-black p-4">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="text-white">Личный кабинет</span>
                <span className="flex items-center gap-1 text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-400"></span>
                  Online
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="text-neutral-400 text-xs">Подписка</div>
                  <div className="mt-1 text-lg font-semibold">SAFE-2</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="text-neutral-400 text-xs">Действует до</div>
                  <div className="mt-1 text-lg font-semibold text-neutral-200">—.—.25</div>
                </div>
                <div className="col-span-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="text-neutral-400 text-xs">Ваш ключ</div>
                  <div className="mt-1 font-mono text-sm truncate">
                    vless://<span className="blur-sm hover:blur-none transition cursor-pointer select-none">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</span>@rvn.market
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 py-2 text-xs">DE-1</div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 py-2 text-xs">DE-2</div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 py-2 text-xs">SWE-1</div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 py-2 text-xs">SWE-2</div>
              </div>
              <div className="mt-2 w-full rounded-xl bg-white border border-neutral-800 text-neutral-900 font-medium py-2 transition text-sm text-center select-none">
                Добавить устройство
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

