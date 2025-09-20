import { Metadata } from 'next';
import AuthIsolatedClient from './AuthIsolatedClient';

export const metadata: Metadata = {
  title: "Авторизация — RVN.GURU",
  description: "Страница входа и регистрации. Личный кабинет. Raven Private.",
  icons: {
    icon: "/static/favicon.ico",
  },
};

export default function AuthPage() {
  return <AuthIsolatedClient />;
}
