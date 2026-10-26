/**
 * MODULÁRNY MODEL FERMENTÁCIE v2
 *
 * [ VSTUPNÝ MODUL ]  ->  [ MIKROBIOLOGICKÝ MODUL ]  ->  [ VÝSTUPNÝ MODUL ]
 *
 * Vstupné kategórie:
 *   A. Receptúrové vstupy (kvasidlo, múka, hydratácia, inhibítory)
 *   B. Teplotné vstupy (prostredie, voda, dynamické chladnutie cesta)
 *   C. Fázové časy (autolýza, bulk, retardácia, finálne kvasenie)
 *   D. Prednastavené pekárenské režimy (scenáre)
 *
 * Výstup: Index Zrelosti Cesta (M_index) v % + doporučené dávkovanie kvasidla.
 */

// ---------- A. RECEPTÚROVÉ VSTUPY ----------

export type YeastKind = "instant" | "fresh" | "sourdough"

export type FermentationInput = {
  /** celková múka v g */
  flourTotal: number
  /** hydratácia v % */
  hydrationPct: number
  /** soľ v % z múky */
  saltPct: number
  /** med/cukor v % z múky */
  sweetenerPct: number
  /** tuk v % z múky (brioche efekt) */
  fatPct: number
  /** priemerné bielkoviny múk g/100g */
  avgProtein: number
  /** podiel celozrnnej/ražnej múky v % (0-100) */
  wholegrainPct: number
  /** typ kvasidla */
  yeastKind: YeastKind
  /** podiel predkvasu (% múky, 0 ak žiadny) */
  leavenPct: number
  /** režim procesu */
  fermentMode: "quick" | "workday" | "overnight" | "evening" | "sourdough"
  /** teplota miestnosti */
  roomTempC: number
  /** reálne dávkovanie droždia v % múky (vlastná úprava) */
  yeastDosePct?: number
  /** automaticky doporučená dávka v % múky (referencia ↑/↓) */
  yeastAutoPct?: number
  /** teplota cesta pri vstupe do chladničky (štart chladnutia) */
  fridgeStartTempC?: number
  /** fázy procesu (izotermické bloky) */
  phases: FermentPhase[]
}

export type FermentPhase = {
  /** "autolyse" | "bulk" | "fridge" | "proof" */
  name: string
  /** teplota fázy v °C */
  tempC: number
  /** trvanie fázy v minútach */
  mins: number
  /** či fáza prispieva k zrelosti (autolýza nie) */
  counts?: boolean
}

// ---------- B. MIKROBIOLOGICKÝ MODUL ----------

/**
 * Teplotný koeficient f(T) – rýchlosť kvasiniek voči referenčnej 24 °C = 1.0.
 * Presné tabuľkové hodnoty podľa pekárskej praxe:
 *   4 °C = 0.12, 10 °C = 0.30, 16 °C = 0.55, 20 °C = 0.80,
 *   24 °C = 1.00, 28 °C = 1.60, 32 °C = 2.00, 36 °C = 2.20 (blízko optima),
 *   nad 40 °C kvasinky odumierajú (0).
 * Medzi uzlami sa lineárne interpoluje.
 */
const TEMP_TABLE: Array<[number, number]> = [
  [0, 0.08],
  [4, 0.12],
  [10, 0.3],
  [16, 0.55],
  [20, 0.8],
  [24, 1.0],
  [28, 1.6],
  [32, 2.0],
  [36, 2.2],
  [40, 1.0],
  [45, 0.0],
]

export function yeastRate(tempC: number): number {
  if (tempC <= TEMP_TABLE[0][0]) return TEMP_TABLE[0][1]
  if (tempC >= TEMP_TABLE[TEMP_TABLE.length - 1][0]) return 0
  for (let i = 1; i < TEMP_TABLE.length; i++) {
    const [t1, r1] = TEMP_TABLE[i - 1]
    const [t2, r2] = TEMP_TABLE[i]
    if (tempC <= t2) {
      const frac = (tempC - t1) / (t2 - t1)
      return r1 + frac * (r2 - r1)
    }
  }
  return 0
}

/** Typ kvasidla: sušené = 1.0, čerstvé ~ 0.7 efektívnej dynamiky (viac hmoty,
 *  ale pomalší štart), kvások = pomalá dynamika s tvorbou kyselín (~0.45). */
export function yeastKindFactor(kind: YeastKind): number {
  if (kind === "fresh") return 0.7
  if (kind === "sourdough") return 0.45
  return 1.0
}

/** Koeficient fermentácie múky (M): biela pšeničná 1.0, celozrnná ~1.3, ražná ~1.5.
 *  Vypočíta sa priebehovo z podielu celozrnnej múky. */
export function flourFermentationFactor(wholegrainPct: number): number {
  return 1 + (Math.min(100, Math.max(0, wholegrainPct)) / 100) * 0.4
}

/** Soľ: nad 2 % každých 0.1 % spomaľuje kvasinky o ~1 %. */
export function saltFactor(saltPct: number): number {
  return Math.max(0.4, 1 - Math.max(0, saltPct - 2) * 0.1)
}

/** Cukor: do 5 % pomáha, nad 5 % osmotický tlak. Tuk (brioche) ďalej spomaľuje. */
export function inhibitorFactor(sweetenerPct: number, fatPct: number): number {
  let f = 1
  if (sweetenerPct > 5) f *= Math.max(0.5, 1 - (sweetenerPct - 5) * 0.02)
  if (fatPct > 5) f *= Math.max(0.6, 1 - (fatPct - 5) * 0.015)
  return f
}

/** Hydratácia: mäkšie cesto (75-80 %) kvasí rýchlejšie ako tuhé (60 %). */
export function hydrationFactor(hydrationPct: number): number {
  return 1 + Math.min(0.35, Math.max(-0.1, (hydrationPct - 70) * 0.012))
}

/** Nameraná krivka chladnutia cesta v chladničke (The Sourdough Journey,
 *  650 g cesta, 78 % hydratácia, chladnička 1,7 °C): 25,6 °C -> ~20,6 °C po 1 h,
 *  ~10 °C po 3 h, asymptota ~4,4 °C okolo 7,5 h. Tabuľka je normalizovaný
 *  zostatok tepla g(t) = (T(t) − T_fridge) / (T_start − T_fridge). */
const COOLING_CURVE: Array<[number, number]> = [
  [0, 1.0],
  [0.5, 0.89],
  [1.0, 0.76],
  [1.5, 0.58],
  [2.0, 0.45],
  [2.5, 0.37],
  [3.0, 0.26],
  [3.5, 0.24],
  [4.0, 0.18],
  [4.5, 0.13],
  [5.0, 0.11],
  [5.5, 0.08],
  [6.0, 0.06],
  [6.5, 0.03],
  [7.5, 0.0],
]

function coolingRemainder(hours: number): number {
  if (hours <= 0) return 1
  const last = COOLING_CURVE[COOLING_CURVE.length - 1]
  if (hours >= last[0]) return 0
  for (let i = 1; i < COOLING_CURVE.length; i++) {
    const [t1, g1] = COOLING_CURVE[i - 1]
    const [t2, g2] = COOLING_CURVE[i]
    if (hours <= t2) {
      const frac = (hours - t1) / (t2 - t1)
      return g1 + frac * (g2 - g1)
    }
  }
  return 0
}

/** Dynamické chladnutie: jadro cesta nasleduje nameranú krivku TSJ
 *  (rýchle ochladenie prvé ~3 h, potom pomalé dochladenie na teplotu
 *  chladničky). Rozdelíme chladničkovú fázu na 30-minútové kroky. */
function coolingProfile(tStartC: number, tFridgeC: number, mins: number): number[] {
  const steps: number[] = []
  const n = Math.max(1, Math.ceil(mins / 30))
  const stepMins = mins / n
  for (let i = 0; i < n; i++) {
    const hours = ((i + 0.5) * stepMins) / 60
    const g = coolingRemainder(hours)
    steps.push(tFridgeC + (tStartC - tFridgeC) * g)
  }
  return steps
}

/** Cieľové narastanie cesta pred chladničkou podľa The Sourdough Journey
 *  (Bulk Fermentation Guidelines): 18 °C -> 100 %, 21 °C -> 75 %,
 *  24 °C -> 50 %, 27 °C -> 30 %. Lineárna interpolácia medzi 16-28 °C. */
export function bulkRiseTargetPct(bulkTempC: number): number {
  const t = Math.min(28, Math.max(16, bulkTempC))
  return Math.round(100 - (t - 18) * (70 / 9))
}

/** Kalibračná teplota bulk fázy režimu – pri nej je cieľ zrelosti bez zmeny
 *  (MODE_TARGET bolo kalibrované na izbu 23 °C, kváskový bulk na 24 °C). */
const MODE_BULK_CAL_TEMP: Record<string, number> = {
  quick: 23,
  workday: 23,
  overnight: 23,
  evening: 23,
  sourdough: 24,
}

/** Korekcia cieľa zrelosti podľa teploty bulk fázy: teplejšie cesto má
 *  skončiť bulk s nižším narastaním (chladnička domkne zvyšok),
 *  chladnejšie naopak s vyšším. */
export function bulkTempFactor(bulkTempC: number, fermentMode: string): number {
  const cal = MODE_BULK_CAL_TEMP[fermentMode] ?? 23
  const f = bulkRiseTargetPct(bulkTempC) / bulkRiseTargetPct(cal)
  return Math.min(1.8, Math.max(0.5, f))
}

/** Integrácia fermentačnej práce (Fermentačné jednotky) cez všetky fázy.
 *  Fázy s counts === false (autolýza) neprispievajú. Chladničková fáza používa
 *  dynamický teplotný profil (prechladnutie 2-4 h podľa hmoty). */
export function integratedActivity(input: FermentationInput): number {
  const chemical =
    flourFermentationFactor(input.wholegrainPct) *
    saltFactor(input.saltPct) *
    inhibitorFactor(input.sweetenerPct, input.fatPct) *
    hydrationFactor(input.hydrationPct)

  let activity = 0
  for (const p of input.phases) {
    if (p.counts === false) continue
    if (p.name === "fridge" && p.mins > 0) {
      // dynamické chladnutie z reálnej teploty cesta pred chladničkou (meranie alebo odhad ~22 °C)
      const tStart = Math.max(p.tempC, input.fridgeStartTempC ?? 22)
      const temps = coolingProfile(tStart, p.tempC, p.mins)
      for (const temp of temps) {
        activity += yeastRate(temp) * (p.mins / temps.length)
      }
    } else {
      activity += yeastRate(p.tempC) * p.mins
    }
  }
  return (activity / 60) * chemical
}

/** Referenčná fermentačná práca ideálneho scenára podľa režimu (NH24).
 *  Kalibrované na štandardné priebehy režimov:
 *  quick ~2 NH (2 h pri izbe), workday ~4.9, overnight ~4.8,
 *  evening ~3.7, sourdough ~8 NH × 0.45 (pomalá kvásková dynamika) = 3.6. */
const MODE_TARGET: Record<string, number> = {
  quick: 2.9, // kalibrované na 2 h bulk + 1 h proof pri 23 °C
  workday: 5.45,
  overnight: 5.45,
  evening: 4.9, // kalibrované na defaultný večerný harmonogram (izba 23 °C, chladnička ~7,75 h, krivka chladnutia TSJ)
  sourdough: 4.1, // kalibrované na 4.5 h bulk 24 °C + 12 h ošatka 4 °C × kvásková dynamika (krivka chladnutia TSJ)
}

// ---------- VÝSTUPNÝ MODUL ----------

export type MaturityRisk = "under" | "ok" | "over" | "severely-over"

export type FermentationOutput = {
  /** Index Zrelosti Cesta (M_index) v % */
  maturityIndex: number
  /** alias pre starší UI kľúč fermentPct */
  fermentPct: number
  risk: MaturityRisk
  /** doporučené dávkovanie droždia v % múky */
  yeastPct: number
  /** odhad dĺžky bulk fermentácie v min pri izbovej teplote */
  bulkMins: number
  /** integrovaná aktivita NH */
  activity: number
  /** pomer kyseliny mliečnej vs octovej (0-1, vyššie = viac mliečnej/jemnejšej) */
  lacticRatio: number | null
  /** cieľové narastanie cesta pred chladničkou v % (len keď po bulku nasleduje chladnička) */
  riseTargetPct: number | null
}

export function computeFermentation(input: FermentationInput): FermentationOutput {
  // kvásková dynamika: pomalé kvasenie s tvorbou kyselín (0.45 faktor)
  const kindAdj = input.yeastKind === "sourdough" ? yeastKindFactor("sourdough") : 1
  // aktivita pri základnej (automatickej) dávke – základ pre odporúčanie,
  // nezmenená tým, čo používateľ do poľa ručne zadal
  const baseActivity = integratedActivity(input) * kindAdj
  let activity = baseActivity

  // vliv dávky droždia: sublineárne škálovanie voči základnej dávke
  // (viac droždia = rýchlejšie kysnutie, ale nie priamo úmerne – kvasinky sa delia)
  const dose = input.yeastDosePct ?? 0
  const auto = input.yeastAutoPct ?? 0
  if (input.yeastKind !== "sourdough" && dose > 0 && auto > 0 && Math.abs(dose - auto) > 1e-9) {
    activity *= Math.min(3.5, Math.max(0.15, Math.pow(dose / auto, 0.75)))
  }

  // predkvas odrobil časť práce dopredu
  const leavenCredit = Math.min(0.8, (input.leavenPct / 100) * 1.5)

  // Cieľové narastanie podľa teploty bulk fázy (The Sourdough Journey):
  // aplikuje sa len v režimoch, kde po bulku nasleduje chladnička
  // (bulok + retardácia = jedna celková zrelosť).
  const bulkIdx = input.phases.findIndex((p) => p.name === "bulk")
  const fridgeAfterBulk =
    bulkIdx >= 0 && input.phases.some((p, i) => p.name === "fridge" && i > bulkIdx)
  const bulkTempC = bulkIdx >= 0 ? input.phases[bulkIdx].tempC : input.roomTempC
  const riseTargetPct = fridgeAfterBulk ? bulkRiseTargetPct(bulkTempC) : null
  const tempFactor = fridgeAfterBulk ? bulkTempFactor(bulkTempC, input.fermentMode) : 1

  const target = (MODE_TARGET[input.fermentMode] ?? 4.0) * (1 - leavenCredit) * tempFactor

  // Index Zrelosti: <85 podkvasené, 95-105 ideál, >115 prekvasené
  const maturityIndex = Math.min(160, Math.round((activity / target) * 100))

  let risk: MaturityRisk
  if (maturityIndex < 85) risk = "under"
  else if (maturityIndex <= 115) risk = "ok"
  else if (maturityIndex <= 145) risk = "over"
  else risk = "severely-over"

  // Odporúčané dávkovanie kvasidla: aká dávka dorovná Index zrelosti na ~100 %
  // pre aktuálne časy a teploty (inverzia dávkovacej krivky, exponent 1/0.75).
  // Základ = automatická dávka režimu (yeastAutoPct); ak nie je zadaná, pozičný
  // scenárový štandard. Kompas rozsahu 1/3 až 3× kvôli extrémom.
  const modeYeastPct: Record<string, number> = {
    quick: 1.75,
    workday: 0.25,
    overnight: 0.35,
    evening: 0.17,
    sourdough: 0,
  }
  const autoPctForRec =
    (input.yeastAutoPct ?? modeYeastPct[input.fermentMode] ?? 0.3) ||
    (modeYeastPct[input.fermentMode] ?? 0.3) * (input.yeastKind === "fresh" ? 3 : 1)
  let yeastPct = autoPctForRec
  if (input.yeastKind !== "sourdough" && auto > 0) {
    const baseIndex = (baseActivity / target) * 100 // Index pri základnej dávke, nezávisle od ručného vstupu
    if (baseIndex >= 15) {
      const ratio = Math.min(3, Math.max(1 / 3, Math.pow(100 / baseIndex, 1 / 0.75)))
      yeastPct = Math.max(0.02, Math.min(3, autoPctForRec * ratio))
    }
  }
  if (input.yeastKind === "sourdough") yeastPct = 0

  // Bulk fermentácia pri izbovej teplote (bez chladničky)
  const bulkMins = Math.round(
    (target /
      (yeastRate(input.roomTempC) *
        flourFermentationFactor(input.wholegrainPct) *
        saltFactor(input.saltPct) *
        hydrationFactor(input.hydrationPct))) *
      60,
  )

  // Pomer kyselín (len kváskové pečenie): teplejšie = viac mliečnej (jemnejšia),
  // chladnejšie = viac octovej (ostrejšia). 24 °C ~ 0.5 vyrovnané.
  let lacticRatio: number | null = null
  if (input.yeastKind === "sourdough" || input.leavenPct > 0) {
    let weightedTemp = 0
    let totalMins = 0
    for (const p of input.phases) {
      if (p.counts === false) continue
      weightedTemp += p.tempC * p.mins
      totalMins += p.mins
    }
    const avgTemp = totalMins > 0 ? weightedTemp / totalMins : 24
    lacticRatio = Math.min(0.9, Math.max(0.2, 0.5 + (avgTemp - 24) * 0.03))
  }

  return { maturityIndex, fermentPct: maturityIndex, risk, yeastPct, bulkMins, activity, lacticRatio, riseTargetPct }
}

/** Pomocník: zostaví fázy procesu podľa režimu (kategórie C + D). */
export function buildPhases(opts: {
  fermentMode: "quick" | "workday" | "overnight" | "evening" | "sourdough"
  roomTempC: number
  fridgeMins: number
  bulkMins: number
  proofMins: number
  autolyseMins?: number
  doughFridgeStartC?: number
}): FermentPhase[] {
  const phases: FermentPhase[] = []
  const autolyse = opts.autolyseMins ?? 30
  const fridgeStart = opts.doughFridgeStartC ?? 22

  if (opts.fermentMode === "quick") {
    // Rýchly pracovný chlieb: bez chladničky, 3-4 h celkovo
    phases.push({ name: "autolyse", tempC: opts.roomTempC, mins: autolyse, counts: false })
    phases.push({ name: "bulk", tempC: opts.roomTempC, mins: opts.bulkMins })
    phases.push({ name: "proof", tempC: opts.roomTempC, mins: opts.proofMins })
  } else if (opts.fermentMode === "evening") {
    phases.push({ name: "autolyse", tempC: opts.roomTempC, mins: autolyse, counts: false })
    phases.push({ name: "bulk", tempC: opts.roomTempC, mins: opts.bulkMins })
    phases.push({ name: "fridge", tempC: 5, mins: opts.fridgeMins })
    phases.push({ name: "proof", tempC: opts.roomTempC, mins: 60 })
  } else if (opts.fermentMode === "workday") {
    phases.push({ name: "autolyse", tempC: opts.roomTempC, mins: autolyse, counts: false })
    phases.push({ name: "fridge", tempC: 5, mins: opts.fridgeMins })
    phases.push({ name: "bulk", tempC: opts.roomTempC, mins: opts.bulkMins })
    phases.push({ name: "proof", tempC: opts.roomTempC, mins: opts.proofMins })
  } else if (opts.fermentMode === "sourdough") {
    // Remeselný kváskový: bulk 4-5 h pri 24 °C, ošatka 12-16 h pri 4 °C
    phases.push({ name: "autolyse", tempC: opts.roomTempC, mins: autolyse, counts: false })
    phases.push({ name: "bulk", tempC: 24, mins: Math.max(opts.bulkMins, 270) })
    phases.push({ name: "fridge", tempC: 4, mins: Math.max(opts.fridgeMins, 720) })
    phases.push({ name: "proof", tempC: opts.roomTempC, mins: 60 })
  } else {
    // overnight
    phases.push({ name: "autolyse", tempC: opts.roomTempC, mins: autolyse, counts: false })
    phases.push({ name: "bulk", tempC: opts.roomTempC, mins: opts.bulkMins })
    phases.push({ name: "fridge", tempC: 5, mins: opts.fridgeMins })
    phases.push({ name: "proof", tempC: opts.roomTempC, mins: opts.proofMins })
  }
  // poznámka: fridgeStart sa použije v coolingProfile (vstup B)
  void fridgeStart
  return phases
}
