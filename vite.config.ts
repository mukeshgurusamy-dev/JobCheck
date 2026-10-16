import { defineConfig, Plugin } from "vite";
import { handler } from "./netlify/functions/inspect";

function netlifyFunctionsDev(): Plugin {
  return {
    name: "netlify-functions-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/.netlify/functions/inspect")) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Method Not Allowed" }));
            return;
          }

          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });

          req.on("end", async () => {
            try {
              const headersObj: Record<string, string> = {};
              for (const [key, value] of Object.entries(req.headers)) {
                if (typeof value === "string") {
                  headersObj[key] = value;
                } else if (Array.isArray(value)) {
                  headersObj[key] = value.join(", ");
                }
              }

              const event = {
                httpMethod: "POST",
                headers: headersObj,
                body,
                rawUrl: req.url || "",
              };

              const result = await handler(event as any, {} as any);
              res.statusCode = result?.statusCode || 200;
              if (result?.headers) {
                for (const [k, v] of Object.entries(result.headers)) {
                  res.setHeader(k, v);
                }
              }
              res.end(result?.body || "{}");
            } catch (err: unknown) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                }),
              );
            }
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [netlifyFunctionsDev()],
  server: {
    port: 3000,
    open: false,
  },
  test: {
    globals: true,
    environment: "happy-dom",
  },
});
