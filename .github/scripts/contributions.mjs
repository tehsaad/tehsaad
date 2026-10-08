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
  },
  light: {
    file: "contributions-light.svg",
    text: "#1F2328", muted: "#59636E",
    levels: ["#EFF2F5", "#F7CDB8", "#F0A07A", "#E5733F", "#D9531E"],
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
  const weeks = cal.weeks;
  const max = Math.max(1, ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)));
  const width = 1000;
  const height = top + 7 * (cell + gap) + 44;
  const gridW = weeks.length * (cell + gap) - gap;
  const scale = Math.min(1, (width - left * 2) / gridW);

  let rects = "";
  weeks.forEach((w, wi) => {
    w.contributionDays.forEach((d) => {
      const lv = levelOf(d.contributionCount, max);
      const x = wi * (cell + gap);
      const y = d.weekday * (cell + gap);
      rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${t.levels[lv]}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    });
  });

  const legendX = width - left - 5 * (cell + gap) - 40;
  const legend = t.levels.map((c, i) =>
    `<rect x="${legendX + 34 + i * (cell + gap)}" y="${height - 30}" width="${cell}" height="${cell}" rx="3" fill="${c}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<title>${cal.totalContributions} contributions in the last year</title>
<text x="${left}" y="32" font-family="${MONO}" font-size="13" fill="${t.muted}"><tspan fill="${t.text}" font-weight="700">${cal.totalContributions}</tspan> contributions in the last year</text>
<g transform="translate(${left} ${top}) scale(${scale.toFixed(4)})">${rects}</g>
<text x="${legendX}" y="${height - 19}" font-family="${MONO}" font-size="11" fill="${t.muted}">less</text>
${legend}
<text x="${legendX + 34 + 5 * (cell + gap) + 4}" y="${height - 19}" font-family="${MONO}" font-size="11" fill="${t.muted}">more</text>
</svg>
`;
}

const cal = await fetchCalendar();
mkdirSync(outDir, { recursive: true });
for (const t of Object.values(THEMES)) {
  writeFileSync(`${outDir}/${t.file}`, render(cal, t));
  console.log(`wrote ${outDir}/${t.file}`);
}
