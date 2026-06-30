import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { MoguFeedback } from '../components/MoguFeedback';
import { RecordModal } from '../components/RecordModal';
import { CalorieGauge, PFCChart } from '../components/Charts';
import { useDashboard } from '../hooks/useDashboard';
import { useAuth } from '../contexts/AuthContext';
import { usePrivacy, PrivacyValue } from '../contexts/PrivacyContext';
import { tokyoDateKey } from '../lib/dateUtils';

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, fetchDashboard } = useDashboard();
  const { isPrivate, toggle: togglePrivacy } = usePrivacy();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchDashboard(tokyoDateKey());
  }, [fetchDashboard]);

  const handleSuccess = () => fetchDashboard(tokyoDateKey());

  const balance = data?.balanceKcal ?? 0;

  return (
    <Layout
      title="MoguMogu"
      rightAction={
        <div className="flex items-center gap-1">
          <button
            onClick={togglePrivacy}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label={isPrivate ? 'プライバシーモード解除' : 'プライバシーモード'}
          >
            {isPrivate
              ? <EyeOff className="w-4 h-4 text-[#233F9A]" />
              : <Eye    className="w-4 h-4 text-gray-400" />
            }
          </button>
          <button
            onClick={() => fetchDashboard(tokyoDateKey())}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      <div className="px-4 py-4 space-y-4">

        {/* ストリーク — ANA グラデーション */}
        <Card className="bg-gradient-to-r from-[#233F9A] to-[#00B5F0] border-0 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-90">
                {user?.loginId} さん、おはようだモグ！
              </p>
              <p className="text-2xl font-bold mt-0.5">
                🔥 {data?.streakDays ?? 0}日連続記録中
              </p>
            </div>
            <div className="text-5xl">🦔</div>
          </div>
        </Card>

        {/* カロリー収支ゲージ */}
        <Card>
          <p className="text-xs font-bold text-gray-400 mb-1">
            {tokyoDateKey()} のカロリー収支
          </p>
          <div className="grid grid-cols-3 gap-2 text-center mb-1">
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">摂取</p>
              <p className="text-lg font-bold text-gray-800">
                <PrivacyValue>{data?.intakeKcal ?? 0}</PrivacyValue>
                <span className="text-[10px] font-normal ml-0.5 text-gray-500">kcal</span>
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">消費</p>
              <p className="text-lg font-bold text-gray-800">
                <PrivacyValue>{data?.burnedKcal ?? 0}</PrivacyValue>
                <span className="text-[10px] font-normal ml-0.5 text-gray-500">kcal</span>
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">目標</p>
              <p className="text-lg font-bold text-gray-500">
                ±0<span className="text-[10px] font-normal ml-0.5">kcal</span>
              </p>
            </div>
          </div>
          <CalorieGauge balance={balance} isPrivate={isPrivate} />
        </Card>

        {/* PFC バランス */}
        <Card>
          <p className="text-xs font-bold text-gray-400 mb-3">PFC バランス</p>
          {isPrivate ? (
            <p className="text-center text-sm text-gray-300 tracking-[0.3em] py-4">●●●</p>
          ) : (
            <PFCChart
              protein={data?.totalProtein ?? 0}
              fat={data?.totalFat ?? 0}
              carb={data?.totalCarb ?? 0}
            />
          )}
        </Card>

        {/* 最新体重 — プライバシー対応 */}
        {data?.latestWeight && (
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-400">最新体重</p>
            </div>
            <p className="text-2xl font-bold text-gray-800 mt-1">
              <PrivacyValue>{data.latestWeight.weight}</PrivacyValue>
              <span className="text-sm font-normal ml-1 text-gray-500">kg</span>
            </p>
          </Card>
        )}

        {/* モグちゃんフィードバック */}
        <MoguFeedback data={data} />
      </div>

      {/* FAB — ANA Deep Blue */}
      <button
        onClick={() => setModalOpen(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-[#233F9A] hover:bg-[#1c3380] active:scale-95 text-white rounded-full shadow-lg shadow-blue-200 flex items-center justify-center transition-all z-40"
      >
        <Plus className="w-7 h-7" />
      </button>

      <RecordModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </Layout>
  );
}
