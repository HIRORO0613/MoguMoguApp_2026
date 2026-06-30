import { useState, useEffect } from 'react';
import { getGeminiKey, getFeedbackCache, saveFeedbackCache } from '../lib/db';
import { generateDailyFeedback } from '../lib/gemini';
import { tokyoDateKey } from '../lib/dateUtils';
import type { DashboardData } from '../types';

export function MoguFeedback({ data }: { data: DashboardData | null }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        // キャッシュ確認（同日なら再生成しない）
        const cache = await getFeedbackCache();
        const today = tokyoDateKey();
        if (cache?.date === today) {
          if (!cancelled) setMessage(cache.message);
          return;
        }
        const apiKey = await getGeminiKey();
        if (!apiKey) {
          if (!cancelled) setMessage('設定画面からGemini APIキーを設定すると、モグちゃんのアドバイスが届くだモグ！');
          return;
        }
        const feedback = await generateDailyFeedback(
          apiKey,
          data.intakeKcal,
          data.burnedKcal,
          data.streakDays,
          data.latestWeight?.weight ?? null
        );
        await saveFeedbackCache({ date: today, message: feedback });
        if (!cancelled) setMessage(feedback);
      } catch {
        if (!cancelled) setMessage('今日も健康管理頑張るだモグ！🌱');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [data?.date]); // 日付が変わったときのみ再生成

  return (
    <div className="flex items-start gap-3 bg-orange-50 rounded-2xl p-4">
      <span className="text-3xl leading-none flex-shrink-0">🦔</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-orange-500 mb-1">モグちゃんより</p>
        {isLoading ? (
          <div className="flex gap-1 items-center h-5">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="w-1.5 h-1.5 bg-orange-300 rounded-full animate-bounce"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
        )}
      </div>
    </div>
  );
}
