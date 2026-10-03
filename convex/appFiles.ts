import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalMutation, internalQuery, type ActionCtx } from "./_generated/server"
import { callMacalyJson } from "./macaly"

const APP_FILES_PROTOCOL = "bindings_v1" as const

const uploadGrant = v.object({
  fileId: v.string(),
  uploadUrl: v.string(),
  method: v.literal("PUT"),
  headers: v.record(v.string(), v.string()),
  expiresAt: v.string(),
  maxBytes: v.number(),
})

export const getCurrentAppUserId = internalQuery({
  args: {},
  returns: v.id("users"),
  handler: async (ctx): Promise<Id<"users">> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Authentication required")
    return userId
  },
})

async function requireAppUserId(
  ctx: Pick<ActionCtx, "runQuery">,
): Promise<Id<"users">> {
  return ctx.runQuery(internal.appFiles.getCurrentAppUserId, {})
}

export const createUpload = action({
  args: {
    filename: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    visibility: v.union(v.literal("public"), v.literal("private")),
  },
  returns: uploadGrant,
  handler: async (ctx, args) => {
    await requireAppUserId(ctx)
    const response = await callMacalyJson(
      "/api/client-app/app-files/create-upload",
      {
        ...args,
        protocolVersion: APP_FILES_PROTOCOL,
        databaseEnvironment:
          process.env.MACALY_DATABASE_ENVIRONMENT === "development"
            ? "development"
            : "production",
        appSubjectId: await requireAppUserId(ctx),
      },
    )
    return response.upload as {
      fileId: string
      uploadUrl: string
      method: "PUT"
      headers: Record<string, string>
      expiresAt: string
      maxBytes: number
    }
  },
})

async function completeAppFile(
  ctx: Pick<ActionCtx, "runQuery">,
  fileId: string,
) {
  const appUserId = await requireAppUserId(ctx)
  const response = await callMacalyJson(
    "/api/client-app/app-files/complete-upload",
    {
      fileId,
      protocolVersion: APP_FILES_PROTOCOL,
      databaseEnvironment:
        process.env.MACALY_DATABASE_ENVIRONMENT === "development"
          ? "development"
          : "production",
      appSubjectId: appUserId,
    },
  )
  return response.file as {
    fileId: string
    status: "ready"
    contentType: string
    fileSize: number
    visibility: "public" | "private"
    url: string | null
  }
}

async function deleteAppFile(ctx: Pick<ActionCtx, "runQuery">, fileId: string) {
  const appUserId = await requireAppUserId(ctx)
  const response = await callMacalyJson(
    "/api/client-app/app-files/delete",
    {
      fileId,
      protocolVersion: APP_FILES_PROTOCOL,
      databaseEnvironment:
        process.env.MACALY_DATABASE_ENVIRONMENT === "development"
          ? "development"
          : "production",
      appSubjectId: appUserId,
    },
  )
  return {
    success: response.success === true,
    cleanupPending: response.cleanupPending === true,
  }
}

// ---------- APLIKAČNÍ LOGIKA: fotka k záznamu pečení ----------

export const finalizeLogPhoto = action({
  args: {
    fileId: v.string(),
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
    const uploaded = await completeAppFile(ctx, args.fileId)
    try {
      return await ctx.runMutation(internal.baking.createLogWithPhoto, {
        flourTotal: args.flourTotal,
        flourDetails: args.flourDetails,
        hydration: args.hydration,
        roomTemp: args.roomTemp,
        bakeTime: args.bakeTime,
        workTime: args.workTime,
        yeastBrand: args.yeastBrand,
        rating: args.rating,
        notes: args.notes,
        photoFileId: uploaded.fileId,
        photoUrl: uploaded.url ?? undefined,
        photoContentType: uploaded.contentType,
        photoFileSize: uploaded.fileSize,
      })
    } catch (error) {
      await deleteAppFile(ctx, uploaded.fileId).catch(() => undefined)
      throw error
    }
  },
})

export const deleteLogWithPhoto = action({
  args: { id: v.id("bakeLogs") },
  returns: v.object({ success: v.boolean(), cleanupPending: v.boolean() }),
  handler: async (ctx, args) => {
    const fileId = await ctx.runMutation(internal.baking.markLogPhotoCleanup, {
      id: args.id,
    })
    if (fileId) await deleteAppFile(ctx, fileId)
    await ctx.runMutation(internal.baking.finishLogDelete, {
      id: args.id,
      expectedFileId: fileId,
    })
    return { success: true, cleanupPending: false }
  },
})
