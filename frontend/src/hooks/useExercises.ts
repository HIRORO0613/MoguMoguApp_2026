import { useState, useCallback } from 'react';
import * as gasApi from '../lib/gasApi';
import { useAuth } from '../contexts/AuthContext';
import { dateRange30Days } from '../lib/dateUtils';
import type { ExerciseType, ExerciseData } from '../types';

export function useExercises() {
  const { getValidToken } = useAuth();
  const [items, setItems] = useState<gasApi.ExerciseItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExercises = useCallback(
    async (startDate?: string, endDate?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const token = await getValidToken();
        if (!token) throw new Error('認証が必要です');
        const { start, end } = dateRange30Days(startDate, endDate);
        const result = await gasApi.getExercises(token, start, end);
        setItems(result.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : '取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    },
    [getValidToken]
  );

  const addExercise = useCallback(
    async (exerciseType: ExerciseType, data: ExerciseData) => {
      const token = await getValidToken();
      if (!token) throw new Error('認証が必要です');
      const result = await gasApi.addExercise(
        token,
        new Date().toISOString(),
        exerciseType,
        data
      );
      setItems((prev) => [result, ...prev]);
      return result;
    },
    [getValidToken]
  );

  return { items, isLoading, error, fetchExercises, addExercise };
}
