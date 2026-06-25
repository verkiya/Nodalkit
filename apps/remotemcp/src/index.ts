import { Hono, type Context } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClerkClient } from "@clerk/backend";
import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { sendTelegramMessage, telegramMessageInputSchema } from "@nodalkit/nodalkit-core";

/**
 * Remote MCP Server Adapter for NodalKit
 *
 * Architectural Intent:
 * Exposes the NodalKit core logic over an HTTP bridge using Hono.
 * This adapter is designed to be multi-tenant and serverless-compatible.
 * It relies on Clerk for OAuth identity verification.
 *
 * Credential Injection Strategy:
 * It extracts the user's specific Telegram bot token directly from the request
 * URL path, meaning each request dynamically provisions its own credentials
 * without leaking secrets into tool input schemas.
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
 *
 * Security & Data Isolation:
 * Because we extract the bot token from the URL, we pass it directly into the
 * tool registration closure. This guarantees that this ephemeral instance of the
 * server is completely locked to the requested bot token without exposing it
 * as an argument in the tool schema. This eliminates the risk of cross-tenant
 * credential leakage in a serverless or multi-tenant environment.
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
 * Execution Flow:
 * 1. OAuth Validation: Validates the incoming Bearer token using `@clerk/backend`.
 *    Fails with `401 Unauthorized` and `WWW-Authenticate` headers if invalid.
 * 2. Credential Extraction: Parses the `botToken` from the authenticated URL path.
 * 3. Ephemeral Instantiation: Creates a completely new MCP server and HTTP transport
 *    bound exclusively to that `botToken`.
 * 4. Request Proxying: Passes the raw JSON-RPC request to the transport.
 * 5. Deterministic Teardown: Enforces `server.close()` in a `finally` block to
 *    prevent memory leaks and zombie servers in long-running processes.
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
