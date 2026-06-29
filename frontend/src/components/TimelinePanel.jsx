import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function TimelinePanel({ events, onSelectEvent }) {
  const timeline = useMemo(() => {
    const buckets = new Map();
    events.forEach((f) => {
      const startedAt = f.properties.started_at;
      if (!startedAt) return;
      const day = format(parseISO(startedAt), "yyyy-MM-dd");
      const current = buckets.get(day) || { day, count: 0, ids: [] };
      current.count += 1;
      current.ids.push(f.properties.id);
      buckets.set(day, current);
    });
    return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [events]);

  return (
    <section className="panel timeline-panel">
      <header className="panel-title-row">
        <h2>Operational Tempo Timeline</h2>
      </header>
      <div className="timeline-chart">
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={timeline} margin={{ top: 12, right: 8, bottom: 12, left: -12 }}>
            <defs>
              <linearGradient id="tempoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2b8cff" stopOpacity={0.96} />
                <stop offset="100%" stopColor="#1dd1a1" stopOpacity={0.82} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--control-border)" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "rgba(43, 140, 255, 0.08)" }}
              contentStyle={{
                background: "var(--panel-strong)",
                border: "1px solid var(--control-border)",
                color: "var(--text)"
              }}
              labelStyle={{ color: "var(--accent)" }}
            />
            <Bar
              dataKey="count"
              fill="url(#tempoFill)"
              radius={[6, 6, 2, 2]}
              maxBarSize={34}
              cursor="pointer"
              onClick={(item) => item?.ids?.[0] && onSelectEvent(item.ids[0])}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="timeline-actions">
        {timeline.slice(-5).map((item) => (
          <button
            key={item.day}
            className="chip"
            onClick={() => item.ids[0] && onSelectEvent(item.ids[0])}
            type="button"
          >
            {item.day} · {item.count}
          </button>
        ))}
      </div>
    </section>
  );
}
