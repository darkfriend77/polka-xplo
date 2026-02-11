import { getAsset, type Asset, type AssetTransfer } from "@/lib/api";
import { formatBalance, truncateHash, formatNumber } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId: rawId } = await params;
  const assetId = parseInt(rawId, 10);

  if (Number.isNaN(assetId)) {
    return (
      <div className="text-center py-20 text-zinc-500">Invalid asset ID.</div>
    );
  }

  let asset: Asset | null = null;
  let transfers: AssetTransfer[] = [];
  let error: string | null = null;

  try {
    const res = await getAsset(assetId);
    asset = res.asset;
    transfers = res.recentTransfers;
  } catch {
    error = "Unable to load asset details.";
  }

  if (error || !asset) {
    return (
      <div className="space-y-4">
        <Link href="/assets" className="text-xs text-accent hover:underline">
          ← Assets
        </Link>
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error ?? "Asset not found."}
        </div>
      </div>
    );
  }

  const symbol = asset.symbol ?? "";
  const decimals = asset.decimals;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/assets" className="text-xs text-accent hover:underline">
            ← Assets
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1">
            {asset.name ?? `Asset #${asset.asset_id}`}
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Asset ID: {asset.asset_id}
            {symbol && <> &middot; {symbol}</>}
          </p>
        </div>
        <StatusBadge status={asset.status} />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InfoCard label="Supply" value={formatBalance(asset.supply, decimals, symbol)} />
        <InfoCard label="Decimals" value={String(decimals)} />
        <InfoCard label="Frozen" value={asset.is_frozen ? "Yes" : "No"} />
        <InfoCard
          label="Created Block"
          value={formatNumber(asset.created_block)}
          href={`/block/${asset.created_block}`}
        />
      </div>

      {/* Owner / Admin / Issuer / Freezer */}
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">Roles</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RoleRow label="Owner" address={asset.owner} />
          <RoleRow label="Admin" address={asset.admin} />
          <RoleRow label="Issuer" address={asset.issuer} />
          <RoleRow label="Freezer" address={asset.freezer} />
        </div>
      </div>

      {/* Recent Transfers */}
      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          Recent Transfers
        </h2>
        {transfers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4">Block</th>
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/block/${t.block_height}`}
                        className="text-accent hover:underline font-mono text-xs"
                      >
                        {formatNumber(t.block_height)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/account/${t.from_address}`}
                        className="text-accent hover:underline font-mono text-xs"
                      >
                        {truncateHash(t.from_address)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/account/${t.to_address}`}
                        className="text-accent hover:underline font-mono text-xs"
                      >
                        {truncateHash(t.to_address)}
                      </Link>
                    </td>
                    <td className="py-2 text-right text-zinc-200 font-mono">
                      {formatBalance(t.amount, decimals, symbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No transfers recorded yet.</p>
        )}
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="card text-center">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      {href ? (
        <Link href={href} className="text-sm font-mono text-accent hover:underline">
          {value}
        </Link>
      ) : (
        <div className="text-sm font-mono text-zinc-200">{value}</div>
      )}
    </div>
  );
}

function RoleRow({ label, address }: { label: string; address: string | null }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-zinc-500">{label}</span>
      {address ? (
        <Link
          href={`/account/${address}`}
          className="text-accent hover:underline font-mono text-xs"
        >
          {truncateHash(address, 12)}
        </Link>
      ) : (
        <span className="text-xs text-zinc-600">—</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "badge-success"
      : status === "destroyed"
        ? "bg-red-900/40 text-red-300 border border-red-800/40"
        : "badge-info";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
