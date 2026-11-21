import { useT } from '../lib/i18n.jsx'

const COMPILER_URL = 'https://hiukim.github.io/mind-ar-js-doc/tools/compile/'

export default function HowToGuide() {
  const { t } = useT()
  return (
    <details className="mt-6 rounded-2xl bg-rose-soft/60 p-5">
      <summary className="cursor-pointer font-display text-lg font-bold">{t('guideTitle')}</summary>
      <ol className="mt-4 list-decimal space-y-3 pl-5">
        <li>{t('guideS1')}</li>
        <li>{t('guideS2')}</li>
        <li>
          {t('guideS3')}{' '}
          <a href={COMPILER_URL} target="_blank" rel="noreferrer" className="font-semibold text-rose-deep underline">
            {t('guideCompiler')}
          </a>
          <p className="mt-1">{t('guideS3b')}</p>
        </li>
        <li>{t('guideS4')}</li>
        <li>{t('guideS5')}</li>
        <li>{t('guideS6')}</li>
        <li>{t('guideS7')}</li>
      </ol>
      <h3 className="mt-5 font-bold">{t('guideNoteTitle')}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>{t('guideN1')}</li>
        <li>{t('guideN2')}</li>
        <li>{t('guideN3')}</li>
      </ul>
    </details>
  )
}
