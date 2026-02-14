"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ActivityBucket, ActivityPeriod } from "@/lib/api";

const API_BASE = "/indexer-api";

type Metric = "extrinsics" | "transfers" | "events" | "blocks";

const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "extrinsics", label: "Extrinsics", color: "#6366f1" },
  { key: "transfers", label: "Transfers", color: "#22d3ee" },
  { key: "events", label: "Events", color: "#a78bfa" },
  { key: "blocks", label: "Blocks", color: "#4ade80" },
];

const PERIODS: { key: ActivityPeriod; label: string; defaultLimit: number }[] = [
  { key: "hour", label: "Hourly", defaultLimit: 48 },
  { key: "day", label: "Daily", defaultLimit: 30 },
  { key: "week", label: "Weekly", defaultLimit: 24 },
  { key: "month", label: "Monthly", defaultLimit: 12 },
];

function formatLabel(ts: number, period: ActivityPeriod): string {
  const d = new Date(ts);
  switch (period) {
    case "hour":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    case "day":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "week":
      return "W " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "month":
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    default:
      return d.toLocaleDateString();
  }
}

function formatTick(ts: number, period: ActivityPeriod): string {
  const d = new Date(ts);
  switch (period) {
    case "hour":
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    case "day":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "week":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "month":
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    default:
      return "";
  }
}

function formatValue(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString();
}

export function ActivityChart() {
  const [period, setPeriod] = useState<ActivityPeriod>("day");
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(
    new Set(["extrinsics", "transfers"]),
  );
  const [data, setData] = useState<ActivityBucket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: ActivityPeriod) => {
    setLoading(true);
    try {
      const periodCfg = PERIODS.find((x) => x.key === p) ?? PERIODS[1]!;
      const res = await fetch(
        `${API_BASE}/api/stats/activity?period=${p}&limit=${periodCfg.defaultLimit}`,
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  const toggleMetric = (m: Metric) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(m)) {
        if (next.size > 1) next.delete(m); // keep at least one
      } else {
        next.add(m);
      }
      return next;
    });
  };

  const btnClass = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
      active
        ? "bg-zinc-700 text-zinc-100"
        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
    }`;

  return (
    <section className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Chain Activity</h2>

        {/* Period selector */}
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={btnClass(period === p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric toggles */}
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => toggleMetric(m.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
              activeMetrics.has(m.key)
                ? "bg-zinc-800 text-zinc-200 ring-1 ring-zinc-700"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{
                backgroundColor: activeMetrics.has(m.key) ? m.color : "#52525b",
              }}
            />
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-[280px] w-full">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            Loading chart data...
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            No activity data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                {METRICS.map((m) => (
                  <linearGradient
                    key={m.key}
                    id={`gradient-${m.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={m.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={m.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#27272a"
                vertical={false}
              />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(ts) => formatTick(ts, period)}
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={{ stroke: "#27272a" }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={formatValue}
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: "8px",
                  fontSize: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
                labelStyle={{ color: "#a1a1aa", marginBottom: "4px" }}
                itemStyle={{ padding: "1px 0" }}
                labelFormatter={(ts) => formatLabel(ts as number, period)}
                formatter={(value: number | undefined) => [
                  value != null ? value.toLocaleString() : "0",
                  undefined,
                ]}
              />
              {METRICS.filter((m) => activeMetrics.has(m.key)).map((m) => (
                <Area
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  name={m.label}
                  stroke={m.color}
                  strokeWidth={2}
                  fill={`url(#gradient-${m.key})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
