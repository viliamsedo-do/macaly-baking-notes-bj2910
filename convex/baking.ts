import { internalMutation, mutation, query } from "./_generated/server"
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"

// ---------- RECEPTY ----------

const recipeValidator = v.object({
  _id: v.id("recipes"),
  _creationTime: v.number(),
  name: v.string(),
  flours: v.array(
    v.object({
      value: v.string(),
      pct: v.number(),
      customName: v.optional(v.string()),
      prot: v.optional(v.number()),
    }),
  ),
  yeast: v.string(),
  customYeast: v.optional(v.string()),
  flourWeight: v.number(),
  hydration: v.number(),
  fermentMode: v.string(),
  workTime: v.string(),
  bakeTime: v.string(),
  roomTemp: v.number(),
  leavenName: v.optional(v.string()),
  leavenPct: v.optional(v.number()),
  leavenHydration: v.optional(v.number()),
  mixMethod: v.optional(v.string()),
  honeyGrams: v.optional(v.number()),
  fatGrams: v.optional(v.number()),
  yeastOverrideG: v.optional(v.number()),
  yudaneFlourG: v.optional(v.number()),
  yudaneWaterG: v.optional(v.number()),
})

const flourArg = v.object({
  value: v.string(),
  pct: v.number(),
  customName: v.optional(v.string()),
  prot: v.optional(v.number()),
})

export const listRecipes = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(recipeValidator),
  handler: async (ctx, args) =>
    ctx.db.query("recipes").withIndex("by_name").order("asc").paginate(args.paginationOpts),
})

export const createRecipe = mutation({
  args: {
    name: v.string(),
    flours: v.array(flourArg),
    yeast: v.string(),
    customYeast: v.optional(v.string()),
    flourWeight: v.number(),
    hydration: v.number(),
    fermentMode: v.string(),
    workTime: v.string(),
    bakeTime: v.string(),
    roomTemp: v.number(),
    leavenName: v.optional(v.string()),
    leavenPct: v.optional(v.number()),
    leavenHydration: v.optional(v.number()),
    mixMethod: v.optional(v.string()),
    honeyGrams: v.optional(v.number()),
    fatGrams: v.optional(v.number()),
    yeastOverrideG: v.optional(v.number()),
    yudaneFlourG: v.optional(v.number()),
    yudaneWaterG: v.optional(v.number()),
  },
  returns: v.id("recipes"),
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) throw new Error("Názov receptu je povinný")
    return ctx.db.insert("recipes", {
      name,
      flours: args.flours,
      yeast: args.yeast,
      customYeast: args.customYeast,
      flourWeight: args.flourWeight,
      hydration: args.hydration,
      fermentMode: args.fermentMode,
      workTime: args.workTime,
      bakeTime: args.bakeTime,
      roomTemp: args.roomTemp,
      leavenName: args.leavenName,
      leavenPct: args.leavenPct,
      leavenHydration: args.leavenHydration,
      mixMethod: args.mixMethod,
      honeyGrams: args.honeyGrams,
      fatGrams: args.fatGrams,
      yeastOverrideG: args.yeastOverrideG,
      yudaneFlourG: args.yudaneFlourG,
      yudaneWaterG: args.yudaneWaterG,
    })
  },
})

export const deleteRecipe = mutation({
  args: { id: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id)
    return null
  },
})

// ---------- DENNÍK PEČENIA ----------

const logValidator = v.object({
  _id: v.id("bakeLogs"),
  _creationTime: v.number(),
  flourTotal: v.number(),
  flourDetails: v.string(),
  hydration: v.number(),
  roomTemp: v.number(),
  bakeTime: v.string(),
  workTime: v.string(),
  yeastBrand: v.string(),
  rating: v.number(),
  notes: v.string(),
  photoFileId: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  photoContentType: v.optional(v.string()),
  photoFileSize: v.optional(v.number()),
})

export const listLogs = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(logValidator),
  handler: async (ctx, args) =>
    ctx.db.query("bakeLogs").order("desc").paginate(args.paginationOpts),
})

export const createLog = mutation({
  args: {
    flourTotal: v.number(),
    flourDetails: v.string(),
    hydration: v.number(),
    roomTemp: v.number(),
    bakeTime: v.string(),
    workTime: v.string(),
    yeastBrand: v.string(),
    rating: v.number(),
    notes: v.string(),
  },
  returns: v.id("bakeLogs"),
  handler: async (ctx, args) => {
    if (args.rating < 1 || args.rating > 5) {
      throw new Error("Hodnotenie musí být 1 až 5")
    }
    return ctx.db.insert("bakeLogs", {
      flourTotal: args.flourTotal,
      flourDetails: args.flourDetails,
      hydration: args.hydration,
      roomTemp: args.roomTemp,
      bakeTime: args.bakeTime,
      workTime: args.workTime,
      yeastBrand: args.yeastBrand,
      rating: args.rating,
      notes: args.notes.trim() || "Bez poznámky.",
    })
  },
})

export const deleteLog = mutation({
  args: { id: v.id("bakeLogs") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id)
    return null
  },
})

// ---------- FOTKY K ZÁZNAMOM (interné mutácie pre appFiles) ----------

export const createLogWithPhoto = internalMutation({
  args: {
    flourTotal: v.number(),
    flourDetails: v.string(),
    hydration: v.number(),
    roomTemp: v.number(),
    bakeTime: v.string(),
    workTime: v.string(),
    yeastBrand: v.string(),
    rating: v.number(),
    notes: v.string(),
    photoFileId: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    photoContentType: v.optional(v.string()),
    photoFileSize: v.optional(v.number()),
  },
  returns: v.id("bakeLogs"),
  handler: async (ctx, args) => {
    if (args.rating < 1 || args.rating > 5) {
      throw new Error("Hodnotenie musí být 1 až 5")
    }
    return await ctx.db.insert("bakeLogs", {
      flourTotal: args.flourTotal,
      flourDetails: args.flourDetails,
      hydration: args.hydration,
      roomTemp: args.roomTemp,
      bakeTime: args.bakeTime,
      workTime: args.workTime,
      yeastBrand: args.yeastBrand,
      rating: args.rating,
      notes: args.notes.trim() || "Bez poznámky.",
      photoFileId: args.photoFileId,
      photoUrl: args.photoUrl,
      photoContentType: args.photoContentType,
      photoFileSize: args.photoFileSize,
    })
  },
})

export const markLogPhotoCleanup = internalMutation({
  args: { id: v.id("bakeLogs") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { id }) => {
    const log = await ctx.db.get(id)
    if (!log) throw new Error("Záznam nenájdený")
    if (!log.photoFileId) {
      await ctx.db.delete(id)
      return null
    }
    await ctx.db.patch(id, { photoUrl: undefined })
    return log.photoFileId
  },
})

export const finishLogDelete = internalMutation({
  args: { id: v.id("bakeLogs"), expectedFileId: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { id, expectedFileId }) => {
    const log = await ctx.db.get(id)
    if (!log) return null // už vymazané - idempotentné
    if (expectedFileId && log.photoFileId && log.photoFileId !== expectedFileId) {
      return null // iný proces prebehol, nechaj mu to
    }
    await ctx.db.delete(id)
    return null
  },
})
