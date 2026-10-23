import { useRouter } from '@tanstack/react-router'
import { setLangFn } from '#/server/lang'
import { LANGS, type Lang } from '#/lib/i18n'
import { useLang } from '#/lib/useT'
import { cn } from '#/lib/utils'

const NAMES: Record<Lang, string> = { en: 'EN', km: 'ខ្មែរ' }

export function LangSwitch({ className }: { className?: string }) {
  const router = useRouter()
  const lang = useLang()
  return (
    <div role="group" aria-label="Language" className={cn('inline-flex overflow-hidden rounded-md border text-xs', className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={async () => {
            await setLangFn({ data: { lang: l } })
            await router.invalidate()
          }}
          className={cn('px-2.5 py-1', lang === l ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent')}
        >
          {NAMES[l]}
        </button>
      ))}
    </div>
  )
}
