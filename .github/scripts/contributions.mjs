// Renders the owner's contribution calendar as two themed SVGs (dark + light).
// Uses only the GitHub GraphQL API and Node's built-ins — no third-party actions.
import { mkdirSync, writeFileSync } from "node:fs";

const user = process.env.GH_USER;
const token = process.env.GITHUB_TOKEN;
const outDir = process.env.OUT_DIR || "dist";

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount weekday } }
      }
    }
  }
}`;

async function fetchCalendar() {
  if (process.env.SAMPLE) return sampleCalendar();
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data.user.contributionsCollection.contributionCalendar;
}

function sampleCalendar() {
  const weeks = [];
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const c = Math.random() < 0.4 ? 0 : Math.floor(Math.random() * 12);
      total += c;
      days.push({ date: `w${w}d${d}`, contributionCount: c, weekday: d });
    }
    weeks.push({ contributionDays: days });
  }
  return { totalContributions: total, weeks };
}

const THEMES = {
  dark: {
    file: "contributions-dark.svg",
    text: "#E6EDF3", muted: "#8B949E",
    levels: ["#161B22", "#4A2A1E", "#8A3F21", "#C95A2B", "#FF7A45"],
    snake: "#E6EDF3",
  },
  light: {
    file: "contributions-light.svg",
    text: "#1F2328", muted: "#59636E",
    levels: ["#EFF2F5", "#F7CDB8", "#F0A07A", "#E5733F", "#D9531E"],
    snake: "#1F2328",
  },
};

const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

function levelOf(count, max) {
  if (count === 0) return 0;
  const r = count / max;
  return r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4;
}

function render(cal, t) {
  const cell = 14, gap = 4, left = 40, top = 56;
  const pitch = cell + gap;
  const weeks = cal.weeks;
  const max = Math.max(1, ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)));
  const width = 1000;
  const height = top + 7 * pitch + 44;
  const gridW = weeks.length * pitch - gap;
  const scale = Math.min(1, (width - left * 2) / gridW);

  // Snake route: serpentine through every day, week by week (down, then up, ...),
  // entering from off-canvas on the left and leaving off-canvas on the right.
  const route = [];
  weeks.forEach((w, wi) => {
    const days = [...w.contributionDays].sort((a, b) => a.weekday - b.weekday);
    if (wi % 2) days.reverse();
    for (const d of days) route.push({ x: wi * pitch + cell / 2, y: d.weekday * pitch + cell / 2, d });
  });
  const SEGMENTS = 6;
  const offLeft = -(left / scale) - pitch * (SEGMENTS + 2);
  const offRight = (width - left) / scale + pitch * (SEGMENTS + 2);
  const first = route[0], last = route[route.length - 1];
  const pts = [{ x: offLeft, y: first.y }, ...route, { x: offRight, y: last.y }];

  // Cumulative distance along the route -> time at which the head reaches each cell.
  const STEP = 0.09;                       // seconds per cell
  const speed = pitch / STEP;              // units per second
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = dist[dist.length - 1];
  const dur = total / speed;
  const pathD = "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L");

  let rects = "";
  route.forEach((r, i) => {
    const lv = levelOf(r.d.contributionCount, max);
    const x = r.x - cell / 2, y = r.y - cell / 2;
    const tip = `<title>${r.d.date}: ${r.d.contributionCount}</title>`;
    if (lv === 0) {
      rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${t.levels[0]}">${tip}</rect>`;
    } else {
      // Cell is "eaten" when the head reaches it, and grows back when the loop restarts.
      const k = (dist[i + 1] / total).toFixed(5);
      rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${t.levels[lv]}">${tip}` +
        `<animate attributeName="fill" values="${t.levels[lv]};${t.levels[0]}" keyTimes="0;${k}" calcMode="discrete" dur="${dur.toFixed(2)}s" repeatCount="indefinite"/></rect>`;
    }
  });

  // Snake body: segments follow the same path, each one cell behind the previous.
  let snake = "";
  for (let i = SEGMENTS - 1; i >= 0; i--) {
    const size = cell - 2 - i * 0.8;
    const lag = i * STEP;
    const begin = lag === 0 ? "0s" : `-${(dur - lag).toFixed(2)}s`;
    snake += `<rect x="${(-size / 2).toFixed(1)}" y="${(-size / 2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="${(size / 3).toFixed(1)}" fill="${t.snake}" opacity="${(1 - i * 0.12).toFixed(2)}">` +
      `<animateMotion path="${pathD}" dur="${dur.toFixed(2)}s" begin="${begin}" repeatCount="indefinite" calcMode="linear"/></rect>`;
  }

  const legendX = width - left - 5 * pitch - 40;
  const legend = t.levels.map((c, i) =>
    `<rect x="${legendX + 34 + i * pitch}" y="${height - 30}" width="${cell}" height="${cell}" rx="3" fill="${c}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<title>${cal.totalContributions} contributions in the last year</title>
<text x="${left}" y="32" font-family="${MONO}" font-size="13" fill="${t.muted}"><tspan fill="${t.text}" font-weight="700">${cal.totalContributions}</tspan> contributions in the last year</text>
<g transform="translate(${left} ${top}) scale(${scale.toFixed(4)})">${rects}${snake}</g>
<text x="${legendX}" y="${height - 19}" font-family="${MONO}" font-size="11" fill="${t.muted}">less</text>
${legend}
<text x="${legendX + 34 + 5 * pitch + 4}" y="${height - 19}" font-family="${MONO}" font-size="11" fill="${t.muted}">more</text>
</svg>
`;
}

const cal = await fetchCalendar();
mkdirSync(outDir, { recursive: true });
for (const t of Object.values(THEMES)) {
  writeFileSync(`${outDir}/${t.file}`, render(cal, t));
  console.log(`wrote ${outDir}/${t.file}`);
}
