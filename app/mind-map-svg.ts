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
  const branches = map.branches.slice(0, 6);
  const rootWidth = 430;
  const topicWidth = 360;
  const leafWidth = 520;
  const blockGap = 10;
  const height = 1400;
  const width = 2400;
  const rootX = 280;
  const topicX = 930;
  const leafX = 1810;
  const centerY = height / 2;
  const paths: string[] = [];
  const nodes: string[] = [];
  const toggles: string[] = [];
  const availableHeight = height - 130 - blockGap * Math.max(0, branches.length - 1);
  const blockHeight = availableHeight / Math.max(1, branches.length);
  let cursorY = 65;

  branches.forEach((branch, branchIndex) => {
    const topicY = cursorY + blockHeight / 2;
    const subtopics = branch.subtopics.slice(0, 4).length ? branch.subtopics.slice(0, 4) : [branch.summary];
    const rootStartX = rootX + rootWidth / 2;
    const topicEndX = topicX - topicWidth / 2;
    paths.push(curve(rootStartX, centerY, topicEndX, topicY, "#6f8a79", 7));
    nodes.push(node(topicX, topicY, topicWidth, 96, "#e5e9e6", branch.topic, "", "topic"));
    toggles.push(toggle(topicX + topicWidth / 2 + 42, topicY));

    subtopics.forEach((subtopic, subIndex) => {
      const leafY = subtopics.length === 1 ? topicY : cursorY + ((subIndex + 0.5) * blockHeight) / subtopics.length;
      const topicStartX = topicX + topicWidth / 2 + 62;
      const leafEndX = leafX - leafWidth / 2;
      paths.push(curve(topicStartX, topicY, leafEndX, leafY, "#a9beaf", 5));
      nodes.push(node(leafX, leafY, leafWidth, 62, "#edf3ef", subtopic, "", "subtopic"));
    });
    cursorY += blockHeight + blockGap;
  });

  const central = node(rootX, centerY, rootWidth, 112, "#eee5d7", map.title, "", "center");
  const rootToggle = toggle(rootX + rootWidth / 2 + 42, centerY);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa mental automático: ${xml(map.title)}"><rect width="100%" height="100%" fill="#f8f7f2"/><g class="mind-links">${paths.join("")}</g><g class="mind-nodes">${nodes.join("")}${central}</g><g class="mind-toggles">${toggles.join("")}${rootToggle}</g></svg>`;
}

function curve(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  const bend = (x2 - x1) * 0.48;
  return `<path d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`;
}

function toggle(x: number, y: number) {
  return `<circle cx="${x}" cy="${y}" r="24" fill="#d9dfda" stroke="#718077" stroke-width="2"/><text x="${x}" y="${y + 10}" text-anchor="middle" fill="#425047" font-family="Arial,sans-serif" font-size="32">‹</text>`;
}

function node(x: number, y: number, width: number, height: number, color: string, title: string, detail: string, kind: "center" | "topic" | "subtopic") {
  const left = x - width / 2;
  const top = y - height / 2;
  return `<foreignObject x="${left}" y="${top}" width="${width}" height="${height}"><xhtml:div class="mind-node mind-node-${kind}" style="--node-color:${color}"><xhtml:strong>${html(title)}</xhtml:strong>${detail ? `<xhtml:span>${html(detail)}</xhtml:span>` : ""}</xhtml:div></foreignObject>`;
}

export const mindMapSvgStyles = `.mind-node{box-sizing:border-box;width:100%;height:100%;display:flex;align-items:center;justify-content:flex-start;padding:18px 28px;border:2px solid #9aaba0;border-radius:14px;background:var(--node-color);color:#26372e;font-family:Georgia,serif;box-shadow:0 5px 14px #42504720}.mind-node strong{font-size:29px;line-height:1.15;font-weight:400;color:#26372e}.mind-node-center{justify-content:center;text-align:center;border-color:#b98b4e}.mind-node-center strong{font-size:32px}.mind-node-topic{border-color:#78877e}.mind-node-topic strong{font-size:28px}.mind-node-subtopic{border-color:#9bb1a4}.mind-node-subtopic strong{font-size:26px}`;

export function buildStandaloneMindMapSvg(map: MindMapData) {
  return buildMindMapSvg(map).replace(">", `><style>${mindMapSvgStyles}</style>`);
}
