#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { sendTelegramMessage, telegramMessageInputSchema } from "@nodalkit/nodalkit-core";

/**
 * Local MCP Server Adapter for NodalKit
 *
 * This package acts as the bridge between an MCP client (like an AI Agent or IDE)
 * and the NodalKit core logic. It runs as a local stdio process.
 */
const server = new McpServer({
  name: "nodalkit-local",
  version: "1.0.0",
});
/**
 * Fetch the bot token directly from the injected environment variables.
 * We specifically DO NOT include the bot token in the MCP tool arguments schema.
 * Doing so would force the AI agent to somehow know or infer the secret.
 * Instead, the MCP client maps the host environment variables to this local MCP server process.
 */
function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required. Configure it in your MCP client environment");
  }
  return token;
}
server.registerTool(
  "telegram",
  {
    title: "Telegram",
    description: "Send a Telegram message",
    inputSchema: telegramMessageInputSchema.shape,
  },
  async (input) => {
    const result = await sendTelegramMessage({
      ...input,
      botToken: getTelegramBotToken(),
    });
    return {
      content: [
        {
          type: "text",
          text: `Sent Telegram message ${result.messageId} to chat ${result.chatId}`,
        },
      ],
      structuredContent: result,
    };
  },
);
const transport = new StdioServerTransport();
await server.connect(transport);
