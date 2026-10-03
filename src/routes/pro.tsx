import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Authenticated, Unauthenticated } from "convex/react"
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useTranslation } from "react-i18next"

import { SignInForm } from "@/components/sign-in-form"
import { api } from "@/convex/_generated/api"
import { defaultLocale, supportedLocales, type Locale } from "@/lib/i18n"
import { buildPhases, computeFermentation } from "@/lib/fermentation"

// ---------- POMOCNÉ FUNKCIE ----------

function addMinutes(timeStr: string, minsToAdd: number): string {
  const [h, m] = timeStr.split(":").map(Number)
  let mins = h * 60 + m + minsToAdd
  mins = ((mins % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
}

/** kľúč pre prežitie časovača v localStorage (prepínanie apiek / reload) */
const TIMER_STORAGE_KEY = "pekarsky-dennik-timer"

function getMinutesDiff(startTimeStr: string, endTimeStr: string): number {
  const [h1, m1] = startTimeStr.split(":").map(Number)
  const [h2, m2] = endTimeStr.split(":").map(Number)
  let startMins = h1 * 60 + m1
  let endMins = h2 * 60 + m2
  if (endMins < startMins) endMins += 24 * 60
  return endMins - startMins
}

// kompresia fotky pred uploadom (canvas -> JPEG)
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" })
  } catch {
    return file
  }
}

// krátky zvukový signál (Web Audio API, bez assetov)
function playBeep(times = 3) {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = 880
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t0 = ctx.currentTime + i * 0.45
      gain.gain.setValueAtTime(0.25, t0)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3)
      osc.start(t0)
      osc.stop(t0 + 0.32)
    }
    setTimeout(() => void ctx.close(), times * 450 + 500)
  } catch {
    // zvuk nie je k dispozícii – ignoruj
  }
}

// skutočná denná doba podľa absolútneho času (+ minuly pres polnoc)
function dayPartForTime(time: string): { key: string; dayOffset: number } {
  const h = Number(time.split(":")[0])
  // krok späť cez polnoc = deň pred
  const dayOffset = 0 // doplnené v harmonograme
  if (h >= 4 && h < 12) return { key: "steps.morning", dayOffset }
  if (h >= 17) return { key: "steps.evening", dayOffset }
  return { key: "steps.afternoon", dayOffset }
}

type FlourSlot = { value: string; pct: number | ""; customName: string; prot: number }

type FormState = {
  flours: FlourSlot[]
  yeast: string
  customYeast: string
  flourWeight: number | ""
  hydration: number | ""
  fermentMode: "workday" | "overnight" | "evening" | "quick"
  workTime: string
  bakeTime: string
  roomTemp: number
  leavenId: string | null
  leavenPct: number | ""
  loaves: number | ""
  mixMethod: "hand" | "handFold" | "planetary" | "spiral"
  honeyGrams: number | ""
  fatGrams: number | ""
  /** vstupná teplota vody (°C); ak prázdne, použije sa odporúčaná */
  waterInTemp: number | ""
  /** teplota cesta po zmiesení (°C) */
  doughAfterMixTemp: number | ""
  /** teplota cesta pred vstupom do chladničky (°C) */
  doughFridgeTemp: number | ""
  /** vlastné množstvo droždia v g ("" = automaticky podľa režimu) */
  yeastOverrideG: number | ""
}

const cardClass =
  "rounded-xl border border-grain-line bg-dough shadow-sm p-4 sm:p-5 mb-4"
const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-crust focus:outline-none focus:ring-3 focus:ring-crust/20"
const labelClass = "block text-sm font-semibold text-muted-foreground mb-1.5"
const btnClass =
  "w-full rounded-lg bg-crust text-white font-bold text-sm px-5 py-3 mt-2.5 hover:bg-crust-deep transition-colors disabled:opacity-50"

function StarRating({
  value,
  onChange,
  t,
}: {
  value: number
  onChange: (v: number) => void
  t: ReturnType<typeof useTranslation>["t"]
}) {
  return (
    <div
      className="flex gap-1.5 text-3xl cursor-pointer"
      role="radiogroup"
      aria-label={t("log.rating")}
      data-testid="star-rating"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("log.stars", { n })}
          className={n <= value ? "text-yeast-star" : "text-border"}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
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

// ---------- ČÍSELNÍKY ----------

function CatalogSection() {
  const { t } = useTranslation()
  const flours = useQuery(api.catalog.listFlours, {})
  const yeasts = useQuery(api.catalog.listYeasts, {})
  const ferments = useQuery(api.catalog.listFerments, {})

  const addFlour = useMutation(api.catalog.addFlour)
  const updateFlour = useMutation(api.catalog.updateFlour)
  const deleteFlour = useMutation(api.catalog.deleteFlour)
  const addYeast = useMutation(api.catalog.addYeast)
  const deleteYeast = useMutation(api.catalog.deleteYeast)
  const addFerment = useMutation(api.catalog.addFerment)
  const deleteFerment = useMutation(api.catalog.deleteFerment)
  const seedDefaults = useMutation(api.catalog.seedDefaults)
  const [seedMsg, setSeedMsg] = useState("")

  const [newFlourName, setNewFlourName] = useState("")
  const [newFlourProt, setNewFlourProt] = useState("12")
  const [newYeastName, setNewYeastName] = useState("")
  const [newYeastType, setNewYeastType] = useState<"instant" | "fresh">("instant")
  const [newFermentName, setNewFermentName] = useState("")
  const [newFermentHyd, setNewFermentHyd] = useState("100")

  const handleSeed = async () => {
    setSeedMsg("")
    try {
      await seedDefaults({})
      setSeedMsg(t("catalog.seeded"))
    } catch (err) {
      console.error("Seed failed:", err)
    }
  }

  const handleAddFlour = async () => {
    const name = newFlourName.trim()
    if (!name) return
    try {
      await addFlour({ name, protein: Number(newFlourProt) || 10 })
      setNewFlourName("")
    } catch (err) {
      console.error("Add flour failed:", err)
    }
  }

  const smallBtn =
    "rounded-md border border-crust/30 px-2.5 py-1 text-xs font-semibold text-crust-deep hover:bg-wheat-tag cursor-pointer disabled:opacity-50"
  const delBtn =
    "rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"

  return (
    <details className={cardClass} data-testid="catalog-card">
      <summary className="cursor-pointer text-lg font-semibold text-crust-deep border-b-2 border-grain pb-2 mb-4 flex items-center gap-2 list-none">
        <span>{t("catalog.title")}</span>
        {flours !== undefined && yeasts !== undefined && ferments !== undefined && (
          <span className="text-xs font-normal text-muted-foreground">
            ({flours.length + yeasts.length + ferments.length})
          </span>
        )}
      </summary>
      {seedMsg && <p className="text-xs text-palm m-0 mb-2">{seedMsg}</p>}

      {/* MÚKY */}
      <details className="mb-3" data-testid="flour-catalog-toggle">
        <summary className="cursor-pointer text-sm font-bold text-crust-deep mb-2 flex items-center gap-2">
          {t("catalog.flours")}
          {flours !== undefined && flours.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({flours.length})</span>
          )}
        </summary>
      <div className="rounded-lg bg-secondary/50 p-3 mb-3" data-testid="flour-catalog">
        {flours === undefined ? (
          <p className="text-sm text-muted-foreground m-0">…</p>
        ) : flours.length === 0 ? (
          <div>
            <p className="text-sm text-muted-foreground m-0 mb-2">{t("catalog.empty")}</p>
            <button type="button" className={smallBtn} onClick={() => void handleSeed()}>
              {t("catalog.seedButton")}
            </button>
          </div>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-1 max-h-64 overflow-y-auto">
            {flours.map((f) => (
              <li
                key={f._id}
                className="flex items-center justify-between gap-2 rounded-lg border border-grain-line bg-background px-3 py-1.5"
              >
                <span className="text-xs min-w-0 truncate">{f.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    className="w-16 rounded border border-border px-1 py-0.5 text-xs"
                    defaultValue={f.protein}
                    step="0.5"
                    min="1"
                    max="50"
                    aria-label={t("catalog.protein")}
                    onBlur={(e) => {
                      const val = Number(e.target.value)
                      if (val > 0 && val !== f.protein) {
                        void updateFlour({ id: f._id, name: f.name, protein: val })
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={delBtn}
                    aria-label={`${t("catalog.delete")} ${f.name}`}
                    onClick={() => void deleteFlour({ id: f._id })}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          className={inputClass}
          style={{ flex: "1 1 140px" }}
          placeholder={t("catalog.name")}
          value={newFlourName}
          onChange={(e) => setNewFlourName(e.target.value)}
          data-testid="new-flour-name"
        />
        <input
          type="number"
          className={inputClass}
          style={{ width: 100 }}
          placeholder={t("catalog.protein")}
          value={newFlourProt}
          onChange={(e) => setNewFlourProt(e.target.value)}
          data-testid="new-flour-prot"
        />
        <button
          type="button"
          className={smallBtn}
          style={{ marginTop: 0 }}
          disabled={!newFlourName.trim()}
          onClick={() => void handleAddFlour()}
          data-testid="add-flour-btn"
        >
          {t("catalog.add")}
        </button>
      </div>
      </details>

      {/* DROŽDIE */}
      <details className="mb-3" data-testid="yeast-catalog-toggle">
        <summary className="cursor-pointer text-sm font-bold text-crust-deep mb-2 flex items-center gap-2">
          {t("catalog.yeasts")}
          {yeasts !== undefined && yeasts.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({yeasts.length})</span>
          )}
        </summary>
      <div className="rounded-lg bg-secondary/50 p-3 mb-3" data-testid="yeast-catalog">
        {yeasts === undefined ? (
          <p className="text-sm text-muted-foreground m-0">…</p>
        ) : yeasts.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("catalog.empty")}</p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-1 max-h-48 overflow-y-auto">
            {yeasts.map((y) => (
              <li
                key={y._id}
                className="flex items-center justify-between gap-2 rounded-lg border border-grain-line bg-background px-3 py-1.5"
              >
                <span className="text-xs min-w-0 truncate">
                  {y.name} <span className="text-muted-foreground">({t(`catalog.${y.type}`)})</span>
                </span>
                <button
                  type="button"
                  className={delBtn}
                  aria-label={`${t("catalog.delete")} ${y.name}`}
                  onClick={() => void deleteYeast({ id: y._id })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          className={inputClass}
          style={{ flex: "1 1 140px" }}
          placeholder={t("catalog.name")}
          value={newYeastName}
          onChange={(e) => setNewYeastName(e.target.value)}
          data-testid="new-yeast-name"
        />
        <select
          className={inputClass}
          style={{ width: 140 }}
          value={newYeastType}
          onChange={(e) => setNewYeastType(e.target.value as "instant" | "fresh")}
          aria-label={t("catalog.type")}
        >
          <option value="instant">{t("catalog.instant")}</option>
          <option value="fresh">{t("catalog.fresh")}</option>
        </select>
        <button
          type="button"
          className={smallBtn}
          style={{ marginTop: 0 }}
          disabled={!newYeastName.trim()}
          onClick={async () => {
            const name = newYeastName.trim()
            if (!name) return
            try {
              await addYeast({ name, type: newYeastType })
              setNewYeastName("")
            } catch (err) {
              console.error("Add yeast failed:", err)
            }
          }}
          data-testid="add-yeast-btn"
        >
          {t("catalog.add")}
        </button>
      </div>
      </details>

      {/* PREDKVASY */}
      <details className="mb-3" data-testid="ferment-catalog-toggle">
        <summary className="cursor-pointer text-sm font-bold text-crust-deep mb-2 flex items-center gap-2">
          {t("catalog.ferments")}
          {ferments !== undefined && ferments.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({ferments.length})</span>
          )}
        </summary>
      <div className="rounded-lg bg-secondary/50 p-3 mb-3" data-testid="ferment-catalog">
        {ferments === undefined ? (
          <p className="text-sm text-muted-foreground m-0">…</p>
        ) : ferments.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("catalog.empty")}</p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-1">
            {ferments.map((f) => (
              <li
                key={f._id}
                className="flex items-center justify-between gap-2 rounded-lg border border-grain-line bg-background px-3 py-1.5"
              >
                <span className="text-xs min-w-0 truncate">
                  {f.name} <span className="text-muted-foreground">({f.hydration}%)</span>
                </span>
                <button
                  type="button"
                  className={delBtn}
                  aria-label={`${t("catalog.delete")} ${f.name}`}
                  onClick={() => void deleteFerment({ id: f._id })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          className={inputClass}
          style={{ flex: "1 1 140px" }}
          placeholder={t("catalog.name")}
          value={newFermentName}
          onChange={(e) => setNewFermentName(e.target.value)}
          data-testid="new-ferment-name"
        />
        <input
          type="number"
          className={inputClass}
          style={{ width: 100 }}
          placeholder={t("catalog.hydration")}
          value={newFermentHyd}
          onChange={(e) => setNewFermentHyd(e.target.value)}
          data-testid="new-ferment-hyd"
        />
        <button
          type="button"
          className={smallBtn}
          style={{ marginTop: 0 }}
          disabled={!newFermentName.trim()}
          onClick={async () => {
            const name = newFermentName.trim()
            if (!name) return
            try {
              await addFerment({ name, hydration: Number(newFermentHyd) || 100 })
              setNewFermentName("")
            } catch (err) {
              console.error("Add ferment failed:", err)
            }
          }}
          data-testid="add-ferment-btn"
        >
          {t("catalog.add")}
        </button>
      </div>
      </details>
    </details>
  )
}

// ---------- HLAVNÁ PRO STRÁNKA ----------

function ProPage() {
  const { t, i18n } = useTranslation()
  const { signOut } = useAuthActions()
  const user = useQuery(api.catalog.currentLoggedInUser, {})

  const flours = useQuery(api.catalog.listFlours, {})
  const yeasts = useQuery(api.catalog.listYeasts, {})
  const ferments = useQuery(api.catalog.listFerments, {})

  const [form, setForm] = useState<FormState>({
    flours: [
      { value: "", pct: 80, customName: "", prot: 10 },
      { value: "", pct: 20, customName: "", prot: 10 },
      { value: "", pct: 0, customName: "", prot: 10 },
    ],
    yeast: "",
    customYeast: "",
    flourWeight: 500,
    hydration: 70,
    fermentMode: "workday",
    workTime: "06:15",
    bakeTime: "18:30",
    roomTemp: 23,
    leavenId: null,
    leavenPct: 0,
    loaves: 1,
    mixMethod: "planetary",
    honeyGrams: "",
    fatGrams: "",
    waterInTemp: "",
    doughAfterMixTemp: "",
    doughFridgeTemp: "",
    yeastOverrideG: "",
  })
  const [rating, setRating] = useState(5)
  const [notes, setNotes] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoCompressing, setPhotoCompressing] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState("")
  const [showAllRecipes, setShowAllRecipes] = useState(false)
  const [showAllLogs, setShowAllLogs] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // ---------- INTERAKTÍVNY ČASOVAČ ----------
  const [timer, setTimer] = useState<{
    stepKey: string
    label: string
    endsAt: number // epoch ms
  } | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())

  // časovač prežíva prepínanie apiek / reloading: cieľový čas je absolutný
  // a uklada sa do localStorage, takže po návrate sa obnoví
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TIMER_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { stepKey?: string; label?: string; endsAt?: number }
      if (
        parsed &&
        typeof parsed.endsAt === "number" &&
        typeof parsed.stepKey === "string" &&
        typeof parsed.label === "string" &&
        parsed.endsAt > Date.now() - 24 * 60 * 60_000
      ) {
        setTimer({ stepKey: parsed.stepKey, label: parsed.label, endsAt: parsed.endsAt })
      } else {
        window.localStorage.removeItem(TIMER_STORAGE_KEY)
      }
    } catch {
      // poškodený záznam ignorujeme
      try {
        window.localStorage.removeItem(TIMER_STORAGE_KEY)
      } catch {
        // nedostupné úložisko – časovač po reloadnutí jednoducho neobnovíme
      }
    }
  }, [])

  // synchronizácia stavu do localStorage
  useEffect(() => {
    try {
      if (timer) window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer))
      else window.localStorage.removeItem(TIMER_STORAGE_KEY)
    } catch {
      // nedostupné úložisko – iba v pamäti
    }
  }, [timer])

  useEffect(() => {
    if (!timer) return
    const tick = () => setNowMs(Date.now())
    const interval = window.setInterval(tick, 1000)
    const onVisible = () => setNowMs(Date.now())
    // po návrate z pozadia (telefon apky) okamžite dosynchronizujeme
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [timer])

  useEffect(() => {
    if (timer && nowMs >= timer.endsAt) {
      playBeep(3)
      setTimer(null)
    }
  }, [timer, nowMs])

  const startTimerForStep = (
    step: { time: string; key: string; title: string; desc: string },
    nextTime?: string,
  ) => {
    // trvanie kroku = čas do ďalšieho kroku harmonogramu (nezávislé od hodín)
    const mins = nextTime ? getMinutesDiff(step.time, nextTime) : 0
    if (mins > 0) {
      setTimer({ stepKey: step.key, label: step.title, endsAt: Date.now() + mins * 60_000 })
      return
    }
    // fallback: cieľový čas na hodinách (posledný krok bez ďalšieho)
    const today = new Date()
    const [h, m] = step.time.split(":").map(Number)
    const target = new Date(today)
    target.setHours(h, m, 0, 0)
    // ak je cieľový čas už v minulosti, plánujeme na zajtra (krok cez polnoc)
    if (target.getTime() < Date.now() - 60_000) target.setDate(target.getDate() + 1)
    setTimer({
      stepKey: step.key,
      label: step.title,
      endsAt: target.getTime(),
    })
  }

  const timerRemaining = useMemo(() => {
    if (!timer) return null
    const diffMs = timer.endsAt - nowMs
    if (diffMs <= 0) return { h: 0, m: 0, s: 0 }
    const total = Math.floor(diffMs / 1000)
    return {
      h: Math.floor(total / 3600),
      m: Math.floor((total % 3600) / 60),
      s: total % 60,
      totalMin: Math.floor(total / 60),
    }
  }, [timer, nowMs])

  const seedDefaults = useMutation(api.catalog.seedDefaults)

  // Po načítaní číselníkov: seed ak prázdne + nastav predvolené hodnoty
  useEffect(() => {
    if (flours && flours.length === 0) {
      void seedDefaults({}).catch((err) => console.error("Seed failed:", err))
    }
  }, [flours, seedDefaults])

  useEffect(() => {
    if (flours && flours.length > 0) {
      setForm((f) => {
        if (f.flours[0].value && f.flours[1].value) return f
        return {
          ...f,
          flours: [
            { ...f.flours[0], value: f.flours[0].value || flours[0].name, prot: flours[0].protein },
            {
              ...f.flours[1],
              value: f.flours[1].value || flours[1]?.name || flours[0].name,
              prot: flours[1]?.protein ?? flours[0].protein,
            },
            f.flours[2],
          ],
        }
      })
    }
  }, [flours])

  useEffect(() => {
    if (yeasts && yeasts.length > 0) {
      setForm((f) => (f.yeast ? f : { ...f, yeast: yeasts[0].name }))
    }
  }, [yeasts])

  const createUpload = useAction(api.appFiles.createUpload)
  const finalizeLogPhoto = useAction(api.appFiles.finalizeLogPhoto)
  const deleteLogWithPhoto = useAction(api.appFiles.deleteLogWithPhoto)

  const createRecipe = useMutation(api.baking.createRecipe)
  const deleteRecipe = useMutation(api.baking.deleteRecipe)
  const createLog = useMutation(api.baking.createLog)
  const deleteLog = useMutation(api.baking.deleteLog)

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

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const updateFlour = (idx: number, patch: Partial<FlourSlot>) =>
    setForm((f) => ({
      ...f,
      flours: f.flours.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }))

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    if (!file) {
      setPhoto(null)
      setPhotoPreview(null)
      return
    }
    setPhotoCompressing(true)
    try {
      const compressed = await compressImage(file)
      setPhoto(compressed)
      setPhotoPreview(URL.createObjectURL(compressed))
    } catch {
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
    } finally {
      setPhotoCompressing(false)
    }
  }

  const clearPhoto = () => {
    setPhoto(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  // ---------- VÝPOČET ----------
  const recipe = useMemo(() => {
    const flourTotal = form.flourWeight || 500
    const hydration = form.hydration || 70

    const flourList = form.flours
      .filter((f) => f.value !== "žiadna" && f.value !== "" && Number(f.pct) > 0)
      .map((f) => {
        const pct = Number(f.pct) || 0
        return {
          name: f.value === "vlastna" ? f.customName || "Vlastná múka" : f.value,
          pct,
          grams: Math.round(flourTotal * (pct / 100)),
          prot: f.prot,
        }
      })

    let totalPct = 0
    let weightedProtein = 0
    for (const f of flourList) {
      totalPct += f.pct
      weightedProtein += f.prot * f.pct
    }
    const avgProtein = totalPct > 0 ? weightedProtein / totalPct : 0

    const yeastOpt = yeasts?.find((y) => y.name === form.yeast)
    const yeastType = yeastOpt?.type ?? "instant"
    const yeastName = form.yeast

    // PREDKVAS: % z múky, hydratácia predkvasu
    const leaven = ferments?.find((f) => f._id === form.leavenId)
    const leavenPct = Number(form.leavenPct) > 0 && leaven ? Number(form.leavenPct) : 0
    const leavenFlour = Math.round(flourTotal * (leavenPct / 100))
    const leavenWater = Math.round(leavenFlour * ((leaven?.hydration ?? 100) / 100))
    const leavenTotal = leavenFlour + leavenWater

    let yeastFactor = 0.003
    let yeastFreshFactor = 0.009

    if (form.fermentMode === "quick") {
      // rýchly pracovný chlieb (priama metóda): vysoká dávka, bez chladničky
      yeastFactor = 0.0175
      yeastFreshFactor = 0.0525
    } else if (form.fermentMode === "evening") {
      // večerný proces s krátkym kysnutím v chladničke: jemné kvantum droždia
      yeastFactor = 0.0017
      yeastFreshFactor = 0.005
    } else if (form.fermentMode === "workday") {
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

    // s predkvasom menej droždia (predkvas už kysne sám)
    const leavenYeastReduction = leavenPct > 0 ? Math.min(0.7, leavenPct / 100 + 0.2) : 0
    const autoYeastGrams = +(
      flourTotal *
      (yeastType === "fresh" ? yeastFreshFactor : yeastFactor) *
      (1 - leavenYeastReduction)
    ).toFixed(2)
    // vlastná úprava množstva droždia (prázdne = automaticky)
    const yeastGrams =
      form.yeastOverrideG !== "" && Number(form.yeastOverrideG) >= 0
        ? +Number(form.yeastOverrideG).toFixed(2)
        : autoYeastGrams
    const yeastDosePct = flourTotal > 0 ? (yeastGrams / flourTotal) * 100 : 0
    const yeastAutoPct = flourTotal > 0 ? (autoYeastGrams / flourTotal) * 100 : 0

    // voda: cieľová - voda v predkvase
    const targetWater = Math.round(flourTotal * (hydration / 100))
    const waterGrams = Math.max(0, targetWater - leavenWater)
    const saltGrams = Math.round(flourTotal * 0.02)
    const honeyGrams = Number(form.honeyGrams) > 0 ? Number(form.honeyGrams) : 0
    const fatGrams = Number(form.fatGrams) > 0 ? Number(form.fatGrams) : 0

    let proofingMins = 60
    if (form.roomTemp <= 20) proofingMins = 80
    else if (form.roomTemp >= 25) proofingMins = 45

    // vypožadovaná teplota vody (pekárska metóda základnej teploty):
    // DDT = (teplota vody + teplota múky + teplota miestnosti + trenie) / 3
    // múka uložená v miestnosti ~ teplota miestnosti => voda = 3*DDT - 2*room - trenie
    // trenie závisí od spôsobu miesenia: ruka ~ 2, planetárny mixér ~ 8, špirálový mixér ~ 12
    const frictionFactor = form.mixMethod === "hand" ? 2 : form.mixMethod === "handFold" ? 4 : form.mixMethod === "spiral" ? 12 : 8
    const desiredDoughTemp = 24 // °C cieľová teplota cesta
    const waterTempRecommended = Math.round(
      Math.max(0, 3 * desiredDoughTemp - 2 * form.roomTemp - frictionFactor),
    )
    // ak pekár zadal skutočnú vstupnú teplotu vody, použije sa pri prepočte
    const waterInTemp = Number(form.waterInTemp) > 0 ? Number(form.waterInTemp) : null
    const waterTemp = waterInTemp ?? waterTempRecommended
    // odhad teploty cesta po zmiesení: ak ju pekár zmeral, použije sa jeho hodnota
    const doughAfterMixTemp =
      Number(form.doughAfterMixTemp) > 0
        ? Number(form.doughAfterMixTemp)
        : // odhad z metódy základnej teploty: DDT = (voda + múka + miestnosť + trenie)/3
          // múka uložená v miestnosti ~ teplota miestnosti
          Math.round(((waterTemp + 2 * form.roomTemp + frictionFactor) / 3) * 10) / 10
    // teplota cesta pred chladničkou: zmeraná, alebo odhad (prechladnutie po bulk fází ~ -1.5 °C)
    const doughFridgeTemp =
      Number(form.doughFridgeTemp) > 0
        ? Number(form.doughFridgeTemp)
        : Math.max(4, Math.round((doughAfterMixTemp - 1.5) * 10) / 10)

    // ---------- FERMENTAČNÝ MODEL (vstup -> mikrobiológia -> výstup) ----------
    // fázy procesu podľa režimu; bulk/proof sa berú z doterajších odhadov
    const saltPctOfFlour = 2
    const sweetenerPctOfFlour = flourTotal > 0 ? (honeyGrams / flourTotal) * 100 : 0
    const fridgeMinsForModel =
      form.fermentMode === "quick"
        ? 0
        : form.fermentMode === "evening"
          ? Math.max(0, getMinutesDiff(form.workTime, form.bakeTime) - 90)
          : form.fermentMode === "workday"
            ? Math.max(0, getMinutesDiff(form.workTime, form.bakeTime))
            : 485
    const phases = buildPhases({
      fermentMode: form.fermentMode,
      roomTempC: form.roomTemp,
      fridgeMins: fridgeMinsForModel,
      bulkMins: form.fermentMode === "evening" ? 75 : form.fermentMode === "quick" ? 120 : 90,
      proofMins: proofingMins,
    }).map((ph) =>
      // ak pekár zmeral reálne teploty cesta, model ich použije namiesto odhadov
      ph.name === "bulk" && Number(form.doughAfterMixTemp) > 0
        ? { ...ph, tempC: Number(form.doughAfterMixTemp) }
        : ph,
    )
    const fermentation = computeFermentation({
      flourTotal,
      hydrationPct: hydration,
      saltPct: saltPctOfFlour,
      sweetenerPct: sweetenerPctOfFlour,
      fatPct: flourTotal > 0 ? (fatGrams / flourTotal) * 100 : 0,
      avgProtein,
      wholegrainPct: flourList.filter((f) => /celozrnn|žitn|ražn|ječn|ovesn/i.test(f.name)).reduce((sum, f) => sum + f.pct, 0),
      yeastKind: leavenPct > 0 || /kvások|kvask/i.test(leaven?.name ?? "") ? "sourdough" : yeastType === "fresh" ? "fresh" : "instant",
      leavenPct,
      yeastDosePct,
      yeastAutoPct,
      fermentMode: form.fermentMode,
      roomTempC: form.roomTemp,
      fridgeStartTempC: doughFridgeTemp,
      phases,
    })

    return {
      flourList,
      avgProtein,
      yeastGrams,
      autoYeastGrams,
      yeastName,
      yeastLabel: yeastType === "fresh" ? t("catalog.fresh") : t("catalog.instant"),
      waterGrams,
      saltGrams,
      honeyGrams,
      fatGrams,
      leavenFlour,
      leavenWater,
      leavenTotal,
      leavenName: leaven?.name ?? null,
      proofingMins,
      waterTemp,
      waterTempRecommended,
      doughAfterMixTemp,
      doughFridgeTemp,
      fridgeHours:
        form.fermentMode !== "overnight"
          ? +(getMinutesDiff(form.workTime, form.bakeTime) / 60).toFixed(1)
          : null,
      fermentation,
    }
  }, [form, yeasts, ferments, t])

  // ---------- HARMONOGRAM ----------
  const steps = useMemo(() => {
    const { flourList, waterGrams, yeastGrams, avgProtein, proofingMins, honeyGrams, fatGrams } = recipe
    const loaves = Math.max(1, form.loaves || 1)
    // viac bochníkov = dlhšie pečenie a chladnutie (každý ďalší +8 min v rúre)
    const coolMins = 40 + (loaves - 1) * 10
    // spôsob miesenia: dĺžka miesenia a počet preložení
    // planeta je najpomalšia zo strojov, špirála najrýchlejšia
    const mixMins = form.mixMethod === "hand" ? 10 : form.mixMethod === "handFold" ? 15 : form.mixMethod === "planetary" ? 12 : 6
    const foldCount = form.mixMethod === "hand" ? 2 : form.mixMethod === "handFold" ? 4 : form.mixMethod === "planetary" ? 3 : 2
    const foldGapMins = 30 // medzi preloženiami
    const foldTotalMins = foldCount * foldGapMins
    const flourSummary = flourList.map((f) => `${f.grams}g ${f.name} (${f.pct}%)`).join(" + ")

    // Denná doba podľa skutočného času; pre časy cez polnoc (krok späť) "deň pred"
    const partLabel = (time: string, wentBackOverMidnight: boolean) => {
      const h = Number(time.split(":")[0])
      const part =
        h >= 4 && h < 12 ? t("steps.morning") : h >= 17 ? t("steps.evening") : t("steps.afternoon")
      const dayNote = wentBackOverMidnight ? ` (${t("steps.dayBefore")})` : ""
      return `${part}${dayNote}`
    }

    type Step = { time: string; title: string; desc: string; key: string }

    const build = (
      time: string,
      key: string,
      opts: Record<string, string | number>,
      wentBack = false,
    ): Step => ({
      time,
      key,
      title: t(key, { day: partLabel(time, wentBack), ...opts }) as string,
      desc: t(`${key}Desc`, opts) as string,
    })

    let result: Step[] = []

    if (form.fermentMode === "evening") {
      // večerný proces: autolýza -> zapracovanie -> 4 preklady -> tvarovanie -> chladnička -> ráno pečenie
      const tBake = form.bakeTime
      const tPreheat = addMinutes(tBake, -45)
      const tUncover = addMinutes(tBake, 20)
      const tDoorAjar = addMinutes(tBake, 35)
      const tOut = addMinutes(tBake, 40)
      const tDone = addMinutes(tOut, Math.max(coolMins, 60))

      result = [
        build(addMinutes(form.workTime, -90), "steps.autolyse", { flours: flourSummary || "-", water: waterGrams }),
        build(addMinutes(form.workTime, -60), "steps.incorpEvening", { yeast: yeastGrams, honey: honeyGrams, fat: fatGrams }),
        build(addMinutes(form.workTime, -50), "steps.foldEvening", { n: 1 }),
        build(addMinutes(form.workTime, -38), "steps.foldEvening", { n: 2 }),
        build(addMinutes(form.workTime, -26), "steps.foldEvening", { n: 3 }),
        build(addMinutes(form.workTime, -15), "steps.foldEvening", { n: 4 }),
        build(addMinutes(form.workTime, -10), "steps.shapeEvening", {}),
        build(form.workTime, "steps.fridgeEvening", {}),
        build(tPreheat, "steps.preheat", {}),
        { time: tBake, key: "steps.bakeStart", title: t("steps.bakeStart") as string, desc: t("steps.bakeStartDesc") as string },
        { time: tUncover, key: "steps.bakeUncover", title: t("steps.bakeUncover") as string, desc: t("steps.bakeUncoverDesc") as string },
        { time: tDoorAjar, key: "steps.doorAjar", title: t("steps.doorAjar") as string, desc: t("steps.doorAjarDesc") as string },
        { time: tDone, key: "timeline.done", title: t("timeline.done"), desc: t("steps.doneEveningDesc") },
      ]
    } else if (form.fermentMode === "quick") {
      // rýchly pracovný chlieb: autolýza -> miesenie -> bulk + preklady -> tvarovanie -> pečenie, bez chladničky
      const tBake = form.bakeTime
      const tPreheat = addMinutes(tBake, -45)
      const tShape = addMinutes(tBake, -proofingMins)
      const tFold = addMinutes(tShape, -foldTotalMins)
      const tMix = addMinutes(tFold, -mixMins)
      const tAutolyse = addMinutes(tMix, -30)
      const tDone = addMinutes(tBake, coolMins)

      result = [
        build(tAutolyse, "steps.autolyse", { flours: flourSummary || "-", water: waterGrams }),
        build(tMix, "steps.mix", { hydration: form.hydration, protein: avgProtein.toFixed(1), mins: mixMins, method: t(`recipe.mixMethod_${form.mixMethod}`) }),
        build(tFold, "steps.fold", { count: foldCount, gap: foldGapMins }),
        build(tShape, "steps.shape", { mins: proofingMins, temp: form.roomTemp }),
        build(tPreheat, "steps.preheat", {}),
        { time: tBake, key: "timeline.bake", title: t("timeline.bake"), desc: (loaves > 1 ? t("timeline.bakeDescMulti", { loaves }) : t("timeline.bakeDesc")) as string },
        { time: tDone, key: "timeline.done", title: t("timeline.done"), desc: t("steps.doneDesc") },
      ]
    } else if (form.fermentMode === "workday") {
      const tAutolyse = addMinutes(form.workTime, -30)
      const wentBack = tAutolyse > form.workTime // prechod cez polnoc
      const tBake = form.bakeTime
      const tPreheat = addMinutes(tBake, -45)
      const tShape = addMinutes(tBake, -proofingMins)
      const tFold = addMinutes(tShape, -foldTotalMins)
      const tMix = addMinutes(tFold, -mixMins)
      const tBath = addMinutes(tMix, -20)
      const tDone = addMinutes(tBake, coolMins)

      result = [
        build(tAutolyse, "steps.autolyse", { flours: flourSummary || "-", water: waterGrams }, wentBack),
        build(form.workTime, "steps.fridge", { yeast: yeastGrams, work: t("steps.fridgeWork") }),
        build(tBath, "steps.bath", {}),
        build(tMix, "steps.mix", { hydration: form.hydration, protein: avgProtein.toFixed(1), mins: mixMins, method: t(`recipe.mixMethod_${form.mixMethod}`) }),
        build(tFold, "steps.fold", { count: foldCount, gap: foldGapMins }),
        build(tShape, "steps.shape", { mins: proofingMins, temp: form.roomTemp }),
        build(tPreheat, "steps.preheat", {}),
        { time: tBake, key: "timeline.bake", title: t("timeline.bake"), desc: (loaves > 1 ? t("timeline.bakeDescMulti", { loaves }) : t("timeline.bakeDesc")) as string },
        { time: tDone, key: "timeline.done", title: t("timeline.done"), desc: t("steps.doneDesc") },
      ]
    } else {
      const tBake = form.bakeTime
      const tPreheat = addMinutes(tBake, -45)
      const tShape = addMinutes(tBake, -proofingMins)
      const tFold = addMinutes(tShape, -foldTotalMins)
      const tMix = addMinutes(tFold, -mixMins)
      const tBath = addMinutes(tMix, -20)
      const tFridge = addMinutes(tBath, -485)
      const tAutolyse = addMinutes(tFridge, -30)
      const wentBack = tAutolyse > tFridge || tFridge > tBath
      const tDone = addMinutes(tBake, coolMins)

      result = [
        build(tAutolyse, "steps.autolyse", { flours: flourSummary, water: waterGrams }, wentBack),
        build(tFridge, "steps.fridge", { yeast: yeastGrams, work: t("steps.fridgeNight") }, tFridge > tBath),
        build(tBath, "steps.bath", {}),
        { time: tMix, key: "steps.mixMorning", title: t("steps.mixMorning", { mins: mixMins }) as string, desc: t("steps.mixMorningDesc", { mins: mixMins, method: t(`recipe.mixMethod_${form.mixMethod}`) }) as string },
        { time: tFold, key: "steps.fold", title: t("steps.fold"), desc: t("steps.foldMorningDesc", { count: foldCount, gap: foldGapMins }) as string },
        build(tShape, "steps.shape", { mins: proofingMins, temp: form.roomTemp }),
        build(tPreheat, "steps.preheat", {}),
        { time: tBake, key: "timeline.bake", title: t("timeline.bake"), desc: (loaves > 1 ? t("timeline.bakeDescMulti", { loaves }) : t("timeline.bakeDesc")) as string },
        { time: tDone, key: "timeline.done", title: t("timeline.done"), desc: t("steps.doneDesc") },
      ]
    }
    return result
  }, [recipe, form, t])

  // ---------- ULOŽENIE ----------
  const suggestedRecipeName = useMemo(() => {
    const floursPart = recipe.flourList.map((f) => `${f.name} (${f.pct}%)`).join(" + ")
    const leavenPart = recipe.leavenName
      ? ` | 🫙 ${recipe.leavenName} ${form.leavenPct || 0}%`
      : ""
    const loavesPart = Number(form.loaves) > 1 ? ` | 🍞 ×${form.loaves}` : ""
    const extrasPart =
      Number(form.honeyGrams) > 0 || Number(form.fatGrams) > 0
        ? ` | ${[
            Number(form.honeyGrams) > 0 ? `🍯 ${Number(form.honeyGrams)}g` : "",
            Number(form.fatGrams) > 0 ? `🧈 ${Number(form.fatGrams)}g` : "",
          ]
            .filter(Boolean)
            .join(" + ")}`
        : ""
    return `${form.flourWeight || 500}g${loavesPart} | 💧 ${form.hydration || 70}% | 🕐 ${form.workTime} → ${form.bakeTime} | 🌾 ${floursPart}${extrasPart}${leavenPart}`
  }, [recipe, form])

  const handleSaveRecipe = async () => {
    setError("")
    setPending("recipe")
    try {
      await createRecipe({
        name: suggestedRecipeName,
        flours: form.flours
          .filter((f) => f.value && Number(f.pct) > 0)
          .map((f) => ({
            value: f.value,
            pct: Number(f.pct) || 0,
            customName: f.customName || undefined,
            prot: f.prot,
          })),
        yeast: form.yeast,
        customYeast: form.customYeast || undefined,
        flourWeight: form.flourWeight || 500,
        hydration: form.hydration || 70,
        fermentMode: form.fermentMode,
        workTime: form.workTime,
        bakeTime: form.bakeTime,
        roomTemp: form.roomTemp,
        leavenName: recipe.leavenName ?? undefined,
        leavenPct: Number(form.leavenPct) > 0 ? Number(form.leavenPct) : undefined,
        leavenHydration: ferments?.find((f) => f._id === form.leavenId)?.hydration,
        mixMethod: form.mixMethod,
        honeyGrams: Number(form.honeyGrams) > 0 ? Number(form.honeyGrams) : undefined,
        fatGrams: Number(form.fatGrams) > 0 ? Number(form.fatGrams) : undefined,
        yeastOverrideG:
          form.yeastOverrideG !== "" && Number(form.yeastOverrideG) >= 0
            ? Number(form.yeastOverrideG)
            : undefined,
      })
    } catch (err) {
      console.error("Save recipe failed:", err)
      setError(t("auth.errorSend"))
    } finally {
      setPending("")
    }
  }

  // Vzorový recept: 1 bochník, ~76 % hydratácie, večerný proces
  const loadDemoRecipe = () => {
    const t530 = flours?.find((f) => f.name.includes("T 530"))?.name ?? "vlastna"
    const t1000 = flours?.find((f) => f.name.includes("T 1000"))?.name ?? "vlastna"
    const starch = flours?.find((f) => f.name.includes("škrob"))?.name ?? "vlastna"
    setForm((f) => ({
      ...f,
      flours: [
        { value: t530, pct: 84, customName: t530 === "vlastna" ? "Pšeničná hladká T530" : "", prot: f.flours[0].prot },
        { value: t1000, pct: 11, customName: t1000 === "vlastna" ? "Pšeničná chlebová T1000" : "", prot: f.flours[1].prot },
        { value: starch, pct: 5, customName: starch === "vlastna" ? "Kukuričný/zemiakový škrob" : "", prot: f.flours[2].prot },
      ],
      flourWeight: 475,
      hydration: 76,
      fermentMode: "evening",
      workTime: "22:30",
      bakeTime: "07:00",
      yeast: yeasts?.find((y) => y.name.includes("Saf"))?.name ?? f.yeast,
      leavenId: null,
      leavenPct: "",
      loaves: 1,
      mixMethod: "hand",
      honeyGrams: 5,
      fatGrams: 10,
      roomTemp: 23,
      yeastOverrideG: "",
    }))
  }

  const handleLoadRecipe = (r: (typeof savedRecipes)[number]) => {
    setForm((f) => ({
      ...f,
      flours: [0, 1, 2].map((i) => ({
        value: r.flours[i]?.value ?? "",
        pct: r.flours[i]?.pct ?? 0,
        customName: r.flours[i]?.customName ?? "",
        prot: r.flours[i]?.prot ?? 10,
      })),
      yeast: r.yeast,
      customYeast: r.customYeast ?? "",
      flourWeight: r.flourWeight,
      hydration: r.hydration,
      fermentMode: (["quick", "workday", "overnight", "evening"].includes(r.fermentMode)
        ? r.fermentMode
        : "workday") as FormState["fermentMode"],
      workTime: r.workTime,
      bakeTime: r.bakeTime,
      roomTemp: r.roomTemp,
      leavenId: ferments?.find((x) => x.name === r.leavenName)?._id ?? null,
      leavenPct: r.leavenPct ?? 0,
      loaves: f.loaves,
      mixMethod: (["hand", "handFold", "planetary", "spiral"].includes(r.mixMethod ?? "")
        ? r.mixMethod
        : "planetary") as FormState["mixMethod"],
      honeyGrams: r.honeyGrams ?? "",
      fatGrams: r.fatGrams ?? "",
      yeastOverrideG: r.yeastOverrideG ?? "",
    }))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSaveLog = async () => {
    setError("")
    setPending("log")
    try {
      const base = {
        flourTotal: form.flourWeight || 500,
        flourDetails: recipe.flourList
          .map((f) => `${f.name} (${f.pct}% / ${f.grams}g)`)
          .join(" + "),
        hydration: form.hydration || 70,
        roomTemp: form.roomTemp,
        bakeTime: form.bakeTime,
        workTime: form.workTime,
        yeastBrand: recipe.yeastName,
        rating,
        notes,
      }

      if (photo) {
        const grant = await createUpload({
          filename: photo.name,
          contentType: photo.type || "application/octet-stream",
          fileSize: photo.size,
          visibility: "public",
        })
        const response = await fetch(grant.uploadUrl, {
          method: grant.method,
          headers: grant.headers,
          body: photo,
        })
        if (!response.ok) throw new Error(`Upload failed (${response.status})`)
        await finalizeLogPhoto({ fileId: grant.fileId, ...base })
        clearPhoto()
      } else {
        await createLog(base)
      }
      setNotes("")
    } catch (err) {
      console.error("Save log failed:", err)
      setError(t("auth.errorSend"))
    } finally {
      setPending("")
    }
  }

  const handleDeleteLog = async (id: string, hasPhoto: boolean) => {
    try {
      if (hasPhoto) {
        await deleteLogWithPhoto({ id: id as never })
      } else {
        await deleteLog({ id: id as never })
      }
    } catch (err) {
      console.error("Delete log failed:", err)
    }
  }

  const localeDate = (ts: number) =>
    new Date(ts).toLocaleString(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    })

  return (
    <div
      className="min-h-screen py-4 px-3 sm:py-8"
      style={{
        backgroundColor: "hsl(38 77% 95%)",
        backgroundImage:
          "radial-gradient(circle at 12% 8%, hsl(28 74% 44% / 0.06) 0, transparent 45%), radial-gradient(circle at 88% 92%, hsl(38 92% 50% / 0.07) 0, transparent 40%)",
      }}
      data-testid="pro-app"
    >
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex gap-2 text-xs">
              <Link
                to="/"
                className="rounded-md border border-grain-line bg-dough px-2.5 py-1.5 font-semibold text-crust-deep"
              >
                {t("nav.lite")}
              </Link>
              <span className="rounded-md bg-crust px-2.5 py-1.5 font-semibold text-white">
                {t("nav.pro")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <button
                type="button"
                className="text-xs text-muted-foreground underline cursor-pointer"
                onClick={() => void signOut()}
              >
                {t("nav.logout")}
              </button>
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-crust-deep m-0">
            {t("app.title")}
          </h1>
          <p className="text-crust text-sm mt-1.5">{t("app.subtitle")}</p>
          {user && (
            <p className="text-xs text-muted-foreground m-0">
              {t("auth.signedInAs")}: {user.email}
            </p>
          )}
        </header>

        {/* ČÍSELNÍKY */}
        <CatalogSection />

        {/* ULOŽENÉ RECEPTY */}
        <section className={cardClass} data-testid="recipes-card">
          <h2 className="text-lg font-semibold text-crust-deep border-b-2 border-grain pb-2 mb-4">
            {t("recipe.savedTitle")}
          </h2>
          <div
            className="rounded-lg bg-secondary/50 p-3 mb-3"
            data-state={recipesStatus === "LoadingFirstPage" ? "loading" : "ready"}
          >
            {recipesStatus === "LoadingFirstPage" ? (
              <p className="text-sm text-muted-foreground m-0">…</p>
            ) : savedRecipes.length === 0 ? (
              <p className="text-sm text-muted-foreground m-0">{t("recipe.savedEmpty")}</p>
            ) : (
              <ul className="list-none p-0 m-0 flex flex-col gap-1.5" data-testid="recipe-list">
                {(showAllRecipes ? savedRecipes : savedRecipes.slice(0, 1)).map((r) => (
                  <li
                    key={r._id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-grain-line bg-background px-3 py-2"
                  >
                    <span className="text-xs min-w-0 truncate" title={r.name}>
                      {r.name}
                    </span>
                    <span className="flex gap-2 shrink-0">
                      <button type="button" className="rounded-md border border-crust/30 px-2.5 py-1 text-xs font-semibold text-crust-deep hover:bg-wheat-tag cursor-pointer" onClick={() => handleLoadRecipe(r)}>
                        {t("recipe.load")}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                        aria-label={`${t("history.delete")} ${r.name}`}
                        onClick={() => void deleteRecipe({ id: r._id })}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!showAllRecipes && savedRecipes.length > 1 && (
              <button
                type="button"
                className="mt-2 text-xs text-crust-deep underline cursor-pointer"
                onClick={() => setShowAllRecipes(true)}
                data-testid="show-all-recipes"
              >
                {t("recipe.moreRecipes", { n: savedRecipes.length - 1 })}
              </button>
            )}
            {showAllRecipes && savedRecipes.length > 1 && (
              <button
                type="button"
                className="mt-2 text-xs text-crust-deep underline cursor-pointer"
                onClick={() => setShowAllRecipes(false)}
                data-testid="hide-all-recipes"
              >
                {t("recipe.lessRecipes")}
              </button>
            )}
            {showAllRecipes && recipesStatus === "CanLoadMore" && (
              <button
                type="button"
                className="mt-2 text-xs text-crust-deep underline cursor-pointer ml-2"
                onClick={() => loadMoreRecipes(10)}
              >
                {t("history.loadMore")}
              </button>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive mt-2 mb-0" role="alert">
              {error}
            </p>
          )}
        </section>

        <div className="text-center mb-2">
          <button
            type="button"
            className={btnClass + " !mt-0"}
            onClick={loadDemoRecipe}
            data-testid="load-demo-recipe"
          >
            {t("recipe.loadDemo")}
          </button>
        </div>

        {/* SUROVINY A PARAMETRE */}
        <section className={cardClass} data-testid="ingredients-card">
          <h2 className="text-lg font-semibold text-crust-deep border-b-2 border-grain pb-2 mb-4">
            {t("recipe.ingredientsTitle")}
          </h2>

          <p className={labelClass}>{t("recipe.flourMix")}</p>
          {form.flours.map((slot, idx) => (
            <div key={idx} className="mb-2.5">
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className={`${inputClass} flex-1 min-w-[180px]`}
                  value={slot.value}
                  onChange={(e) => {
                    const v = e.target.value
                    const cat = flours?.find((f) => f.name === v)
                    updateFlour(idx, { value: v, prot: cat?.protein ?? slot.prot })
                  }}
                  aria-label={`${idx + 1}. ${t("catalog.flours")}`}
                >
                  {idx > 0 && <option value="">{t("recipe.flourNone")}</option>}
                  {flours?.map((f) => (
                    <option key={f._id} value={f.name}>
                      {f.name} ({f.protein}g)
                    </option>
                  ))}
                  <option value="vlastna">{t("recipe.flourCustom")}</option>
                </select>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    className={`${inputClass} w-20`}
                    min={0}
                    max={100}
                    value={slot.pct}
                    onChange={(e) => updateFlour(idx, { pct: e.target.value === "" ? "" : Number(e.target.value) || 0 })}
                    aria-label={`% ${idx + 1}`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              {slot.value === "vlastna" && (
                <input
                  type="text"
                  className={`${inputClass} mt-2`}
                  placeholder={t("recipe.flourCustomPlaceholder", { n: idx + 1 })}
                  value={slot.customName}
                  onChange={(e) => updateFlour(idx, { customName: e.target.value })}
                />
              )}
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="yeastBrand">{t("recipe.yeastBrand")}</label>
              <select
                id="yeastBrand"
                className={inputClass}
                value={form.yeast}
                onChange={(e) => update("yeast", e.target.value)}
              >
                {yeasts?.map((y) => (
                  <option key={y._id} value={y.name}>
                    {y.name} ({t(`catalog.${y.type}`)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="leaven">{t("recipe.leaven")}</label>
              <select
                id="leaven"
                className={inputClass}
                value={form.leavenId ?? ""}
                onChange={(e) => update("leavenId", e.target.value || null)}
                data-testid="leaven-select"
              >
                <option value="">{t("recipe.leavenNone")}</option>
                {ferments?.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} ({f.hydration}%)
                  </option>
                ))}
              </select>
            </div>

            {form.leavenId && (
              <div>
                <label className={labelClass} htmlFor="leavenPct">{t("recipe.leavenPct")}</label>
                <input
                  type="number"
                  id="leavenPct"
                  className={inputClass}
                  min={0}
                  max={50}
                  value={form.leavenPct}
                  onChange={(e) => update("leavenPct", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                  data-testid="leaven-pct"
                />
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="flour">{t("recipe.flourWeight")}</label>
              <input
                type="number"
                id="flour"
                className={inputClass}
                step={50}
                min={0}
                value={form.flourWeight}
                onChange={(e) => update("flourWeight", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                data-testid="flour-weight"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="hydration">{t("recipe.hydration")}</label>
              <input
                type="number"
                id="hydration"
                className={inputClass}
                min={50}
                max={90}
                value={form.hydration}
                onChange={(e) => update("hydration", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                data-testid="hydration"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="loaves">{t("recipe.loaves")}</label>
              <input
                type="number"
                id="loaves"
                className={inputClass}
                min={1}
                max={8}
                value={form.loaves}
                onChange={(e) => update("loaves", e.target.value === "" ? "" : Math.max(1, Math.round(Number(e.target.value)) || 1))}
                data-testid="loaves"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="mixMethod">{t("recipe.mixMethod")}</label>
              <select
                id="mixMethod"
                className={inputClass}
                value={form.mixMethod}
                onChange={(e) => update("mixMethod", e.target.value as "hand" | "planetary" | "spiral")}
                data-testid="mix-method"
              >
                <option value="hand">🖐️ {t("recipe.mixMethod_hand")}</option>
                <option value="handFold">🤲 {t("recipe.mixMethod_handFold")}</option>
                <option value="planetary">🥣 {t("recipe.mixMethod_planetary")}</option>
                <option value="spiral">🌀 {t("recipe.mixMethod_spiral")}</option>
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="honey">{t("recipe.honey")}</label>
              <input
                type="number"
                id="honey"
                className={inputClass}
                min={0}
                step={1}
                value={form.honeyGrams}
                onChange={(e) => update("honeyGrams", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                data-testid="honey"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="fat">{t("recipe.fat")}</label>
              <input
                type="number"
                id="fat"
                className={inputClass}
                min={0}
                step={1}
                value={form.fatGrams}
                onChange={(e) => update("fatGrams", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                data-testid="fat"
              />
            </div>

          </div>

          {/* PREPOČET */}
          <div className="mt-4 flex flex-wrap justify-around gap-3 rounded-lg border border-grain-line bg-wheat-tag/60 p-3 text-center">
            <div>
              <div className="font-bold text-crust-deep text-base" data-testid="rec-flours">
                {recipe.flourList.map((f) => `${f.grams}g`).join(" + ") || "0 g"}
              </div>
              <div className="text-xs text-crust-deep/80">{t("recipe.floursSplit")}</div>
            </div>
            <div>
              <div className="font-bold text-crust-deep text-base">{recipe.avgProtein.toFixed(1)} g</div>
              <div className="text-xs text-crust-deep/80">{t("recipe.proteinAvg")}</div>
            </div>
            <div>
              <div className="font-bold text-crust-deep text-base" data-testid="rec-water">
                {recipe.waterGrams} g
              </div>
              <div className="text-xs text-crust-deep/80">
                {t("recipe.waterLabel", { pct: form.hydration })}
              </div>
              <div className="text-xs text-crust font-semibold" data-testid="rec-water-temp">
                {t("recipe.waterTempLabel", { temp: recipe.waterTemp })}
              </div>
              {Number(form.waterInTemp) > 0 && (
                <div className="text-xs text-muted-foreground" data-testid="rec-water-recommended">
                  {t("recipe.waterRecommended", { temp: recipe.waterTempRecommended })}
                </div>
              )}
            </div>
            <div>
              <div className="font-bold text-crust-deep text-base" data-testid="rec-yeast">
                {recipe.yeastGrams} g
              </div>
              <div className="text-xs text-crust-deep/80">{recipe.yeastLabel}</div>
            </div>
            <div>
              <div className="font-bold text-crust-deep text-base">{recipe.saltGrams} g</div>
              <div className="text-xs text-crust-deep/80">{t("recipe.saltLabel")}</div>
            </div>
            {recipe.honeyGrams > 0 && (
              <div>
                <div className="font-bold text-crust-deep text-base">{recipe.honeyGrams} g</div>
                <div className="text-xs text-crust-deep/80">{t("recipe.honey")}</div>
              </div>
            )}
            {recipe.fatGrams > 0 && (
              <div>
                <div className="font-bold text-crust-deep text-base">{recipe.fatGrams} g</div>
                <div className="text-xs text-crust-deep/80">{t("recipe.fat")}</div>
              </div>
            )}
            {recipe.leavenName && Number(form.leavenPct) > 0 && (
              <div>
                <div className="font-bold text-crust-deep text-base">{recipe.leavenTotal} g</div>
                <div className="text-xs text-crust-deep/80">
                  {t("recipe.leavenSummary", {
                    name: recipe.leavenName,
                    pct: Number(form.leavenPct) || 0,
                    grams: recipe.leavenTotal,
                  })}
                </div>
              </div>
            )}
          </div>
          {recipe.fridgeHours !== null && (
            <p className="text-center text-xs text-crust mt-2 mb-0">
              {t("recipe.fridgeHours", { hours: recipe.fridgeHours })}
            </p>
          )}

          {/* FERMENTAČNÝ MODEL */}
          <div
            className="mt-4 rounded-lg border border-grain-line bg-dough p-3"
            data-testid="fermentation-model"
            data-state="ready"
          >
            <p className="text-xs font-bold text-crust-deep m-0 mb-2">
              {t("ferm.title")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              <div>
                <label className={labelClass} htmlFor="fermentMode">{t("recipe.fermentMode")}</label>
                <select
                  id="fermentMode"
                  className={inputClass}
                  value={form.fermentMode}
                  onChange={(e) => {
                    const mode = e.target.value as FormState["fermentMode"]
                    update("fermentMode", mode)
                    // typické časy scénáru (možno upraviť podľa seba)
                    if (mode === "quick") {
                      update("workTime", "09:00")
                      update("bakeTime", "13:00")
                    } else if (mode === "overnight") {
                      update("workTime", "21:00")
                      update("bakeTime", "07:00")
                    } else if (mode === "evening") {
                      update("workTime", "21:45")
                      update("bakeTime", "07:00")
                    } else {
                      update("workTime", "06:15")
                      update("bakeTime", "18:30")
                    }
                  }}
                  data-testid="ferment-mode"
                >
                  <option value="quick">{t("recipe.quick")}</option>
                  <option value="overnight">{t("recipe.overnight")}</option>
                  <option value="workday">{t("recipe.workday")}</option>
                  <option value="evening">{t("recipe.evening")}</option>
                </select>
              </div>
              {form.fermentMode !== "overnight" && (
                <div>
                  <label className={labelClass} htmlFor="workTime">{t("recipe.workTime")}</label>
                  <input
                    type="time"
                    id="workTime"
                    className={inputClass}
                    value={form.workTime}
                    onChange={(e) => update("workTime", e.target.value)}
                    data-testid="work-time"
                  />
                </div>
              )}
              <div>
                <label className={labelClass} htmlFor="bakeTime">{t("recipe.bakeTime")}</label>
                <input
                  type="time"
                  id="bakeTime"
                  className={inputClass}
                  value={form.bakeTime}
                  onChange={(e) => update("bakeTime", e.target.value)}
                  data-testid="bake-time"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="roomTemp">{t("recipe.roomTemp")}</label>
                <select
                  id="roomTemp"
                  className={inputClass}
                  value={form.roomTemp}
                  onChange={(e) => update("roomTemp", Number(e.target.value))}
                >
                  <option value={19}>18 - 20 °C</option>
                  <option value={23}>21 - 24 °C</option>
                  <option value={27}>25 - 28 °C</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="waterInTemp">{t("recipe.waterInTemp")}</label>
                <input
                  type="number"
                  id="waterInTemp"
                  className={inputClass}
                  min={0}
                  max={60}
                  step={0.5}
                  value={form.waterInTemp}
                  onChange={(e) => update("waterInTemp", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                  data-testid="water-in-temp"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="doughAfterMixTemp">{t("recipe.doughAfterMixTemp")}</label>
                <input
                  type="number"
                  id="doughAfterMixTemp"
                  className={inputClass}
                  min={0}
                  max={45}
                  step={0.5}
                  value={form.doughAfterMixTemp}
                  onChange={(e) => update("doughAfterMixTemp", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                  data-testid="dough-after-mix-temp"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="doughFridgeTemp">{t("recipe.doughFridgeTemp")}</label>
                <input
                  type="number"
                  id="doughFridgeTemp"
                  className={inputClass}
                  min={0}
                  max={40}
                  step={0.5}
                  value={form.doughFridgeTemp}
                  onChange={(e) => update("doughFridgeTemp", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                  data-testid="dough-fridge-temp"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="yeastOverrideG">{t("ferm.yeastOverride")}</label>
                <input
                  type="number"
                  id="yeastOverrideG"
                  className={inputClass}
                  min={0}
                  max={50}
                  step={0.5}
                  placeholder={t("ferm.yeastAutoShort", { auto: recipe.autoYeastGrams })}
                  value={form.yeastOverrideG}
                  onChange={(e) => update("yeastOverrideG", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                  data-testid="yeast-override"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("ferm.yeastOverrideHint")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground">
                {t("ferm.progress")}:{" "}
                <strong
                  className={
                    recipe.fermentation.risk === "ok"
                      ? "text-palm"
                      : recipe.fermentation.risk === "under"
                        ? "text-crust-deep"
                        : "text-destructive"
                  }
                  data-testid="ferm-pct"
                >
                  {recipe.fermentation.fermentPct} %
                </strong>
              </span>
              <span className="text-xs text-muted-foreground">
                {t("ferm.risk")}:{" "}
                <strong
                  className={
                    recipe.fermentation.risk === "ok"
                      ? "text-palm"
                      : recipe.fermentation.risk === "under"
                        ? "text-crust-deep"
                        : "text-destructive"
                  }
                  data-testid="ferm-risk"
                >
                  {t(`ferm.risk_${recipe.fermentation.risk}`)}
                </strong>
              </span>
              <span className="text-xs text-muted-foreground">
                {t("ferm.activity")}:{" "}
                <strong data-testid="ferm-activity">
                  {recipe.fermentation.activity.toFixed(1)} NH24
                </strong>
              </span>
              <span className="text-xs text-muted-foreground">
                {t("ferm.doughTempMix")}:{" "}
                <strong data-testid="ferm-dough-mix-temp">
                  {recipe.doughAfterMixTemp.toFixed(1)} °C
                </strong>
              </span>
              <span className="text-xs text-muted-foreground">
                {t("ferm.doughTempFridge")}:{" "}
                <strong data-testid="ferm-dough-fridge-temp">
                  {recipe.doughFridgeTemp.toFixed(1)} °C
                </strong>
              </span>
              <span className="text-xs text-muted-foreground">
                {t("ferm.yeastAdvice")}:{" "}
                <strong data-testid="ferm-yeast-advice">
                  {recipe.fermentation.yeastPct.toFixed(2)} %
                  {" "}
                  ({((recipe.fermentation.yeastPct / 100) * (form.flourWeight || 500)).toFixed(2)} g)
                </strong>
              </span>

              {recipe.fermentation.lacticRatio !== null && (
                <span className="text-xs text-muted-foreground">
                  {t("ferm.acidity")}:{" "}
                  <strong data-testid="ferm-acidity">
                    {t(recipe.fermentation.lacticRatio >= 0.55 ? "ferm.acidityMild" : "ferm.aciditySharp")}
                  </strong>
                </span>
              )}
            </div>
            {/* vizuálna ladica fermentačného priebehu */}
            <div
              className="mt-2 h-2.5 w-full rounded-full bg-secondary overflow-hidden"
              role="progressbar"
              aria-valuenow={recipe.fermentation.fermentPct}
              aria-valuemin={0}
              aria-valuemax={160}
              aria-label={t("ferm.progress")}
            >
              <div
                className={
                  "h-full rounded-full transition-all " +
                  (recipe.fermentation.risk === "ok"
                    ? "bg-palm"
                    : recipe.fermentation.risk === "under"
                      ? "bg-crust"
                      : "bg-destructive")
                }
                style={{ width: `${Math.min(100, (recipe.fermentation.fermentPct / 160) * 100)}%` }}
              />
            </div>
            {recipe.fermentation.risk !== "ok" && (
              <p className="text-xs text-crust-deep mt-2 mb-0" data-testid="ferm-advice">
                {t(`ferm.advice_${recipe.fermentation.risk}`)}
              </p>
            )}
            <p className="text-[0.7rem] text-muted-foreground mt-2 mb-0">
              {t("ferm.hint")}
            </p>
          </div>

          {/* ULOŽIŤ RECEPT pod sumárom s rozpisom */}
          <button
            type="button"
            className={btnClass}
            disabled={pending === "recipe"}
            onClick={() => void handleSaveRecipe()}
            data-testid="save-recipe-btn"
          >
            {pending === "recipe" ? t("recipe.saving") : t("recipe.saveRecipe")}
          </button>
          <p className="text-xs text-muted-foreground mt-2 mb-0 break-all" data-testid="suggested-name">{suggestedRecipeName}</p>
        </section>

        {/* ČASOVÁ OS */}
        <section className={cardClass} data-testid="timeline-card">
          <h2 className="text-lg font-semibold text-crust-deep border-b-2 border-grain pb-2 mb-4">
            {t("timeline.title")}
          </h2>

          <ol className="list-none m-0 p-0 pl-5 border-l-[3px] border-crust" data-testid="timeline">
            {steps.map((s, i) => (
              <li key={`${s.time}-${s.title}`} className="relative mb-4 last:mb-0">
                <span className="absolute -left-[26px] top-1 block w-2.5 h-2.5 rounded-full bg-crust ring-2 ring-dough" />
                <div className="font-bold text-crust text-sm">{s.time}</div>
                <div className="font-semibold text-sm my-0.5">{s.title}</div>
                <div className="text-[0.83rem] text-muted-foreground">{s.desc}</div>
                <button
                  type="button"
                  className={
                    "mt-1 rounded-md px-2.5 py-1 text-[0.72rem] font-semibold cursor-pointer tabular-nums " +
                    (timer && timer.stepKey === s.key
                      ? "border-2 border-crust bg-wheat-tag text-crust-deep"
                      : "border border-crust/30 text-crust-deep hover:bg-wheat-tag")
                  }
                  onClick={() =>
                    timer && timer.stepKey === s.key
                      ? setTimer(null)
                      : startTimerForStep(s, steps[i + 1]?.time)
                  }
                  aria-label={
                    timer && timer.stepKey === s.key
                      ? `${t("timer.stop")} ${s.time}`
                      : `${t("timer.start")} ${s.time}`
                  }
                  data-testid={timer && timer.stepKey === s.key ? "timer-button-running" : "timer-button-start"}
                >
                  {timer && timer.stepKey === s.key && timerRemaining
                    ? `⏳ ${timerRemaining.totalMin}:${String(timerRemaining.s).padStart(2, "0")} ${t("timer.min")}`
                    : `⏲️ ${t("timer.start")}`}
                </button>
              </li>
            ))}
          </ol>
        </section>

        {/* ULOŽIŤ POKUS */}
        <section className={cardClass} data-testid="log-form-card">
          <h2 className="text-lg font-semibold text-crust-deep border-b-2 border-grain pb-2 mb-4">
            {t("log.title")}
          </h2>
          <div className="mb-3">
            <span className={labelClass}>{t("log.rating")}</span>
            <StarRating value={rating} onChange={setRating} t={t} />
          </div>
          <div className="mb-2">
            <label className={labelClass} htmlFor="notes">{t("log.notes")}</label>
            <textarea
              id="notes"
              rows={3}
              className={inputClass}
              placeholder={t("log.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="notes-input"
            />
          </div>
          <div className="mb-2">
            <span className={labelClass}>{t("log.photo")}</span>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPhotoChange}
              data-testid="photo-input"
            />
            {photoCompressing ? (
              <p className="text-xs text-muted-foreground m-0" data-testid="photo-compressing">
                {t("log.photoCompressing")}
              </p>
            ) : photoPreview ? (
              <div className="flex flex-col gap-2">
                <img
                  src={photoPreview}
                  alt={t("log.photo")}
                  className="max-h-64 rounded-lg border border-grain-line object-cover"
                  data-testid="photo-preview"
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <button type="button" className="rounded-md border border-crust/30 px-2.5 py-1 text-xs font-semibold text-crust-deep cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                    {t("log.photoChange")}
                  </button>
                  <button type="button" className="rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive cursor-pointer" onClick={clearPhoto}>
                    {t("log.photoRemove")}
                  </button>
                  {photo && (
                    <span className="text-[0.72rem] text-muted-foreground">
                      {t("log.photoSize", { size: Math.round(photo.size / 1024) })}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="rounded-md border border-crust/30 px-2.5 py-1.5 text-xs font-semibold text-crust-deep hover:bg-wheat-tag cursor-pointer"
                onClick={() => photoInputRef.current?.click()}
                data-testid="add-photo-btn"
              >
                📷 {t("log.photoAdd")}
              </button>
            )}
          </div>
          <button
            type="button"
            className={btnClass}
            disabled={pending === "log"}
            onClick={() => void handleSaveLog()}
            data-testid="save-log-btn"
          >
            {pending === "log" ? t("log.saving") : t("log.save")}
          </button>
        </section>

        {/* HISTÓRIA */}
        <section className={cardClass} data-testid="history-card">
          <h2 className="text-lg font-semibold text-crust-deep border-b-2 border-grain pb-2 mb-4">
            {t("history.title")}
          </h2>
          <div data-state={logsStatus === "LoadingFirstPage" ? "loading" : "ready"} data-testid="logs-container">
            {logsStatus === "LoadingFirstPage" ? (
              <p className="text-sm text-muted-foreground m-0">{t("history.loading")}</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground m-0">{t("history.empty")}</p>
            ) : (
              <div className="flex flex-col gap-3" data-testid="log-list">
                {(showAllLogs ? logs : logs.slice(0, 1)).map((l) => (
                  <article
                    key={l._id}
                    className="border-l-4 border-crust rounded-lg bg-background p-3 shadow-sm"
                  >
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-1">
                      <div className="text-sm">
                        <strong>{t("history.flourTotal", { grams: l.flourTotal })}</strong> |{" "}
                        {t("recipe.hydration")}: {l.hydration}% | {t("history.departure")}:{" "}
                        {l.workTime || "N/A"} | {t("history.baking")}: {l.bakeTime}
                      </div>
                      <div className="text-yeast-star" aria-label={`${l.rating}/5`}>
                        {"★".repeat(l.rating)}
                        <span className="text-border">{"★".repeat(5 - l.rating)}</span>
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
                    {l.photoUrl && (
                      <button
                        type="button"
                        className="mt-2 p-0 border-none bg-transparent cursor-pointer"
                        onClick={() => setLightboxUrl(l.photoUrl ?? null)}
                        aria-label={t("history.enlargePhoto")}
                        data-testid="log-photo-thumb"
                      >
                        <img
                          src={l.photoUrl}
                          alt={t("log.photo")}
                          className="max-h-28 w-28 rounded-lg border border-grain-line object-cover"
                          data-testid="log-photo"
                        />
                      </button>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {t("history.saved")}: {localeDate(l._creationTime)}
                    </div>
                    <p className="text-sm bg-secondary/50 rounded-md p-2 mt-1.5 mb-0 whitespace-pre-wrap">
                      {l.notes}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-destructive underline cursor-pointer mt-1.5"
                      onClick={() => void handleDeleteLog(l._id, !!l.photoFileId)}
                    >
                      {t("history.delete")}
                    </button>
                  </article>
                ))}
              </div>
            )}
            {!showAllLogs && logs.length > 1 && (
              <button
                type="button"
                className="mt-2 text-xs text-crust-deep underline cursor-pointer"
                onClick={() => setShowAllLogs(true)}
                data-testid="show-all-logs"
              >
                {t("history.moreBakes", { n: logs.length - 1 })}
              </button>
            )}
            {showAllLogs && logs.length > 1 && (
              <button
                type="button"
                className="mt-2 text-xs text-crust-deep underline cursor-pointer"
                onClick={() => setShowAllLogs(false)}
                data-testid="hide-all-logs"
              >
                {t("history.lessBakes")}
              </button>
            )}
            {showAllLogs && logsStatus === "CanLoadMore" && (
              <button
                type="button"
                className="mt-2 text-xs text-crust-deep underline cursor-pointer ml-2"
                onClick={() => loadMoreLogs(10)}
              >
                {t("history.loadMore")}
              </button>
            )}
          </div>
        </section>

        {/* LIGHTBOX NA ZVÄČŠENIE FOTKY */}
        {lightboxUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 cursor-pointer"
            onClick={() => setLightboxUrl(null)}
            role="dialog"
            aria-modal="true"
            aria-label={t("history.enlargePhoto")}
            data-testid="photo-lightbox"
          >
            <img
              src={lightboxUrl}
              alt={t("log.photo")}
              className="max-w-full max-h-full rounded-lg object-contain"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function RouteComponent() {
  return (
    <>
      <Authenticated>
        <ProPage />
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  )
}

export const Route = createFileRoute('/pro')({
  component: RouteComponent,
})
