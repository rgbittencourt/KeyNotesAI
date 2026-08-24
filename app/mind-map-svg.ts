export type MindMapData = {
  title: string;
  branches: Array<{ topic: string; summary: string; subtopics: string[] }>;
};

const xml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const html = (value: unknown) =>
  xml(value).replace(/'/g, "&#039;");

export function buildMindMapSvg(map: MindMapData) {
  const branches = map.branches.slice(0, 8);
  const rootWidth = 430;
  const topicWidth = 360;
  const leafWidth = 520;
  const nodeGap = 28;
  const blockGap = 58;
  const blockHeights = branches.map((branch) =>
    Math.max(108, Math.max(1, branch.subtopics.slice(0, 6).length) * (76 + nodeGap) - nodeGap),
  );
  const height = Math.max(900, 150 + blockHeights.reduce((sum, value) => sum + value, 0) + blockGap * Math.max(0, branches.length - 1));
  const width = 2260;
  const rootX = 280;
  const topicX = 930;
  const leafX = 1730;
  const centerY = height / 2;
  const paths: string[] = [];
  const nodes: string[] = [];
  const toggles: string[] = [];
  let cursorY = 75;

  branches.forEach((branch, branchIndex) => {
    const blockHeight = blockHeights[branchIndex];
    const topicY = cursorY + blockHeight / 2;
    const subtopics = branch.subtopics.slice(0, 6).length ? branch.subtopics.slice(0, 6) : [branch.summary];
    const rootStartX = rootX + rootWidth / 2;
    const topicEndX = topicX - topicWidth / 2;
    paths.push(curve(rootStartX, centerY, topicEndX, topicY, "#8f94ff", 7));
    nodes.push(node(topicX, topicY, topicWidth, 96, "#4d5660", branch.topic, "", "topic"));
    toggles.push(toggle(topicX + topicWidth / 2 + 42, topicY));

    subtopics.forEach((subtopic, subIndex) => {
      const leafY = subtopics.length === 1 ? topicY : cursorY + 38 + subIndex * (76 + nodeGap);
      const topicStartX = topicX + topicWidth / 2 + 62;
      const leafEndX = leafX - leafWidth / 2;
      paths.push(curve(topicStartX, topicY, leafEndX, leafY, "#a8c9ef", 5));
      nodes.push(node(leafX, leafY, leafWidth, 76, "#30433f", subtopic, "", "subtopic"));
    });
    cursorY += blockHeight + blockGap;
  });

  const central = node(rootX, centerY, rootWidth, 112, "#5e6178", map.title, "", "center");
  const rootToggle = toggle(rootX + rootWidth / 2 + 42, centerY);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa mental automático: ${xml(map.title)}"><rect width="100%" height="100%" fill="#080909"/><g class="mind-links">${paths.join("")}</g><g class="mind-nodes">${nodes.join("")}${central}</g><g class="mind-toggles">${toggles.join("")}${rootToggle}</g></svg>`;
}

function curve(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  const bend = (x2 - x1) * 0.48;
  return `<path d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`;
}

function toggle(x: number, y: number) {
  return `<circle cx="${x}" cy="${y}" r="24" fill="#505b66"/><text x="${x}" y="${y + 10}" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="32">‹</text>`;
}

function node(x: number, y: number, width: number, height: number, color: string, title: string, detail: string, kind: "center" | "topic" | "subtopic") {
  const left = x - width / 2;
  const top = y - height / 2;
  return `<foreignObject x="${left}" y="${top}" width="${width}" height="${height}"><xhtml:div class="mind-node mind-node-${kind}" style="--node-color:${color}"><xhtml:strong>${html(title)}</xhtml:strong>${detail ? `<xhtml:span>${html(detail)}</xhtml:span>` : ""}</xhtml:div></foreignObject>`;
}

export const mindMapSvgStyles = `.mind-node{box-sizing:border-box;width:100%;height:100%;display:flex;align-items:center;justify-content:flex-start;padding:18px 28px;border:0;border-radius:14px;background:var(--node-color);color:#fff;font-family:Georgia,serif;box-shadow:0 7px 20px #0006}.mind-node strong{font-size:29px;line-height:1.15;font-weight:400;color:#fff}.mind-node-center{justify-content:center;text-align:center}.mind-node-center strong{font-size:32px}.mind-node-topic strong{font-size:28px}.mind-node-subtopic strong{font-size:26px}`;

export function buildStandaloneMindMapSvg(map: MindMapData) {
  return buildMindMapSvg(map).replace(">", `><style>${mindMapSvgStyles}</style>`);
}
