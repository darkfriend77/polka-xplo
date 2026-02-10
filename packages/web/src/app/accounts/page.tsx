import { getAccounts, type AccountsResponse } from "@/lib/api";
import { theme } from "@/lib/theme";
import { AccountsTable } from "@/components/AccountsTable";
import { Pagination } from "@/components/Pagination";

/**
 * Accounts list page — paginated ranked list of accounts.
 * Mirrors the statescan accounts view with rank, address, balance, and extrinsic count.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const pageSize = 25;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;

  let accounts: AccountsResponse | null = null;
  let error: string | null = null;

  try {
    accounts = await getAccounts(pageSize, offset);
  } catch {
    error = "Unable to fetch accounts. Is the backend running?";
  }

  const totalPages = accounts ? Math.ceil(accounts.total / pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Accounts</h1>
        {accounts && (
          <span className="text-sm text-zinc-400">
            {accounts.total.toLocaleString()} total
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {accounts && accounts.data.length > 0 && (
        <>
          <div className="card">
            <AccountsTable
              accounts={accounts.data}
              startRank={offset + 1}
              tokenSymbol={theme.tokenSymbol}
              tokenDecimals={theme.tokenDecimals}
            />
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/accounts"
          />
        </>
      )}

      {accounts && accounts.data.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No accounts found yet. The indexer is still syncing.
        </div>
      )}
    </div>
  );
}
