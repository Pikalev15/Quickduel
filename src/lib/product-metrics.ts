export type ProductEvent = {
  event_type: string; user_id: string | null; session_id: string | null;
  game_type: string | null; match_id: string | null; device_class: string | null;
  duration_ms: number | null; occurred_at: string;
};
export type ProductMatch = {
  game_type: string; status: string; starts_at: string | null;
  completion_reason: string | null;
};
const DAY = 86_400_000;
const day = (value: string | number) => Math.floor((typeof value === "string" ? Date.parse(value) : value) / DAY);
function percentile(values: number[], fraction: number) {
  const ordered = values.slice().sort((a,b) => a-b);
  return ordered.length ? ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)] : null;
}
function rate(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}
const gameEvents = new Set(["match_started", "match_completed", "match_abandoned", "practice_started"]);
export function buildProductMetrics(events: ProductEvent[], matches: ProductMatch[], now: number, days: number, placements: { eligible: number; started: number; placed: number }) {
  const today = day(now);
  const firstDay = today - days + 1;
  const current = events.filter(event => day(event.occurred_at) >= firstDay && day(event.occurred_at) <= today);
  const activity = new Map<string, Set<number>>();
  const played = new Map<number, Set<string>>();
  const sessions = new Set<string>();
  const periodPlayers = new Set<string>();
  const eventCounts: Record<string, number> = {};
  const deviceEvents = new Map<string, { joined: number; cancelled: number; wait: number[]; players: Set<string> }>();
  const gameCounts = new Map<string, { started: number; normal: number; abandoned: number; other: number; pending: number; practice: number }>();
  function gameFor(id: string) {
    if (!gameCounts.has(id)) gameCounts.set(id,{started:0,normal:0,abandoned:0,other:0,pending:0,practice:0});
    return gameCounts.get(id)!;
  }
  for (const event of events) {
    if (!event.user_id || !gameEvents.has(event.event_type)) continue;
    const d = day(event.occurred_at);
    if (!activity.has(event.user_id)) activity.set(event.user_id,new Set());
    activity.get(event.user_id)!.add(d);
    if (d >= firstDay && d <= today) {
      if (!played.has(d)) played.set(d,new Set());
      played.get(d)!.add(event.user_id);
      periodPlayers.add(event.user_id);
    }
  }
  const waits: number[] = [];
  for (const event of current) {
    eventCounts[event.event_type] = (eventCounts[event.event_type] ?? 0) + 1;
    if (event.session_id) sessions.add(event.session_id);
    if (event.event_type === "practice_started" && event.game_type) gameFor(event.game_type).practice++;
    const device = ["mobile","tablet","desktop"].includes(event.device_class ?? "") ? event.device_class! : "unknown";
    if (!deviceEvents.has(device)) deviceEvents.set(device,{joined:0,cancelled:0,wait:[],players:new Set()});
    const item = deviceEvents.get(device)!;
    if (event.user_id && gameEvents.has(event.event_type)) item.players.add(event.user_id);
    if (event.event_type === "queue_joined") item.joined++;
    if (event.event_type === "queue_cancelled") item.cancelled++;
    if (event.event_type === "human_match_found" && event.duration_ms !== null && event.duration_ms >= 0) {
      waits.push(event.duration_ms);
      item.wait.push(event.duration_ms);
    }
  }
  let completed = 0, normal = 0, abandoned = 0, other = 0, pending = 0;
  for (const match of matches) {
    if (!match.starts_at || day(match.starts_at) < firstDay || day(match.starts_at) > today) continue;
    const item = gameFor(match.game_type);
    item.started++;
    if (match.status === "completed") {
      completed++;
      if (match.completion_reason === "normal") { normal++; item.normal++; }
      else { other++; item.other++; }
    } else if (match.status === "abandoned" || match.status === "cancelled") {
      abandoned++; item.abandoned++;
    } else { pending++; item.pending++; }
  }
  function retention(interval: number) {
    let cohort = 0, returned = 0;
    for (const dates of activity.values()) {
      const first = Math.min(...dates);
      if (first < firstDay || first + interval >= today) continue;
      cohort++;
      if (dates.has(first + interval)) returned++;
    }
    return {cohort, returned, rate: rate(returned, cohort)};
  }
  const returning = [...periodPlayers].filter(id => {
    const dates = activity.get(id)!;
    return [...dates].some(d => d < firstDay) || [...dates].filter(d => d >= firstDay && d <= today).length > 1;
  }).length;
  return {
    days, asOf: new Date(now).toISOString(), players: periodPlayers.size, sessions: sessions.size,
    returning: { count: returning, rate: rate(returning,periodPlayers.size) },
    matches: {started: normal + other + abandoned + pending, completed, normal, other, abandoned, pending, completionRate:rate(completed, completed + abandoned), normalRate:rate(normal, completed + abandoned)},
    queue: { joined:eventCounts.queue_joined ?? 0, cancelled:eventCounts.queue_cancelled ?? 0, matched:waits.length, medianMs:percentile(waits,.5), p95Ms:percentile(waits,.95) },
    retention: {day1:retention(1),day7:retention(7)},
    daily: Array.from({length:days},(_,i)=>({date:new Date((firstDay+i)*DAY).toISOString().slice(0,10),players:played.get(firstDay+i)?.size ?? 0})),
    games: [...gameCounts].map(([game,counts])=>({game,...counts,abandonmentRate:rate(counts.abandoned,counts.normal+counts.other+counts.abandoned)})).sort((a,b)=>b.started+b.practice-a.started-a.practice),
    devices: [...deviceEvents].map(([device,item])=>({device,players:item.players.size,joined:item.joined,cancelled:item.cancelled,matched:item.wait.length,medianMs:percentile(item.wait,.5),p95Ms:percentile(item.wait,.95)})),
    placements: {...placements, completionRate:rate(placements.placed,placements.started)},
    eventCounts
  };
}
export type ProductMetrics = ReturnType<typeof buildProductMetrics>;
