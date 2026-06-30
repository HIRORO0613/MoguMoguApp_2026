import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { GasApiError } from '../lib/gasApi';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ loginId?: string; password?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!loginId.trim()) e.loginId = 'ログインIDを入力してください';
    if (!password) e.password = 'パスワードを入力してください';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      await login(loginId.trim(), password);
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof GasApiError && e.code === 401) {
        toast.error('IDまたはパスワードが違います');
      } else if (e instanceof GasApiError && e.code === 408) {
        toast.error('接続がタイムアウトしました。GASのデプロイ設定を確認してください。', { duration: 6000 });
      } else if (e instanceof GasApiError && e.code === 0) {
        toast.error('GASに接続できませんでした。VITE_GAS_API_URLを確認してください。', { duration: 6000 });
      } else {
        toast.error(e instanceof Error ? e.message : 'ログインに失敗しました', { duration: 6000 });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-neutral-50 flex flex-col items-center justify-center px-6 max-w-md mx-auto">
      {/* Logo */}
      <div className="text-center mb-10">
        <div className="text-7xl mb-3">🦔</div>
        <h1 className="text-3xl font-bold text-gray-900">MoguMogu</h1>
        <p className="text-sm text-gray-500 mt-1">健康管理をもっと楽しく</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <Input
          label="ログインID"
          placeholder="英数字・アンダースコア (3〜32文字)"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          error={errors.loginId}
        />
        <Input
          label="パスワード"
          type={showPw ? 'text' : 'password'}
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          error={errors.password}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="text-gray-400"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />
        <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
          ログイン
        </Button>
      </form>

      <p className="mt-6 text-sm text-gray-500">
        アカウントをお持ちでない方は{' '}
        <Link to="/register" className="text-orange-500 font-medium underline">
          新規登録
        </Link>
      </p>
    </div>
  );
}
