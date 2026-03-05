# Strava MCP Server

A remote MCP server for Claude that connects to Strava. Built with Vercel Edge Functions + TypeScript.

## Tools Available

| Tool | Description |
|---|---|
| `get_recent_activities` | Fetch recent runs with pace, HR, distance |
| `analyze_training_load` | CTL / ATL / TSB fitness metrics |
| `race_prep_summary` | TCS 10K readiness vs 65min target |
| `weekly_summary` | Weekly volume, pace, consistency |
| `get_activity_detail` | Splits, laps, segments for one activity |
| `get_athlete_stats` | All-time Strava stats |
| `get_activity_streams` | Raw HR, pace, cadence time-series |

## Setup

### 1. Clone & install

```bash
git clone <your-repo>
cd strava-mcp
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your Strava credentials:
- `STRAVA_CLIENT_ID` — from strava.com/settings/api
- `STRAVA_CLIENT_SECRET` — from strava.com/settings/api  
- `STRAVA_REFRESH_TOKEN` — from your RunStats OAuth flow

### 3. Deploy to Vercel

```bash
npx vercel deploy
```

Then add your env vars in the Vercel dashboard under **Settings → Environment Variables**.

### 4. Connect to Claude

In Claude.ai, go to **Settings → Integrations → Add MCP Server** and enter:

```
https://your-project.vercel.app/api/mcp
```

## Local Development

```bash
npx vercel dev
```

Server runs at `http://localhost:3000/api/mcp`

## Getting Your Refresh Token

If you have the RunStats app, find the refresh token in your OAuth callback response.  
Alternatively, use the [Strava OAuth playground](https://www.strava.com/oauth/authorize) with scopes:
```
activity:read_all,profile:read_all
```
