import { jsPDF } from "jspdf";
import { formatRoomTypeLabel, type ReportSnapshot } from "@inspect-ai/contracts";

interface ExportNodeOptions {
  reportNode: HTMLElement;
  snapshot: ReportSnapshot;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14; // margin
const CW = PAGE_W - 2 * M; // content width
const COL_W = (CW - 4) / 2; // two-column width
const PAGE_BOTTOM = PAGE_H - M;

// Color palette (hex → RGB)
const C = {
  bg: [12, 18, 32] as [number, number, number],
  card: [18, 24, 38] as [number, number, number],
  cyan: [61, 220, 255] as [number, number, number],
  white: [231, 236, 243] as [number, number, number],
  muted: [149, 160, 183] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  sectionBg: [22, 30, 48] as [number, number, number],
  red: [255, 90, 95] as [number, number, number],
  orange: [251, 146, 60] as [number, number, number],
  yellow: [250, 204, 21] as [number, number, number],
  green: [52, 211, 153] as [number, number, number],
  border: [40, 50, 70] as [number, number, number],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFileSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
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
  window.setTimeout(() => link.remove(), 0);
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, fileName);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function ensureSpace(pdf: jsPDF, y: number, needed: number): number {
  if (y + needed <= PAGE_BOTTOM) return y;
  pdf.addPage();
  drawPageBg(pdf);
  return M;
}

function drawPageBg(pdf: jsPDF) {
  pdf.setFillColor(...C.bg);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
}

// ---------------------------------------------------------------------------
// Text drawing helpers
// ---------------------------------------------------------------------------

function drawText(pdf: jsPDF, text: string, x: number, y: number, opts?: {
  color?: [number, number, number];
  size?: number;
  style?: "normal" | "bold" | "italic";
  maxWidth?: number;
  lineHeight?: number;
}): number {
  const size = opts?.size ?? 10;
  const style = opts?.style ?? "normal";
  const color = opts?.color ?? C.white;
  const maxWidth = opts?.maxWidth ?? CW;
  const lineHeight = opts?.lineHeight ?? size * 0.45;

  pdf.setFont("helvetica", style);
  pdf.setFontSize(size);
  pdf.setTextColor(...color);

  const lines: string[] = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

// ---------------------------------------------------------------------------
// Section drawing
// ---------------------------------------------------------------------------

function drawSectionHeader(pdf: jsPDF, y: number, title: string, icon?: string): number {
  y = ensureSpace(pdf, y, 16);

  // Accent bar
  pdf.setFillColor(...C.cyan);
  pdf.rect(M, y, 3, 10, "F");

  // Section background
  pdf.setFillColor(...C.sectionBg);
  pdf.roundedRect(M + 5, y, CW - 5, 10, 2, 2, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11.5);
  pdf.setTextColor(...C.white);
  pdf.text(`${icon ? icon + "  " : ""}${title}`, M + 10, y + 7);

  return y + 15;
}

function drawBulletItem(pdf: jsPDF, y: number, text: string, opts?: {
  bulletColor?: [number, number, number];
  textColor?: [number, number, number];
  maxWidth?: number;
  indent?: number;
}): number {
  const indent = opts?.indent ?? M + 6;
  const bulletColor = opts?.bulletColor ?? C.cyan;
  const maxWidth = opts?.maxWidth ?? CW - (indent - M) - 4;

  y = ensureSpace(pdf, y, 8);
  pdf.setFillColor(...bulletColor);
  pdf.circle(indent - 3, y - 1, 0.8, "F");

  return drawText(pdf, text, indent, y, {
    color: opts?.textColor ?? C.white,
    size: 9.5,
    maxWidth,
    lineHeight: 4.2,
  }) + 1.5;
}

function drawKeyValueRow(pdf: jsPDF, y: number, label: string, value: string, width?: number): number {
  y = ensureSpace(pdf, y, 6);
  drawText(pdf, label, M + 4, y, { color: C.muted, size: 8.5, style: "bold", maxWidth: 40 });
  drawText(pdf, value, M + 44, y, { color: C.white, size: 9, maxWidth: (width ?? CW) - 48 });
  return y + 5;
}

// ---------------------------------------------------------------------------
// Table drawing
// ---------------------------------------------------------------------------

function drawTable(pdf: jsPDF, y: number, headers: string[], rows: string[][], colWidths: number[]): number {
  y = ensureSpace(pdf, y, 12);
  const rowH = 7;

  // Header row
  pdf.setFillColor(...C.sectionBg);
  pdf.rect(M, y, CW, rowH, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...C.cyan);
  let xOff = M + 2;
  for (let i = 0; i < headers.length; i++) {
    pdf.text(headers[i]!, xOff, y + 5);
    xOff += colWidths[i]!;
  }
  y += rowH;

  // Data rows
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  for (const row of rows) {
    y = ensureSpace(pdf, y, rowH);
    pdf.setDrawColor(...C.border);
    pdf.line(M, y, M + CW, y);
    pdf.setTextColor(...C.white);
    xOff = M + 2;
    for (let i = 0; i < row.length; i++) {
      const cellText = pdf.splitTextToSize(row[i] ?? "", colWidths[i]! - 4);
      pdf.text(cellText[0] ?? "", xOff, y + 5);
      xOff += colWidths[i]!;
    }
    y += rowH;
  }

  return y + 2;
}

// ---------------------------------------------------------------------------
// Image embedding
// ---------------------------------------------------------------------------

function tryAddImage(pdf: jsPDF, base64: string, x: number, y: number, w: number, h: number): boolean {
  try {
    const src = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
    pdf.addImage(src, "JPEG", x, y, w, h);
    return true;
  } catch {
    // Draw placeholder
    pdf.setFillColor(...C.card);
    pdf.setDrawColor(...C.border);
    pdf.roundedRect(x, y, w, h, 2, 2, "FD");
    pdf.setFontSize(7);
    pdf.setTextColor(...C.muted);
    pdf.text("Image unavailable", x + w / 2 - 10, y + h / 2);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function getSeverityColor(severity: string): [number, number, number] {
  switch (severity) {
    case "Critical": return C.red;
    case "High": return C.orange;
    case "Medium": return C.yellow;
    case "Low": return C.green;
    default: return C.muted;
  }
}

// ---------------------------------------------------------------------------
// Main PDF builder
// ---------------------------------------------------------------------------

function buildEnhancedPdfBlob(snapshot: ReportSnapshot): Blob {
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  drawPageBg(pdf);
  let y = M;

  // ===== COVER HEADER =====
  pdf.setTextColor(...C.cyan);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("Inspect.AI", M, y);
  pdf.setFontSize(10);
  pdf.setTextColor(...C.muted);
  pdf.text("Property Intelligence Report", M + 62, y);
  y += 4;

  // Divider
  pdf.setDrawColor(...C.cyan);
  pdf.setLineWidth(0.6);
  pdf.line(M, y, M + CW, y);
  y += 6;

  // Address + meta
  y = drawText(pdf, snapshot.inputs.address || "Rental inspection report", M, y, {
    color: C.white, size: 14, style: "bold", lineHeight: 6,
  });
  y += 2;

  const metaLine = [
    `Mode: ${snapshot.inputs.mode.toUpperCase()}`,
    `Generated: ${formatTimestamp(snapshot.createdAt)}`,
    snapshot.inputs.agency ? `Agency: ${snapshot.inputs.agency}` : null,
  ].filter(Boolean).join("  |  ");
  y = drawText(pdf, metaLine, M, y, { color: C.muted, size: 8.5 });
  y += 4;

  // ===== RISK SCORE CARD =====
  pdf.setFillColor(...C.card);
  pdf.setDrawColor(...C.cyan);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(M, y, CW, 26, 4, 4, "FD");

  // Score number
  const scoreColor = snapshot.propertyRiskScore >= 70 ? C.green :
    snapshot.propertyRiskScore >= 40 ? C.yellow : C.red;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(32);
  pdf.setTextColor(...scoreColor);
  pdf.text(String(snapshot.propertyRiskScore), M + 8, y + 14);

  // Score label + outcome
  pdf.setFontSize(9);
  pdf.setTextColor(...C.muted);
  pdf.text("Risk Score / 100", M + 32, y + 9);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...C.white);
  pdf.text(snapshot.recommendation?.outcome || "Review", M + 32, y + 17);

  // Stats on right
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...C.muted);
  pdf.text(`Hazards: ${snapshot.hazards.length}`, M + CW - 50, y + 9);
  pdf.text(`Fit: ${snapshot.fitScore ?? "N/A"}`, M + CW - 50, y + 17);

  y += 32;

  // ===== STATIC MAP =====
  if (snapshot.exportAssets?.staticMapImageBase64) {
    y = ensureSpace(pdf, y, 50);
    tryAddImage(pdf, snapshot.exportAssets.staticMapImageBase64, M, y, CW, 44);
    pdf.setFontSize(7);
    pdf.setTextColor(...C.muted);
    pdf.text("Property location", M + 2, y + 42);
    y += 48;
  }

  // ===== DECISION RECOMMENDATION =====
  y = drawSectionHeader(pdf, y, "Decision Recommendation");

  if (snapshot.recommendation) {
    y = drawText(pdf, snapshot.recommendation.summary, M + 6, y, {
      color: C.white, size: 10, style: "bold", maxWidth: CW - 12, lineHeight: 4.5,
    });
    y += 2;

    for (const reason of snapshot.recommendation.reasons.slice(0, 5)) {
      y = drawBulletItem(pdf, y, reason);
    }
  } else {
    y = drawBulletItem(pdf, y, "Recommendation is still being generated.");
  }
  y += 3;

  // ===== HAZARDS TABLE =====
  y = drawSectionHeader(pdf, y, `Hazards Detected (${snapshot.hazards.length})`);

  if (snapshot.hazards.length > 0) {
    // Table
    const hazardRows = snapshot.hazards.slice(0, 10).map((h) => [
      h.severity,
      h.category,
      h.roomType ? formatRoomTypeLabel(h.roomType) : "—",
      h.description.slice(0, 60),
    ]);
    y = drawTable(pdf, y, ["Severity", "Category", "Room", "Description"],
      hazardRows, [22, 28, 28, CW - 78]);

    // Hazard thumbnails — 3 per row
    const thumbs = snapshot.exportAssets?.hazardThumbnails?.filter((t) => t.base64) ?? [];
    if (thumbs.length > 0) {
      y += 2;
      y = ensureSpace(pdf, y, 30);
      const thumbW = (CW - 8) / 3;
      const thumbH = 22;

      for (let i = 0; i < Math.min(thumbs.length, 6); i++) {
        const col = i % 3;
        if (i > 0 && col === 0) {
          y += thumbH + 6;
          y = ensureSpace(pdf, y, thumbH + 6);
        }
        const tx = M + col * (thumbW + 4);
        if (thumbs[i]!.base64) {
          tryAddImage(pdf, thumbs[i]!.base64!, tx, y, thumbW, thumbH);
          // Label under thumbnail
          const hazard = snapshot.hazards.find((h) => h.id === thumbs[i]!.hazardId);
          if (hazard) {
            pdf.setFontSize(6.5);
            pdf.setTextColor(...getSeverityColor(hazard.severity));
            pdf.text(`${hazard.severity}: ${hazard.category}`.slice(0, 30), tx + 1, y + thumbH + 3);
          }
        }
      }
      y += thumbH + 8;
    }
  } else {
    y = drawBulletItem(pdf, y, "No confirmed hazards were recorded.", { bulletColor: C.green });
  }
  y += 2;

  // ===== EVIDENCE SUMMARY =====
  if (snapshot.evidenceSummary) {
    y = drawSectionHeader(pdf, y, "Evidence Summary");
    for (const item of snapshot.evidenceSummary.slice(0, 5)) {
      const conf = item.confidence === "high" ? "✓" : item.confidence === "medium" ? "○" : "?";
      y = drawBulletItem(pdf, y, `[${conf}] ${item.area}: ${item.finding}`);
    }
    y += 3;
  }

  // ===== INSPECTION COVERAGE =====
  if (snapshot.inspectionCoverage) {
    y = drawSectionHeader(pdf, y, "Inspection Coverage");
    y = drawText(pdf, snapshot.inspectionCoverage.summary, M + 6, y, {
      color: C.white, size: 9.5, maxWidth: CW - 12, lineHeight: 4.2,
    });
    y += 2;

    if (snapshot.inspectionCoverage.warning) {
      y = drawBulletItem(pdf, y, `⚠ ${snapshot.inspectionCoverage.warning}`, { bulletColor: C.yellow });
    }
    if (snapshot.inspectionCoverage.missingAreas.length > 0) {
      y = drawBulletItem(pdf, y,
        `Missing: ${snapshot.inspectionCoverage.missingAreas.slice(0, 4).join(", ")}`,
        { bulletColor: C.orange }
      );
    }
    y += 3;
  }

  // ===== PRE-LEASE ACTION GUIDE (two-column layout) =====
  if (snapshot.preLeaseActionGuide) {
    y = drawSectionHeader(pdf, y, "Pre-Lease Action Guide");

    if (snapshot.preLeaseActionGuide.summary) {
      y = drawText(pdf, snapshot.preLeaseActionGuide.summary, M + 6, y, {
        color: C.white, size: 9.5, maxWidth: CW - 12, lineHeight: 4.2,
      });
      y += 3;
    }

    // Two-column: Negotiate | Further Inspection
    const colStartY = y;
    let leftY = y;
    let rightY = y;

    // Left column header
    drawText(pdf, "Negotiate", M + 4, leftY, { color: C.cyan, size: 8.5, style: "bold", maxWidth: COL_W });
    leftY += 5;
    for (const point of snapshot.preLeaseActionGuide.negotiatePoints.slice(0, 4)) {
      leftY = drawBulletItem(pdf, leftY, point, { maxWidth: COL_W - 8, indent: M + 8 });
    }

    // Right column header
    drawText(pdf, "Further Inspection", M + COL_W + 8, rightY, { color: C.cyan, size: 8.5, style: "bold", maxWidth: COL_W });
    rightY += 5;
    for (const item of snapshot.preLeaseActionGuide.furtherInspectionItems.slice(0, 4)) {
      rightY = ensureSpace(pdf, rightY, 8);
      pdf.setFillColor(...C.cyan);
      pdf.circle(M + COL_W + 5, rightY - 1, 0.8, "F");
      rightY = drawText(pdf, item, M + COL_W + 10, rightY, {
        color: C.white, size: 9.5, maxWidth: COL_W - 12, lineHeight: 4.2,
      }) + 1.5;
    }

    y = Math.max(leftY, rightY) + 3;
  }

  // ===== RAG KNOWLEDGE GUIDANCE =====
  if (snapshot.knowledgeAnswer) {
    y = drawSectionHeader(pdf, y, "Knowledge Base Guidance (RAG)");

    y = drawText(pdf, snapshot.knowledgeAnswer.summary, M + 6, y, {
      color: C.white, size: 10, style: "bold", maxWidth: CW - 12, lineHeight: 4.5,
    });
    y += 2;

    for (const point of snapshot.knowledgeAnswer.keyPoints.slice(0, 4)) {
      y = drawBulletItem(pdf, y, point);
    }

    if (snapshot.knowledgeTrace) {
      y += 1;
      y = drawText(pdf,
        `RAG: ${snapshot.knowledgeTrace.mode} | retrieved ${snapshot.knowledgeTrace.retrievedCount} | reranked ${snapshot.knowledgeTrace.rerankedCount} | rerank: ${snapshot.knowledgeTrace.rerankUsed ? "on" : "off"}`,
        M + 6, y, { color: C.muted, size: 7.5 }
      );
    }
    y += 3;
  }

  // ===== PAPERWORK CHECKS =====
  if (snapshot.paperworkChecks) {
    y = drawSectionHeader(pdf, y, "People & Paperwork Checks");

    const pwRows: string[][] = [];
    for (const item of snapshot.paperworkChecks.checklist.slice(0, 4)) {
      pwRows.push(["Checklist", item.slice(0, 70)]);
    }
    for (const flag of snapshot.paperworkChecks.riskFlags.slice(0, 3)) {
      pwRows.push(["⚠ Risk Flag", flag.slice(0, 70)]);
    }
    for (const doc of snapshot.paperworkChecks.requiredDocuments.slice(0, 3)) {
      pwRows.push(["📄 Document", doc.slice(0, 70)]);
    }

    if (pwRows.length > 0) {
      y = drawTable(pdf, y, ["Type", "Detail"], pwRows, [30, CW - 30]);
    }
    y += 2;
  }

  // ===== ROOM EVIDENCE BASIS =====
  if (snapshot.reportEvidenceBasis?.length) {
    y = drawSectionHeader(pdf, y, "Room-by-Room Evidence Basis");

    for (const basis of snapshot.reportEvidenceBasis.slice(0, 4)) {
      y = ensureSpace(pdf, y, 14);
      const room = formatRoomTypeLabel(basis.roomType);

      y = drawKeyValueRow(pdf, y, room, `${basis.verdict.status} — ${basis.verdict.summary}`, CW);

      if (basis.missingEvidence.length > 0) {
        y = drawBulletItem(pdf, y,
          `Missing: ${basis.missingEvidence.slice(0, 3).join(", ")}`,
          { bulletColor: C.orange, indent: M + 12 }
        );
      }
    }
    y += 3;
  }

  // ===== FOOTER =====
  y = ensureSpace(pdf, y + 4, 16);
  pdf.setDrawColor(...C.cyan);
  pdf.setLineWidth(0.3);
  pdf.line(M, y, M + CW, y);
  y += 5;
  drawText(pdf,
    "Inspect.AI is an AI-assisted screening tool and does not replace a licensed building inspector. Verify all findings before signing or paying a deposit.",
    M, y, { color: C.muted, size: 8, lineHeight: 3.8, maxWidth: CW }
  );

  return pdf.output("blob");
}

// ---------------------------------------------------------------------------
// Legacy poster (keep the existing Canvas-based poster as the "simple export")
// ---------------------------------------------------------------------------

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
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);

  const visibleLines = typeof args.maxLines === "number" ? lines.slice(0, args.maxLines) : lines;
  visibleLines.forEach((item, index) => {
    const isLast = typeof args.maxLines === "number" && index === visibleLines.length - 1 && lines.length > visibleLines.length;
    args.ctx.fillText(isLast ? `${item}...` : item, args.x, args.y + index * args.lineHeight);
  });
  return args.y + visibleLines.length * args.lineHeight;
}

function summarizeHazards(snapshot: ReportSnapshot) {
  if (snapshot.hazards.length === 0) return ["No confirmed hazards recorded."];
  return snapshot.hazards.slice(0, 6).map((h) => {
    const room = h.roomType ? ` (${formatRoomTypeLabel(h.roomType)})` : "";
    return `${h.severity} ${h.category}${room}: ${h.description}`;
  });
}

function summarizeCoverage(snapshot: ReportSnapshot) {
  if (!snapshot.inspectionCoverage) return ["Coverage not summarized yet."];
  return [
    snapshot.inspectionCoverage.summary || "Coverage summary unavailable.",
    ...(snapshot.inspectionCoverage.warning ? [snapshot.inspectionCoverage.warning] : []),
    ...(snapshot.inspectionCoverage.missingAreas.length > 0
      ? [`Missing: ${snapshot.inspectionCoverage.missingAreas.slice(0, 4).join("; ")}`] : []),
  ];
}

function summarizeActionGuide(snapshot: ReportSnapshot) {
  if (!snapshot.preLeaseActionGuide) return ["No action guide available."];
  return [
    ...(snapshot.preLeaseActionGuide.summary ? [snapshot.preLeaseActionGuide.summary] : []),
    ...snapshot.preLeaseActionGuide.negotiatePoints.slice(0, 3),
    ...snapshot.preLeaseActionGuide.furtherInspectionItems.slice(0, 3),
  ];
}

function summarizeKnowledge(snapshot: ReportSnapshot) {
  if (!snapshot.knowledgeAnswer) return ["RAG knowledge not available."];
  return [
    snapshot.knowledgeAnswer.summary,
    ...snapshot.knowledgeAnswer.keyPoints.slice(0, 3),
  ];
}

async function buildPosterBlob(snapshot: ReportSnapshot) {
  const poster = document.createElement("canvas");
  poster.width = 1080;
  poster.height = 1920;
  const ctx = poster.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable.");

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
  ctx.fillText("Inspect.AI", 72, 112);

  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillStyle = "#95A0B7";
  let y = drawWrappedCanvasText({
    ctx, text: snapshot.inputs.address || "Rental inspection snapshot",
    x: 72, y: 164, maxWidth: 840, lineHeight: 40, maxLines: 2,
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
    text: snapshot.recommendation?.summary || "Recommendation is being prepared.",
    x: 320, y: y + 162, maxWidth: 620, lineHeight: 34, maxLines: 3,
  });

  const sections = [
    { title: "Top Hazards", items: summarizeHazards(snapshot).slice(0, 3) },
    { title: "Coverage", items: summarizeCoverage(snapshot).slice(0, 3) },
    { title: "Next Actions", items: summarizeActionGuide(snapshot).slice(0, 3) },
    { title: "RAG Knowledge", items: summarizeKnowledge(snapshot).slice(0, 3) },
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
    let sectionY = y + 98;
    for (const item of section.items) {
      ctx.fillStyle = "#3DDCFF";
      ctx.beginPath();
      ctx.arc(108, sectionY - 10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#D9E2EC";
      sectionY = drawWrappedCanvasText({
        ctx, text: item, x: 126, y: sectionY, maxWidth: 840, lineHeight: 30, maxLines: 2,
      });
      sectionY += 16;
    }
    y += 286;
  }

  ctx.fillStyle = "#95A0B7";
  ctx.font = "500 22px system-ui, sans-serif";
  drawWrappedCanvasText({
    ctx,
    text: "AI-assisted export. Verify all findings with a licensed professional before signing.",
    x: 72, y: 1810, maxWidth: 920, lineHeight: 30, maxLines: 3,
  });

  return await new Promise<Blob>((resolve, reject) => {
    poster.toBlob((blob) => {
      if (!blob) { reject(new Error("Canvas export failed.")); return; }
      resolve(blob);
    }, "image/png");
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function exportReportPdf({ snapshot }: ExportNodeOptions) {
  const blob = buildEnhancedPdfBlob(snapshot);
  downloadBlob(blob, `${buildFileBase(snapshot)}.pdf`);
}

export async function exportReportPoster({ snapshot }: ExportNodeOptions) {
  const blob = await buildPosterBlob(snapshot);
  downloadBlob(blob, `${buildFileBase(snapshot)}-poster.png`);
}
