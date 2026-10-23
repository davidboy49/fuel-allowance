import { createContext, useContext } from 'react'
import { MESSAGES, translate, type Lang, type MessageKey } from './i18n'

const LangContext = createContext<Lang>('en')

export const LangProvider = LangContext.Provider
export const useLang = () => useContext(LangContext)

export function useT() {
  const lang = useLang()
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars)
}

export function useStatus() {
  const t = useT()
  return (status: string) => (`status.${status}` in MESSAGES.en ? t(`status.${status}` as MessageKey) : status)
}
