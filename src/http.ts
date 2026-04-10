import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./index.js";
import { apiKeyStore } from "./services/mailchimp-client.js";

const transports = new Map<string, StreamableHTTPServerTransport>();

export function startHttpServer(port: number) {
  const server = createHttpServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, X-Mailchimp-API-Key");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only serve /mcp
    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    // Require API key
    const apiKey = req.headers["x-mailchimp-api-key"] as string | undefined;
    if (!apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing X-Mailchimp-API-Key header" },
        id: null,
      }));
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Wrap the entire request in the API key context so all tool
    // handlers (via mailchimpRequest) automatically use this key.
    await apiKeyStore.run(apiKey, async () => {
      if (req.method === "POST") {
        const body = await readBody(req);
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports.has(sessionId)) {
          transport = transports.get(sessionId)!;
        } else if (!sessionId) {
          // New session
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports.set(sid, transport);
            },
          });

          transport.onclose = () => {
            if (transport.sessionId) transports.delete(transport.sessionId);
          };

          const mcpServer = createServer();
          await mcpServer.connect(transport);
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found" },
            id: null,
          }));
          return;
        }

        await transport.handleRequest(req, res, body);
      } else if (req.method === "GET") {
        if (!sessionId || !transports.has(sessionId)) {
          res.writeHead(400);
          res.end("Session not found");
          return;
        }
        await transports.get(sessionId)!.handleRequest(req, res);
      } else if (req.method === "DELETE") {
        if (!sessionId || !transports.has(sessionId)) {
          res.writeHead(404);
          res.end("Session not found");
          return;
        }
        await transports.get(sessionId)!.handleRequest(req, res);
      } else {
        res.writeHead(405);
        res.end("Method not allowed");
      }
    });
  });

  server.listen(port, () => {
    console.error(`Mailchimp MCP server running on http://localhost:${port}/mcp`);
  });
}

function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
