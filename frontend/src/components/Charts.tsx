/**
 * 共通グラフコンポーネント群 (SVG のみ、外部ライブラリなし)
 *
 * エクスポート:
 *   CalorieGauge     - ホーム/履歴(日)用 半円ゲージ
 *   PFCChart         - ホーム/履歴(日)用 ドーナツ+凡例
 *   CalorieBarChart  - 週/月 用 カロリー棒グラフ
 *   PFCStackedBar    - 週/月 用 PFC スタック棒グラフ
 *   WeightLineChart  - 週/月 用 体重折れ線グラフ
 */

// ─────────────────────────────────────────────────────────────────────────────
// 共有ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/** YYYY-MM-DD → 短いラベル (数が多いほど短く) */
function axisDateLabel(dateKey: string, total: number): string {
  const d = new Date(dateKey + 'T12:00:00+09:00');
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (total <= 7) return `${m}/${day}`;
  if (total <= 14) return day % 2 === 0 ? `${day}` : '';
  return day % 5 === 1 || day === 1 ? `${day}` : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// CalorieGauge — 半円メーター（黒字/赤字）
// ─────────────────────────────────────────────────────────────────────────────

export interface CalorieGaugeProps {
  balance: number;
  /** 最大値（±max がゲージ端）デフォルト 1500kcal */
  max?: number;
  /** プライバシーモード: true のとき数値を隠す */
  isPrivate?: boolean;
}

export function CalorieGauge({ balance, max = 1500, isPrivate = false }: CalorieGaugeProps) {
  const cx = 120, cy = 82;
  const R = 68;
  const trackW = 10;
  const activeW = 5;

  const clamped = Math.max(-max, Math.min(max, balance));

  const thetaDeg = 90 - (clamped / max) * 90;
  const thetaRad = (thetaDeg * Math.PI) / 180;
  const nx = cx + R * Math.cos(thetaRad);
  const ny = cy - R * Math.sin(thetaRad);

  const lx = cx - R, ly = cy;
  const tx = cx,     ty = cy - R;
  const rx = cx + R, ry = cy;

  const fullArc  = `M ${lx} ${ly} A ${R} ${R} 0 0 1 ${rx} ${ry}`;
  const leftArc  = `M ${lx} ${ly} A ${R} ${R} 0 0 1 ${tx} ${ty}`;
  const rightArc = `M ${tx} ${ty} A ${R} ${R} 0 0 1 ${rx} ${ry}`;

  const arcD = clamped < 0
    ? `M ${tx} ${ty} A ${R} ${R} 0 0 0 ${nx} ${ny}`
    : `M ${tx} ${ty} A ${R} ${R} 0 0 1 ${nx} ${ny}`;

  const isBlack = clamped < -30;
  const isRed   = clamped >  30;
  // ANA sky blue (#00B5F0) for black zone, ANA deep (#233F9A) for neutral
  const color   = isBlack ? '#00B5F0' : isRed ? '#ef4444' : '#233F9A';
  const showArc = Math.abs(clamped) > 30;

  return (
    <div className="select-none">
      <svg
        viewBox="-18 -8 276 108"
        className="w-full mx-auto"
        aria-label={`カロリー収支 ${balance >= 0 ? '+' : ''}${balance}kcal`}
      >
        {/* 背景トラック */}
        <path d={fullArc} fill="none" stroke="#f3f4f6"
          strokeWidth={trackW} strokeLinecap="round" />

        {/* ゾーン淡色 — ANA sky tint for black zone */}
        <path d={leftArc}  fill="none" stroke="#e0f7fe"
          strokeWidth={trackW} strokeLinecap="butt" />
        <path d={rightArc} fill="none" stroke="#fff1f2"
          strokeWidth={trackW} strokeLinecap="butt" />

        {/* アクティブ弧 */}
        {showArc && (
          <path d={arcD} fill="none" stroke={color}
            strokeWidth={activeW} strokeLinecap="butt" opacity="0.9" />
        )}

        {/* ±0 目盛り */}
        <line x1={tx} y1={ty + 2} x2={tx} y2={ty + trackW - 2}
          stroke="#d1d5db" strokeWidth="1.2" />

        {/* 針 */}
        <line x1={cx} y1={cy} x2={nx} y2={ny}
          stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3.5" fill="white" stroke={color} strokeWidth="1.8" />

        {/* ゾーンラベル */}
        <text x={lx - 6} y={ly - 3} textAnchor="end"
          fontSize="9" fontWeight="600" fill="#00B5F0">黒字</text>
        <text x={lx - 6} y={ly + 7} textAnchor="end"
          fontSize="7" fill="#7dd3e8">不足</text>
        <text x={tx} y={ty - 4} textAnchor="middle"
          fontSize="7" fill="#d1d5db">±0</text>
        <text x={rx + 6} y={ry - 3} textAnchor="start"
          fontSize="9" fontWeight="600" fill="#f87171">赤字</text>
        <text x={rx + 6} y={ry + 7} textAnchor="start"
          fontSize="7" fill="#fca5a5">過多</text>

        {/* max ラベル */}
        <text x={lx - 6} y={ly + 17} textAnchor="end"
          fontSize="6" fill="#e5e7eb">{(-max).toLocaleString()}</text>
        <text x={rx + 6} y={ry + 17} textAnchor="start"
          fontSize="6" fill="#e5e7eb">+{max.toLocaleString()}</text>
      </svg>

      {/* バランス数値 — SVG外のHTMLで表示（スケーラブルでモダン） */}
      <div className="-mt-1 text-center pb-1">
        {isPrivate ? (
          <p className="text-base font-bold text-gray-300 tracking-[0.3em]">●●●</p>
        ) : (
          <p className="text-base font-bold tabular-nums" style={{ color }}>
            {balance >= 0 ? '+' : ''}{balance.toLocaleString()}
          </p>
        )}
        <p className="text-[9px] text-gray-400 tracking-widest mt-0.5">kcal 収支</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PFCChart — ドーナツ + 凡例バー
// ─────────────────────────────────────────────────────────────────────────────

export interface PFCChartProps {
  protein: number;
  fat: number;
  carb: number;
}

const PFC_COLORS = { P: '#3b82f6', F: '#f59e0b', C: '#f97316' } as const;
const PFC_IDEALS = { P: '15–25%', F: '20–30%', C: '50–65%' } as const;

export function PFCChart({ protein, fat, carb }: PFCChartProps) {
  const r = 38, sw = 17;
  const C = 2 * Math.PI * r;
  const cx = 52, cy = 52;

  const pKcal = protein * 4;
  const fKcal = fat * 9;
  const cKcal = carb * 4;
  const total = pKcal + fKcal + cKcal;

  if (total === 0) {
    return (
      <p className="text-center text-sm text-gray-400 py-4">
        食事を記録するとPFCバランスが表示されます
      </p>
    );
  }

  const pFrac = pKcal / total;
  const fFrac = fKcal / total;
  const pLen = pFrac * C;
  const fLen = fFrac * C;
  const cLen = C - pLen - fLen;

  const pPct = Math.round(pFrac * 100);
  const fPct = Math.round(fFrac * 100);
  const cPct = 100 - pPct - fPct;

  const rows: { key: keyof typeof PFC_COLORS; label: string; g: number; pct: number }[] = [
    { key: 'P', label: '蛋白質',   g: protein, pct: pPct },
    { key: 'F', label: '脂質',     g: fat,     pct: fPct },
    { key: 'C', label: '炭水化物', g: carb,    pct: cPct },
  ];

  return (
    <div className="flex items-center gap-4">
      {/* ドーナツ */}
      <svg viewBox="0 0 104 104" className="w-24 h-24 flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={PFC_COLORS.P} strokeWidth={sw}
          strokeDasharray={`${pLen} ${C - pLen}`} strokeDashoffset={0}
          transform={`rotate(-90 ${cx} ${cy})`} />
        {fLen > 0.1 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={PFC_COLORS.F} strokeWidth={sw}
            strokeDasharray={`${fLen} ${C - fLen}`} strokeDashoffset={-pLen}
            transform={`rotate(-90 ${cx} ${cy})`} />
        )}
        {cLen > 0.1 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={PFC_COLORS.C} strokeWidth={sw}
            strokeDasharray={`${cLen} ${C - cLen}`} strokeDashoffset={-(pLen + fLen)}
            transform={`rotate(-90 ${cx} ${cy})`} />
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="600">PFC</text>
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize="8" fill="#9ca3af">{Math.round(total)}kcal</text>
      </svg>

      {/* 凡例バー */}
      <div className="flex-1 space-y-2">
        {rows.map(({ key, label, g, pct }) => (
          <div key={key}>
            <div className="flex justify-between items-baseline mb-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: PFC_COLORS[key] }} />
                <span className="text-[11px] font-semibold text-gray-700">{key} {label}</span>
              </div>
              <span className="text-[11px] text-gray-500">
                {g}g&nbsp;
                <span className="font-bold" style={{ color: PFC_COLORS[key] }}>{pct}%</span>
              </span>
            </div>
            <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(pct, 100)}%`, background: PFC_COLORS[key] }} />
            </div>
            <p className="text-[9px] text-gray-400 mt-0.5">目安 {PFC_IDEALS[key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// データ型
// ─────────────────────────────────────────────────────────────────────────────

export interface DaySummary {
  date: string;       // YYYY-MM-DD
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

// ─────────────────────────────────────────────────────────────────────────────
// CalorieBarChart — 摂取/消費 棒グラフ (週/月ビュー)
// ─────────────────────────────────────────────────────────────────────────────

export function CalorieBarChart({ data }: { data: DaySummary[] }) {
  if (data.length === 0) {
    return (
      <p className="text-center text-sm text-gray-400 py-6">データがありません</p>
    );
  }

  const W = 320, H = 155;
  const ml = 38, mr = 8, mt = 14, mb = 28;
  const cw = W - ml - mr;
  const ch = H - mt - mb;

  const maxKcal = Math.max(...data.map(d => Math.max(d.intakeKcal, d.burnedKcal)), 300);
  const yMax = Math.ceil(maxKcal / 200) * 200;

  const groupW = cw / data.length;
  const barW = Math.max(3, Math.min(14, groupW * 0.33));
  const gap = Math.max(1, barW * 0.25);

  const toY = (v: number) => mt + ch - (v / yMax) * ch;
  const yTicks = [0, yMax / 2, yMax];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* グリッド + Y軸ラベル */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={ml} y1={toY(v)} x2={W - mr} y2={toY(v)}
            stroke="#f3f4f6" strokeWidth="1" />
          <text x={ml - 3} y={toY(v) + 4} textAnchor="end" fontSize="8" fill="#9ca3af">
            {v > 0 ? `${Math.round(v / 100) * 100}` : '0'}
          </text>
        </g>
      ))}

      {/* X軸ライン */}
      <line x1={ml} y1={mt + ch} x2={W - mr} y2={mt + ch}
        stroke="#e5e7eb" strokeWidth="1" />

      {/* バー */}
      {data.map((d, i) => {
        const cx = ml + (i + 0.5) * groupW;
        const iH = Math.max(1, (d.intakeKcal / yMax) * ch);
        const bH = Math.max(d.burnedKcal > 0 ? 1 : 0, (d.burnedKcal / yMax) * ch);
        const label = axisDateLabel(d.date, data.length);
        return (
          <g key={d.date}>
            {/* 摂取 (橙) */}
            <rect x={cx - barW - gap / 2} y={toY(d.intakeKcal)}
              width={barW} height={iH} fill="#f97316" rx="1.5" />
            {/* 消費 (青) */}
            {d.burnedKcal > 0 && (
              <rect x={cx + gap / 2} y={toY(d.burnedKcal)}
                width={barW} height={bH} fill="#3b82f6" rx="1.5" />
            )}
            {/* X軸ラベル */}
            {label && (
              <text x={cx} y={H - mb + 10} textAnchor="middle" fontSize="8" fill="#9ca3af">
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* 凡例 */}
      <rect x={W - mr - 62} y={2} width={7} height={7} fill="#f97316" rx="1" />
      <text x={W - mr - 53} y={9} fontSize="8" fill="#6b7280">摂取</text>
      <rect x={W - mr - 32} y={2} width={7} height={7} fill="#3b82f6" rx="1" />
      <text x={W - mr - 23} y={9} fontSize="8" fill="#6b7280">消費</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PFCStackedBar — PFCスタック棒グラフ (週/月ビュー)
// ─────────────────────────────────────────────────────────────────────────────

export function PFCStackedBar({ data }: { data: DaySummary[] }) {
  if (data.length === 0) return null;

  const W = 320, H = 130;
  const ml = 38, mr = 8, mt = 14, mb = 28;
  const cw = W - ml - mr;
  const ch = H - mt - mb;

  // 各日の PFC kcal
  const pfcKcal = data.map(d => ({
    date: d.date,
    p: d.protein * 4,
    f: d.fat * 9,
    c: d.carb * 4,
    total: d.protein * 4 + d.fat * 9 + d.carb * 4,
  }));

  const maxTotal = Math.max(...pfcKcal.map(d => d.total), 200);
  const yMax = Math.ceil(maxTotal / 200) * 200;
  const barW = Math.max(4, Math.min(22, (cw / data.length) * 0.65));

  const toY = (v: number) => mt + ch - (v / yMax) * ch;
  const yTicks = [0, yMax / 2, yMax];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {yTicks.map(v => (
        <g key={v}>
          <line x1={ml} y1={toY(v)} x2={W - mr} y2={toY(v)}
            stroke="#f3f4f6" strokeWidth="1" />
          <text x={ml - 3} y={toY(v) + 4} textAnchor="end" fontSize="8" fill="#9ca3af">
            {v > 0 ? `${Math.round(v / 100) * 100}` : '0'}
          </text>
        </g>
      ))}
      <line x1={ml} y1={mt + ch} x2={W - mr} y2={mt + ch}
        stroke="#e5e7eb" strokeWidth="1" />

      {pfcKcal.map((d, i) => {
        const cx = ml + (i + 0.5) * (cw / data.length);
        const x = cx - barW / 2;
        const pH = (d.p / yMax) * ch;
        const fH = (d.f / yMax) * ch;
        const cH = (d.c / yMax) * ch;
        const label = axisDateLabel(d.date, data.length);
        // スタック: C(底) → F → P(上)
        const cY = toY(d.c);
        const fY = toY(d.c + d.f);
        const pY = toY(d.c + d.f + d.p);
        return (
          <g key={d.date}>
            {cH > 0.5 && <rect x={x} y={cY} width={barW} height={cH} fill="#f97316" rx="1" />}
            {fH > 0.5 && <rect x={x} y={fY} width={barW} height={fH} fill="#f59e0b" />}
            {pH > 0.5 && <rect x={x} y={pY} width={barW} height={pH} fill="#3b82f6"
              rx="1" style={{ borderTopLeftRadius: '1px', borderTopRightRadius: '1px' }} />}
            {label && (
              <text x={cx} y={H - mb + 10} textAnchor="middle" fontSize="8" fill="#9ca3af">
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* 凡例 */}
      <rect x={W - mr - 72} y={2} width={7} height={7} fill="#3b82f6" rx="1" />
      <text x={W - mr - 63} y={9} fontSize="8" fill="#6b7280">P</text>
      <rect x={W - mr - 55} y={2} width={7} height={7} fill="#f59e0b" rx="1" />
      <text x={W - mr - 46} y={9} fontSize="8" fill="#6b7280">F</text>
      <rect x={W - mr - 38} y={2} width={7} height={7} fill="#f97316" rx="1" />
      <text x={W - mr - 29} y={9} fontSize="8" fill="#6b7280">C</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WeightLineChart — 体重折れ線グラフ
// ─────────────────────────────────────────────────────────────────────────────

export function WeightLineChart({ weights }: { weights: WeightPoint[] }) {
  if (weights.length === 0) {
    return (
      <p className="text-center text-sm text-gray-400 py-4">体重の記録がありません</p>
    );
  }

  const W = 320, H = 130;
  const ml = 40, mr = 10, mt = 14, mb = 28;
  const cw = W - ml - mr;
  const ch = H - mt - mb;

  const wVals = weights.map(w => w.weight);
  const wMin = Math.floor(Math.min(...wVals) * 2) / 2 - 0.5;
  const wMax = Math.ceil(Math.max(...wVals) * 2) / 2 + 0.5;
  const wRange = wMax - wMin || 1;

  const toX = (i: number) =>
    weights.length === 1 ? ml + cw / 2 : ml + (i / (weights.length - 1)) * cw;
  const toY = (w: number) => mt + ch - ((w - wMin) / wRange) * ch;

  const pathD = weights.map((w, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(w.weight).toFixed(1)}`
  ).join(' ');

  // Y軸目盛り (3本)
  const yMid = (wMin + wMax) / 2;
  const yTicks = [wMin, yMid, wMax].map(v => ({
    v: Math.round(v * 10) / 10,
    y: toY(v),
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {yTicks.map(t => (
        <g key={t.v}>
          <line x1={ml} y1={t.y} x2={W - mr} y2={t.y}
            stroke="#f3f4f6" strokeWidth="1" />
          <text x={ml - 3} y={t.y + 4} textAnchor="end" fontSize="8" fill="#9ca3af">
            {t.v}
          </text>
        </g>
      ))}
      <line x1={ml} y1={mt + ch} x2={W - mr} y2={mt + ch}
        stroke="#e5e7eb" strokeWidth="1" />

      {/* 折れ線 */}
      <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />

      {/* データ点 */}
      {weights.map((w, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(w.weight)} r="3.5" fill="#f97316" />
          {/* 最新値ラベル */}
          {i === weights.length - 1 && (
            <text x={toX(i)} y={toY(w.weight) - 7} textAnchor="middle"
              fontSize="9" fill="#f97316" fontWeight="bold">
              {w.weight}kg
            </text>
          )}
        </g>
      ))}

      {/* X軸ラベル */}
      {weights.map((w, i) => {
        const label = axisDateLabel(w.date, weights.length);
        return label ? (
          <text key={i} x={toX(i)} y={H - mb + 10}
            textAnchor="middle" fontSize="8" fill="#9ca3af">
            {label}
          </text>
        ) : null;
      })}
    </svg>
  );
}
