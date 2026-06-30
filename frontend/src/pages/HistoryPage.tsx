import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { usePrivacy, PrivacyValue } from '../contexts/PrivacyContext';
import {
  CalorieGauge,
  PFCChart,
  CalorieBarChart,
  PFCStackedBar,
  WeightLineChart,
} from '../components/Charts';
import { useDashboard } from '../hooks/useDashboard';
import { useSummary } from '../hooks/useSummary';
import { useMeals } from '../hooks/useMeals';
import { useWeights } from '../hooks/useWeights';
import { useExercises } from '../hooks/useExercises';
import { formatDate, formatDateTime, groupByDate } from '../lib/dateUtils';
import type { ExerciseData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// 日付ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

const tokyoToday = (): string => {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
};

const addDays = (dateKey: string, n: number): string => {
  const d = new Date(dateKey + 'T12:00:00+09:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
};

const weekStart = (dateKey: string): string => {
  const d = new Date(dateKey + 'T12:00:00+09:00');
  const dow = d.getDay(); // 0=日
  d.setDate(d.getDate() - dow);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
};

const monthStart = (dateKey: string): string => dateKey.slice(0, 8) + '01';

const monthEnd = (dateKey: string): string => {
  const [y, m] = dateKey.split('-').map(Number);
  return new Date(y, m, 0).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
};

const daysInRange = (from: string, to: string): number => {
  const a = new Date(from + 'T12:00:00+09:00');
  const b = new Date(to   + 'T12:00:00+09:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
};

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;
const isWithin30Days = (dateKey: string): boolean =>
  new Date().getTime() - new Date(dateKey + 'T00:00:00+09:00').getTime() < THIRTY_DAYS_MS;

// ─────────────────────────────────────────────────────────────────────────────
// 期間ラベル
// ─────────────────────────────────────────────────────────────────────────────

function periodLabel(tab: 'day' | 'week' | 'month', anchor: string): string {
  if (tab === 'day') {
    return formatDate(anchor + 'T00:00:00');
  }
  if (tab === 'week') {
    const ws = weekStart(anchor);
    const we = addDays(ws, 6);
    return `${formatDate(ws + 'T00:00:00')} 〜 ${formatDate(we + 'T00:00:00')}`;
  }
  const [y, m] = anchor.split('-');
  return `${y}年${parseInt(m)}月`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 個別記録コンポーネント
// ─────────────────────────────────────────────────────────────────────────────

function exerciseSummary(data: ExerciseData): string {
  if (data.type === 'steps') return `${data.steps.toLocaleString()} 歩`;
  return `${data.durationMinutes}分 / ${data.caloriesBurned}kcal${data.memo ? ` (${data.memo})` : ''}`;
}

interface IndividualRecordsProps {
  from: string;
  to: string;
}

function IndividualRecords({ from, to }: IndividualRecordsProps) {
  const meals     = useMeals();
  const weights   = useWeights();
  const exercises = useExercises();

  useEffect(() => {
    meals.fetchMeals(from, to);
    weights.fetchWeights(from, to);
    exercises.fetchExercises(from, to);
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = meals.isLoading || weights.isLoading || exercises.isLoading;
  const hasMeals  = meals.items.length > 0;
  const hasWeights  = weights.items.length > 0;
  const hasExercises = exercises.items.length > 0;

  if (isLoading) {
    return <p className="text-center text-sm text-gray-400 py-4">読み込み中...</p>;
  }
  if (!hasMeals && !hasWeights && !hasExercises) {
    return (
      <p className="text-center text-sm text-gray-400 py-4">この期間に記録はありません</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* 食事 */}
      {hasMeals && (
        <div>
          <p className="text-xs font-bold text-gray-400 mb-2">🍽️ 食事</p>
          {groupByDate(meals.items).map(({ dateKey, items }) => (
            <div key={dateKey} className="mb-3">
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">
                {formatDate(dateKey + 'T00:00:00')}
              </p>
              <div className="space-y-1.5">
                {items.map(item => (
                  <Card key={item.recordId} padding="sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.data.mealName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          P:{item.data.protein}g F:{item.data.fat}g C:{item.data.carb}g
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm font-bold text-[#233F9A]">{item.data.calories} kcal</p>
                        <p className="text-[10px] text-gray-400">{formatDateTime(item.timestamp)}</p>
                      </div>
                    </div>
                  </Card>
                ))}
                <p className="text-right text-xs text-gray-500 font-medium pr-1">
                  合計: {items.reduce((s, i) => s + i.data.calories, 0)} kcal
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 体重 */}
      {hasWeights && (
        <div>
          <p className="text-xs font-bold text-gray-400 mb-2">⚖️ 体重</p>
          {groupByDate(weights.items).map(({ dateKey, items }) => (
            <div key={dateKey} className="mb-3">
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">
                {formatDate(dateKey + 'T00:00:00')}
              </p>
              <div className="space-y-1.5">
                {items.map(item => (
                  <Card key={item.recordId} padding="sm">
                    <div className="flex justify-between items-center">
                      <p className="text-xl font-bold text-gray-800">
                        <PrivacyValue>{item.data.weight}</PrivacyValue>
                        <span className="text-sm font-normal ml-1 text-gray-500">kg</span>
                      </p>
                      <p className="text-xs text-gray-400">{formatDateTime(item.timestamp)}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 運動 */}
      {hasExercises && (
        <div>
          <p className="text-xs font-bold text-gray-400 mb-2">🏃 運動</p>
          {groupByDate(exercises.items).map(({ dateKey, items }) => (
            <div key={dateKey} className="mb-3">
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">
                {formatDate(dateKey + 'T00:00:00')}
              </p>
              <div className="space-y-1.5">
                {items.map(item => (
                  <Card key={item.recordId} padding="sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {item.exerciseType === 'steps' ? '歩数'
                            : item.exerciseType === 'running' ? 'ランニング'
                            : 'ワークアウト'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {exerciseSummary(item.data)}
                        </p>
                      </div>
                      <p className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                        {formatDateTime(item.timestamp)}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HistoryPage
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'day' | 'week' | 'month';
const TABS: { id: Tab; label: string }[] = [
  { id: 'day',   label: '日' },
  { id: 'week',  label: '週' },
  { id: 'month', label: '月' },
];

export function HistoryPage() {
  const today = tokyoToday();
  const [tab, setTab] = useState<Tab>('day');
  const [anchor, setAnchor] = useState(today);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const { isPrivate } = usePrivacy();

  // anchor に応じた from/to を計算
  const { from, to } = useMemo(() => {
    if (tab === 'day') return { from: anchor, to: anchor };
    if (tab === 'week') {
      const ws = weekStart(anchor);
      return { from: ws, to: addDays(ws, 6) };
    }
    return { from: monthStart(anchor), to: monthEnd(anchor) };
  }, [tab, anchor]);

  // 日ビュー: ダッシュボードデータ (既存)
  const dashboard = useDashboard();
  // 週/月ビュー: サマリーデータ
  const summary   = useSummary();

  useEffect(() => {
    if (tab === 'day') {
      dashboard.fetchDashboard(from);
    } else {
      summary.fetchSummary(from, to);
    }
  }, [tab, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  // ナビゲーション（前/次）
  const goBack = () => {
    if (tab === 'day')   setAnchor(a => addDays(a, -1));
    if (tab === 'week')  setAnchor(a => addDays(weekStart(a), -7));
    if (tab === 'month') setAnchor(a => {
      const [y, m] = a.split('-').map(Number);
      return m === 1
        ? `${y - 1}-12-01`
        : `${y}-${String(m - 1).padStart(2, '0')}-01`;
    });
  };
  const goForward = () => {
    if (tab === 'day')   setAnchor(a => addDays(a, 1));
    if (tab === 'week')  setAnchor(a => addDays(weekStart(a), 7));
    if (tab === 'month') setAnchor(a => {
      const [y, m] = a.split('-').map(Number);
      return m === 12
        ? `${y + 1}-01-01`
        : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    });
  };

  const canForward = to < today;
  const isLoading  = tab === 'day' ? dashboard.isLoading : summary.isLoading;

  // 現在期間かどうか（「今日に戻る」ボタンの表示制御）
  const isCurrentPeriod = useMemo(() => {
    if (tab === 'day')   return anchor === today;
    if (tab === 'week')  return weekStart(anchor) === weekStart(today);
    return anchor.slice(0, 7) === today.slice(0, 7);
  }, [tab, anchor, today]);

  const goToday = () => setAnchor(today);

  // デートピッカーを開く
  const openDatePicker = () => dateInputRef.current?.showPicker?.();

  // 30日以内か（個別記録を表示するか）
  const showRecords = daysInRange(from, today) <= 31 && isWithin30Days(from);

  // 週/月用データ
  const summaryData  = summary.data?.summaries ?? [];
  const weightPoints = summary.data?.weights   ?? [];

  // 日ビュー用
  const dayBalance = dashboard.data?.balanceKcal ?? 0;

  return (
    <Layout title="記録履歴">
      {/* タブ */}
      <div className="flex bg-white border-b border-gray-100 px-4 gap-1 pt-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setAnchor(today); }}
            className={[
              'flex-1 py-2 text-sm font-semibold rounded-t-lg transition-colors',
              id === tab
                ? 'text-[#233F9A] border-b-2 border-[#233F9A]'
                : 'text-gray-400 hover:text-gray-600',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 期間ナビゲーター */}
      <div className="bg-white border-b border-gray-100">
        {/* メインナビ行 */}
        <div className="flex items-center h-11 px-2">
          {/* ← ボタン */}
          <button
            onClick={goBack}
            className="flex-none p-2 rounded-xl hover:bg-gray-100 text-gray-400 active:scale-90 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* 期間ラベル（タップでデートピッカー） */}
          <button
            onClick={openDatePicker}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 mx-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-700 leading-tight truncate">
              {periodLabel(tab, anchor)}
            </span>
          </button>

          {/* 隠しデートインプット（ネイティブピッカーを呼び出す） */}
          <input
            ref={dateInputRef}
            type="date"
            value={anchor}
            max={today}
            onChange={(e) => { if (e.target.value) setAnchor(e.target.value); }}
            className="sr-only"
            style={{ fontSize: '16px' }}
          />

          {/* → ボタン */}
          <button
            onClick={goForward}
            disabled={!canForward}
            className={[
              'flex-none p-2 rounded-xl transition-all',
              canForward
                ? 'hover:bg-gray-100 text-gray-400 active:scale-90'
                : 'text-gray-200 cursor-default',
            ].join(' ')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 「今日に戻る」チップ（現在期間でないときのみ表示） */}
        {!isCurrentPeriod && (
          <div className="flex justify-center pb-1.5">
            <button
              onClick={goToday}
              className="text-xs font-medium text-[#233F9A] bg-[#e8eef9] hover:bg-[#c3d0f0] px-4 py-1 rounded-full transition-colors active:scale-95"
            >
              今日に戻る
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-4 pb-8">
        {isLoading && (
          <p className="text-center text-sm text-gray-400 py-8">読み込み中...</p>
        )}

        {!isLoading && (
          <>
            {/* ═══ 日ビュー ═══ */}
            {tab === 'day' && (
              <>
                <Card>
                  <p className="text-xs font-bold text-gray-400 mb-1">カロリー収支</p>
                  <div className="grid grid-cols-2 gap-3 text-center mb-2">
                    <div>
                      <p className="text-[10px] text-gray-400">摂取</p>
                      <p className="text-lg font-bold text-gray-800">
                        {dashboard.data?.intakeKcal ?? 0}
                        <span className="text-[10px] ml-0.5 text-gray-500">kcal</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">消費</p>
                      <p className="text-lg font-bold text-gray-800">
                        {dashboard.data?.burnedKcal ?? 0}
                        <span className="text-[10px] ml-0.5 text-gray-500">kcal</span>
                      </p>
                    </div>
                  </div>
                  <CalorieGauge balance={dayBalance} isPrivate={isPrivate} />
                </Card>

                <Card>
                  <p className="text-xs font-bold text-gray-400 mb-3">PFC バランス</p>
                  <PFCChart
                    protein={dashboard.data?.totalProtein ?? 0}
                    fat={dashboard.data?.totalFat ?? 0}
                    carb={dashboard.data?.totalCarb ?? 0}
                  />
                </Card>

                {/* 個別記録（日ビューは常に表示） */}
                <Card>
                  <p className="text-xs font-bold text-gray-400 mb-3">この日の記録</p>
                  <IndividualRecords from={from} to={to} />
                </Card>
              </>
            )}

            {/* ═══ 週/月ビュー ═══ */}
            {(tab === 'week' || tab === 'month') && (
              <>
                {/* カロリー棒グラフ */}
                <Card>
                  <p className="text-xs font-bold text-gray-400 mb-2">摂取 / 消費カロリー</p>
                  <CalorieBarChart data={summaryData} />
                  {/* サマリー合計 */}
                  {summaryData.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 text-center mt-3 pt-3 border-t border-gray-50">
                      <div>
                        <p className="text-[9px] text-gray-400">総摂取</p>
                        <p className="text-sm font-bold text-[#233F9A]">
                          <PrivacyValue>{summaryData.reduce((s, d) => s + d.intakeKcal, 0)}</PrivacyValue>
                          <span className="text-[9px] font-normal ml-0.5">kcal</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400">総消費</p>
                        <p className="text-sm font-bold text-[#00B5F0]">
                          <PrivacyValue>{summaryData.reduce((s, d) => s + d.burnedKcal, 0)}</PrivacyValue>
                          <span className="text-[9px] font-normal ml-0.5">kcal</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400">収支</p>
                        {(() => {
                          const bal = summaryData.reduce(
                            (s, d) => s + d.intakeKcal - d.burnedKcal, 0
                          );
                          const c = bal > 0 ? 'text-red-500' : bal < 0 ? 'text-[#00B5F0]' : 'text-emerald-500';
                          return (
                            <p className={`text-sm font-bold ${c}`}>
                              {bal >= 0 ? '+' : ''}{bal}
                              <span className="text-[9px] font-normal ml-0.5">kcal</span>
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </Card>

                {/* PFC スタック棒グラフ */}
                <Card>
                  <p className="text-xs font-bold text-gray-400 mb-2">PFC バランス推移</p>
                  <PFCStackedBar data={summaryData} />
                  {/* 期間合計の PFC ドーナツ */}
                  {summaryData.length > 0 && (() => {
                    const tp = summaryData.reduce((s, d) => s + d.protein, 0);
                    const tf = summaryData.reduce((s, d) => s + d.fat,     0);
                    const tc = summaryData.reduce((s, d) => s + d.carb,    0);
                    return (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-[10px] text-gray-400 mb-2">期間合計 PFC</p>
                        <PFCChart
                          protein={Math.round(tp * 10) / 10}
                          fat={Math.round(tf * 10) / 10}
                          carb={Math.round(tc * 10) / 10}
                        />
                      </div>
                    );
                  })()}
                </Card>

                {/* 体重推移 */}
                <Card>
                  <p className="text-xs font-bold text-gray-400 mb-2">体重推移</p>
                  <WeightLineChart weights={weightPoints} />
                </Card>

                {/* 個別記録（30日以内のみ） */}
                {showRecords && (
                  <Card>
                    <p className="text-xs font-bold text-gray-400 mb-3">個別記録（直近30日）</p>
                    <IndividualRecords from={from} to={to} />
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
