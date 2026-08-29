import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** 语言切换（i18n 持久化） */
export function useLanguage(): {
  lang: string;
  setLang: (l: string) => void;
  langs: { code: string; label: string }[];
} {
  const { i18n } = useTranslation();
  const setLang = useCallback(
    (l: string) => {
      void i18n.changeLanguage(l);
      try {
        localStorage.setItem('language', l);
      } catch {
        /* ignore */
      }
      document.documentElement.lang = l;
    },
    [i18n],
  );
  return {
    lang: i18n.language,
    setLang,
    langs: [
      { code: 'zh', label: '简体中文' },
      { code: 'zh-TW', label: '繁體中文' },
      { code: 'en', label: 'English' },
      { code: 'ja', label: '日本語' },
    ],
  };
}
