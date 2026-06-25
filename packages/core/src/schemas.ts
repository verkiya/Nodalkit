import { z } from "zod";
/**
 * The input schema representing the pure operational payload.
 * Notice that it DOES NOT contain any credentials. This is critical for the MCP tool
 * adapter, which uses this exact schema shape for tool arguments. Exposing credentials
 * here would require AI agents to know the bot token.
 */
export const telegramMessageInputSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  message: z.string().min(1, "Message is required"),
});

/**
 * The internal options schema used by the core operation function.
 * It extends the base input schema to require the injected `botToken`.
 * Adapters (CLI, local MCP, remote MCP) are responsible for resolving this token
 * from their respective environments (config file, process.env, or HTTP request URL).
 */
export const telegramMessageOptionsSchema = telegramMessageInputSchema.extend({
  botToken: z.string().min(1, "Telegram bot token is required"),
});
export const telegramSendMessageRequestSchema = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1),
});
export const telegramSendMessageResponseSchema = z.object({
  ok: z.boolean(),
  result: z
    .object({
      message_id: z.number(),
    })
    .optional(),
  description: z.string().optional(),
});
export const telegramMessageOutputSchema = z.object({
  ok: z.literal(true),
  chatId: z.string(),
  messageId: z.number(),
});
export type TelegramMessageInput = z.infer<typeof telegramMessageInputSchema>;
export type TelegramMessageOptions = z.infer<typeof telegramMessageOptionsSchema>;
export type TelegramMessageOutput = z.infer<typeof telegramMessageOutputSchema>;
