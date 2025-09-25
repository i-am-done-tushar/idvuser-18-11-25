import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleGetTemplate } from "./routes/templates";
import { handleResolveShortCode } from "./routes/shortcode";
import { handleGetTemplateVersionDirect } from "./routes/templateVersionDirect";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Template API route
  app.get("/api/templates/:id", handleGetTemplate);

  // Shortcode resolution routes
  app.get(
    "/api/templates-link-generation/resolve/:shortCode",
    handleResolveShortCode,
  );
  app.get("/api/TemplateVersion/:versionId", handleGetTemplateVersionDirect);

  return app;
}
