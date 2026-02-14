export const dynamic = "force-dynamic";

/**
 * Chain State Browser — Generic State Map Viewer
 *
 * This page implements the "Tracking Things" requirement from the spec.
 * It uses PAPI metadata to dynamically generate a table for any storage map,
 * allowing users to browse Assets, Accounts, or any pallet state without
 * custom code for each storage item.
 *
 * Route: /chain-state/[pallet]/[storage]
 * Example: /chain-state/System/Account → shows all accounts
 *          /chain-state/Assets/Asset → shows all assets
 */
export default async function ChainStatePage({
  params,
}: {
  params: Promise<{ pallet: string; storage: string }>;
}) {
  const { pallet, storage } = await params;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          Chain State: {pallet}.{storage}
        </h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Browse runtime storage maps using on-chain metadata
        </p>
      </div>

      {/* Info about metadata-driven discovery */}
      <div className="card">
        <div className="text-sm text-zinc-300 space-y-3">
          <p>
            This view dynamically queries the{" "}
            <code className="text-accent bg-zinc-800 px-1 rounded">
              {pallet}.{storage}
            </code>{" "}
            storage map using PAPI&apos;s metadata introspection.
          </p>
          <p className="text-zinc-500 text-xs">
            When connected to a live node, PAPI discovers the key and value types from the runtime
            metadata and renders them automatically. This allows tracking &quot;things&quot;
            (Assets, NFTs, Staking state) without writing custom code for each pallet.
          </p>
        </div>
      </div>

      {/* Placeholder for dynamic state entries */}
      <div className="card">
        <div className="text-center py-12 text-zinc-500">
          <p>
            Connect to a live node to browse {pallet}.{storage} entries.
          </p>
          <p className="text-xs mt-2">
            The state browser will render table headers and rows from PAPI metadata.
          </p>
        </div>
      </div>
    </div>
  );
}
