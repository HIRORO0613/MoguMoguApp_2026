import { useState, useCallback } from 'react';
import * as gasApi from '../lib/gasApi';
import { useAuth } from '../contexts/AuthContext';
import { dateRange30Days } from '../lib/dateUtils';

export function useWeights() {
  const { getValidToken } = useAuth();
  const [items, setItems] = useState<gasApi.WeightItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeights = useCallback(
    async (startDate?: string, endDate?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const token = await getValidToken();
        if (!token) throw new Error('認証が必要です');
        const { start, end } = dateRange30Days(startDate, endDate);
        const result = await gasApi.getWeights(token, start, end);
        setItems(result.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : '取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    },
    [getValidToken]
  );

  const addWeight = useCallback(
    async (weight: number) => {
      const token = await getValidToken();
      if (!token) throw new Error('認証が必要です');
      const result = await gasApi.addWeight(token, new Date().toISOString(), weight);
      setItems((prev) => [result, ...prev]);
      return result;
    },
    [getValidToken]
  );

  return { items, isLoading, error, fetchWeights, addWeight };
}
