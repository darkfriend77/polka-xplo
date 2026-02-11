"use client";

import { useState, useEffect } from "react";

interface StakingStats {
  era: number;
  totalStaked: string;
  validatorCount: number;
  nominatorCount: number;
  totalReward: string;
}

/**
 * Hook to fetch staking statistics from the API.
 * In production, this would also subscribe to live updates via PAPI.
 */
export function useStakingInfo(apiUrl: string) {
  const [stats, setStats] = useState<StakingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch(`${apiUrl}/api/staking/stats`);
        if (!res.ok) throw new Error("Failed to fetch staking stats");
        const data = (await res.json()) as StakingStats;
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [apiUrl]);

  return { stats, loading, error };
}
