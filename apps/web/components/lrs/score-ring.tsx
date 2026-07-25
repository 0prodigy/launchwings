// T4 — three concentric arcs (one per LRS stage). Stage 1 is active in this
// PR; Stage 2/3 render as muted background tracks until LRC-04+. Score
// thresholds and tone classes mirror `verdictFor` in audit-results-panel.tsx
// (≥80 emerald, ≥50 amber, else red) so the scorecard reads consistently with
// the anonymous /audit demo.

import { cn } from "@/lib/cn";

type Props = {
  stage1Score: number | null;
  stage2Score?: number | null;
  stage3Score?: number | null;
  className?: string;
};

const SIZE = 180;
const STROKE = 10;
const GAP = 4;

// outer = stage 1 (the only one with real data today); inner rings are stage 2
// then stage 3 as we move toward the centre.
const RADII = [
  SIZE / 2 - STROKE / 2,
  SIZE / 2 - STROKE / 2 - (STROKE + GAP),
  SIZE / 2 - STROKE / 2 - 2 * (STROKE + GAP),
];

function toneFor(score: number | null | undefined): string {
  if (score == null) return "stroke-white/10";
  if (score >= 80) return "stroke-emerald-400";
  if (score >= 50) return "stroke-amber-400";
  return "stroke-red-400";
}

function textToneFor(score: number | null | undefined): string {
  if (score == null) return "text-[color:var(--color-muted)]";
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function Arc({
  radius,
  score,
}: {
  radius: number;
  score: number | null | undefined;
}) {
  const circumference = 2 * Math.PI * radius;
  const fraction = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const dash = circumference * fraction;
  const tone = toneFor(score);

  return (
    <>
      {/* track */}
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={radius}
        className="stroke-white/5"
        strokeWidth={STROKE}
        fill="none"
      />
      {score != null ? (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          className={tone}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${circumference - dash}`}
          // start at 12 o'clock, sweep clockwise
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      ) : null}
    </>
  );
}

export function ScoreRing({
  stage1Score,
  stage2Score = null,
  stage3Score = null,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Arc radius={RADII[0]!} score={stage1Score} />
        <Arc radius={RADII[1]!} score={stage2Score} />
        <Arc radius={RADII[2]!} score={stage3Score} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "text-4xl font-semibold tracking-tight tabular-nums",
            textToneFor(stage1Score),
          )}
        >
          {stage1Score == null ? "—" : stage1Score}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-muted)]">
          Stage 1 / 100
        </span>
      </div>
    </div>
  );
}
