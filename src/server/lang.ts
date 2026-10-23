import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { LANGS, parseLang } from '#/lib/i18n'

const COOKIE = 'fa_lang'

export const langFn = createServerFn({ method: 'GET' }).handler(async () => parseLang(getCookie(COOKIE)))

export const setLangFn = createServerFn({ method: 'POST' })
  .validator(z.object({ lang: z.enum(LANGS) }))
  .handler(async ({ data }) => {
    setCookie(COOKIE, data.lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
    return data.lang
  })
