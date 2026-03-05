import {
  getActivities,
  getActivityDetail,
  getActivityStreams,
  getAthleteStats,
  metersToKm,
  speedToPace,
  formatDuration,
  formatDate,
} from "../lib/strava.js";
import {
  calcFitnessMetrics,
  getWeeklySummaries,
  getRacePrepReport,
} from "../lib/analysis.js";

export const config = { runtime: "edge" };

// --- MCP Tool Definitions ---

const TOOLS = [
  {
    name: "get_recent_activities",
    description: "Fetch recent Strava runs with pace, distance, HR, and elevation. Use to get an overview of training.",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of activities to fetch (default 20, max 50)" },
        type: { type: "string", description: "Filter by type: Run, Ride, Walk (default: Run)" },
      },
    },
  },
  {
    name: "analyze_training_load",
    description: "Calculate CTL (fitness), ATL (fatigue), TSB (form) using Banister model. Shows current training stress and recovery status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "race_prep_summary",
    description: "Generate TCS World 10K race readiness report vs 65-minute target. Shows pace gap, readiness score, and recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        target_minutes: { type: "number", description: "Race time target in minutes (default: 65)" },
      },
    },
  },
  {
    name: "weekly_summary",
    description: "Get weekly training summaries: volume, pace, HR, consistency over last N weeks.",
    inputSchema: {
      type: "object",
      properties: {
        weeks: { type: "number", description: "Number of weeks to show (default: 8)" },
      },
    },
  },
  {
    name: "get_activity_detail",
    description: "Get detailed info for a specific activity including laps, splits, and segments.",
    inputSchema: {
      type: "object",
      required: ["activity_id"],
      properties: {
        activity_id: { type: "number", description: "Strava activity ID" },
      },
    },
  },
  {
    name: "get_athlete_stats",
    description: "Get all-time and recent Strava athlete stats: total distance, runs, PRs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_activity_streams",
    description: "Get raw time-series streams for an activity: HR, pace, cadence, altitude.",
    inputSchema: {
      type: "object",
      required: ["activity_id"],
      properties: {
        activity_id: { type: "number", description: "Strava activity ID" },
      },
    },
  },
];

// --- Tool Handlers ---

async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "get_recent_activities": {
      const count = Math.min(Number(args.count ?? 20), 50);
      const activities = await getActivities(count);
      const typeFilter = String(args.type ?? "Run");
      const filtered = activities.filter(a =>
        typeFilter === "all" || a.type === typeFilter || a.sport_type === typeFilter
      );
      const lines = filtered.map(a => [
        `📍 **${a.name}** (${formatDate(a.start_date)})`,
        `  Distance: ${metersToKm(a.distance)}km | Time: ${formatDuration(a.moving_time)}`,
        `  Pace: ${speedToPace(a.average_speed)} | Elevation: ${Math.round(a.total_elevation_gain)}m`,
        a.average_heartrate ? `  Avg HR: ${Math.round(a.average_heartrate)}bpm` : "",
        a.suffer_score ? `  Suffer Score: ${a.suffer_score}` : "",
        `  ID: ${a.id}`,
      ].filter(Boolean).join("\n"));
      return `## Recent ${typeFilter}s (${filtered.length})\n\n${lines.join("\n\n")}`;
    }

    case "analyze_training_load": {
      const activities = await getActivities(50);
      const metrics = calcFitnessMetrics(activities);
      return [
        "## Training Load Analysis",
        "",
        `**CTL (Fitness / 42-day load):** ${metrics.ctl}`,
        `**ATL (Fatigue / 7-day load):** ${metrics.atl}`,
        `**TSB (Form = CTL - ATL):** ${metrics.tsb > 0 ? "+" : ""}${metrics.tsb}`,
        "",
        `**Status:** ${metrics.status}`,
        "",
        "### Interpretation",
        "- CTL > 50: Good aerobic base",
        "- TSB -10 to +10: Optimal race window",
        "- TSB < -20: Too fatigued to race well",
      ].join("\n");
    }

    case "race_prep_summary": {
      const targetMinutes = Number(args.target_minutes ?? 65);
      const activities = await getActivities(50);
      const report = getRacePrepReport(activities, targetMinutes);
      const gapStr = report.gapSeconds > 0
        ? `🔴 ${report.gapSeconds}s/km behind target`
        : `🟢 ${Math.abs(report.gapSeconds)}s/km ahead of target`;
      return [
        `## TCS World 10K Race Prep — Target: ${targetMinutes}min`,
        "",
        `**Target Pace:** ${report.targetPace}`,
        `**Current Best Pace:** ${report.currentEstimatedPace} (${gapStr})`,
        report.recentBest5kPace ? `**Best Recent 5K Pace:** ${report.recentBest5kPace}` : "",
        report.recentBest10kPace ? `**Best Recent 10K Pace:** ${report.recentBest10kPace}` : "",
        "",
        `**Readiness Score:** ${report.readinessScore}/100`,
        `**Avg Weekly Volume (4wk):** ${report.weeklyVolumeAvg}km`,
        `**Longest Recent Run:** ${report.longRunMax}km`,
        "",
        "### Recommendations",
        ...report.recommendations.map(r => `- ${r}`),
      ].filter(Boolean).join("\n");
    }

    case "weekly_summary": {
      const weeks = Number(args.weeks ?? 8);
      const activities = await getActivities(100);
      const summaries = getWeeklySummaries(activities, weeks);
      const lines = summaries.map(w => [
        `**Week of ${w.weekLabel}**`,
        `  Runs: ${w.runs} | Volume: ${w.totalKm}km | Time: ${w.totalTime}`,
        `  Avg Pace: ${w.avgPace} | Longest: ${w.longestRunKm}km`,
        w.avgHR ? `  Avg HR: ${w.avgHR}bpm` : "",
      ].filter(Boolean).join("\n"));
      const totalVol = summaries.reduce((s, w) => s + w.totalKm, 0);
      const avgVol = summaries.length > 0 ? Math.round(totalVol / summaries.length) : 0;
      return [
        `## Weekly Training Summary (last ${summaries.length} weeks)`,
        `**Avg weekly volume:** ${avgVol}km`,
        "",
        ...lines,
      ].join("\n\n");
    }

    case "get_activity_detail": {
      const id = Number(args.activity_id);
      const act = await getActivityDetail(id);
      const lines = [
        `## ${act.name} — ${formatDate(act.start_date)}`,
        `**Distance:** ${metersToKm(act.distance)}km | **Time:** ${formatDuration(act.moving_time)}`,
        `**Pace:** ${speedToPace(act.average_speed)} | **Elevation:** ${Math.round(act.total_elevation_gain)}m`,
        act.average_heartrate ? `**Avg HR:** ${Math.round(act.average_heartrate)}bpm | **Max HR:** ${act.max_heartrate}bpm` : "",
        "",
      ];
      if (act.splits_metric?.length) {
        lines.push("### KM Splits");
        act.splits_metric.forEach(s => {
          lines.push(`  KM ${s.split}: ${speedToPace(s.average_speed)}${s.average_heartrate ? ` @ ${Math.round(s.average_heartrate)}bpm` : ""} | Elev: ${Math.round(s.elevation_difference)}m`);
        });
      }
      if (act.laps?.length && act.laps.length > 1) {
        lines.push("\n### Laps");
        act.laps.forEach(l => {
          lines.push(`  Lap ${l.lap_index}: ${metersToKm(l.distance)}km @ ${speedToPace(l.average_speed)}${l.average_heartrate ? ` | HR: ${Math.round(l.average_heartrate)}` : ""}`);
        });
      }
      return lines.filter(l => l !== undefined).join("\n");
    }

    case "get_athlete_stats": {
      const stats = await getAthleteStats() as Record<string, Record<string, number>>;
      const r = stats.recent_run_totals ?? {};
      const a = stats.all_run_totals ?? {};
      return [
        "## Athlete Stats",
        "",
        "### Recent (4 weeks)",
        `Runs: ${r.count ?? 0} | Distance: ${metersToKm(r.distance ?? 0)}km | Moving Time: ${formatDuration(r.moving_time ?? 0)}`,
        "",
        "### All Time",
        `Runs: ${a.count ?? 0} | Distance: ${metersToKm(a.distance ?? 0)}km | Elevation: ${Math.round((a.elevation_gain ?? 0))}m`,
      ].join("\n");
    }

    case "get_activity_streams": {
      const id = Number(args.activity_id);
      const streams = await getActivityStreams(id);
      const hrData = streams.heartrate?.data ?? [];
      const paceData = streams.velocity_smooth?.data ?? [];
      const summary = [
        `## Activity ${id} — Data Streams`,
        `**Data points:** ${streams.time?.data?.length ?? 0}`,
        hrData.length ? `**HR range:** ${Math.min(...hrData)}–${Math.max(...hrData)}bpm | Avg: ${Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length)}bpm` : "",
        paceData.length ? `**Pace range:** ${speedToPace(Math.max(...paceData))}–${speedToPace(Math.min(...paceData))}` : "",
      ].filter(Boolean).join("\n");
      return summary;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- MCP Protocol Handler ---

interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function mcpResponse(id: string | number, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function mcpError(id: string | number, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return Response.json(
      { name: "strava-mcp", version: "1.0.0", status: "ok" },
      { headers: corsHeaders },
    );
  }

  try {
    const body = await req.json() as MCPRequest;
    const { id, method, params } = body;

    let response: Response;

    switch (method) {
      case "initialize":
        response = mcpResponse(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "strava-mcp", version: "1.0.0" },
        });
        break;

      case "tools/list":
        response = mcpResponse(id, { tools: TOOLS });
        break;

      case "tools/call": {
        const toolName = String((params as Record<string, unknown>)?.name ?? "");
        const toolArgs = ((params as Record<string, unknown>)?.arguments ?? {}) as Record<string, unknown>;
        try {
          const content = await handleTool(toolName, toolArgs);
          response = mcpResponse(id, {
            content: [{ type: "text", text: content }],
          });
        } catch (err) {
          response = mcpResponse(id, {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          });
        }
        break;
      }

      default:
        response = mcpError(id, -32601, `Method not found: ${method}`);
    }

    // Add CORS headers
    const newHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      newHeaders.set(k, v);
    }
    return new Response(response.body, { status: response.status, headers: newHeaders });

  } catch (err) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: corsHeaders }
    );
  }
}
