import { describe, expect, it } from "vitest";
import { normalizeLocale, translate, formatDateTime, LOCALE_LABELS, APP_LOCALES } from "./i18n";

describe("i18n — normalizeLocale", () => {
  it("returns en for empty input", () => {
    expect(normalizeLocale("")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });

  it("matches known locale prefixes", () => {
    expect(normalizeLocale("zh")).toBe("zh");
    expect(normalizeLocale("zh-CN")).toBe("zh");
    expect(normalizeLocale("zh-TW")).toBe("zh");
    expect(normalizeLocale("es")).toBe("es");
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("ja")).toBe("ja");
    expect(normalizeLocale("ko")).toBe("ko");
    expect(normalizeLocale("pt")).toBe("pt");
    expect(normalizeLocale("pt-BR")).toBe("pt");
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("en-US")).toBe("en");
  });

  it("falls back to en for unrecognised locales", () => {
    expect(normalizeLocale("fr")).toBe("en");
    expect(normalizeLocale("de")).toBe("en");
  });
});

describe("i18n — translate", () => {
  it("returns the key unchanged for en locale", () => {
    expect(translate("en", "Hello")).toBe("Hello");
    expect(translate("en", "Some key")).toBe("Some key");
  });

  it("returns zh translations when available", () => {
    expect(translate("zh", "Language")).toBe("语言");
    expect(translate("zh", "Compare")).toBe("对比");
    expect(translate("zh", "History")).toBe("历史");
    expect(translate("zh", "Generate Report")).toBe("生成报告");
    expect(translate("zh", "Back Home")).toBe("返回首页");
    expect(translate("zh", "Manual Upload")).toBe("手动上传");
  });

  it("falls back to English key when zh translation is missing", () => {
    expect(translate("zh", "A key that does not exist")).toBe("A key that does not exist");
  });

  it("interpolates variables into translation templates", () => {
    expect(translate("zh", "Hazards: {count}", { count: 5 })).toBe("隐患：5");
    expect(translate("zh", "Compare {count} properties", { count: 3 })).toBe("对比 3 个房源");
    expect(translate("zh", "{category} added to report.", { category: "Mould" })).toBe("Mould 已加入报告。");
  });

  it("handles missing variable values by inserting empty string", () => {
    expect(translate("zh", "Hello {name}", {})).toBe("Hello ");
    expect(translate("zh", "A key without vars")).toBe("A key without vars");
  });

  it("handles number variables", () => {
    expect(translate("zh", "Maximum {count} images allowed", { count: 8 })).toBe("最多允许 8 张图片");
    expect(translate("zh", "Rank {rank}", { rank: 1 })).toBe("第 1 名");
  });

  it("translates room types for zh", () => {
    expect(translate("zh", "living room")).toBe("客厅");
    expect(translate("zh", "bathroom")).toBe("浴室");
    expect(translate("zh", "bedroom")).toBe("卧室");
    expect(translate("zh", "kitchen")).toBe("厨房");
    expect(translate("zh", "laundry")).toBe("洗衣房");
    expect(translate("zh", "balcony")).toBe("阳台");
    expect(translate("zh", "hallway")).toBe("走廊");
    expect(translate("zh", "general area")).toBe("一般区域");
  });

  it("translates severity levels for zh", () => {
    expect(translate("zh", "Critical")).toBe("严重");
    expect(translate("zh", "High")).toBe("高");
    expect(translate("zh", "Medium")).toBe("中");
    expect(translate("zh", "Low")).toBe("低");
  });

  it("translates decision outcomes for zh", () => {
    expect(translate("zh", "Apply")).toBe("申请");
    expect(translate("zh", "Negotiate")).toBe("谈判");
    expect(translate("zh", "Inspect Further")).toBe("继续检查");
    expect(translate("zh", "Walk Away")).toBe("放弃");
  });

  it("translates hazard categories for zh", () => {
    expect(translate("zh", "Mould")).toBe("霉菌");
    expect(translate("zh", "Structural")).toBe("结构");
    expect(translate("zh", "Plumbing")).toBe("管道");
    expect(translate("zh", "Pest")).toBe("虫害");
    expect(translate("zh", "Electrical")).toBe("电气");
    expect(translate("zh", "Safety")).toBe("安全");
  });

  it("translates async status labels for zh", () => {
    expect(translate("zh", "loading")).toBe("加载中");
    expect(translate("zh", "success")).toBe("成功");
    expect(translate("zh", "fallback")).toBe("降级");
    expect(translate("zh", "error")).toBe("错误");
    expect(translate("zh", "idle")).toBe("空闲");
  });

  it("translates home page smoke-test strings for zh", () => {
    // Macro/micro scale
    expect(translate("zh", "MACRO-SCALE MAPPING")).toBe("宏尺度建模");
    expect(translate("zh", "MICRO-SCALE MAPPING")).toBe("微尺度建模");
    // Slogan
    expect(translate("zh", "Scan Deeper. Rent Smarter.")).toBe("扫描更深入，租房更聪明。");
    // Description
    expect(translate("zh", "An AI-first rental inspection copilot built for faster screening, stronger evidence capture, and smarter lease decisions."))
      .toBe("一款 AI 驱动的租赁检查副驾驶，旨在加快筛选速度、增强证据采集，并做出更明智的租约决策。");
    expect(translate("zh", "Move past surface impressions and inspect what actually matters."))
      .toBe("超越表面印象，检查真正重要的内容。");
    // Buttons
    expect(translate("zh", "Enter Deep Scan")).toBe("进入深度扫描");
    expect(translate("zh", "Manual Override")).toBe("手动模式");
    // Status
    expect(translate("zh", "TARGET LOCK")).toBe("目标锁定");
    expect(translate("zh", "BREACH PROTOCOL INIT")).toBe("突破协议启动");
    // Scan indicators
    expect(translate("zh", "MACRO-SCAN")).toBe("宏扫描");
    expect(translate("zh", "MICRO-SCAN")).toBe("微扫描");
    // Latency line
    expect(translate("zh", "LATENCY: 12MS // PROTOCOL:")).toBe("延迟：12毫秒 // 协议：");
    expect(translate("zh", "INDOOR_MAPPING")).toBe("室内建模");
    expect(translate("zh", "EXTERIOR_SYNC")).toBe("外部同步");
    // Exterior labels
    expect(translate("zh", "EXTERIOR: SUBURBAN RESIDENCE")).toBe("外部：郊区住宅");
    expect(translate("zh", "EXTERIOR: HIGH-RISE APARTMENT")).toBe("外部：高层公寓");
    expect(translate("zh", "INTERIOR: LIVING ROOM TOPOLOGY")).toBe("内部：客厅拓扑");
    // Status text variants
    expect(translate("zh", "CRITICAL OVERRIDE: BREACHING EXTERIOR...")).toBe("紧急越权：正在突破外部...");
    expect(translate("zh", "INTERIOR TOPOLOGY: LIVING ROOM SECURED")).toBe("内部拓扑：客厅已安全");
    expect(translate("zh", "RE-ESTABLISHING MACRO VIEW...")).toBe("正在重建宏观视野...");
    expect(translate("zh", "EXTERNAL MACRO SCAN")).toBe("外部宏观扫描");
    // Data panels
    expect(translate("zh", "Detected Hazards")).toBe("已检测隐患");
    expect(translate("zh", "Data Integrity")).toBe("数据完整度");
  });

  it("translates home page intake modal strings for zh", () => {
    expect(translate("zh", "LIVE INTAKE")).toBe("实时录入");
    expect(translate("zh", "MANUAL INTAKE")).toBe("手动录入");
    expect(translate("zh", "Configure Deep Scan")).toBe("配置深度扫描");
    expect(translate("zh", "Prepare Manual Override")).toBe("准备手动模式");
    expect(translate("zh", "Property Address")).toBe("房源地址");
    expect(translate("zh", "Resolved Address")).toBe("已解析地址");
    expect(translate("zh", "Saved Address")).toBe("已保存地址");
    expect(translate("zh", "Real Estate Agency")).toBe("房地产中介");
    expect(translate("zh", "Start Live Scan")).toBe("开始实时扫描");
    expect(translate("zh", "Continue to Manual Upload")).toBe("继续到手动上传");
  });

  it("translates newly added page.tsx keys for zh", () => {
    expect(translate("zh", "Failed to resolve current location.")).toBe("当前位置解析失败。");
    expect(translate("zh", "Failed to load saved reports.")).toBe("加载已保存报告失败。");
    expect(translate("zh", "Comparison report generation failed.")).toBe("对比报告生成失败。");
    expect(translate("zh", "Unknown error")).toBe("未知错误");
    expect(translate("zh", "Weekly Rent")).toBe("周租金");
  });
});

describe("i18n — formatDateTime", () => {
  it("uses zh-CN Intl locale for zh", () => {
    const result = formatDateTime("zh", new Date("2025-06-12T10:30:00Z").getTime());
    // Should contain Chinese date separators
    expect(result).toMatch(/2025/);
  });

  it("uses en-AU Intl locale for en", () => {
    const result = formatDateTime("en", new Date("2025-06-12T10:30:00Z").getTime());
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/Jun|June/);
  });
});

describe("i18n — LOCALE_LABELS", () => {
  it("has labels for all APP_LOCALES", () => {
    for (const locale of APP_LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
    }
  });

  it("includes Chinese as a supported locale", () => {
    expect(APP_LOCALES).toContain("zh");
    expect(LOCALE_LABELS.zh).toBe("中文");
  });
});
