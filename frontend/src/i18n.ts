import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";

export const resources = {
  en: { translation: en },
  de: { translation: de },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: navigator.language.toLowerCase().startsWith("de") ? "de" : "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
