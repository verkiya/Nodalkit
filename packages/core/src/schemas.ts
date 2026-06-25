import { z } from "zod";

/**
 * The input schema representing the pure operational payload.
 *
 * Architectural Intent:
 * This schema defines the exact parameters required to perform the business logic,
 * but explicitly excludes all credentials. This is critical because adapters like
 * the local MCP server use this schema to expose tool arguments to AI agents.
 * Exposing credentials here would force agents to handle secret tokens, leading to leaks.
 */
export const telegramMessageInputSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  message: z.string().min(1, "Message is required"),
});

/**
 * The internal options schema used by the core operation function.
 *
 * Architectural Intent:
 * It extends the base input schema to require the injected `botToken`.
 * Adapters (CLI, local MCP, remote MCP) act as the security boundary. They are
 * responsible for resolving this token securely from their respective environments
 * (e.g., config file, `process.env`, or HTTP request URL parameter) and passing
 * it into the core operation.
 */
export const telegramMessageOptionsSchema = telegramMessageInputSchema.extend({
  botToken: z.string().min(1, "Telegram bot token is required"),
});

/**
 * The request payload schema sent to the external Telegram API.
 * This ensures that NodalKit explicitly casts the adapter-agnostic input
 * into the strict format expected by the downstream service.
 */
export const telegramSendMessageRequestSchema = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1),
});

/**
 * The response payload schema returned from the external Telegram API.
 * This strict validation protects NodalKit from unexpected API changes
 * by forcing runtime type checking on the raw JSON response.
 */
export const telegramSendMessageResponseSchema = z.object({
  ok: z.boolean(),
  result: z
    .object({
      message_id: z.number(),
    })
    .optional(),
  description: z.string().optional(),
});

/**
 * The standardized output schema returned to adapters.
 *
 * Architectural Intent:
 * Normalizes the response so that all adapters (CLI output, MCP tool result)
 * can present a predictable, strictly-typed structure, decoupling the
 * downstream external API shape from our internal consumers.
 */
export const telegramMessageOutputSchema = z.object({
  ok: z.literal(true),
  chatId: z.string(),
  messageId: z.number(),
});

export type TelegramMessageInput = z.infer<typeof telegramMessageInputSchema>;
export type TelegramMessageOptions = z.infer<typeof telegramMessageOptionsSchema>;
export type TelegramMessageOutput = z.infer<typeof telegramMessageOutputSchema>;
