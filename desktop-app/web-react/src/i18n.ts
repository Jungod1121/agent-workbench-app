import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh/common.json';
import zhTW from './locales/zh-TW/common.json';
import en from './locales/en/common.json';
import ja from './locales/ja/common.json';

export const LANGS = ['zh', 'zh-TW', 'en', 'ja'] as const;
export type Lang = (typeof LANGS)[number];

function initialLang(): Lang {
  try {
    const s = localStorage.getItem('language');
    if (s && (LANGS as readonly string[]).includes(s)) return s as Lang;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('zh-tw') || nav.startsWith('zh-hk') || nav.startsWith('zh-hant')) return 'zh-TW';
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    'zh-TW': { translation: zhTW },
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLang(lng: Lang): void {
  void i18n.changeLanguage(lng);
  try {
    localStorage.setItem('language', lng);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lng;
}
