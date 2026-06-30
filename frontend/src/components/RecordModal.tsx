/**
 * RecordModal — ワンストップ記録ボトムシート
 * 食事 / 体重 / 運動 の記録をステップ形式で行う
 * 食事はテキスト入力 + カメラ/ライブラリ画像入力に対応
 */
import { useState, useRef } from 'react';
import { X, Sparkles, ChevronLeft, Camera, ImageIcon, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuth } from '../contexts/AuthContext';
import { getGeminiKey } from '../lib/db';
import { analyzeMeal, GeminiError, type ImageData } from '../lib/gemini';
import * as gasApi from '../lib/gasApi';
import { GasApiError } from '../lib/gasApi';
import type { ExerciseType } from '../types';

type Step =
  | 'choice'
  | 'meal-input'
  | 'meal-analyzing'
  | 'meal-confirm'
  | 'weight'
  | 'exercise';

interface MealForm {
  mealName: string;
  calories: string;
  protein: string;
  fat: string;
  carb: string;
}

interface ExerciseForm {
  type: ExerciseType;
  steps: string;
  duration: string;
  caloriesBurned: string;
  memo: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DEFAULT_MEAL: MealForm = { mealName: '', calories: '', protein: '', fat: '', carb: '' };
const DEFAULT_EX: ExerciseForm = { type: 'steps', steps: '', duration: '', caloriesBurned: '', memo: '' };

const STEP_TITLE: Record<Step, string> = {
  choice: '何を記録する？',
  'meal-input': '食事を記録',
  'meal-analyzing': 'AI解析中',
  'meal-confirm': '食事の内容を確認',
  weight: '体重を記録',
  exercise: '運動を記録',
};

/** File → base64 文字列（data: プレフィックスなし）に変換 */
function fileToBase64(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(',');
      const mimeType = header.replace('data:', '').replace(';base64', '');
      resolve({ base64: data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function GasError({ err }: { err: Error }) {
  const isToken = err.message.toLowerCase().includes('token') || err.message.toLowerCase().includes('auth');
  if (isToken) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800 space-y-1">
        <p className="font-bold flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />認証エラー</p>
        <p>GASのCode.gsを最新版に更新し、<strong>「新バージョン」で再デプロイ</strong>してください。</p>
      </div>
    );
  }
  return null;
}

export function RecordModal({ isOpen, onClose, onSuccess }: Props) {
  const { getValidToken } = useAuth();
  const [step, setStep] = useState<Step>('choice');
  const [isSaving, setIsSaving] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  // 食事
  const [mealText, setMealText] = useState('');
  const [mealForm, setMealForm] = useState<MealForm>(DEFAULT_MEAL);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzedByAI, setAnalyzedByAI] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 体重
  const [weightVal, setWeightVal] = useState('');

  // 運動
  const [exForm, setExForm] = useState<ExerciseForm>(DEFAULT_EX);

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('choice');
    setMealText(''); setMealForm(DEFAULT_MEAL);
    setImageData(null); setImagePreview(null); setAnalyzedByAI(false);
    setWeightVal('');
    setExForm(DEFAULT_EX);
    setLastError(null);
    onClose();
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('画像は10MB以下にしてください');
      return;
    }
    try {
      const data = await fileToBase64(file);
      setImageData(data);
      setImagePreview(URL.createObjectURL(file));
    } catch {
      toast.error('画像の読み込みに失敗しました');
    }
    e.target.value = '';
  };

  const clearImage = () => {
    setImageData(null);
    setImagePreview(null);
  };

  // ----- 食事 AI 解析 -----
  const handleAnalyzeMeal = async () => {
    if (!mealText.trim() && !imageData) {
      toast.error('食事の内容を入力するか画像を選択してください');
      return;
    }
    const apiKey = await getGeminiKey();
    if (!apiKey) {
      setMealForm({ ...DEFAULT_MEAL, mealName: mealText });
      setAnalyzedByAI(false);
      setStep('meal-confirm');
      toast('Gemini APIキー未設定のため手動入力モードです', { icon: 'ℹ️' });
      return;
    }
    setStep('meal-analyzing');
    try {
      const result = await analyzeMeal(apiKey, mealText, imageData ?? undefined);
      setMealForm({
        mealName: result.mealName,
        calories: String(Math.round(result.calories)),
        protein: String(result.protein.toFixed(1)),
        fat: String(result.fat.toFixed(1)),
        carb: String(result.carb.toFixed(1)),
      });
      setAnalyzedByAI(true);
      setStep('meal-confirm');
    } catch (e) {
      const msg = e instanceof GeminiError ? e.message : 'AI解析に失敗しました';
      toast.error(`${msg}。手動で入力してください。`);
      setMealForm({ ...DEFAULT_MEAL, mealName: mealText });
      setAnalyzedByAI(false);
      setStep('meal-confirm');
    }
  };

  // ----- 食事保存 -----
  const handleSaveMeal = async () => {
    if (!mealForm.mealName.trim()) { toast.error('メニュー名を入力してください'); return; }
    setIsSaving(true); setLastError(null);
    try {
      const token = await getValidToken();
      if (!token) throw new GasApiError(401, '認証が必要です。再ログインしてください。');
      await gasApi.addMeal(token, new Date().toISOString(), {
        mealName: mealForm.mealName,
        calories: Number(mealForm.calories) || 0,
        protein: Number(mealForm.protein) || 0,
        fat: Number(mealForm.fat) || 0,
        carb: Number(mealForm.carb) || 0,
      });
      toast.success('食事を記録しただモグ！🍽️');
      onSuccess(); handleClose();
    } catch (e) {
      const err = e instanceof Error ? e : new Error('保存に失敗しました');
      setLastError(err);
      toast.error(err.message);
    } finally { setIsSaving(false); }
  };

  // ----- 体重保存 -----
  const handleSaveWeight = async () => {
    const w = Number(weightVal);
    if (!weightVal || isNaN(w) || w <= 0 || w > 500) { toast.error('体重を正しく入力してください'); return; }
    setIsSaving(true); setLastError(null);
    try {
      const token = await getValidToken();
      if (!token) throw new GasApiError(401, '認証が必要です。再ログインしてください。');
      await gasApi.addWeight(token, new Date().toISOString(), w);
      toast.success('体重を記録しただモグ！⚖️');
      onSuccess(); handleClose();
    } catch (e) {
      const err = e instanceof Error ? e : new Error('保存に失敗しました');
      setLastError(err);
      toast.error(err.message);
    } finally { setIsSaving(false); }
  };

  // ----- 運動保存 -----
  const handleSaveExercise = async () => {
    setIsSaving(true); setLastError(null);
    try {
      const token = await getValidToken();
      if (!token) throw new GasApiError(401, '認証が必要です。再ログインしてください。');
      const ts = new Date().toISOString();
      if (exForm.type === 'steps') {
        const steps = Number(exForm.steps);
        if (!steps || steps <= 0) { toast.error('歩数を入力してください'); return; }
        await gasApi.addExercise(token, ts, 'steps', { type: 'steps', steps });
      } else {
        const duration = Number(exForm.duration);
        if (!duration || duration <= 0) { toast.error('時間を入力してください'); return; }
        await gasApi.addExercise(token, ts, exForm.type, {
          type: exForm.type,
          durationMinutes: duration,
          caloriesBurned: Number(exForm.caloriesBurned) || 0,
          memo: exForm.memo || undefined,
        });
      }
      toast.success('運動を記録しただモグ！🏃');
      onSuccess(); handleClose();
    } catch (e) {
      const err = e instanceof Error ? e : new Error('保存に失敗しました');
      setLastError(err);
      toast.error(err.message);
    } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      <div className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step !== 'choice' && (
              <button
                onClick={() => setStep(
                  step === 'meal-confirm' ? 'meal-input' : 'choice'
                )}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-base font-bold text-gray-900">{STEP_TITLE[step]}</h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="overflow-y-auto px-5 py-4 pb-8 space-y-4">

          {/* --- 選択 --- */}
          {step === 'choice' && (
            <div className="grid grid-cols-3 gap-3">
              {([
                { label: '食事', emoji: '🍽️', target: 'meal-input' as Step },
                { label: '体重', emoji: '⚖️', target: 'weight' as Step },
                { label: '運動', emoji: '🏃', target: 'exercise' as Step },
              ] as const).map(({ label, emoji, target }) => (
                <button
                  key={label}
                  onClick={() => setStep(target)}
                  className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-orange-50 hover:bg-orange-100 active:scale-95 transition-all"
                >
                  <span className="text-3xl">{emoji}</span>
                  <span className="text-sm font-medium text-orange-700">{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* --- 食事入力 --- */}
          {step === 'meal-input' && (
            <>
              <Input
                label="食事の内容（テキスト）"
                placeholder="例: ラーメン大盛り、チャーハン"
                value={mealText}
                onChange={(e) => setMealText(e.target.value)}
                hint="テキストのみ・画像のみ・両方で解析できます"
              />

              {/* 画像入力エリア */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  写真で撮る <span className="text-gray-400 font-normal">（任意）</span>
                </label>
                {imagePreview ? (
                  <div className="relative rounded-2xl overflow-hidden">
                    <img src={imagePreview} alt="選択した食事" className="w-full max-h-44 object-cover" />
                    <button
                      onClick={clearImage}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent p-2">
                      <p className="text-white text-xs">タップして変更 ↑</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 cursor-pointer hover:border-orange-300 hover:text-orange-500 transition-colors">
                      <Camera className="w-4 h-4" />
                      カメラ
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleImageSelect}
                      />
                    </label>
                    <label className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 cursor-pointer hover:border-orange-300 hover:text-orange-500 transition-colors">
                      <ImageIcon className="w-4 h-4" />
                      ライブラリ
                      <input
                        ref={galleryInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageSelect}
                      />
                    </label>
                  </div>
                )}
              </div>

              <Button
                fullWidth
                onClick={handleAnalyzeMeal}
                disabled={!mealText.trim() && !imageData}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                AIで栄養を解析する
              </Button>
              <button
                className="w-full text-sm text-gray-400 underline"
                onClick={() => {
                  setMealForm({ ...DEFAULT_MEAL, mealName: mealText });
                  setAnalyzedByAI(false);
                  setStep('meal-confirm');
                }}
              >
                手動で入力する
              </button>
            </>
          )}

          {/* --- AI解析中 --- */}
          {step === 'meal-analyzing' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <span className="text-5xl animate-bounce">🦔</span>
              <p className="text-sm text-gray-500">栄養情報を解析中だモグ...</p>
              {imageData && <p className="text-xs text-gray-400">画像を解析しています</p>}
            </div>
          )}

          {/* --- 食事確認・編集 --- */}
          {step === 'meal-confirm' && (
            <>
              {/* AI免責事項 */}
              {analyzedByAI && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    <strong>AIによる推定値は目安です。</strong>
                    実際の栄養素は食品・量・調理法によって異なります。必要に応じて編集してください。
                  </p>
                </div>
              )}
              <Input
                label="メニュー名"
                value={mealForm.mealName}
                onChange={(e) => setMealForm({ ...mealForm, mealName: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="カロリー (kcal)" type="number" value={mealForm.calories}
                  onChange={(e) => setMealForm({ ...mealForm, calories: e.target.value })} />
                <Input label="タンパク質 (g)" type="number" value={mealForm.protein}
                  onChange={(e) => setMealForm({ ...mealForm, protein: e.target.value })} />
                <Input label="脂質 (g)" type="number" value={mealForm.fat}
                  onChange={(e) => setMealForm({ ...mealForm, fat: e.target.value })} />
                <Input label="炭水化物 (g)" type="number" value={mealForm.carb}
                  onChange={(e) => setMealForm({ ...mealForm, carb: e.target.value })} />
              </div>
              {lastError && <GasError err={lastError} />}
              <Button fullWidth isLoading={isSaving} onClick={handleSaveMeal}>
                記録する
              </Button>
            </>
          )}

          {/* --- 体重 --- */}
          {step === 'weight' && (
            <>
              <Input
                label="体重 (kg)"
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder="例: 65.5"
                value={weightVal}
                onChange={(e) => setWeightVal(e.target.value)}
              />
              {lastError && <GasError err={lastError} />}
              <Button fullWidth isLoading={isSaving} onClick={handleSaveWeight}>
                記録する
              </Button>
            </>
          )}

          {/* --- 運動 --- */}
          {step === 'exercise' && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">運動の種類</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { val: 'steps' as ExerciseType, label: '歩数' },
                    { val: 'running' as ExerciseType, label: 'ランニング' },
                    { val: 'workout' as ExerciseType, label: 'ワークアウト' },
                  ] as const).map(({ val, label }) => (
                    <button
                      key={val}
                      onClick={() => setExForm({ ...DEFAULT_EX, type: val })}
                      className={[
                        'py-2 text-sm rounded-xl border transition-colors',
                        exForm.type === val
                          ? 'border-orange-400 bg-orange-50 text-orange-700 font-medium'
                          : 'border-gray-200 text-gray-600',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {exForm.type === 'steps' ? (
                <Input
                  label="歩数"
                  type="number"
                  inputMode="numeric"
                  placeholder="例: 8000"
                  value={exForm.steps}
                  onChange={(e) => setExForm({ ...exForm, steps: e.target.value })}
                />
              ) : (
                <div className="space-y-3">
                  <Input
                    label="時間 (分)"
                    type="number"
                    inputMode="numeric"
                    placeholder="例: 30"
                    value={exForm.duration}
                    onChange={(e) => setExForm({ ...exForm, duration: e.target.value })}
                  />
                  <Input
                    label="消費カロリー (kcal)"
                    type="number"
                    inputMode="numeric"
                    placeholder="例: 200"
                    value={exForm.caloriesBurned}
                    onChange={(e) => setExForm({ ...exForm, caloriesBurned: e.target.value })}
                  />
                  <Input
                    label="メモ（任意）"
                    placeholder="例: 朝のランニング"
                    value={exForm.memo}
                    onChange={(e) => setExForm({ ...exForm, memo: e.target.value })}
                  />
                </div>
              )}
              {lastError && <GasError err={lastError} />}
              <Button fullWidth isLoading={isSaving} onClick={handleSaveExercise}>
                記録する
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
