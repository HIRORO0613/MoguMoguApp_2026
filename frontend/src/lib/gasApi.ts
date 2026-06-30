/**
 * GAS Web App API クライアント
 *
 * CORS 対策:
 *   - GET : クエリパラメータのみ、カスタムヘッダーなし → simple request
 *   - POST: body を生テキスト (Content-Type 未指定 → text/plain) → preflight なし
 *   - Authorization ヘッダーの代わりに ?token= クエリパラメータでトークンを送信
 *   - PUT / DELETE は POST + body._method でトンネリング
 */

import type {
  DashboardData,
  MealData,
  WeightData,
  ExerciseType,
  ExerciseData,
  ProfileData,
  SummaryResponse,
} from '../types';

const GAS_URL = import.meta.env.VITE_GAS_API_URL;

export class GasApiError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
    this.name = 'GasApiError';
  }
}

const TIMEOUT_MS = 30_000; // GAS コールドスタートを考慮して30秒

type Params = Record<string, string | undefined>;
type Body = Record<string, unknown>;

/** タイムアウト付き fetch */
async function fetchWithTimeout(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new GasApiError(408, 'リクエストがタイムアウトしました。GASのセットアップが完了しているか確認してください。');
    }
    throw new GasApiError(0, 'ネットワークエラー: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    clearTimeout(timer);
  }
}

/** レスポンスを安全に JSON パース（HTML エラーページ対策） */
async function safeJson<T>(res: Response): Promise<{ error?: string; status?: number } & T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as { error?: string; status?: number } & T;
  } catch {
    // GAS が HTML エラーページを返した場合
    const preview = text.slice(0, 200).replace(/<[^>]+>/g, '').trim();
    throw new GasApiError(
      res.status,
      `GASから予期しないレスポンスが返りました (${res.status})。\nGASのデプロイ設定・Script Propertiesを確認してください。\n内容: ${preview}`
    );
  }
}

async function gasGet<T>(path: string, params?: Params, token?: string | null): Promise<T> {
  const url = new URL(GAS_URL);
  url.searchParams.set('path', path);
  if (token) url.searchParams.set('token', token);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }
  const res = await fetchWithTimeout(url.toString());
  const data = await safeJson<T>(res);
  if (data.error) throw new GasApiError(data.status ?? 400, data.error);
  return data;
}

async function gasPost<T>(
  path: string,
  body: Body,
  token?: string | null,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST'
): Promise<T> {
  const url = new URL(GAS_URL);
  url.searchParams.set('path', path);
  if (token) url.searchParams.set('token', token);

  const payload: Body = { ...body };
  if (method !== 'POST') payload._method = method;
  // token を body にも含める (GAS 側の body.token フォールバック用・全バージョン互換)
  if (token) payload.token = token;

  // Content-Type ヘッダーを明示しない → ブラウザは text/plain を送信 → CORS preflight なし
  const res = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = await safeJson<T>(res);
  if (data.error) throw new GasApiError(data.status ?? 400, data.error);
  return data;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthResult {
  userUUID: string;
  loginId: string;
  token: string;
  webhookToken: string;
}

export const register = (loginId: string, password: string) =>
  gasPost<AuthResult>('/api/auth/register', { loginId, password });

export const login = (loginId: string, password: string) =>
  gasPost<AuthResult>('/api/auth/login', { loginId, password });

export const refresh = (token: string) =>
  gasPost<{ token: string; expiresInDays: number }>('/api/auth/refresh', {}, token);

export const changePassword = (token: string, oldPassword: string, newPassword: string) =>
  gasPost<{ token: string; tokenVersion: number }>(
    '/api/auth/change-password',
    { oldPassword, newPassword },
    token
  );

export const deleteAccount = (token: string, password: string) =>
  gasPost<{ success: boolean }>('/api/account', { password }, token, 'DELETE');

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const getDashboard = (token: string, date?: string) =>
  gasGet<DashboardData>('/api/dashboard', date ? { date } : {}, token);

export const getSummary = (token: string, from: string, to: string) =>
  gasGet<SummaryResponse>('/api/summary', { from, to }, token);

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface ProfileResponse {
  recordId?: string;
  profile: ProfileData | null;
}

export const getProfile = (token: string) =>
  gasGet<ProfileResponse>('/api/profile', {}, token);

export const updateProfile = (token: string, profile: ProfileData) =>
  gasPost<{ recordId: string; profile: ProfileData }>('/api/profile', { profile }, token, 'PUT');

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export interface MealItem {
  recordId: string;
  timestamp: string;
  data: MealData;
}

export const getMeals = (token: string, startDate: string, endDate: string) =>
  gasGet<{ items: MealItem[] }>('/api/meals', { start_date: startDate, end_date: endDate }, token);

export const addMeal = (token: string, timestamp: string, data: MealData) =>
  gasPost<MealItem>('/api/meals', { timestamp, data }, token);

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export interface WeightItem {
  recordId: string;
  timestamp: string;
  data: WeightData;
}

export const getWeights = (token: string, startDate: string, endDate: string) =>
  gasGet<{ items: WeightItem[] }>(
    '/api/weights',
    { start_date: startDate, end_date: endDate },
    token
  );

export const addWeight = (token: string, timestamp: string, weight: number) =>
  gasPost<WeightItem>('/api/weights', { timestamp, data: { weight } }, token);

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export interface ExerciseItem {
  recordId: string;
  timestamp: string;
  exerciseType: ExerciseType;
  data: ExerciseData;
}

export const getExercises = (token: string, startDate: string, endDate: string) =>
  gasGet<{ items: ExerciseItem[] }>(
    '/api/exercises',
    { start_date: startDate, end_date: endDate },
    token
  );

export const addExercise = (
  token: string,
  timestamp: string,
  exerciseType: ExerciseType,
  data: ExerciseData
) => gasPost<ExerciseItem>('/api/exercises', { timestamp, exerciseType, data }, token);

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const saveChat = (token: string, role: 'user' | 'assistant', message: string) =>
  gasPost<{ recordId: string; timestamp: string }>(
    '/api/chat',
    { timestamp: new Date().toISOString(), data: { role, message } },
    token
  );
