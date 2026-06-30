import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { GasApiError } from '../lib/gasApi';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    loginId?: string;
    password?: string;
    confirm?: string;
  }>({});

  const validate = () => {
    const e: typeof errors = {};
    const id = loginId.trim().toLowerCase();
    if (!id) {
      e.loginId = 'ログインIDを入力してください';
    } else if (!/^[a-z0-9_]{3,32}$/.test(id)) {
      e.loginId = '3〜32文字の英数字・アンダースコアのみ使用できます';
    }
    if (!password) {
      e.password = 'パスワードを入力してください';
    } else if (password.length < 8) {
      e.password = '8文字以上で設定してください';
    }
    if (password !== confirm) {
      e.confirm = 'パスワードが一致しません';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      await register(loginId.trim().toLowerCase(), password);
      toast.success('アカウントを作成しただモグ！');
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof GasApiError && e.code === 409) {
        setErrors((prev) => ({ ...prev, loginId: 'このIDはすでに使われています' }));
      } else if (e instanceof GasApiError && e.code === 408) {
        toast.error('接続がタイムアウトしました。GASのデプロイ設定を確認してください。', { duration: 6000 });
      } else if (e instanceof GasApiError && e.code === 0) {
        toast.error('GASに接続できませんでした。VITE_GAS_API_URLを確認してください。', { duration: 6000 });
      } else {
        toast.error(e instanceof Error ? e.message : '登録に失敗しました', { duration: 6000 });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-neutral-50 flex flex-col items-center justify-center px-6 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="text-6xl mb-2">🦔</div>
        <h1 className="text-2xl font-bold text-gray-900">新規登録</h1>
        <p className="text-sm text-gray-500 mt-1">一緒に健康管理を始めるだモグ！</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <Input
          label="ログインID"
          placeholder="英数字・アンダースコア (3〜32文字)"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          hint="英小文字・数字・_ で 3〜32文字"
          error={errors.loginId}
        />
        <Input
          label="パスワード"
          type={showPw ? 'text' : 'password'}
          placeholder="8文字以上"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint="8文字以上"
          error={errors.password}
          rightElement={
            <button type="button" onClick={() => setShowPw((v) => !v)} className="text-gray-400">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />
        <Input
          label="パスワード（確認）"
          type={showPw ? 'text' : 'password'}
          placeholder="もう一度入力"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          error={errors.confirm}
        />
        <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
          アカウントを作成
        </Button>
      </form>

      <p className="mt-6 text-sm text-gray-500">
        すでにアカウントをお持ちの方は{' '}
        <Link to="/login" className="text-orange-500 font-medium underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
