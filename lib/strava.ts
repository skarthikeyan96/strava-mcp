// lib/strava.ts — Strava API client with auto token refresh

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface Activity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;         // meters
  moving_time: number;      // seconds
  elapsed_time: number;     // seconds
  total_elevation_gain: number;
  average_speed: number;    // m/s
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  suffer_score?: number;
  map?: { summary_polyline: string };
}

export interface ActivityDetail extends Activity {
  laps?: Lap[];
  splits_metric?: Split[];
  segment_efforts?: SegmentEffort[];
}

export interface Lap {
  lap_index: number;
  distance: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
}

export interface Split {
  split: number;
  distance: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
  elevation_difference: number;
}

export interface SegmentEffort {
  name: string;
  distance: number;
  moving_time: number;
  average_heartrate?: number;
  pr_rank?: number;
}

// --- Token Management ---
// Set STRAVA_ACCESS_TOKEN for quick testing (expires in 6h).
// For production, use STRAVA_CLIENT_ID + CLIENT_SECRET + REFRESH_TOKEN
// which auto-refreshes indefinitely.

let cachedTokens: StravaTokens | null = null;

async function getValidAccessToken(): Promise<string> {
  const staticToken = process.env.STRAVA_ACCESS_TOKEN;
  if (staticToken) return staticToken;

  const now = Math.floor(Date.now() / 1000);

  if (cachedTokens && cachedTokens.expires_at > now + 300) {
    return cachedTokens.access_token;
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refreshToken = cachedTokens?.refresh_token ?? process.env.STRAVA_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Strava credentials. Set STRAVA_ACCESS_TOKEN, or all three of " +
      "STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN.",
    );
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as StravaTokens;
  cachedTokens = data;
  return data.access_token;
}

// --- API Helpers ---

async function stravaFetch<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const token = await getValidAccessToken();
  const url = new URL(`https://www.strava.com/api/v3${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Strava API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// --- Public API ---

export async function getActivities(perPage = 30, page = 1): Promise<Activity[]> {
  return stravaFetch<Activity[]>("/athlete/activities", { per_page: perPage, page });
}

export async function getActivityDetail(id: number): Promise<ActivityDetail> {
  return stravaFetch<ActivityDetail>(`/activities/${id}`);
}

export async function getActivityStreams(id: number): Promise<Record<string, { data: number[] }>> {
  return stravaFetch(`/activities/${id}/streams`, {
    keys: "time,distance,heartrate,cadence,velocity_smooth,altitude",
    key_by_type: "true",
  });
}

export async function getAthleteStats(): Promise<Record<string, unknown>> {
  const athlete = await stravaFetch<{ id: number }>("/athlete");
  return stravaFetch(`/athletes/${athlete.id}/stats`);
}

// --- Utility Formatters ---

export function metersToKm(m: number): number {
  return Math.round((m / 1000) * 100) / 100;
}

export function speedToPace(mps: number): string {
  if (!mps || mps === 0) return "N/A";
  const secPerKm = 1000 / mps;
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}
