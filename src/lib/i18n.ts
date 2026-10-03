import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import csPro from "../../public/locales/cs/pro.json"
import dePro from "../../public/locales/de/pro.json"
import enPro from "../../public/locales/en/pro.json"
import skPro from "../../public/locales/sk/pro.json"
import csLite from "../../public/locales/cs/lite.json"
import deLite from "../../public/locales/de/lite.json"
import enLite from "../../public/locales/en/lite.json"
import skLite from "../../public/locales/sk/lite.json"

export const supportedLocales = ["sk", "cs", "en", "de"] as const
export type Locale = (typeof supportedLocales)[number]
export const defaultLocale: Locale = "sk"

i18n.use(initReactI18next).init({
  resources: {
    sk: { pro: skPro, lite: skLite },
    cs: { pro: csPro, lite: csLite },
    en: { pro: enPro, lite: enLite },
    de: { pro: dePro, lite: deLite },
  },
  fallbackLng: "sk",
  defaultNS: "pro",
  interpolation: { escapeValue: false },
})

i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng
  }
})

export default i18n
