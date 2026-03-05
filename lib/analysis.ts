// lib/analysis.ts — Training load & race prep analysis

import type { Activity } from "./strava.js";
import { metersToKm, speedToPace, formatDuration } from "./strava.js";

// --- Training Stress Score (simplified, pace-based) ---

function estimateTSS(activity: Activity): number {
  if (activity.type !== "Run" && activity.sport_type !== "Run") return 0;
  const durationHours = activity.moving_time / 3600;
  const distanceKm = activity.distance / 1000;
  // Simplified: intensity factor based on pace vs threshold (assume 5:30/km threshold)
  const thresholdSpeedMps = 1000 / 330; // 5:30/km
  const if_ = Math.min(activity.average_speed / thresholdSpeedMps, 1.2);
  return Math.round(100 * durationHours * if_ * if_);
}

// --- CTL / ATL / TSB (Banister impulse-response) ---

export interface FitnessMetrics {
  ctl: number;  // Chronic Training Load (fitness, 42-day)
  atl: number;  // Acute Training Load (fatigue, 7-day)
  tsb: number;  // Training Stress Balance (form)
  status: string;
}

export function calcFitnessMetrics(activities: Activity[]): FitnessMetrics {
  // Sort oldest to newest
  const runs = activities
    .filter(a => a.type === "Run" || a.sport_type === "Run")
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  let ctl = 0;
  let atl = 0;
  const ctlDecay = 1 / 42;
  const atlDecay = 1 / 7;

  for (const run of runs) {
    const tss = estimateTSS(run);
    ctl = ctl + (tss - ctl) * ctlDecay;
    atl = atl + (tss - atl) * atlDecay;
  }

  const tsb = Math.round(ctl - atl);
  const ctlR = Math.round(ctl);
  const atlR = Math.round(atl);

  let status = "";
  if (tsb > 10) status = "🟢 Fresh — good form, ready to race";
  else if (tsb > 0) status = "🟡 Neutral — moderate fatigue, manageable";
  else if (tsb > -10) status = "🟠 Tired — accumulated fatigue, ease up";
  else status = "🔴 Overreached — need recovery";

  return { ctl: ctlR, atl: atlR, tsb, status };
}

// --- Weekly Summary ---

export interface WeeklySummary {
  weekLabel: string;
  runs: number;
  totalKm: number;
  totalTime: string;
  avgPace: string;
  avgHR?: number;
  longestRunKm: number;
}

export function getWeeklySummaries(activities: Activity[], weeks = 8): WeeklySummary[] {
  const runs = activities.filter(a => a.type === "Run" || a.sport_type === "Run");
  const summaries: WeeklySummary[] = [];

  for (let w = 0; w < weeks; w++) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - w * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const weekRuns = runs.filter(r => {
      const d = new Date(r.start_date);
      return d >= weekStart && d < weekEnd;
    });

    if (weekRuns.length === 0 && w > 0) continue;

    const totalDist = weekRuns.reduce((s, r) => s + r.distance, 0);
    const totalTime = weekRuns.reduce((s, r) => s + r.moving_time, 0);
    const avgSpeed = totalTime > 0 ? totalDist / totalTime : 0;
    const hrsWithHR = weekRuns.filter(r => r.average_heartrate);
    const avgHR = hrsWithHR.length > 0
      ? Math.round(hrsWithHR.reduce((s, r) => s + (r.average_heartrate ?? 0), 0) / hrsWithHR.length)
      : undefined;
    const longest = Math.max(...weekRuns.map(r => r.distance), 0);

    summaries.push({
      weekLabel: weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      runs: weekRuns.length,
      totalKm: metersToKm(totalDist),
      totalTime: formatDuration(totalTime),
      avgPace: speedToPace(avgSpeed),
      avgHR,
      longestRunKm: metersToKm(longest),
    });
  }

  return summaries.reverse();
}

// --- Race Prep: TCS 10K Target 65min ---

export interface RacePrepReport {
  targetPace: string;
  currentEstimatedPace: string;
  gapSeconds: number;
  readinessScore: number; // 0-100
  recentBest5kPace?: string;
  recentBest10kPace?: string;
  weeklyVolumeAvg: number;
  longRunMax: number;
  recommendations: string[];
}

export function getRacePrepReport(activities: Activity[], targetMinutes = 65): RacePrepReport {
  const TARGET_PACE_SEC = (targetMinutes * 60) / 10; // per km
  const targetPace = `${Math.floor(TARGET_PACE_SEC / 60)}:${(TARGET_PACE_SEC % 60).toString().padStart(2, "0")}/km`;

  const runs = activities
    .filter(a => (a.type === "Run" || a.sport_type === "Run"))
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  // Best recent pace from runs 5km+
  const qualifyingRuns = runs.filter(r => r.distance >= 5000).slice(0, 15);
  const bestPaceRun = qualifyingRuns.sort((a, b) => b.average_speed - a.average_speed)[0];
  const currentPaceSec = bestPaceRun ? 1000 / bestPaceRun.average_speed : TARGET_PACE_SEC + 60;
  const currentPace = speedToPace(bestPaceRun?.average_speed ?? 0);
  const gapSeconds = Math.round(currentPaceSec - TARGET_PACE_SEC);

  // Recent best by distance
  const best5k = runs.filter(r => r.distance >= 4800 && r.distance <= 5500)
    .sort((a, b) => b.average_speed - a.average_speed)[0];
  const best10k = runs.filter(r => r.distance >= 9500 && r.distance <= 10500)
    .sort((a, b) => b.average_speed - a.average_speed)[0];

  // Weekly volume avg (last 4 weeks)
  const summaries = getWeeklySummaries(activities, 4);
  const weeklyVolumeAvg = summaries.length > 0
    ? Math.round(summaries.reduce((s, w) => s + w.totalKm, 0) / summaries.length)
    : 0;

  const longRunMax = Math.max(...runs.slice(0, 20).map(r => r.distance), 0);

  // Readiness score
  let score = 50;
  if (gapSeconds <= 0) score += 30;
  else if (gapSeconds <= 15) score += 20;
  else if (gapSeconds <= 30) score += 10;
  else if (gapSeconds <= 60) score += 0;
  else score -= 10;

  if (weeklyVolumeAvg >= 40) score += 15;
  else if (weeklyVolumeAvg >= 30) score += 10;
  else if (weeklyVolumeAvg >= 20) score += 5;

  if (longRunMax >= 12000) score += 10;
  else if (longRunMax >= 10000) score += 5;

  score = Math.max(0, Math.min(100, score));

  // Recommendations
  const recs: string[] = [];
  if (gapSeconds > 30) recs.push(`⚡ Add 1 tempo run/week at target pace (${targetPace}) — currently ${Math.round(gapSeconds)}s/km off`);
  if (weeklyVolumeAvg < 30) recs.push(`📈 Build weekly volume to 35–40km (currently avg ${weeklyVolumeAvg}km)`);
  if (longRunMax < 12000) recs.push(`🏃 Include a 12–14km long run before taper`);
  if (gapSeconds <= 10) recs.push(`✅ Pace is on target — focus on race-day execution & nutrition`);
  recs.push(`🗓️ Begin taper 10 days before April 26 — reduce volume 30%, keep intensity`);
  recs.push(`☕ Test caffeine strategy on March 15 mock race`);

  return {
    targetPace,
    currentEstimatedPace: currentPace,
    gapSeconds,
    readinessScore: score,
    recentBest5kPace: best5k ? speedToPace(best5k.average_speed) : undefined,
    recentBest10kPace: best10k ? speedToPace(best10k.average_speed) : undefined,
    weeklyVolumeAvg,
    longRunMax: metersToKm(longRunMax),
    recommendations: recs,
  };
}
