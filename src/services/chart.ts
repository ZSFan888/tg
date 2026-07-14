export interface DailyPoint {
  date: string;
  messageCount: number;
}

export function buildUsageChartUrl(history: DailyPoint[]): string {
  const labels = history.map((h) => h.date.slice(5));
  const data = history.map((h) => h.messageCount);

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
