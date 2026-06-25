import { Hono, type Context } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClerkClient } from "@clerk/backend";
import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { sendTelegramMessage, telegramMessageInputSchema } from "@nodalkit/nodalkit-core";

/**
 * Remote MCP Server Adapter for NodalKit
 *
 * Exposes the NodalKit core logic over an HTTP bridge.
 * This adapter is designed to be multi-tenant. It relies on Clerk for OAuth
 * identity verification and extracts the user's specific Telegram bot token
 * directly from the request URL path.
 */
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (!clerkSecretKey) {
  throw new Error("CLERK_SECRET_KEY environment variable is required");
}
if (!clerkPublishableKey) {
  throw new Error("CLERK_PUBLISHABLE_KEY environment variable is required");
}

const clerkClient = createClerkClient({
  publishableKey: clerkPublishableKey,
  secretKey: clerkSecretKey,
});

/**
 * Creates an ephemeral, per-request MCP Server instance.
 * Because we extract the bot token from the URL, we pass it into the tool registration closure.
 * This ensures that this specific instance of the server is locked to the specific bot token
 * requested via the authenticated endpoint, without leaking it into the input schemas.
 */
function createServer(botToken: string) {
  const server = new McpServer({
    name: "nodalkit-remote",
    version: "1.0.0",
  });
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
        botToken,
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
  return server;
}
const app = new Hono();
function protectedResourceMetadataUrl(c: Context, botToken: string) {
  return new URL(`/.well-known/oauth-protected-resource/${botToken}/mcp`, c.req.url).toString();
}

function unauthorizedMcpResponse(c: Context, botToken: string) {
  c.header(
    "WWW-Authenticate",
    `Bearer resource_metadata="${protectedResourceMetadataUrl(c, botToken)}"`,
  );
  return c.json({ error: "Unauthorized" }, 401);
}
app.get("/.well-known/oauth-protected-resource/:botToken/mcp", (c) => {
  return c.json(
    generateClerkProtectedResourceMetadata({
      publishableKey: clerkPublishableKey,
      resourceUrl: new URL(`/${c.req.param("botToken")}/mcp`, c.req.url).toString(),
    }),
  );
});

/**
 * Main MCP POST endpoint
 *
 * 1. Validates the Bearer token against Clerk.
 * 2. Extracts the `botToken` from the URL path.
 * 3. Instantiates an ephemeral MCP server and HTTP transport.
 * 4. Proxies the raw request to the transport and automatically closes the server afterwards.
 */
app.post("/:botToken/mcp", async (c) => {
  const botToken = c.req.param("botToken");
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorizedMcpResponse(c, botToken);
  }
  try {
    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      acceptsToken: "oauth_token",
    });
    if (!requestState.isAuthenticated) {
      return unauthorizedMcpResponse(c, botToken);
    }
  } catch {
    return unauthorizedMcpResponse(c, botToken);
  }

  const server = createServer(botToken);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    await server.close();
  }
});
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});
const port = Number(process.env.PORT ?? 3000);
export default {
  port,
  fetch: (req: Request) => {
    const url = new URL(req.url);
    url.protocol = req.headers.get("x-forwarded-proto") ?? url.protocol;
    url.host = req.headers.get("x-forwarded-host") ?? url.host;
    return app.fetch(new Request(url, req));
  },
};
