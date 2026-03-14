import { jsPDF } from "jspdf";
import { formatRoomTypeLabel, type ReportSnapshot } from "@inspect-ai/contracts";

interface ExportNodeOptions {
  reportNode: HTMLElement;
  snapshot: ReportSnapshot;
}

const PAGE_MARGIN = 16;
const PAGE_BOTTOM = 281;
const CONTENT_WIDTH = 178;

function sanitizeFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildFileBase(snapshot: ReportSnapshot) {
  const addressPart = sanitizeFileSegment(snapshot.inputs.address || "inspection-report");
  return `${addressPart}-${snapshot.reportId.slice(0, 8)}`;
}

function triggerDownload(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
  }, 0);
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, fileName);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function summarizeHazards(snapshot: ReportSnapshot) {
  if (snapshot.hazards.length === 0) {
    return ["No confirmed hazards were recorded in this snapshot."];
  }

  return snapshot.hazards.slice(0, 6).map((hazard) => {
    const roomLabel = hazard.roomType ? ` (${formatRoomTypeLabel(hazard.roomType)})` : "";
    return `${hazard.severity} ${hazard.category}${roomLabel}: ${hazard.description}`;
  });
}

function summarizeCoverage(snapshot: ReportSnapshot) {
  const coverage = snapshot.inspectionCoverage;
  if (!coverage) {
    return ["Inspection coverage has not been summarized yet."];
  }

  return [
    coverage.summary || "Coverage summary unavailable.",
    ...(coverage.warning ? [coverage.warning] : []),
    ...(coverage.missingAreas.length > 0
      ? [`Missing evidence: ${coverage.missingAreas.slice(0, 4).join("; ")}`]
      : ["No missing evidence areas were listed."]),
  ];
}

function summarizeActionGuide(snapshot: ReportSnapshot) {
  if (!snapshot.preLeaseActionGuide) {
    return ["No structured action guide is available yet."];
  }

  return [
    ...(snapshot.preLeaseActionGuide.summary ? [snapshot.preLeaseActionGuide.summary] : []),
    ...snapshot.preLeaseActionGuide.negotiatePoints.slice(0, 3),
    ...snapshot.preLeaseActionGuide.furtherInspectionItems.slice(0, 3),
  ];
}

function summarizeKnowledge(snapshot: ReportSnapshot) {
  if (!snapshot.knowledgeAnswer) {
    return ["RAG knowledge guidance was not available in this snapshot."];
  }

  return [
    snapshot.knowledgeAnswer.summary,
    ...snapshot.knowledgeAnswer.keyPoints.slice(0, 3),
    ...(snapshot.knowledgeTrace
      ? [
          `Workflow: ${snapshot.knowledgeTrace.mode} | retrieved ${snapshot.knowledgeTrace.retrievedCount} | reranked ${snapshot.knowledgeTrace.rerankedCount}`,
        ]
      : []),
  ];
}

function summarizeEvidenceBasis(snapshot: ReportSnapshot) {
  if (!snapshot.reportEvidenceBasis?.length) {
    return [];
  }

  return snapshot.reportEvidenceBasis.slice(0, 3).flatMap((basis) => {
    const room = formatRoomTypeLabel(basis.roomType);
    return [
      `${room}: ${basis.verdict.status} - ${basis.verdict.summary}`,
      ...(basis.missingEvidence.length > 0
        ? [`Missing evidence: ${basis.missingEvidence.slice(0, 3).join(", ")}`]
        : []),
      ...(basis.confirmedHazards.length > 0
        ? [`Evidence used: ${basis.confirmedHazards.map((item) => item.summary).slice(0, 2).join("; ")}`]
        : []),
    ];
  });
}

function ensureSpace(pdf: jsPDF, cursorY: number, neededHeight: number) {
  if (cursorY + neededHeight <= PAGE_BOTTOM) {
    return cursorY;
  }

  pdf.addPage();
  return PAGE_MARGIN;
}

function drawWrappedText(args: {
  pdf: jsPDF;
  text: string;
  x: number;
  y: number;
  width: number;
  lineHeight: number;
  color?: [number, number, number];
  fontSize?: number;
  fontStyle?: "normal" | "bold";
}) {
  const { pdf } = args;
  pdf.setFont("helvetica", args.fontStyle ?? "normal");
  pdf.setFontSize(args.fontSize ?? 11);
  if (args.color) {
    pdf.setTextColor(...args.color);
  } else {
    pdf.setTextColor(33, 41, 52);
  }

  const lines = pdf.splitTextToSize(args.text, args.width);
  pdf.text(lines, args.x, args.y);
  return args.y + lines.length * args.lineHeight;
}

function drawSection(args: {
  pdf: jsPDF;
  cursorY: number;
  title: string;
  items: string[];
}) {
  const { pdf, title, items } = args;
  let cursorY = ensureSpace(pdf, args.cursorY, 22);

  pdf.setDrawColor(219, 228, 239);
  pdf.setFillColor(247, 250, 252);
  pdf.roundedRect(PAGE_MARGIN, cursorY, CONTENT_WIDTH, 10, 3, 3, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text(title, PAGE_MARGIN + 4, cursorY + 6.8);
  cursorY += 15;

  for (const item of items) {
    cursorY = ensureSpace(pdf, cursorY, 12);
    pdf.setFillColor(61, 220, 255);
    pdf.circle(PAGE_MARGIN + 2, cursorY - 1.2, 0.9, "F");
    cursorY = drawWrappedText({
      pdf,
      text: item,
      x: PAGE_MARGIN + 6,
      y: cursorY,
      width: CONTENT_WIDTH - 10,
      lineHeight: 5.2,
      fontSize: 10.5,
    });
    cursorY += 2.5;
  }

  return cursorY + 2;
}

function buildPdfBlob(snapshot: ReportSnapshot) {
  const pdf = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4",
  });

  pdf.setFillColor(12, 18, 32);
  pdf.rect(0, 0, 210, 297, "F");

  let y = PAGE_MARGIN;
  pdf.setTextColor(231, 236, 243);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("RentRadar Inspection Snapshot", PAGE_MARGIN, y);
  y += 8;

  y = drawWrappedText({
    pdf,
    text: snapshot.inputs.address || "Rental inspection snapshot",
    x: PAGE_MARGIN,
    y,
    width: CONTENT_WIDTH,
    lineHeight: 5.4,
    color: [149, 160, 183],
    fontSize: 11.5,
  });
  y += 3;

  pdf.setFillColor(18, 24, 38);
  pdf.setDrawColor(61, 220, 255);
  pdf.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 22, 4, 4, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(61, 220, 255);
  pdf.text(String(snapshot.propertyRiskScore), PAGE_MARGIN + 6, y + 9.5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(231, 236, 243);
  pdf.text("Risk score", PAGE_MARGIN + 28, y + 9.2);
  pdf.text(`Mode: ${snapshot.inputs.mode.toUpperCase()}`, PAGE_MARGIN + 78, y + 9.2);
  pdf.text(`Hazards: ${snapshot.hazards.length}`, PAGE_MARGIN + 125, y + 9.2);
  pdf.text(snapshot.recommendation?.outcome || "Review", PAGE_MARGIN + 6, y + 17.2);
  pdf.setTextColor(149, 160, 183);
  pdf.text(formatTimestamp(snapshot.createdAt), PAGE_MARGIN + 78, y + 17.2);
  y += 30;

  y = drawSection({
    pdf,
    cursorY: y,
    title: "Decision Recommendation",
    items: [
      snapshot.recommendation?.summary ||
        "Recommendation is still being prepared for this snapshot.",
      ...(snapshot.recommendation?.reasons.slice(0, 4) ?? []),
    ],
  });

  y = drawSection({
    pdf,
    cursorY: y,
    title: "Top Hazards",
    items: summarizeHazards(snapshot),
  });

  y = drawSection({
    pdf,
    cursorY: y,
    title: "Inspection Coverage",
    items: summarizeCoverage(snapshot),
  });

  const evidenceItems = summarizeEvidenceBasis(snapshot);
  if (evidenceItems.length > 0) {
    y = drawSection({
      pdf,
      cursorY: y,
      title: "Room Evidence Basis",
      items: evidenceItems,
    });
  }

  y = drawSection({
    pdf,
    cursorY: y,
    title: "Action Guide",
    items: summarizeActionGuide(snapshot),
  });

  y = drawSection({
    pdf,
    cursorY: y,
    title: "RAG Knowledge Guidance",
    items: summarizeKnowledge(snapshot),
  });

  y = drawSection({
    pdf,
    cursorY: y,
    title: "People & Paperwork Checks",
    items: snapshot.paperworkChecks
      ? [
          ...snapshot.paperworkChecks.checklist.slice(0, 3),
          ...snapshot.paperworkChecks.riskFlags.slice(0, 3),
          ...snapshot.paperworkChecks.requiredDocuments.slice(0, 3).map((item) => `Document: ${item}`),
        ]
      : ["No paperwork checklist has been stored for this snapshot."],
  });

  y = ensureSpace(pdf, y + 6, 20);
  pdf.setDrawColor(61, 220, 255);
  pdf.line(PAGE_MARGIN, y, PAGE_MARGIN + CONTENT_WIDTH, y);
  y += 7;
  drawWrappedText({
    pdf,
    text:
      "RentRadar is an AI-assisted screening tool and does not replace a licensed building inspector. Verify all findings before signing.",
    x: PAGE_MARGIN,
    y,
    width: CONTENT_WIDTH,
    lineHeight: 4.8,
    color: [149, 160, 183],
    fontSize: 9.5,
  });

  return pdf.output("blob");
}

function drawWrappedCanvasText(args: {
  ctx: CanvasRenderingContext2D;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  maxLines?: number;
}) {
  const words = args.text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (args.ctx.measureText(candidate).width <= args.maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
    }
    line = word;
  }

  if (line) {
    lines.push(line);
  }

  const visibleLines =
    typeof args.maxLines === "number" ? lines.slice(0, args.maxLines) : lines;

  visibleLines.forEach((item, index) => {
    const isLastLine =
      typeof args.maxLines === "number" &&
      index === visibleLines.length - 1 &&
      lines.length > visibleLines.length;
    args.ctx.fillText(isLastLine ? `${item}...` : item, args.x, args.y + index * args.lineHeight);
  });

  return args.y + visibleLines.length * args.lineHeight;
}

async function buildPosterBlob(snapshot: ReportSnapshot) {
  const poster = document.createElement("canvas");
  poster.width = 1080;
  poster.height = 1920;
  const ctx = poster.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context unavailable.");
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, poster.height);
  gradient.addColorStop(0, "#121826");
  gradient.addColorStop(1, "#090b12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, poster.width, poster.height);

  ctx.fillStyle = "rgba(61,220,255,0.12)";
  ctx.beginPath();
  ctx.arc(910, 210, 240, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#E7ECF3";
  ctx.font = "700 64px system-ui, sans-serif";
  ctx.fillText("RentRadar", 72, 112);

  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillStyle = "#95A0B7";
  let y = drawWrappedCanvasText({
    ctx,
    text: snapshot.inputs.address || "Rental inspection snapshot",
    x: 72,
    y: 164,
    maxWidth: 840,
    lineHeight: 40,
    maxLines: 2,
  });

  ctx.fillStyle = "#121826";
  ctx.strokeStyle = "rgba(231,236,243,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(72, y + 32, 936, 250, 36);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#3DDCFF";
  ctx.font = "700 120px system-ui, sans-serif";
  ctx.fillText(String(snapshot.propertyRiskScore), 108, y + 150);

  ctx.fillStyle = "#E7ECF3";
  ctx.font = "700 46px system-ui, sans-serif";
  ctx.fillText(snapshot.recommendation?.outcome || "Review", 320, y + 120);
  ctx.font = "500 28px system-ui, sans-serif";
  ctx.fillStyle = "#95A0B7";
  drawWrappedCanvasText({
    ctx,
    text:
      snapshot.recommendation?.summary ||
      "Recommendation is being prepared. Review the key hazards and coverage status before acting.",
    x: 320,
    y: y + 162,
    maxWidth: 620,
    lineHeight: 34,
    maxLines: 3,
  });

  const sections = [
    {
      title: "Top Hazards",
      items: summarizeHazards(snapshot).slice(0, 3),
    },
    {
      title: "Coverage",
      items: summarizeCoverage(snapshot).slice(0, 3),
    },
    {
      title: "Next Actions",
      items: summarizeActionGuide(snapshot).slice(0, 3),
    },
    {
      title: "RAG Knowledge",
      items: summarizeKnowledge(snapshot).slice(0, 3),
    },
  ];

  y += 340;
  for (const section of sections) {
    ctx.fillStyle = "#121826";
    ctx.strokeStyle = "rgba(231,236,243,0.12)";
    ctx.beginPath();
    ctx.roundRect(72, y, 936, 250, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#E7ECF3";
    ctx.font = "700 36px system-ui, sans-serif";
    ctx.fillText(section.title, 104, y + 52);

    ctx.font = "500 24px system-ui, sans-serif";
    ctx.fillStyle = "#D9E2EC";
    let sectionY = y + 98;
    for (const item of section.items) {
      ctx.fillStyle = "#3DDCFF";
      ctx.beginPath();
      ctx.arc(108, sectionY - 10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#D9E2EC";
      sectionY = drawWrappedCanvasText({
        ctx,
        text: item,
        x: 126,
        y: sectionY,
        maxWidth: 840,
        lineHeight: 30,
        maxLines: 2,
      });
      sectionY += 16;
    }
    y += 286;
  }

  ctx.fillStyle = "#95A0B7";
  ctx.font = "500 22px system-ui, sans-serif";
  drawWrappedCanvasText({
    ctx,
    text:
      "AI-assisted export. Verify all findings with a licensed professional before signing or paying a deposit.",
    x: 72,
    y: 1810,
    maxWidth: 920,
    lineHeight: 30,
    maxLines: 3,
  });

  return await new Promise<Blob>((resolve, reject) => {
    poster.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas export failed."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export async function exportReportPdf({ snapshot }: ExportNodeOptions) {
  const blob = buildPdfBlob(snapshot);
  downloadBlob(blob, `${buildFileBase(snapshot)}.pdf`);
}

export async function exportReportPoster({ snapshot }: ExportNodeOptions) {
  const blob = await buildPosterBlob(snapshot);
  downloadBlob(blob, `${buildFileBase(snapshot)}-poster.png`);
}
