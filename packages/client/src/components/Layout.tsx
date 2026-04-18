import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const toggleLanguage = () => {
    const next = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr';
  };

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-primary-600">
            {t('app.title')}
          </h2>
          <button
            onClick={toggleLanguage}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
          >
            {t('language.toggle')}
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
