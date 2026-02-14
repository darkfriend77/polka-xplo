import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import type { ChainConfig } from "@polka-xplo/shared";

export interface PapiClient {
  client: ReturnType<typeof createClient>;
  chainConfig: ChainConfig;
  disconnect: () => void;
}

/** Map of active PAPI clients keyed by chain ID */
const clients = new Map<string, PapiClient>();

/** Create and cache a PAPI client for a chain */
export function getClient(chainConfig: ChainConfig): PapiClient {
  const existing = clients.get(chainConfig.id);
  if (existing) return existing;

  console.log(`[PAPI] Connecting to ${chainConfig.name} via ${chainConfig.rpc[0]}`);

  const provider = getWsProvider(chainConfig.rpc[0]!);
  const client = createClient(provider);

  const papiClient: PapiClient = {
    client,
    chainConfig,
    disconnect: () => {
      client.destroy();
      clients.delete(chainConfig.id);
      console.log(`[PAPI] Disconnected from ${chainConfig.name}`);
    },
  };

  clients.set(chainConfig.id, papiClient);
  return papiClient;
}

/** Disconnect all clients */
export function disconnectAll(): void {
  for (const [, client] of clients) {
    client.disconnect();
  }
  clients.clear();
}
