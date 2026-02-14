"use client";

import dynamic from "next/dynamic";

const ActivityChart = dynamic(
  () => import("@/components/ActivityChart").then((m) => m.ActivityChart),
  {
    ssr: false,
    loading: () => (
      <section className="card p-5">
        <div className="h-[280px] flex items-center justify-center text-zinc-500 text-sm">
          Loading chart...
        </div>
      </section>
    ),
  },
);

export function ActivityChartWrapper() {
  return <ActivityChart />;
}
