import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { useTranslation } from 'react-i18next'

import { api } from '@/convex/_generated/api'
import { supportedLocales } from '@/lib/i18n'

// ---------- DÁTA (prevedené z původního projektu z Gemini) ----------

const flourDB = [
  { vyrobca: 'Pernerka', nazov: 'Pšeničná hladká Extra silná', typ: 'T 530', prot: 14.0 },
  { vyrobca: 'Babiččina volba', nazov: 'Pšeničná mouka chlebová', typ: 'T 1000', prot: 11.5 },
  { vyrobca: 'Pernerka', nazov: 'Pšeničná hladká svetlá', typ: 'T 530', prot: 12.0 },
  { vyrobca: 'Pernerka', nazov: 'Pšeničná celozrnná', typ: 'T 1800', prot: 13.0 },
  { vyrobca: 'Pernerka', nazov: 'Špaldová hladká', typ: 'T 630', prot: 14.0 },
  { vyrobca: 'Pernerka', nazov: 'Špaldová celozrnná', typ: 'T 1050/1800', prot: 15.0 },
  { vyrobca: 'Pernerka', nazov: 'Žitná chlebová', typ: 'T 930', prot: 9.5 },
  { vyrobca: 'Pernerka', nazov: 'Žitná celozrnná', typ: 'T 1700', prot: 9.0 },
  { vyrobca: 'VitaFlora', nazov: 'Pšeničná chlebová', typ: 'T 1000', prot: 11.8 },
  { vyrobca: 'VitaFlora', nazov: 'Pšeničná hladká', typ: 'T 530', prot: 11.5 },
  { vyrobca: 'VitaFlora', nazov: 'Ražná chlebová', typ: 'T 930', prot: 8.1 },
  { vyrobca: 'Billa (Clever)', nazov: 'Pšeničná hladká 00 extra', typ: 'T 00', prot: 10.0 },
  { vyrobca: 'Billa Bio', nazov: 'Špaldová hladká / celozrnná', typ: 'T 630/1050', prot: 13.0 },
  { vyrobca: 'Lidl (Castello/Belbake)', nazov: 'Pšeničná hladká', typ: 'T 530', prot: 10.0 },
  { vyrobca: 'Lidl (Belbake Bio)', nazov: 'Špaldová hladká', typ: 'T 630', prot: 12.5 },
  { vyrobca: 'Lidl (Castello)', nazov: 'Ražná chlebová', typ: 'T 930', prot: 8.0 },
  { vyrobca: 'COOP Jednota', nazov: 'Pšeničná hladká špeciál', typ: 'T 00/530', prot: 10.0 },
  { vyrobca: 'COOP Jednota', nazov: 'Pšeničná hladká Extra', typ: 'T 00', prot: 10.5 },
  { vyrobca: 'COOP Jednota', nazov: 'Ražná chlebová', typ: 'T 930', prot: 8.5 },
  { vyrobca: 'COOP Jednota', nazov: 'Špaldová hladká', typ: 'T 630', prot: 12.5 },
  { vyrobca: 'Mlyn Pohronský Ruskov', nazov: 'Pšeničná hladká 00 extra', typ: 'T 00', prot: 10.0 },
  { vyrobca: 'Mlyn Trenčan', nazov: 'Pšeničná hladká T 00', typ: 'T 00', prot: 10.5 },
  { vyrobca: 'Babiččina volba', nazov: 'Pšeničná na kynuté těsto', typ: 'T 512', prot: 12.0 },
  { vyrobca: 'Babiččina volba', nazov: 'Pšeničná hladká', typ: 'T 530', prot: 10.0 },
  { vyrobca: 'Babiččina volba', nazov: 'Žitná chlebová', typ: 'T 930', prot: 8.0 },
  { vyrobca: 'Předměřická', nazov: 'Pšeničná hladká svetlá', typ: 'T 512/530', prot: 10.8 },
  { vyrobca: 'Předměřická', nazov: 'Pšeničná chlebová', typ: 'T 1000', prot: 11.5 },
  { vyrobca: 'Penam', nazov: 'Pšeničná hladká', typ: 'T 530', prot: 10.0 },
  { vyrobca: 'Pernerka', nazov: 'Ječná (Jačmenná) celozrnná', typ: '-', prot: 10.0 },
  { vyrobca: 'Pernerka', nazov: 'Ovesná celozrnná', typ: '-', prot: 13.0 },
  { vyrobca: 'Pernerka', nazov: 'Pohanková (Bezlepková)', typ: '-', prot: 12.0 },
  { vyrobca: 'Pernerka', nazov: 'Rýžová (Bezlepková)', typ: '-', prot: 7.0 },
  { vyrobca: 'Pernerka', nazov: 'Kukuřičná (Bezlepková)', typ: '-', prot: 7.5 },
]

const flourOptions = flourDB.map((f) => ({
  value: `${f.vyrobca} ${f.nazov} (${f.typ})`,
  label: `${f.vyrobca} - ${f.nazov} [${f.typ}] (${f.prot}g bielk.)`,
  prot: f.prot,
}))

const yeastOptions = [
  { value: 'Saf-instant Sušené (Lesaffre)', type: 'instant', label: 'Saf-instant Sušené (Sušené)' },
  { value: 'Fala Čerstvé (Lesaffre)', type: 'fresh', label: 'Fala Čerstvé droždie (Čerstvé)' },
  { value: 'Dr. Oetker Droždie sušené', type: 'instant', label: 'Dr. Oetker Droždie sušené (Sušené)' },
  { value: 'Dr. Oetker na pizzu a focacciu', type: 'instant', label: 'Dr. Oetker na pizzu a focacciu (Sušené)' },
  { value: 'Lidl (Belbake) Sušené', type: 'instant', label: 'Lidl / Belbake Sušené droždie' },
  { value: 'Lidl (Belbake) Čerstvé', type: 'fresh', label: 'Lidl / Belbake Čerstvé droždie' },
  { value: 'Vivo Čerstvé (Nekton)', type: 'fresh', label: 'Vivo Čerstvé droždie (Čerstvé)' },
  { value: 'Kvasar Čerstvé', type: 'fresh', label: 'Kvasar Čerstvé pekařské droždí' },
  { value: 'COOP Jednota Čerstvé', type: 'fresh', label: 'COOP Jednota Čerstvé droždie' },
  { value: 'vlastna', type: 'instant', label: 'Iný výrobca...' },
]

// ---------- POMOCNÉ FUNKCIE (převod logiky z Gemini) ----------

function addMinutes(timeStr: string, minsToAdd: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  let mins = h * 60 + m + minsToAdd
  mins = ((mins % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function getMinutesDiff(startTimeStr: string, endTimeStr: number | string): number {
  const [h1, m1] = startTimeStr.split(':').map(Number)
  const [h2, m2] = String(endTimeStr).split(':').map(Number)
  let startMins = h1 * 60 + m1
  let endMins = h2 * 60 + m2
  if (endMins < startMins) endMins += 24 * 60
  return endMins - startMins
}

type FlourSlot = { value: string; pct: number | ""; customName: string }

type TFunc = ReturnType<typeof useTranslation>["t"]

type FormState = {
  flours: FlourSlot[]
  yeast: string
  customYeast: string
  flourWeight: number | ""
  hydration: number | ""
  fermentMode: 'workday' | 'overnight'
  workTime: string
  bakeTime: string
  roomTemp: number
}

const defaultForm: FormState = {
  flours: [
    { value: flourOptions[0].value, pct: 80, customName: '' },
    { value: flourOptions[1].value, pct: 20, customName: '' },
    { value: 'žiadna', pct: 0, customName: '' },
  ],
  yeast: yeastOptions[0].value,
  customYeast: '',
  flourWeight: 500,
  hydration: 70,
  fermentMode: 'workday',
  workTime: '06:15',
  bakeTime: '18:30',
  roomTemp: 23,
}

function getFlourInfo(slot: FlourSlot) {
  if (slot.value === 'vlastna') {
    return { name: slot.customName || 'Vlastná múka', prot: 10.0 }
  }
  const opt = flourOptions.find((o) => o.value === slot.value)
  return { name: slot.value, prot: opt?.prot ?? 10.0 }
}

function computeRecipe(form: FormState, t: TFunc) {
  const flourTotal = form.flourWeight || 500
  const hydration = form.hydration || 70

  const flourList = form.flours
    .filter((f) => f.value !== 'žiadna' && Number(f.pct) > 0)
    .map((f) => {
      const info = getFlourInfo(f)
      const pct = Number(f.pct) || 0
      return {
        name: info.name,
        pct,
        grams: Math.round(flourTotal * (pct / 100)),
        prot: info.prot,
      }
    })

  let totalPct = 0
  let weightedProtein = 0
  for (const f of flourList) {
    totalPct += f.pct
    weightedProtein += f.prot * f.pct
  }
  const avgProtein = totalPct > 0 ? weightedProtein / totalPct : 0

  const yeastOpt = yeastOptions.find((o) => o.value === form.yeast)
  const yeastType = yeastOpt?.type ?? 'instant'
  const yeastName = form.yeast === 'vlastna' ? form.customYeast || 'Vlastné droždie' : form.yeast

  let yeastFactor = 0.003 // základ 0.3% sušené
  let yeastFreshFactor = 0.009 // základ 0.9% čerstvé

  if (form.fermentMode === 'workday') {
    const fridgeHours = getMinutesDiff(form.workTime, form.bakeTime) / 60
    if (fridgeHours >= 15) {
      yeastFactor = 0.0008
      yeastFreshFactor = 0.0025
    } else if (fridgeHours >= 13) {
      yeastFactor = 0.0012
      yeastFreshFactor = 0.0035
    } else if (fridgeHours >= 10) {
      yeastFactor = 0.0015
      yeastFreshFactor = 0.0045
    } else {
      yeastFactor = 0.002
      yeastFreshFactor = 0.006
    }
  }

  const yeastGrams = +(flourTotal * (yeastType === 'fresh' ? yeastFreshFactor : yeastFactor)).toFixed(2)
  const waterGrams = Math.round(flourTotal * (hydration / 100))
  const saltGrams = Math.round(flourTotal * 0.02)

  let proofingMins = 60
  if (form.roomTemp <= 20) proofingMins = 80
  else if (form.roomTemp >= 25) proofingMins = 45

  const flourSummaryText = flourList.map((f) => `${f.grams}g ${f.name} (${f.pct}%)`).join(' + ')

  type Step = { time: string; title: string; desc: string }
  let steps: Step[] = []

  // dynamická denná doba podľa skutočného času (oprava chybného RÁNO/VEČER)
  const dayPart = (time: string): string => {
    const h = Number(time.split(':')[0])
    if (h >= 4 && h < 12) return t('timeline.morning')
    if (h >= 17) return t('timeline.evening')
    return t('timeline.afternoon')
  }
  // krok, ktorý sa vrátil cez polnoc, sa deje deň pred
  const partWentBack = (time: string, nextTime: string): string => {
    const part = dayPart(time)
    if (time > nextTime) return `${part} (${t('timeline.dayBefore')})`
    return part
  }

  if (form.fermentMode === 'workday') {
    const tAutolyse = addMinutes(form.workTime, -30)
    const tFridge = form.workTime
    const tBake = form.bakeTime
    const tPreheat = addMinutes(tBake, -45)
    const tShape = addMinutes(tBake, -proofingMins)
    const tFold = addMinutes(tShape, -35)
    const tMix = addMinutes(tShape, -70)
    const tBath = addMinutes(tMix, -20)
    const tDone = addMinutes(tBake, 40)

    steps = [
      { time: tAutolyse, title: t('timeline.steps.workday.autolyseTitle', { part: partWentBack(tAutolyse, tFridge) }), desc: t('timeline.steps.workday.autolyseDesc', { flours: flourSummaryText || '-', water: waterGrams }) },
      { time: tFridge, title: t('timeline.steps.workday.fridgeTitle', { part: dayPart(tFridge) }), desc: t('timeline.steps.workday.fridgeDesc', { yeast: yeastGrams }) },
      { time: tBath, title: t('timeline.steps.workday.bathTitle', { part: dayPart(tBath) }), desc: t('timeline.steps.workday.bathDesc') },
      { time: tMix, title: t('timeline.steps.workday.mixTitle', { part: dayPart(tMix) }), desc: t('timeline.steps.workday.mixDesc', { hydration, protein: avgProtein.toFixed(1) }) },
      { time: tFold, title: t('timeline.steps.workday.foldTitle'), desc: t('timeline.steps.workday.foldDesc') },
      { time: tShape, title: t('timeline.steps.workday.shapeTitle'), desc: t('timeline.steps.workday.shapeDesc', { mins: proofingMins, temp: form.roomTemp }) },
      { time: tPreheat, title: t('timeline.steps.workday.preheatTitle'), desc: t('timeline.steps.workday.preheatDesc') },
      { time: tBake, title: t('timeline.steps.workday.bakeTitle'), desc: t('timeline.steps.workday.bakeDesc') },
      { time: tDone, title: t('timeline.steps.workday.doneTitle'), desc: t('timeline.steps.workday.doneDesc') },
    ]
  } else {
    const tBake = form.bakeTime
    const tPreheat = addMinutes(tBake, -45)
    const tShape = addMinutes(tBake, -proofingMins)
    const tFold = addMinutes(tShape, -35)
    const tMix = addMinutes(tShape, -70)
    const tBath = addMinutes(tMix, -20)
    const tFridge = addMinutes(tBath, -485)
    const tAutolyse = addMinutes(tFridge, -30)
    const tDone = addMinutes(tBake, 40)

    steps = [
      { time: tAutolyse, title: t('timeline.steps.overnight.autolyseTitle', { part: partWentBack(tAutolyse, tFridge) }), desc: t('timeline.steps.overnight.autolyseDesc', { flours: flourSummaryText || '-', water: waterGrams }) },
      { time: tFridge, title: t('timeline.steps.overnight.fridgeTitle', { part: partWentBack(tFridge, tBath) }), desc: t('timeline.steps.overnight.fridgeDesc', { yeast: yeastGrams }) },
      { time: tBath, title: t('timeline.steps.overnight.bathTitle', { part: dayPart(tBath) }), desc: t('timeline.steps.overnight.bathDesc') },
      { time: tMix, title: t('timeline.steps.overnight.mixTitle', { part: dayPart(tMix) }), desc: t('timeline.steps.overnight.mixDesc') },
      { time: tFold, title: t('timeline.steps.overnight.foldTitle'), desc: t('timeline.steps.overnight.foldDesc') },
      { time: tShape, title: t('timeline.steps.overnight.shapeTitle'), desc: t('timeline.steps.overnight.shapeDesc', { mins: proofingMins, temp: form.roomTemp }) },
      { time: tPreheat, title: t('timeline.steps.overnight.preheatTitle'), desc: t('timeline.steps.overnight.preheatDesc') },
      { time: tBake, title: t('timeline.steps.overnight.bakeTitle'), desc: t('timeline.steps.overnight.bakeDesc') },
      { time: tDone, title: t('timeline.steps.overnight.doneTitle'), desc: t('timeline.steps.overnight.doneDesc') },
    ]
  }

  const yeastLabel =
    yeastType === 'fresh'
      ? t('recap.yeastFresh', { pct: (yeastFreshFactor * 100).toFixed(2) })
      : t('recap.yeastInstant', { pct: (yeastFactor * 100).toFixed(2) })

  return {
    flourList,
    avgProtein,
    waterGrams,
    yeastGrams,
    yeastName,
    yeastLabel,
    saltGrams,
    steps,
    fridgeHours:
      form.fermentMode === 'workday'
        ? +(getMinutesDiff(form.workTime, form.bakeTime) / 60).toFixed(1)
        : null,
  }
}

// ---------- UI ----------

const cardClass =
  'rounded-xl border border-grain-line bg-dough shadow-sm p-4 sm:p-5 mb-4'

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-crust-deep border-b-2 border-grain pb-2 mb-4">
      <span className="text-crust mr-2">{n}</span>
      {children}
    </h2>
  )
}

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-crust focus:outline-none focus:ring-3 focus:ring-crust/20'
const labelClass = 'block text-sm font-semibold text-muted-foreground mb-1.5'
const btnClass =
  'w-full rounded-lg bg-crust text-white font-bold text-sm px-5 py-3 mt-2.5 hover:bg-crust-deep transition-colors disabled:opacity-50'

function StarRating({ value, onChange, t }: { value: number; onChange: (v: number) => void; t: TFunc }) {
  return (
    <div
      className="flex gap-1.5 text-3xl cursor-pointer"
      role="radiogroup"
      aria-label={t('log.rating')}
      data-testid="star-rating"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('log.stars', { n })}
          className={n <= value ? 'text-yeast-star' : 'text-border'}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function LanguageSwitcher({ t }: { t: TFunc }) {
  const { i18n } = useTranslation()
  return (
    <select
      className="rounded-lg border border-grain-line bg-dough px-2 py-1.5 text-xs font-semibold text-crust-deep"
      value={i18n.language}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
      aria-label="Language"
      data-testid="lang-switcher"
    >
      {supportedLocales.map((code) => (
        <option key={code} value={code}>
          {t(`lang.${code}`)}
        </option>
      ))}
    </select>
  )
}

export function RouteComponent() {
  const { t, i18n } = useTranslation('lite')
  const [form, setForm] = useState<FormState>(defaultForm)
  const [rating, setRating] = useState(5)
  const [notes, setNotes] = useState('')
  const [recipeName, setRecipeName] = useState('')
  const [saveError, setSaveError] = useState('')

  const recipe = useMemo(() => computeRecipe(form, t), [form, t])

  // Automaticky navrhnutý názov receptu (rovnaký štýl ako záznam v denníku)
  const suggestedRecipeName = `${form.flourWeight || 500}g múky | Hydratácia: ${form.hydration || 70}% | Odchod: ${form.workTime} | Pečenie: ${form.bakeTime} | 🌾 ${recipe.flourList
    .map((f) => `${f.name} (${f.pct}%)`)
    .join(' + ')}`

  // Convex: recepty + denník
  const {
    results: savedRecipes,
    status: recipesStatus,
    loadMore: loadMoreRecipes,
  } = usePaginatedQuery(api.baking.listRecipes, {}, { initialNumItems: 10 })
  const {
    results: logs,
    status: logsStatus,
    loadMore: loadMoreLogs,
  } = usePaginatedQuery(api.baking.listLogs, {}, { initialNumItems: 10 })

  const createRecipe = useMutation(api.baking.createRecipe)
  const deleteRecipe = useMutation(api.baking.deleteRecipe)
  const createLog = useMutation(api.baking.createLog)
  const deleteLog = useMutation(api.baking.deleteLog)
  const [pendingAction, setPendingAction] = useState('')

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const updateFlour = (idx: number, patch: Partial<FlourSlot>) =>
    setForm((f) => ({
      ...f,
      flours: f.flours.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }))

  const handleSaveRecipe = async () => {
    setSaveError('')
    // Ak je pole prázdne, použije sa automaticky navrhnutý názov
    const name = recipeName.trim() || suggestedRecipeName
    setPendingAction('recipe')
    try {
      await createRecipe({
        name,
        flours: form.flours.map((f) => ({
          value: f.value,
          pct: f.pct || 0,
          customName: f.customName || undefined,
        })),
        yeast: form.yeast,
        customYeast: form.customYeast || undefined,
        flourWeight: form.flourWeight || 500,
        hydration: form.hydration || 70,
        fermentMode: form.fermentMode,
        workTime: form.workTime,
        bakeTime: form.bakeTime,
        roomTemp: form.roomTemp,
      })
      setRecipeName('')
    } catch (err) {
      console.error('Chyba pri ukladaní receptu:', err)
      setSaveError(t('recipes.saveError'))
    } finally {
      setPendingAction('')
    }
  }

  const handleLoadRecipe = (r: (typeof savedRecipes)[number]) => {
    setForm({
      flours: [0, 1, 2].map((i) => ({
        value: r.flours[i]?.value ?? 'žiadna',
        pct: r.flours[i]?.pct ?? 0,
        customName: r.flours[i]?.customName ?? '',
      })),
      yeast: r.yeast,
      customYeast: r.customYeast ?? '',
      flourWeight: r.flourWeight,
      hydration: r.hydration,
      fermentMode: r.fermentMode as 'workday' | 'overnight',
      workTime: r.workTime,
      bakeTime: r.bakeTime,
      roomTemp: r.roomTemp,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSaveLog = async () => {
    setPendingAction('log')
    setSaveError('')
    try {
      await createLog({
        flourTotal: form.flourWeight || 500,
        flourDetails: recipe.flourList
          .map((f) => `${f.name} (${f.pct}% / ${f.grams}g)`)
          .join(' + '),
        hydration: form.hydration || 70,
        roomTemp: form.roomTemp,
        bakeTime: form.bakeTime,
        workTime: form.workTime,
        yeastBrand: recipe.yeastName,
        rating,
        notes,
      })
      setNotes('')
    } catch (err) {
      console.error('Chyba pri ukladaní záznamu:', err)
      setSaveError(t('log.saveError'))
    } finally {
      setPendingAction('')
    }
  }

  return (
    <div
      className="min-h-screen py-4 px-3 sm:py-8"
      style={{
        backgroundColor: 'hsl(38 77% 95%)',
        backgroundImage:
          'radial-gradient(circle at 12% 8%, hsl(28 74% 44% / 0.06) 0, transparent 45%), radial-gradient(circle at 88% 92%, hsl(38 92% 50% / 0.07) 0, transparent 40%)',
      }}
      data-testid="baking-app"
    >
      <div className="mx-auto w-full max-w-3xl">
        <header className="text-center mb-6">
          <div className="flex justify-center items-center gap-2 text-xs mb-3">
            <span className="rounded-md bg-crust px-2.5 py-1.5 font-semibold text-white">
              {t('app.lite')}
            </span>
            <Link
              to="/pro"
              className="rounded-md border border-grain-line bg-dough px-2.5 py-1.5 font-semibold text-crust-deep"
            >
              {t('app.pro')}
            </Link>
            <LanguageSwitcher t={t} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-crust-deep m-0">
            {t('app.title')}
          </h1>
          <p className="text-crust text-sm mt-1.5">
            {t('app.subtitle')}
          </p>
        </header>

        {/* ULOŽENÉ RECEPTY */}
        <section className={cardClass} data-testid="recipes-card">
          <SectionTitle n="📚">{t('recipes.savedTitle')}</SectionTitle>
          <div
            className="rounded-lg bg-secondary/50 p-3 mb-3"
            data-state={recipesStatus === 'LoadingFirstPage' ? 'loading' : 'ready'}
          >
            {recipesStatus === 'LoadingFirstPage' ? (
              <p className="text-sm text-muted-foreground m-0">{t('recipes.loading')}</p>
            ) : savedRecipes.length === 0 ? (
              <p className="text-sm text-muted-foreground m-0">
                {t('recipes.empty')}
              </p>
            ) : (
              <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                {savedRecipes.map((r) => (
                  <li
                    key={r._id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-grain-line bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <strong className="text-sm">{r.name}</strong>{' '}
                      <span className="text-xs text-muted-foreground">
                        ({r.flourWeight}g, {r.hydration}%)
                      </span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        className="rounded-md border border-crust/30 px-2.5 py-1 text-xs font-semibold text-crust-deep hover:bg-wheat-tag cursor-pointer"
                        onClick={() => handleLoadRecipe(r)}
                      >
                        {t('recipes.load')}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                        aria-label={t('recipes.deleteAria', { name: r.name })}
                        onClick={() => void deleteRecipe({ id: r._id })}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {recipesStatus === 'CanLoadMore' && (
              <button
                type="button"
                className="mt-2 text-xs text-crust-deep underline cursor-pointer"
                onClick={() => loadMoreRecipes(10)}
              >
                {t('recipes.loadMore')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              className={inputClass}
              style={{ flex: '1 1 150px' }}
              placeholder={t('recipes.namePlaceholder')}
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              data-testid="recipe-name-input"
            />
            <button
              type="button"
              className="rounded-lg bg-crust text-white font-bold text-sm px-4 py-2.5 hover:bg-crust-deep transition-colors cursor-pointer disabled:opacity-50"
              disabled={pendingAction === 'recipe'}
              onClick={() => void handleSaveRecipe()}
              data-testid="save-recipe-btn"
            >
              {pendingAction === 'recipe' ? t('recipes.saving') : t('recipes.save')}
            </button>
          </div>
          {saveError && (
            <p className="text-sm text-destructive mt-2 mb-0" role="alert">
              {saveError}
            </p>
          )}
        </section>

        {/* SUROVINY A PARAMETRE */}
        <section className={cardClass} data-testid="ingredients-card">
          <SectionTitle n="1.">{t('form.ingredientsTitle')}</SectionTitle>

          <p className={labelClass}>{t('form.flourMix')}</p>
          {form.flours.map((slot, idx) => (
            <div key={idx} className="mb-2.5">
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className={`${inputClass} flex-1 min-w-[180px]`}
                  value={slot.value}
                  onChange={(e) => updateFlour(idx, { value: e.target.value })}
                  aria-label={t('form.flourAria', { n: idx + 1 })}
                >
                  {idx > 0 && <option value="žiadna">{t('form.flourNone')}</option>}
                  {flourOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  <option value="vlastna">{t('form.flourCustom')}</option>
                </select>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    className={`${inputClass} w-20`}
                    min={0}
                    max={100}
                    value={slot.pct}
                    onChange={(e) =>
                      updateFlour(idx, {
                        pct: e.target.value === '' ? '' : Number(e.target.value) || 0,
                      })
                    }
                    aria-label={t('form.flourPctAria', { n: idx + 1 })}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              {slot.value === 'vlastna' && (
                <input
                  type="text"
                  className={`${inputClass} mt-2`}
                  placeholder={t('form.flourCustomPlaceholder', { n: idx + 1 })}
                  value={slot.customName}
                  onChange={(e) => updateFlour(idx, { customName: e.target.value })}
                />
              )}
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="fermentMode">
                {t('form.fermentMode')}
              </label>
              <select
                id="fermentMode"
                className={inputClass}
                value={form.fermentMode}
                data-testid="ferment-mode"
                onChange={(e) => {
                  const mode = e.target.value as 'workday' | 'overnight'
                  // přednastavené časy: ranní pečení 09:00, večerní 18:00, odchod 09:00
                  if (mode === 'overnight') update('bakeTime', '09:00')
                  else if (mode === 'workday') {
                    update('bakeTime', '18:00')
                    update('workTime', '09:00')
                  }
                  update('fermentMode', mode)
                }}
              >
                <option value="overnight">
                  {t('form.modeOvernight')}
                </option>
                <option value="workday">
                  {t('form.modeWorkday')}
                </option>
              </select>
            </div>

            {form.fermentMode === 'workday' && (
              <div>
                <label className={labelClass} htmlFor="workTime">
                  {t('form.workTime')}
                </label>
                <input
                  type="time"
                  id="workTime"
                  className={inputClass}
                  value={form.workTime}
                  onChange={(e) => update('workTime', e.target.value)}
                  data-testid="work-time"
                />
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="yeastBrand">
                {t('form.yeastBrand')}
              </label>
              <select
                id="yeastBrand"
                className={inputClass}
                value={form.yeast}
                onChange={(e) => update('yeast', e.target.value)}
              >
                {yeastOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {form.yeast === 'vlastna' && (
                <input
                  type="text"
                  className={`${inputClass} mt-2`}
                  placeholder={t('form.yeastCustomPlaceholder')}
                  value={form.customYeast}
                  onChange={(e) => update('customYeast', e.target.value)}
                />
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="flour">
                {t('form.flourWeight')}
              </label>
              <input
                type="number"
                id="flour"
                className={inputClass}
                step={50}
                min={0}
                value={form.flourWeight}
                onChange={(e) => update('flourWeight', e.target.value === '' ? '' : Number(e.target.value) || 0)}
                data-testid="flour-weight"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="hydration">
                {t('form.hydration')}
              </label>
              <input
                type="number"
                id="hydration"
                className={inputClass}
                min={50}
                max={90}
                value={form.hydration}
                onChange={(e) => update('hydration', e.target.value === '' ? '' : Number(e.target.value) || 0)}
                data-testid="hydration"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="roomTemp">
                {t('form.roomTemp')}
              </label>
              <select
                id="roomTemp"
                className={inputClass}
                value={form.roomTemp}
                onChange={(e) => update('roomTemp', Number(e.target.value))}
              >
                <option value={19}>{t('form.roomTempCold')}</option>
                <option value={23}>{t('form.roomTempIdeal')}</option>
                <option value={27}>{t('form.roomTempWarm')}</option>
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="bakeTime">
                {t('form.bakeTime')}
              </label>
              <input
                type="time"
                id="bakeTime"
                className={inputClass}
                value={form.bakeTime}
                onChange={(e) => update('bakeTime', e.target.value)}
                data-testid="bake-time"
              />
            </div>
          </div>

          {/* PREPOČET RECEPTU */}
          <div className="mt-4 flex flex-wrap justify-around gap-3 rounded-lg border border-grain-line bg-wheat-tag/60 p-3 text-center">
            <div>
              <div className="font-bold text-crust-deep text-base" data-testid="rec-flours">
                {recipe.flourList.map((f) => `${f.grams}g`).join(' + ') || '0 g'}
              </div>
              <div className="text-xs text-crust-deep/80">{t('recap.flours')}</div>
            </div>
            <div>
              <div className="font-bold text-crust-deep text-base">
                {recipe.avgProtein.toFixed(1)} g
              </div>
              <div className="text-xs text-crust-deep/80">{t('recap.protein')}</div>
            </div>
            <div>
              <div className="font-bold text-crust-deep text-base" data-testid="rec-water">
                {recipe.waterGrams} g
              </div>
              <div className="text-xs text-crust-deep/80">
                {t('recap.water', { pct: form.hydration || 70 })}
              </div>
            </div>
            <div>
              <div className="font-bold text-crust-deep text-base" data-testid="rec-yeast">
                {recipe.yeastGrams} g
              </div>
              <div className="text-xs text-crust-deep/80">{recipe.yeastLabel}</div>
            </div>
            <div>
              <div className="font-bold text-crust-deep text-base">{recipe.saltGrams} g</div>
              <div className="text-xs text-crust-deep/80">{t('recap.salt')}</div>
            </div>
          </div>
          {recipe.fridgeHours !== null && (
            <p className="text-center text-xs text-crust mt-2 mb-0">
              {t('recap.fridgeHours', { hours: recipe.fridgeHours })}
            </p>
          )}
        </section>

        {/* ČASOVÁ OS */}
        <section className={cardClass} data-testid="timeline-card">
          <SectionTitle n="2.">{t('timeline.title')}</SectionTitle>
          <ol className="list-none m-0 p-0 pl-5 border-l-[3px] border-crust" data-testid="timeline">
            {recipe.steps.map((s) => (
              <li key={`${s.time}-${s.title}`} className="relative mb-4 last:mb-0">
                <span className="absolute -left-[26px] top-1 block w-2.5 h-2.5 rounded-full bg-crust ring-2 ring-dough" />
                <div className="font-bold text-crust text-sm">{s.time}</div>
                <div className="font-semibold text-sm my-0.5">{s.title}</div>
                <div className="text-[0.83rem] text-muted-foreground">{s.desc}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* ULOŽIŤ POKUS */}
        <section className={cardClass} data-testid="log-form-card">
          <SectionTitle n="3.">{t('log.title')}</SectionTitle>
          <div className="mb-3">
            <span className={labelClass}>{t('log.ratingLabel')}</span>
            <StarRating value={rating} onChange={setRating} t={t} />
          </div>
          <div className="mb-2">
            <label className={labelClass} htmlFor="notes">
              {t('log.notes')}
            </label>
            <textarea
              id="notes"
              rows={3}
              className={inputClass}
              placeholder={t('log.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="notes-input"
            />
          </div>
          <button
            type="button"
            className={btnClass}
            disabled={pendingAction === 'log'}
            onClick={() => void handleSaveLog()}
            data-testid="save-log-btn"
          >
            {pendingAction === 'log' ? t('log.saving') : t('log.save')}
          </button>
        </section>

        {/* HISTÓRIA */}
        <section className={cardClass} data-testid="history-card">
          <SectionTitle n="4.">{t('history.title')}</SectionTitle>
          <div data-state={logsStatus === 'LoadingFirstPage' ? 'loading' : 'ready'} data-testid="logs-container">
            {logsStatus === 'LoadingFirstPage' ? (
              <p className="text-sm text-muted-foreground">{t('history.loading')}</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('history.empty')}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {logs.map((l) => (
                  <article
                    key={l._id}
                    className="border-l-4 border-crust rounded-lg bg-background p-3 shadow-sm"
                  >
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-1">
                      <div className="text-sm">
                        <strong>{t('history.flourTotal', { g: l.flourTotal })}</strong> | {t('history.summary', { hydration: l.hydration, workTime: l.workTime || 'N/A', bakeTime: l.bakeTime })}
                      </div>
                      <div className="text-yeast-star" aria-label={t('history.starsAria', { n: l.rating })}>
                        {'★'.repeat(l.rating)}
                        <span className="text-border">{'★'.repeat(5 - l.rating)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 my-1">
                      <span className="rounded-md bg-wheat-tag px-2 py-0.5 text-xs font-semibold text-wheat-tag-ink">
                        🌾 {l.flourDetails}
                      </span>
                      <span className="rounded-md bg-wheat-tag px-2 py-0.5 text-xs font-semibold text-wheat-tag-ink">
                        🧪 {l.yeastBrand}
                      </span>
                      <span className="rounded-md bg-wheat-tag px-2 py-0.5 text-xs font-semibold text-wheat-tag-ink">
                        🌡️ {l.roomTemp}°C
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('history.saved')}{' '}
                      {new Date(l._creationTime).toLocaleString(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </div>
                    <p className="text-sm bg-secondary/50 rounded-md p-2 mt-1.5 mb-0 whitespace-pre-wrap">
                      {l.notes}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-destructive underline cursor-pointer mt-1.5"
                      onClick={() => void deleteLog({ id: l._id })}
                    >
                      {t('history.delete')}
                    </button>
                  </article>
                ))}
              </div>
            )}
            {logsStatus === 'CanLoadMore' && (
              <button
                type="button"
                className="mt-2 text-xs text-crust-deep underline cursor-pointer"
                onClick={() => loadMoreLogs(10)}
              >
                {t('history.loadMore')}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: RouteComponent,
})
