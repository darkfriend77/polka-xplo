import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, closePool } from "@polka-xplo/db";
import { DEFAULT_CONFIG, getChainConfig } from "@polka-xplo/shared";
import { getClient, disconnectAll } from "./client.js";
import { RpcPool } from "./rpc-pool.js";
import { PluginRegistry } from "./plugins/registry.js";
import { IngestionPipeline } from "./ingestion/pipeline.js";
import { createApiServer } from "./api/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  console.log("====================================");
  console.log("  Polka-Xplo Indexer Starting...");
  console.log("====================================");

  // 1. Initialize database connection
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }
  createPool(dbUrl);
  console.log("[Main] Database pool initialized.");

  // 2. Load chain configuration
  const chainId = process.env.CHAIN_ID ?? DEFAULT_CONFIG.defaultChain;
  const chainConfig = getChainConfig(DEFAULT_CONFIG, chainId);
  if (!chainConfig) {
    console.error(`Chain '${chainId}' not found in configuration.`);
    process.exit(1);
  }
  console.log(`[Main] Chain: ${chainConfig.name} (${chainConfig.id})`);

  // 3. Discover and register extensions
  const extensionsDir = path.resolve(__dirname, "..", "..", "..", "extensions");
  const registry = new PluginRegistry();
  await registry.discover(extensionsDir);
  await registry.runMigrations();
  console.log(`[Main] Extensions loaded: ${registry.getExtensions().length}`);

  // 4. Parse RPC endpoints (comma-separated list supported for load balancing)
  const rpcEnv = process.env.ARCHIVE_NODE_URL ?? chainConfig.rpc[0];
  const rpcUrls = rpcEnv
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const rpcPool = new RpcPool(rpcUrls);

  // 5. Start the API server early so /health is always reachable
  const port = parseInt(process.env.API_PORT ?? "3001", 10);
  // Pipeline holder — the API server reads from this mutable object
  // so /consistency-check/repair works once the pipeline starts.
  const pipelineHolder: { current: IngestionPipeline | null } = { current: null };
  const apiServer = createApiServer(registry, chainId, rpcPool, pipelineHolder);
  apiServer.listen(port, () => {
    console.log(`[Main] API server listening on port ${port}`);
  });

  // 6. Connect to the Polkadot node via PAPI and start the ingestion pipeline.
  //    Errors here are non-fatal so the API server keeps serving /health.
  let pipeline: IngestionPipeline | null = null;
  try {
    // Primary URL for the PAPI WebSocket subscription client
    const primaryUrl = rpcUrls[0];
    const activeConfig = { ...chainConfig, rpc: [primaryUrl] };
    const papiClient = getClient(activeConfig);

    console.log(`[Main] Connected to ${primaryUrl} (${rpcUrls.length} endpoint(s) in pool)`);

    pipeline = new IngestionPipeline(papiClient, registry, rpcPool);
    pipelineHolder.current = pipeline;
    await pipeline.start();
  } catch (err) {
    console.error("[Main] Pipeline failed to start (API server still running):", err);
  }

  // 7. Graceful shutdown
  const shutdown = async () => {
    console.log("[Main] Shutting down...");
    if (pipeline) await pipeline.stop();
    disconnectAll();
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[Main] Fatal error:", err);
  process.exit(1);
});
