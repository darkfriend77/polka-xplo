import { getExtrinsic } from "@/lib/api";
import { EventList } from "@/components/EventList";
import { JsonView } from "@/components/JsonView";
import { AddressDisplay } from "@/components/AddressDisplay";
import { formatBalance, formatDate, timeAgo } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Convert PascalCase to camelCase */
function toCamelCase(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Extrinsic Detail Page — Server Component
 * Handles both tx hash (0x...) and block-index ID (100-0) formats.
 * Layout mirrors statescan.io extrinsic detail view.
 */
export default async function ExtrinsicPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  let data;

  try {
    data = await getExtrinsic(hash);
  } catch {
    return (
      <div className="text-center py-20 text-zinc-500">
        Extrinsic not found or indexer unavailable.
      </div>
    );
  }

  const { extrinsic, events, blockTimestamp } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/" className="text-xs text-accent hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Extrinsic {extrinsic.id}</h1>
      </div>

      {/* Detail Card */}
      <div className="card space-y-3">
        {blockTimestamp && (
          <DetailRow
            label="Extrinsic Time"
            value={`${formatDate(blockTimestamp)} (${timeAgo(blockTimestamp)})`}
          />
        )}
        <DetailRow
          label="Block"
          value={String(extrinsic.blockHeight)}
          link={`/block/${extrinsic.blockHeight}`}
        />
        <DetailRow label="Extrinsic Hash" value={extrinsic.txHash ?? "—"} mono />
        <DetailRow label="Module" value={toCamelCase(extrinsic.module)} />
        <DetailRow label="Call" value={extrinsic.call} />
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
          <span className="text-xs text-zinc-500 sm:w-32 shrink-0">Signer</span>
          {extrinsic.signer ? (
            <AddressDisplay address={extrinsic.signer} link className="text-sm font-mono" />
          ) : (
            <span className="text-sm text-zinc-200">Unsigned</span>
          )}
        </div>
        {extrinsic.fee && <DetailRow label="Fee" value={formatBalance(extrinsic.fee)} />}
        <DetailRow label="Result" value="" badge={extrinsic.success ? "success" : "error"} />
      </div>

      {/* Parameters */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">Parameters</h2>
        <div className="card">
          <JsonView data={extrinsic.args} />
        </div>
      </section>

      {/* Events tab (matching statescan: "Events N") */}
      <section>
        <div className="flex gap-1 mb-4 border-b border-zinc-800">
          <span className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-100 border-b-2 border-[var(--color-accent)] -mb-px">
            Events
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-zinc-700 text-zinc-200">
              {events.length}
            </span>
          </span>
        </div>
        <div className="card">
          <EventList events={events} />
        </div>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  link,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: string;
  badge?: "success" | "error";
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-xs text-zinc-500 sm:w-32 shrink-0">{label}</span>
      {badge ? (
        <span className={badge === "success" ? "badge-success" : "badge-error"}>
          {badge === "success" ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mr-1">
                <path
                  d="M2.5 6L5 8.5L9.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Success
            </>
          ) : (
            "Failed"
          )}
        </span>
      ) : link ? (
        <a
          href={link}
          className={`text-sm text-accent hover:underline break-all ${mono ? "font-mono" : ""}`}
        >
          {value}
        </a>
      ) : (
        <span className={`text-sm text-zinc-200 break-all ${mono ? "font-mono" : ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}
