import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

// Uložený recept: kompletné nastavenie kalkulačky
export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.string()),
  }).index("email", ["email"]),

  // Číselník múk (PRO)
  flours: defineTable({
    name: v.string(),
    protein: v.number(), // g bielkovín / 100g
  }).index("by_name", ["name"]),

  // Číselník droždia (PRO)
  yeasts: defineTable({
    name: v.string(),
    type: v.string(), // "instant" | "fresh"
  }).index("by_name", ["name"]),

  // Číselník predkvasov: kvások / biga / poolish (PRO)
  ferments: defineTable({
    name: v.string(),
    hydration: v.number(), // % hydratácia predkvasu
  }).index("by_name", ["name"]),

  recipes: defineTable({
    name: v.string(),
    flours: v.array(
      v.object({
        value: v.string(), // názov múky (catalog) alebo "vlastna"
        pct: v.number(),
        customName: v.optional(v.string()),
        prot: v.optional(v.number()), // bielkoviny pre znovuvypočet
      }),
    ),
    yeast: v.string(),
    customYeast: v.optional(v.string()),
    flourWeight: v.number(),
    hydration: v.number(),
    fermentMode: v.string(), // "overnight" | "workday"
    workTime: v.string(),
    bakeTime: v.string(),
    roomTemp: v.number(),
    leavenName: v.optional(v.string()),
    leavenPct: v.optional(v.number()),
    leavenHydration: v.optional(v.number()),
    mixMethod: v.optional(v.string()), // "hand" | "planetary" | "spiral"
    honeyGrams: v.optional(v.number()), // med (g)
    fatGrams: v.optional(v.number()), // maslo/olej (g)
    yeastOverrideG: v.optional(v.number()), // vlastné množstvo droždia (g)
  }).index("by_name", ["name"]),

  // Záznam v denníku pečení
  bakeLogs: defineTable({
    flourTotal: v.number(),
    flourDetails: v.string(),
    hydration: v.number(),
    roomTemp: v.number(),
    bakeTime: v.string(),
    workTime: v.string(),
    yeastBrand: v.string(),
    rating: v.number(), // 1 - 5
    notes: v.string(),
    photoFileId: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    photoContentType: v.optional(v.string()),
    photoFileSize: v.optional(v.number()),
  }),
})
