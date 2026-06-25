import {
  telegramMessageOutputSchema,
  telegramMessageOptionsSchema,
  telegramSendMessageRequestSchema,
  telegramSendMessageResponseSchema,
  type TelegramMessageOptions,
  type TelegramMessageOutput,
} from "./schemas";

/**
 * Core operation: sendTelegramMessage
 *
 * Architectural Intent:
 * All business logic is isolated in this core package. Adapters (CLI, Local MCP,
 * Remote MCP) only act as transports and rely on this shared function.
 * This pattern ensures that any bug fix or feature addition here propagates
 * correctly across all interfaces without duplicating logic.
 *
 * Design Tradeoffs & Implementation Details:
 * 1. Double Validation: Even though TypeScript enforces `TelegramMessageOptions`
 *    at compile time, we explicitly parse `input` through `telegramMessageOptionsSchema`
 *    at runtime. This guarantees that adapters cannot accidentally bypass data constraints
 *    (e.g., passing empty strings) if they skip strict validation on their end.
 * 2. Explicit External Schemas: We cast the internal data shape into `telegramSendMessageRequestSchema`
 *    to map our generalized fields (`chatId`, `message`) to Telegram's exact
 *    external expectations (`chat_id`, `text`).
 * 3. Standardized Output: We wrap the external API's response into our own
 *    `TelegramMessageOutput` structure. This decouples the consumers (MCP, CLI)
 *    from Telegram-specific API anomalies.
 *
 * @param input - The strictly typed options payload including the securely injected bot token.
 * @returns A standardized output payload.
 */
export async function sendTelegramMessage(
  input: TelegramMessageOptions,
): Promise<TelegramMessageOutput> {
  // 1. Validate the incoming options (acting as a safety net against faulty adapters)
  const parsedInput = telegramMessageOptionsSchema.parse(input);

  // 2. Map the domain inputs to the specific downstream API schema
  const requestBody = telegramSendMessageRequestSchema.parse({
    chat_id: parsedInput.chatId,
    text: parsedInput.message,
  });

  // 3. Execute the operation (no console logs or side effects permitted here)
  const response = await fetch(`https://api.telegram.org/bot${parsedInput.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: await Response.json(requestBody).text(),
  });

  // 4. Validate the raw response to catch upstream API changes or errors
  const data = telegramSendMessageResponseSchema.parse(await response.json());

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description ?? "Telegram message request failed");
  }

  // 5. Normalize and return the output for the adapters
  return telegramMessageOutputSchema.parse({
    ok: true,
    chatId: parsedInput.chatId,
    messageId: data.result.message_id,
  });
}
