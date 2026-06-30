import { useState, useCallback } from 'react';
import { getDashboard } from '../lib/gasApi';
import { useAuth } from '../contexts/AuthContext';
import type { DashboardData } from '../types';

export function useDashboard() {
  const { getValidToken } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(
    async (date?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const token = await getValidToken();
        if (!token) throw new Error('認証が必要です');
        const result = await getDashboard(token, date);
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : '取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    },
    [getValidToken]
  );

  return { data, isLoading, error, fetchDashboard };
}
