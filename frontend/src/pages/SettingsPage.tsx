import { useEffect, useState } from 'react';
import { Eye, EyeOff, Copy, Check, LogOut, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';
import { getGeminiKey, saveGeminiKey, clearGeminiKey } from '../lib/db';
import * as gasApi from '../lib/gasApi';
import type { ProfileData } from '../types';

const ACTIVITY_LABELS: Record<string, string> = {
  low: '低め（デスクワーク中心）',
  normal: '普通（適度に動く）',
  high: '高め（よく運動する）',
};

export function SettingsPage() {
  const { user, logout, getValidToken } = useAuth();
  const navigate = useNavigate();

  // Gemini key
  const [geminiKey, setGeminiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  // Profile
  const [profile, setProfile] = useState<Partial<ProfileData>>({
    height: undefined, targetWeight: undefined, targetDate: '', age: undefined,
    sex: 'male', activityLevel: 'normal',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Change password
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);

  // Delete account
  const [deletePw, setDeletePw] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeletePw, setShowDeletePw] = useState(false);

  // Webhook copy
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getGeminiKey().then((k) => { if (k) setGeminiKey(k); });
    (async () => {
      setProfileLoading(true);
      try {
        const token = await getValidToken();
        if (!token) return;
        const res = await gasApi.getProfile(token);
        if (res.profile) setProfile(res.profile);
      } catch { /* ignore */ }
      finally { setProfileLoading(false); }
    })();
  }, [getValidToken]);

  // Gemini key handlers
  const handleSaveKey = async () => {
    await saveGeminiKey(geminiKey.trim());
    setKeySaved(true);
    toast.success('APIキーを保存しました');
    setTimeout(() => setKeySaved(false), 2000);
  };
  const handleClearKey = async () => {
    await clearGeminiKey();
    setGeminiKey('');
    toast('APIキーを削除しました', { icon: '🗑️' });
  };

  // Profile handler
  const handleSaveProfile = async () => {
    if (!profile.height || !profile.age || !profile.targetWeight) {
      toast.error('身長・年齢・目標体重を入力してください');
      return;
    }
    setProfileSaving(true);
    try {
      const token = await getValidToken();
      if (!token) throw new Error('認証エラー');
      await gasApi.updateProfile(token, profile as ProfileData);
      toast.success('プロフィールを保存しました');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存に失敗しました');
    } finally { setProfileSaving(false); }
  };

  // Change password handler
  const handleChangePassword = async () => {
    if (!oldPw || !newPw) { toast.error('パスワードを入力してください'); return; }
    if (newPw.length < 8) { toast.error('新しいパスワードは8文字以上にしてください'); return; }
    setChangePwLoading(true);
    try {
      const token = await getValidToken();
      if (!token) throw new Error('認証エラー');
      await gasApi.changePassword(token, oldPw, newPw);
      toast.success('パスワードを変更しました。再ログインしてください。');
      setOldPw(''); setNewPw('');
      await logout();
      navigate('/login', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'パスワード変更に失敗しました');
    } finally { setChangePwLoading(false); }
  };

  // Delete account handler
  const handleDeleteAccount = async () => {
    if (!deletePw) { toast.error('パスワードを入力してください'); return; }
    if (!confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) return;
    setDeleteLoading(true);
    try {
      const token = await getValidToken();
      if (!token) throw new Error('認証エラー');
      await gasApi.deleteAccount(token, deletePw);
      toast.success('アカウントを削除しました');
      await logout();
      navigate('/login', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '削除に失敗しました');
    } finally { setDeleteLoading(false); }
  };

  // Copy webhook URL
  const webhookUrl = `${import.meta.env.VITE_GAS_API_URL}?path=/api/webhook`;
  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Layout title="設定">
      <div className="px-4 py-4 space-y-6">

        {/* Gemini API Key */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Gemini API キー</h2>
          <Card>
            <div className="space-y-3">
              <Input
                label="APIキー"
                type={showKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                hint="Google AI Studio で取得できます"
                rightElement={
                  <button type="button" onClick={() => setShowKey((v) => !v)} className="text-gray-400">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
              <div className="flex gap-2">
                <Button fullWidth onClick={handleSaveKey} isLoading={keySaved} size="sm">
                  {keySaved ? '保存済み ✓' : '保存'}
                </Button>
                <Button variant="ghost" onClick={handleClearKey} size="sm">削除</Button>
              </div>
            </div>
          </Card>
        </section>

        {/* Profile */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">プロフィール</h2>
          <Card>
            {profileLoading ? (
              <p className="text-sm text-gray-400 text-center py-4">読み込み中...</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="身長 (cm)" type="number" value={profile.height ?? ''}
                    onChange={(e) => setProfile({ ...profile, height: Number(e.target.value) })} />
                  <Input label="年齢" type="number" value={profile.age ?? ''}
                    onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })} />
                  <Input label="目標体重 (kg)" type="number" step="0.1" value={profile.targetWeight ?? ''}
                    onChange={(e) => setProfile({ ...profile, targetWeight: Number(e.target.value) })} />
                  <Input label="目標日" type="date" value={profile.targetDate ?? ''}
                    onChange={(e) => setProfile({ ...profile, targetDate: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">性別</label>
                  <div className="flex gap-2">
                    {(['male', 'female', 'other'] as const).map((s) => (
                      <button key={s} onClick={() => setProfile({ ...profile, sex: s })}
                        className={`flex-1 py-2 text-xs rounded-xl border transition-colors ${profile.sex === s ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500'}`}>
                        {s === 'male' ? '男性' : s === 'female' ? '女性' : 'その他'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">活動量</label>
                  <select
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400"
                    value={profile.activityLevel}
                    onChange={(e) => setProfile({ ...profile, activityLevel: e.target.value as ProfileData['activityLevel'] })}
                  >
                    {Object.entries(ACTIVITY_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <Button fullWidth isLoading={profileSaving} onClick={handleSaveProfile}>
                  プロフィールを保存
                </Button>
              </div>
            )}
          </Card>
        </section>

        {/* Webhook URL */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Webhook (iOS ショートカット)</h2>
          <Card>
            <p className="text-xs text-gray-500 mb-2">歩数を自動送信する URL です</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-600 flex-1 truncate font-mono">{webhookUrl}</p>
              <button onClick={handleCopy} className="text-gray-400 flex-shrink-0">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {user?.webhookToken && (
              <p className="text-xs text-gray-400 mt-2">
                Token: <code className="bg-gray-100 px-1 rounded">{user.webhookToken}</code>
              </p>
            )}
          </Card>
        </section>

        {/* Change Password */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">パスワード変更</h2>
          <Card>
            <div className="space-y-3">
              <Input label="現在のパスワード" type="password" value={oldPw}
                onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
              <Input label="新しいパスワード" type="password" value={newPw}
                onChange={(e) => setNewPw(e.target.value)} hint="8文字以上" autoComplete="new-password" />
              <Button fullWidth variant="ghost" isLoading={changePwLoading} onClick={handleChangePassword}>
                パスワードを変更
              </Button>
            </div>
          </Card>
        </section>

        {/* Logout / Delete */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">アカウント</h2>
          <Card>
            <div className="space-y-3">
              <Button fullWidth variant="ghost" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>
                <LogOut className="w-4 h-4" />
                ログアウト
              </Button>
              <hr className="border-gray-100" />
              <p className="text-xs text-gray-400">アカウントとすべてのデータを完全に削除します</p>
              <Input
                label="確認のため現在のパスワードを入力"
                type={showDeletePw ? 'text' : 'password'}
                value={deletePw}
                onChange={(e) => setDeletePw(e.target.value)}
                rightElement={
                  <button type="button" onClick={() => setShowDeletePw((v) => !v)} className="text-gray-400">
                    {showDeletePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
              <Button fullWidth variant="danger" isLoading={deleteLoading} onClick={handleDeleteAccount}>
                <Trash2 className="w-4 h-4" />
                アカウントを削除
              </Button>
            </div>
          </Card>
        </section>

        <div className="h-4" />
      </div>
    </Layout>
  );
}
