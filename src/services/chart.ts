export interface DailyPoint {
  date: string;
  messageCount: number;
}

function fmtDayBefore(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function buildUsageChartUrl(history: DailyPoint[]): string {
  // Always render a chart, even with just one data point. QuickChart's line
  // chart needs at least two labels to draw a visible line/area, so pad a
  // synthetic zero-value point the day before when we only have one real
  // data point yet (e.g. right after first deploy).
  const points = history.length >= 1
    ? history
    : [];
  const padded = points.length === 1
    ? [{ date: fmtDayBefore(points[0].date), messageCount: 0 }, ...points]
    : points;

  const labels = padded.map((h) => h.date.slice(5));
  const data = padded.map((h) => h.messageCount);

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '每日消息数',
          data,
          fill: true,
          borderColor: '#01696f',
          backgroundColor: 'rgba(1, 105, 111, 0.15)',
          tension: 0.3,
          pointRadius: 3
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: '近 14 天消息量趋势' }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?width=700&height=400&backgroundColor=white&c=${encoded}`;
}
