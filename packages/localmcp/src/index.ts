#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { sendTelegramMessage, telegramMessageInputSchema } from "@nodalkit/nodalkit-core";

/**
 * Local MCP Server Adapter for NodalKit
 *
 * Architectural Intent:
 * This package acts as the bridge between an MCP client (like Claude Desktop
 * or OpenCode) and the NodalKit core logic. It operates as a local stdio process,
 * listening for JSON-RPC messages and forwarding them to `@nodalkit/nodalkit-core`.
 * By keeping business logic out of this adapter, we ensure consistency with the CLI.
 */
const server = new McpServer({
  name: "nodalkit-local",
  version: "1.0.0",
});

/**
 * Fetch the bot token directly from the injected environment variables.
 *
 * Credential Injection Strategy:
 * We explicitly DO NOT include the bot token in the MCP tool arguments schema.
 * If credentials were part of the tool payload, the AI agent would be forced to
 * handle the secret token in context, leading to potential leaks.
 * Instead, the MCP client provisions the `TELEGRAM_BOT_TOKEN` in this server process's
 * environment variables during initialization.
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
