import { useState, useCallback } from 'react';
import { getSummary } from '../lib/gasApi';
import { useAuth } from '../contexts/AuthContext';
import type { SummaryResponse } from '../types';

export function useSummary() {
  const { getValidToken } = useAuth();
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(
    async (from: string, to: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const token = await getValidToken();
        if (!token) throw new Error('認証が必要です');
        const result = await getSummary(token, from, to);
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : '取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    },
    [getValidToken]
  );

  return { data, isLoading, error, fetchSummary };
}
