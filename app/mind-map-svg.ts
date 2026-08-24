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
  const width = 2200;
  const height = 1400;
  const centerX = width / 2;
  const centerY = height / 2;
  const topicRadiusX = 600;
  const topicRadiusY = 360;
  const subtopicRadiusX = 950;
  const subtopicRadiusY = 590;
  const colors = ["#3f765e", "#b07a35", "#526f91", "#91627f", "#718e4f", "#ad6250", "#527f83", "#8a7048"];
  const branches = map.branches.slice(0, 8);
  const paths: string[] = [];
  const nodes: string[] = [];

  branches.forEach((branch, branchIndex) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * branchIndex) / branches.length;
    const topicX = centerX + Math.cos(angle) * topicRadiusX;
    const topicY = centerY + Math.sin(angle) * topicRadiusY;
    const color = colors[branchIndex % colors.length];
    const controlX = centerX + Math.cos(angle) * topicRadiusX * 0.48;
    const controlY = centerY + Math.sin(angle) * topicRadiusY * 0.48;
    paths.push(`<path d="M ${centerX} ${centerY} Q ${controlX} ${controlY} ${topicX} ${topicY}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round" opacity=".9"/>`);
    nodes.push(node(topicX, topicY, 260, 104, color, branch.topic, branch.summary, "topic"));

    const subtopics = branch.subtopics.slice(0, 6);
    const spread = Math.min(0.72, 0.2 + subtopics.length * 0.09);
    subtopics.forEach((subtopic, subIndex) => {
      const offset = subtopics.length === 1 ? 0 : -spread / 2 + (spread * subIndex) / (subtopics.length - 1);
      const subAngle = angle + offset;
      const subX = centerX + Math.cos(subAngle) * subtopicRadiusX;
      const subY = centerY + Math.sin(subAngle) * subtopicRadiusY;
      const subControlX = topicX + (subX - topicX) * 0.52;
      const subControlY = topicY + (subY - topicY) * 0.52;
      paths.push(`<path d="M ${topicX} ${topicY} Q ${subControlX} ${subControlY} ${subX} ${subY}" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".65"/>`);
      nodes.push(node(subX, subY, 180, 62, color, subtopic, "", "subtopic"));
    });
  });

  const central = node(centerX, centerY, 320, 142, "#203a2c", map.title, "Tema central", "center");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa mental automático: ${xml(map.title)}"><rect width="100%" height="100%" rx="32" fill="#fbfaf6"/><g class="mind-links">${paths.join("")}</g><g class="mind-nodes">${nodes.join("")}${central}</g></svg>`;
}

function node(x: number, y: number, width: number, height: number, color: string, title: string, detail: string, kind: "center" | "topic" | "subtopic") {
  const left = x - width / 2;
  const top = y - height / 2;
  return `<foreignObject x="${left}" y="${top}" width="${width}" height="${height}"><xhtml:div class="mind-node mind-node-${kind}" style="--node-color:${color}"><xhtml:strong>${html(title)}</xhtml:strong>${detail ? `<xhtml:span>${html(detail)}</xhtml:span>` : ""}</xhtml:div></foreignObject>`;
}

export const mindMapSvgStyles = `.mind-node{box-sizing:border-box;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 14px;border:3px solid var(--node-color);border-radius:18px;background:#fff;color:#26332c;text-align:center;font-family:Arial,sans-serif;box-shadow:0 7px 18px #24382c20}.mind-node strong{font-size:17px;line-height:1.15;color:var(--node-color)}.mind-node span{display:block;margin-top:5px;font-size:11px;line-height:1.25;color:#667069}.mind-node-center{border-width:5px;border-radius:50%;background:#eaf3ed}.mind-node-center strong{font:700 25px Georgia,serif}.mind-node-center span{font-size:12px;letter-spacing:1.5px;text-transform:uppercase}.mind-node-topic{background:#fff}.mind-node-subtopic{border-width:2px;border-radius:13px;background:#fdfdfb}.mind-node-subtopic strong{font-size:13px}`;

export function buildStandaloneMindMapSvg(map: MindMapData) {
  return buildMindMapSvg(map).replace(">", `><style>${mindMapSvgStyles}</style>`);
}
