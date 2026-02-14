import { getBlock } from "@/lib/api";
import { ExtrinsicList } from "@/components/ExtrinsicList";
import { EventList } from "@/components/EventList";
import { LogList } from "@/components/LogList";
import { BlockDetailTabs } from "@/components/BlockDetailTabs";
import { truncateHash, formatNumber, formatDate, timeAgo } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Block Detail Page — Server Component
 * Renders block header, extrinsics table, and event list.
 * Immutable finalized blocks are effectively static and highly cacheable.
 */
export default async function BlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;

  try {
    data = await getBlock(id);
  } catch {
    return (
      <div className="text-center py-20 text-zinc-500">Block not found or indexer unavailable.</div>
    );
  }

  const { block, extrinsics, events } = data;
  const digestLogs = block.digestLogs ?? [];

  return (
    <div className="space-y-6">
      {/* Block Header */}
      <div>
        <Link href="/" className="text-xs text-accent hover:underline">
          ← Home
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold text-zinc-100">Block #{formatNumber(block.height)}</h1>
          <span className={block.status === "finalized" ? "badge-success" : "badge-info"}>
          {block.status}
        </span>
        </div>
      </div>

      {/* Block Details Card */}
      <div className="card space-y-3">
        <DetailRow label="Block Hash" value={block.hash} mono />
        <DetailRow
          label="Parent Hash"
          value={block.parentHash}
          mono
          href={`/block/${block.height - 1}`}
        />
        <DetailRow label="State Root" value={truncateHash(block.stateRoot, 10)} mono />
        <DetailRow label="Extrinsics Root" value={truncateHash(block.extrinsicsRoot, 10)} mono />
        <DetailRow
          label="Timestamp"
          value={
            block.timestamp ? `${formatDate(block.timestamp)} (${timeAgo(block.timestamp)})` : "—"
          }
        />
        <DetailRow label="Spec Version" value={String(block.specVersion)} />
        <DetailRow label="Validator" value={block.validatorId ?? "—"} mono />
      </div>

      {/* Tabbed: Extrinsics / Events / Logs */}
      <BlockDetailTabs
        extrinsicCount={extrinsics.length}
        eventCount={events.length}
        logCount={digestLogs.length}
        extrinsicsContent={
          <div className="card">
            <ExtrinsicList extrinsics={extrinsics} />
          </div>
        }
        eventsContent={
          <div className="card">
            <EventList events={events} />
          </div>
        }
        logsContent={
          <div className="card">
            <LogList logs={digestLogs} blockHeight={block.height} />
          </div>
        }
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-xs text-zinc-500 sm:w-40 shrink-0">{label}</span>
      {href ? (
        <a
          href={href}
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
