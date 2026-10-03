import { getAuthUserId } from "@convex-dev/auth/server"
import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

// ---------- MÚKY ----------

const flourValidator = v.object({
  _id: v.id("flours"),
  _creationTime: v.number(),
  name: v.string(),
  protein: v.number(),
})

export const listFlours = query({
  args: {},
  returns: v.array(flourValidator),
  handler: async (ctx) =>
    // číselník je malý a editovaný zřídka; kapped zobrazení je produktové chování
    ctx.db.query("flours").withIndex("by_name").order("asc").collect(),
})

export const addFlour = mutation({
  args: { name: v.string(), protein: v.number() },
  returns: v.id("flours"),
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) throw new Error("Názov múky je povinný")
    if (args.protein <= 0 || args.protein > 50) {
      throw new Error("Bielkoviny musia být v rozsahu 0 - 50 g/100g")
    }
    return ctx.db.insert("flours", { name, protein: args.protein })
  },
})

export const updateFlour = mutation({
  args: { id: v.id("flours"), name: v.string(), protein: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name.trim() || "Bez názvu",
      protein: args.protein,
    })
    return null
  },
})

export const deleteFlour = mutation({
  args: { id: v.id("flours") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
    return null
  },
})

// ---------- DROŽDIE ----------

const yeastValidator = v.object({
  _id: v.id("yeasts"),
  _creationTime: v.number(),
  name: v.string(),
  type: v.string(),
})

export const listYeasts = query({
  args: {},
  returns: v.array(yeastValidator),
  handler: async (ctx) =>
    ctx.db.query("yeasts").withIndex("by_name").order("asc").collect(),
})

export const addYeast = mutation({
  args: { name: v.string(), type: v.string() },
  returns: v.id("yeasts"),
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) throw new Error("Názov droždia je povinný")
    if (!["instant", "fresh"].includes(args.type)) {
      throw new Error("Typ musí být 'instant' alebo 'fresh'")
    }
    return ctx.db.insert("yeasts", { name, type: args.type })
  },
})

export const deleteYeast = mutation({
  args: { id: v.id("yeasts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
    return null
  },
})

// ---------- PREDKVASY (kvások / biga / poolish) ----------

const fermentValidator = v.object({
  _id: v.id("ferments"),
  _creationTime: v.number(),
  name: v.string(),
  hydration: v.number(),
})

export const listFerments = query({
  args: {},
  returns: v.array(fermentValidator),
  handler: async (ctx) =>
    ctx.db.query("ferments").withIndex("by_name").order("asc").collect(),
})

export const addFerment = mutation({
  args: { name: v.string(), hydration: v.number() },
  returns: v.id("ferments"),
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) throw new Error("Názov predkvasu je povinný")
    if (args.hydration < 30 || args.hydration > 150) {
      throw new Error("Hydratácia predkvasu musí být 30 - 150 %")
    }
    return ctx.db.insert("ferments", { name, hydration: args.hydration })
  },
})

export const deleteFerment = mutation({
  args: { id: v.id("ferments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
    return null
  },
})

// ---------- USERS ----------

export const currentLoggedInUser = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const user = await ctx.db.get(userId)
    if (!user) return null
    return { _id: user._id, email: user.email, name: user.name }
  },
})

// ---------- SEED ČÍSELNÍKOV ----------

export const seedDefaults = mutation({
  args: {},
  returns: v.object({
    flours: v.number(),
    yeasts: v.number(),
    ferments: v.number(),
  }),
  handler: async (ctx) => {
    const existingFlours = await ctx.db.query("flours").take(1)
    const existingYeasts = await ctx.db.query("yeasts").take(1)
    const existingFerments = await ctx.db.query("ferments").take(1)

    let flours = 0
    let yeasts = 0
    let ferments = 0

    if (existingFlours.length === 0) {
      const defaults = [
        ["Pernerka Pšeničná hladká Extra silná (T 530)", 14.0],
        ["Babiččina volba Pšeničná mouka chlebová (T 1000)", 11.5],
        ["Pernerka Pšeničná hladká svetlá (T 530)", 12.0],
        ["Pernerka Pšeničná celozrnná (T 1800)", 13.0],
        ["Pernerka Špaldová hladká (T 630)", 14.0],
        ["Pernerka Špaldová celozrnná (T 1050/1800)", 15.0],
        ["Pernerka Žitná chlebová (T 930)", 9.5],
        ["Pernerka Žitná celozrnná (T 1700)", 9.0],
        ["VitaFlora Pšeničná chlebová (T 1000)", 11.8],
        ["VitaFlora Pšeničná hladká (T 530)", 11.5],
        ["VitaFlora Ražná chlebová (T 930)", 8.1],
        ["Billa (Clever) Pšeničná hladká 00 extra (T 00)", 10.0],
        ["Billa Bio Špaldová hladká / celozrnná (T 630/1050)", 13.0],
        ["Lidl (Castello/Belbake) Pšeničná hladká (T 530)", 10.0],
        ["Lidl (Belbake Bio) Špaldová hladká (T 630)", 12.5],
        ["Lidl (Castello) Ražná chlebová (T 930)", 8.0],
        ["COOP Jednota Pšeničná hladká špeciál (T 00/530)", 10.0],
        ["COOP Jednota Pšeničná hladká Extra (T 00)", 10.5],
        ["COOP Jednota Ražná chlebová (T 930)", 8.5],
        ["COOP Jednota Špaldová hladká (T 630)", 12.5],
        ["Mlyn Pohronský Ruskov Pšeničná hladká 00 extra (T 00)", 10.0],
        ["Mlyn Trenčan Pšeničná hladká T 00", 10.5],
        ["Babiččina volba Pšeničná na kynuté těsto (T 512)", 12.0],
        ["Babiččina volba Pšeničná hladká (T 530)", 10.0],
        ["Babiččina volba Žitná chlebová (T 930)", 8.0],
        ["Předměřická Pšeničná hladká svetlá (T 512/530)", 10.8],
        ["Předměřická Pšeničná chlebová (T 1000)", 11.5],
        ["Penam Pšeničná hladká (T 530)", 10.0],
        ["Pernerka Ječná (Jačmenná) celozrnná", 10.0],
        ["Pernerka Ovesná celozrnná", 13.0],
        ["Pernerka Pohanková (Bezlepková)", 12.0],
        ["Pernerka Rýžová (Bezlepková)", 7.0],
        ["Pernerka Kukuřičná (Bezlepková)", 7.5],
        ["Kukuričný / zemiakový škrob", 0.3],
      ] as const
      for (const [name, protein] of defaults) {
        await ctx.db.insert("flours", { name, protein })
        flours++
      }
    }

    if (existingYeasts.length === 0) {
      const defaults = [
        ["Saf-instant Sušené (Lesaffre)", "instant"],
        ["Fala Čerstvé (Lesaffre)", "fresh"],
        ["Dr. Oetker Droždie sušené", "instant"],
        ["Dr. Oetker na pizzu a focacciu", "instant"],
        ["Lidl (Belbake) Sušené", "instant"],
        ["Lidl (Belbake) Čerstvé", "fresh"],
        ["Vivo Čerstvé (Nekton)", "fresh"],
        ["Kvasar Čerstvé", "fresh"],
        ["COOP Jednota Čerstvé", "fresh"],
      ] as const
      for (const [name, type] of defaults) {
        await ctx.db.insert("yeasts", { name, type })
        yeasts++
      }
    }

    if (existingFerments.length === 0) {
      const defaults = [
        ["Kvások (100 % hydratácia)", 100],
        ["Biga (45 % hydratácia)", 45],
        ["Poolish (100 % hydratácia)", 100],
      ] as const
      for (const [name, hydration] of defaults) {
        await ctx.db.insert("ferments", { name, hydration })
        ferments++
      }
    }

    return { flours, yeasts, ferments }
  },
})
