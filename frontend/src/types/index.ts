export interface User {
  userUUID: string;
  loginId: string;
  token: string;
  webhookToken: string;
}

export interface ProfileData {
  height: number;
  targetWeight: number;
  targetDate: string;
  age: number;
  sex: 'male' | 'female' | 'other';
  activityLevel: 'low' | 'normal' | 'high';
}

export interface MealData {
  mealName: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
}

export interface MealRecord {
  recordId: string;
  timestamp: string;
  data: MealData;
}

export type ExerciseType = 'steps' | 'workout' | 'running';

export interface StepsData {
  type: 'steps';
  steps: number;
}

export interface WorkoutData {
  type: 'workout' | 'running';
  durationMinutes: number;
  caloriesBurned: number;
  memo?: string;
}

export type ExerciseData = StepsData | WorkoutData;

export interface ExerciseRecord {
  recordId: string;
  timestamp: string;
  exerciseType: ExerciseType;
  data: ExerciseData;
}

export interface WeightData {
  weight: number;
}

export interface WeightRecord {
  recordId: string;
  timestamp: string;
  data: WeightData;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  message: string;
  timestamp?: string;
  recordId?: string;
  localId?: string;
}

export interface DashboardData {
  date: string;
  intakeKcal: number;
  burnedKcal: number;
  balanceKcal: number;
  totalProtein?: number;
  totalFat?: number;
  totalCarb?: number;
  latestWeight: {
    recordId: string;
    timestamp: string;
    weight: number;
  } | null;
  streakDays: number;
}

// DailySummary — /api/summary が返す1日分のデータ
export interface DailySummaryItem {
  date: string;          // YYYY-MM-DD
  intakeKcal: number;
  burnedKcal: number;
  protein: number;
  fat: number;
  carb: number;
}

export interface WeightPoint {
  date: string;
  weight: number;
}

export interface SummaryResponse {
  from: string;
  to: string;
  summaries: DailySummaryItem[];
  weights: WeightPoint[];
}

export interface GeminiMealAnalysis {
  mealName: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  confidence: number;
}
