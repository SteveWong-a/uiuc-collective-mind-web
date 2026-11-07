import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { chicagoDate, zonedToISO, formatChicago, TZ } from "./model.mjs";

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const MCP_SERVER_NAME = "uiuc-collective-mind-muse";
export const MCP_SERVER_VERSION = "1.0.0";

const HOUR = 3_600_000;
const DAY = 86_400_000;

const shiftDate = (date, days) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const prevDate = (date) => shiftDate(date, -1);
const nextDate = (date) => shiftDate(date, 1);
const hourOn = (date, hour, minute = 0) => {
  const [year, month, day] = date.split("-").map(Number);
  return zonedToISO({ year, month, day, hour, minute });
};

/**
 * Extracts a numeric percentage (0..150) from an assignment's grade string or details text.
 * Supports formats like "95%", "100.00%", "9/10", "Score: 45%", "Score 50.00/100.00 (50.00%)".
 */
export function parseGradePercent(grade, details = "") {
  const candidates = [grade, details].filter(Boolean).map(String);
  for (const text of candidates) {
    // Check explicit percentage in parentheses first, e.g. "50.00/100.00 (50.00%)"
    const parenPct = text.match(/\(([\d.]+)\s*%\)/);
    if (parenPct) {
      const v = Number.parseFloat(parenPct[1]);
      if (Number.isFinite(v)) return Math.max(0, Math.min(150, Math.round(v * 100) / 100));
    }
    // Check "Score: 85%" or standalone "85%"
    const scorePct = text.match(/(?:Score:?\s*)?([\d.]+)\s*%/i);
    if (scorePct && (text === String(grade) || /Score:?/i.test(text))) {
      const v = Number.parseFloat(scorePct[1]);
      if (Number.isFinite(v)) return Math.max(0, Math.min(150, Math.round(v * 100) / 100));
    }
    // Check fraction "9/10" or "Score 85.00/100.00"
    const frac = text.match(/(?:Score:?\s*)?([\d.]+)\s*\/\s*([\d.]+)/i);
    if (frac) {
      const num = Number.parseFloat(frac[1]);
      const den = Number.parseFloat(frac[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        return Math.max(0, Math.min(150, Math.round((num / den) * 10000) / 100));
      }
    }
  }
  if (typeof grade === "string") {
    const letter = grade.trim().toUpperCase();
    const letterMap = {
      "A+": 98, A: 95, "A-": 91,
      "B+": 88, B: 85, "B-": 81,
      "C+": 78, C: 75, "C-": 71,
      "D+": 68, D: 65, "D-": 61,
      F: 40, COMPLETE: 100, PASS: 100, INCOMPLETE: 0,
    };
    if (letter in letterMap) return letterMap[letter];
  }
  return null;
}

/**
 * Parses remaining or late credit windows from assignment details.
 */
export function parseCreditWindows(details = "", dueAt = null, status = "open", now = new Date(), currentScore = null) {
  const nowMs = now.getTime();
  const dueMs = dueAt ? Date.parse(dueAt) : null;
  const text = String(details ?? "");
  let currentCreditPercent = 100;
  let hasLateWindow = false;
  let lateWindowDesc = null;

  // PrairieLearn access window rows: "80%: Sep 4 00:00 – Sep 10 23:59"
  const plWindows = [...text.matchAll(/(\d+)%\s*:\s*([^\n]+?)\s*[–-]\s*([^\n]+)/g)];
  if (plWindows.length > 0) {
    for (const m of plWindows) {
      const pct = Number.parseInt(m[1], 10);
      if (pct > 0 && pct < 100) {
        hasLateWindow = true;
        lateWindowDesc = `${pct}% credit window (${m[2].trim()} – ${m[3].trim()})`;
        if (dueMs !== null && dueMs < nowMs && status !== "closed") {
          currentCreditPercent = pct;
        }
      }
    }
  }

  // SmartPhysics credit line: "Due: Sep. 9 at 8:00 AM for 80% credit"
  const spMatch = text.match(/for\s+(\d+)%\s+credit/i);
  if (spMatch) {
    const pct = Number.parseInt(spMatch[1], 10);
    if (Number.isFinite(pct)) {
      currentCreditPercent = pct;
      if (pct < 100) {
        hasLateWindow = true;
        lateWindowDesc = `${pct}% late credit available`;
      }
    }
  }

  const isPastDue = dueMs !== null && !Number.isNaN(dueMs) && dueMs < nowMs;
  // If the student already earned as much or more than the late credit window offers (e.g. 92% > 80%),
  // no additional credit can be gained by submitting.
  const hasWorthwhileCredit = currentScore === null || currentScore < currentCreditPercent;
  const canSubmit = (status === "open" || status === "unknown" || (hasLateWindow && status !== "closed" && status !== "graded")) && hasWorthwhileCredit;

  return {
    currentCreditPercent: status === "closed" && isPastDue ? 0 : currentCreditPercent,
    hasLateWindow,
    lateWindowDesc,
    canSubmit,
    hasWorthwhileCredit,
  };
}

/**
 * Computes per-course grade history, performance trends, weak topics, and structuring feedback
 * so Muse AI can tailor homework block duration and study advice.
 */
export function buildCourseGradeHistory(assignments = [], { now = new Date() } = {}) {
  const nowMs = now.getTime();
  const byCourse = new Map();

  for (const a of assignments) {
    if (!a || !a.course) continue;
    if (!byCourse.has(a.course)) {
      byCourse.set(a.course, []);
    }
    byCourse.get(a.course).push(a);
  }

  const courses = {};
  for (const [course, items] of byCourse.entries()) {
    const scoredItems = [];
    const weakAreas = [];
    let missedCount = 0;
    let inProgressCount = 0;
    let completedPastCount = 0;
    let totalPastCount = 0;

    // Sort chronologically by dueAt (or seenAt) to compute trends
    const sorted = [...items].sort((x, y) => {
      const dx = x.dueAt ? Date.parse(x.dueAt) : 0;
      const dy = y.dueAt ? Date.parse(y.dueAt) : 0;
      return dx - dy || String(x.id).localeCompare(String(y.id));
    });

    for (const a of sorted) {
      if (a.source === "prairietest") continue; // CBTF reservations are exam slots, not graded homework rows
      const pct = parseGradePercent(a.grade, a.details);
      const dueMs = a.dueAt ? Date.parse(a.dueAt) : null;
      const isPast = dueMs !== null && !Number.isNaN(dueMs) && dueMs < nowMs;

      const isPartial = (a.status === "submitted" || a.status === "open") && pct !== null && pct > 0 && pct < 100;
      if (isPartial && !isPast) {
        inProgressCount++;
      }

      const isMissed =
        isPast &&
        ((pct !== null && pct === 0) ||
          ((a.status === "open" || a.status === "unknown" || a.status === "closed") && (pct === null || pct < 100) && !(a.status === "graded" && a.grade === null)));

      if (isPast) {
        totalPastCount++;
        if (!isMissed && (a.status === "graded" || a.status === "submitted" || (pct !== null && pct > 0))) {
          completedPastCount++;
        }
      }

      if (isMissed) {
        missedCount++;
        scoredItems.push({
          id: a.id,
          title: a.title,
          dueAt: a.dueAt,
          grade: a.grade ?? "0%",
          scorePercent: pct ?? 0,
          status: a.status,
          missed: true,
        });
        weakAreas.push({
          id: a.id,
          title: a.title,
          grade: a.grade ?? "0%",
          scorePercent: pct ?? 0,
          reason: a.status === "closed" ? "missed deadline (closed at 0%)" : "overdue / incomplete",
        });
      } else if (a.status === "graded" || (pct !== null && (isPast || pct >= 100))) {
        const effectivePct = pct ?? 100;
        scoredItems.push({
          id: a.id,
          title: a.title,
          dueAt: a.dueAt,
          grade: a.grade ?? `${effectivePct}%`,
          scorePercent: effectivePct,
          status: a.status,
          missed: false,
        });
        if (effectivePct < 85) {
          weakAreas.push({
            id: a.id,
            title: a.title,
            grade: a.grade ?? `${effectivePct}%`,
            scorePercent: effectivePct,
            reason: effectivePct < 70 ? "low score (<70%) — review core concepts" : "below target (<85%) — check edge cases",
          });
        }
      }
    }

    const numericScores = scoredItems.map((x) => x.scorePercent).filter((v) => typeof v === "number" && Number.isFinite(v));
    const averagePercent =
      numericScores.length > 0
        ? Math.round((numericScores.reduce((acc, v) => acc + v, 0) / numericScores.length) * 100) / 100
        : null;

    let trend = "insufficient_data";
    if (numericScores.length >= 3) {
      const mid = Math.floor(numericScores.length / 2);
      const firstHalf = numericScores.slice(0, mid);
      const secondHalf = numericScores.slice(mid);
      const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
      if (avgSecond - avgFirst >= 4) trend = "improving";
      else if (avgFirst - avgSecond >= 4) trend = "declining";
      else trend = "steady";
    }

    const completionRatePercent =
      totalPastCount > 0 ? Math.round((completedPastCount / totalPastCount) * 10000) / 100 : null;

    // Compute dynamic time multiplier for scheduling blocks in this course
    let timeMultiplier = 1.0;
    if (averagePercent !== null) {
      if (averagePercent < 70) timeMultiplier += 0.45;
      else if (averagePercent < 82) timeMultiplier += 0.25;
      else if (averagePercent < 90) timeMultiplier += 0.1;
    }
    if (missedCount > 0) timeMultiplier += Math.min(0.4, missedCount * 0.15);
    if (trend === "declining") timeMultiplier += 0.15;
    timeMultiplier = Math.round(Math.min(2.0, timeMultiplier) * 100) / 100;

    // Build concrete structuring feedback for Muse AI based on course performance
    const feedbackParts = [];
    if (averagePercent !== null) {
      feedbackParts.push(`${course} average is ${averagePercent}% across ${numericScores.length} graded/past assignments (${trend.replace(/_/g, " ")}).`);
    } else {
      feedbackParts.push(`${course} has no graded history yet; use baseline study structure.`);
    }
    if (missedCount > 0) {
      feedbackParts.push(
        `ALERT: ${missedCount} missed/overdue assignment(s) in ${course}. Start homework blocks at least 48h before deadline and split into two checkpoints.`
      );
    }
    if (weakAreas.length > 0) {
      const topWeak = weakAreas.slice(-3).map((w) => `${w.title} (${w.scorePercent}%)`).join(", ");
      feedbackParts.push(
        `Spend the first 15 minutes reviewing prior friction points (${topWeak}) before tackling new problems.`
      );
    } else if (averagePercent !== null && averagePercent >= 92) {
      feedbackParts.push(`Strong mastery in ${course}; standard single-block execution is sufficient.`);
    }

    courses[course] = {
      course,
      averagePercent,
      gradedCount: scoredItems.filter((x) => !x.missed).length,
      missedCount,
      inProgressCount,
      completionRatePercent,
      trend,
      timeMultiplier,
      previousGrades: [...scoredItems].reverse().slice(0, 25),
      weakAreas: [...weakAreas].reverse().slice(0, 10),
      structuringFeedback: feedbackParts.join(" "),
    };
  }

  return courses;
}

/**
 * Analyzes a single assignment to extract live progress, missed/overdue state,
 * remaining workload, priority score, and structuring recommendations for Muse AI.
 */
export function analyzeAssignment(a, { now = new Date(), courseStats = null } = {}) {
  const nowMs = now.getTime();
  const pct = parseGradePercent(a.grade, a.details);
  const dueMs = a.dueAt ? Date.parse(a.dueAt) : null;
  const hasValidDue = dueMs !== null && !Number.isNaN(dueMs);
  const isPastDue = hasValidDue && dueMs < nowMs;
  const hoursUntilDue = hasValidDue ? Math.round(((dueMs - nowMs) / HOUR) * 10) / 10 : null;
  const creditWindow = parseCreditWindows(a.details, a.dueAt, a.status, now, pct);

  // Determine progress percentage & state
  let progressPercent = 0;
  let progressState = "not_started";

  if (a.source === "prairietest") {
    progressPercent = isPastDue || a.status === "closed" ? 100 : 0;
    progressState = isPastDue || a.status === "closed" ? "completed" : "scheduled_exam";
  } else if (pct !== null && pct >= 100) {
    progressPercent = 100;
    progressState = "graded";
  } else if ((a.status === "submitted" || a.status === "open") && pct !== null && pct > 0 && pct < 100) {
    // PrairieLearn, CS 128, SmartPhysics report status="submitted" as soon as score > 0%
    progressPercent = pct;
    progressState = isPastDue ? (creditWindow.canSubmit ? "missed_open" : "graded") : "in_progress";
  } else if (a.status === "graded") {
    if (pct !== null && pct === 0 && isPastDue) {
      progressPercent = 0;
      progressState = "missed_closed";
    } else {
      progressPercent = pct ?? 100;
      progressState = "graded";
    }
  } else if (a.status === "submitted") {
    // Turned in (e.g. Canvas file upload) waiting for grade
    progressPercent = 100;
    progressState = "submitted";
  } else if (isPastDue) {
    progressPercent = pct ?? 0;
    progressState = creditWindow.canSubmit ? "missed_open" : "missed_closed";
  } else if (a.status === "closed") {
    progressPercent = pct ?? 0;
    progressState = "closed";
  } else {
    progressPercent = pct ?? 0;
    progressState = progressPercent > 0 ? "in_progress" : "not_started";
  }

  const remainingPercent = Math.max(0, Math.round((100 - Math.min(100, progressPercent)) * 100) / 100);
  const isMissed = progressState === "missed_open" || progressState === "missed_closed";
  const isSubmittable =
    progressState === "not_started" ||
    progressState === "in_progress" ||
    progressState === "missed_open";

  // Base duration by source type (in minutes for 100% of an assignment)
  const baseMinutesBySource = {
    cs128: 75,
    prairielearn: 60,
    canvas: 70,
    smartphysics: 45,
    prairietest: 60,
  };
  const baseMinutes = baseMinutesBySource[a.source] ?? 60;
  const multiplier = courseStats?.timeMultiplier ?? 1.0;
  const rawMinutes = remainingPercent > 0 ? (baseMinutes * (remainingPercent / 100)) * multiplier : 0;
  const estimatedRemainingMinutes = remainingPercent > 0 ? Math.max(15, Math.round(rawMinutes / 5) * 5) : 0;

  // Compute urgency / priority score for Muse AI block ordering
  let priorityScore = 0;
  let priorityLevel = "low";
  if (isSubmittable || progressState === "scheduled_exam") {
    if (progressState === "missed_open") {
      const daysPastDue = hasValidDue ? (nowMs - dueMs) / DAY : 0;
      if (daysPastDue > 14 || progressPercent >= 80) {
        // Old or near-complete work is low-value late credit; do not displace current deadlines
        priorityScore = 20;
        priorityLevel = "low";
      } else {
        // Recent actionable missed work -> highest priority pivot!
        priorityScore = 100 + Math.round(remainingPercent * 0.3) + Math.round((multiplier - 1) * 30);
        priorityLevel = "critical_pivot";
      }
    } else if (hoursUntilDue !== null) {
      if (hoursUntilDue <= 12) {
        priorityScore = 85 + Math.round(remainingPercent * 0.15);
        priorityLevel = "high";
      } else if (hoursUntilDue <= 24) {
        priorityScore = 70 + Math.round(remainingPercent * 0.15);
        priorityLevel = "high";
      } else if (hoursUntilDue <= 72) {
        priorityScore = 50 + Math.round(remainingPercent * 0.1);
        priorityLevel = "medium";
      } else {
        priorityScore = 25;
        priorityLevel = "low";
      }
      priorityScore += Math.round((multiplier - 1) * 20);
    } else {
      priorityScore = 20;
      priorityLevel = "low";
    }
  }

  // Construct assignment-specific structuring guidance
  const advice = [];
  if (progressState === "missed_open") {
    if (priorityLevel === "low") {
      advice.push(
        `LOW-VALUE LATE CREDIT: "${a.title}" (${a.course}) is overdue (${progressPercent}% earned, max late credit ${creditWindow.currentCreditPercent}%). Do not displace current-week deadlines.`
      );
    } else {
      advice.push(
        `PIVOT REQUIRED: "${a.title}" (${a.course}) is past due (${progressPercent}% complete, ${remainingPercent}% left) and still open (${creditWindow.currentCreditPercent}% credit). Allocate ~${estimatedRemainingMinutes} min immediately.`
      );
    }
  } else if (progressState === "in_progress") {
    advice.push(
      `IN PROGRESS: ${progressPercent}% complete (${remainingPercent}% remaining). Schedule ~${estimatedRemainingMinutes} min to finish remaining problems.`
    );
  } else if (progressState === "not_started" && isSubmittable) {
    advice.push(
      `NOT STARTED: Allocate ~${estimatedRemainingMinutes} min (${multiplier > 1.1 ? `scaled ${multiplier}x from ${a.course} grade history` : "standard block"}).`
    );
  }
  if (courseStats?.weakAreas?.length > 0 && isSubmittable) {
    const recentWeak = courseStats.weakAreas[0];
    advice.push(
      `Based on past ${a.course} score on "${recentWeak.title}" (${recentWeak.scorePercent}%), reserve 10-15 min for reviewing concepts/tests before submitting.`
    );
  }

  return {
    id: a.id,
    course: a.course,
    title: a.title,
    source: a.source,
    dueAt: a.dueAt ?? null,
    openAt: a.openAt ?? null,
    url: a.url ?? "",
    status: a.status,
    grade: a.grade ?? null,
    details: a.details ?? "",
    progressPercent,
    remainingPercent,
    progressState,
    isMissed,
    isSubmittable,
    hoursUntilDue,
    creditWindow,
    estimatedRemainingMinutes,
    priorityScore,
    priorityLevel,
    structuringAdvice: advice.join(" "),
  };
}

/**
 * Dynamically plans and rearranges homework blocks for Muse AI.
 * Unlike static blocks, this:
 * 1. Includes both not-started AND partially-completed (in_progress) assignments.
 * 2. Detects missed/overdue assignments that can still be turned in (missed_open)
 *    and immediately pivots tonight's block to allocate time for them first.
 * 3. Dynamically scales block duration and per-assignment time allocations using
 *    remaining progress (100 - progressPercent) and course grade history multipliers.
 */
export function planDynamicBlocks(
  assignments = [],
  {
    now = new Date(),
    withinHours = 24,
    startHour = 20,
    endHour = 23,
    courseHistory = null,
  } = {}
) {
  const nowMs = now.getTime();
  const courses = courseHistory ?? buildCourseGradeHistory(assignments, { now });
  const analyzed = assignments.map((a) =>
    analyzeAssignment(a, { now, courseStats: courses[a.course] ?? null })
  );

  const byDate = new Map();
  for (const item of analyzed) {
    if (!item.dueAt || item.source === "prairietest") continue;
    // Include any assignment that still needs work (not_started, in_progress, missed_open)
    if (!item.isSubmittable || item.remainingPercent <= 0) continue;

    const due = Date.parse(item.dueAt);
    if (Number.isNaN(due)) continue;

    // Missed/overdue submittable work: only genuinely actionable items enter tonight's emergency block.
    // Low-value late credit (e.g. old September/October work or >=80% completed) must NEVER
    // displace current-week deadlines or examlet study blocks.
    if (due <= nowMs) {
      const daysOverdue = (nowMs - due) / DAY;
      if (item.priorityLevel === "low" || daysOverdue > 14 || item.progressPercent >= 80) {
        continue;
      }
    }

    // Upcoming work enters a block once within `withinHours` (or scaled window for heavy courses).
    const courseMultiplier = courses[item.course]?.timeMultiplier ?? 1.0;
    const effectiveWithinHours = Math.round(withinHours * Math.max(1, (courseMultiplier - 1) * 0.5 + 1));
    if (due > nowMs && nowMs < due - effectiveWithinHours * HOUR) continue;

    let date;
    if (due <= nowMs) {
      const today = chicagoDate(now.toISOString());
      date = Date.parse(hourOn(today, endHour)) <= nowMs ? nextDate(today) : today;
    } else {
      const deadlineDate = chicagoDate(item.dueAt);
      date = Date.parse(hourOn(deadlineDate, startHour)) < due ? deadlineDate : prevDate(deadlineDate);
    }

    const baseEnd = hourOn(date, endHour);
    if (Date.parse(baseEnd) <= nowMs) continue;

    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        pivoted: false,
        assignments: [],
      });
    }
    const group = byDate.get(date);
    if (item.progressState === "missed_open") group.pivoted = true;
    group.assignments.push(item);
  }

  const blocks = [];
  for (const group of byDate.values()) {
    // Sort by priorityScore descending (missed_open pivots first), then dueAt ascending
    group.assignments.sort(
      (x, y) =>
        y.priorityScore - x.priorityScore ||
        Date.parse(x.dueAt) - Date.parse(y.dueAt) ||
        x.id.localeCompare(y.id)
    );

    const defaultBlockMinutes = Math.max(60, (endHour - startHour) * 60);
    const totalEstimatedMinutes = group.assignments.reduce(
      (sum, a) => sum + a.estimatedRemainingMinutes,
      0
    );

    // Dynamically size block duration: can scale between 60 min and defaultBlockMinutes + 60 min (if pivoted)
    const maxBlockMinutes = group.pivoted ? defaultBlockMinutes + 60 : defaultBlockMinutes;
    const targetBlockMinutes = Math.min(
      maxBlockMinutes,
      Math.max(defaultBlockMinutes, totalEstimatedMinutes)
    );

    // If pivoted and needs extra time beyond standard window, start up to 1 hour earlier (if still in the future)
    const extraMinutes = Math.max(0, targetBlockMinutes - defaultBlockMinutes);
    const extraHours = Math.ceil(extraMinutes / 60);
    const adjustedStartHour = Math.max(0, startHour - extraHours);
    let blockStartIso = hourOn(group.date, adjustedStartHour);
    if (Date.parse(blockStartIso) < nowMs && Date.parse(hourOn(group.date, startHour)) > nowMs) {
      blockStartIso = hourOn(group.date, startHour);
    }
    const blockEndIso = hourOn(group.date, endHour);
    const availableMinutes = Math.max(
      30,
      Math.round((Date.parse(blockEndIso) - Date.parse(blockStartIso)) / 60_000)
    );

    // Allocate minutes proportionally to estimatedRemainingMinutes * priority weight
    const weights = group.assignments.map(
      (a) => a.estimatedRemainingMinutes * (a.progressState === "missed_open" ? 1.35 : 1.0)
    );
    const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;

    let cursorMs = Date.parse(blockStartIso);
    const allocations = group.assignments.map((a, idx) => {
      const share =
        totalEstimatedMinutes <= availableMinutes
          ? a.estimatedRemainingMinutes
          : Math.max(15, Math.round(((weights[idx] / totalWeight) * availableMinutes) / 5) * 5);
      const slotStart = new Date(cursorMs).toISOString();
      cursorMs += share * 60_000;
      const slotEnd = new Date(cursorMs).toISOString();
      return {
        assignmentId: a.id,
        course: a.course,
        title: a.title,
        dueAt: a.dueAt,
        progressPercent: a.progressPercent,
        remainingPercent: a.remainingPercent,
        progressState: a.progressState,
        isMissed: a.isMissed,
        priorityLevel: a.priorityLevel,
        allocatedMinutes: share,
        slotStart,
        slotEnd,
        structuringAdvice: a.structuringAdvice,
      };
    });

    blocks.push({
      date: group.date,
      start: blockStartIso,
      end: blockEndIso,
      pivoted: group.pivoted,
      totalEstimatedMinutes,
      availableMinutes,
      assignments: group.assignments,
      allocations,
    });
  }

  return blocks.sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Builds the comprehensive Muse AI Rundown payload containing:
 * - Current assignments with live completion progress
 * - Missed/overdue assignments and automatic schedule pivot plan
 * - Course-by-course previous grades, averages, trends, and structuring feedback
 * - Dynamically allocated homework blocks
 */
export function buildMuseRundown(
  assignments = [],
  { changes = [], settings = {}, now = new Date() } = {}
) {
  const courseGrades = buildCourseGradeHistory(assignments, { now });
  const analyzed = assignments.map((a) =>
    analyzeAssignment(a, { now, courseStats: courseGrades[a.course] ?? null })
  );

  const missedAssignments = analyzed
    .filter((a) => a.isMissed)
    .sort((x, y) => y.priorityScore - x.priorityScore || Date.parse(x.dueAt ?? 0) - Date.parse(y.dueAt ?? 0));

  const missedOpen = missedAssignments.filter((a) => a.progressState === "missed_open");
  const missedClosed = missedAssignments.filter((a) => a.progressState === "missed_closed");

  const currentAssignments = analyzed
    .filter((a) => a.isSubmittable || a.progressState === "scheduled_exam")
    .sort((x, y) => y.priorityScore - x.priorityScore || Date.parse(x.dueAt ?? "2099-12-31") - Date.parse(y.dueAt ?? "2099-12-31"));

  const inProgressAssignments = currentAssignments.filter((a) => a.progressPercent > 0 && a.progressPercent < 100);
  const completedAssignments = analyzed.filter(
    (a) => a.progressState === "graded" || a.progressState === "submitted"
  );

  const dynamicBlocks = planDynamicBlocks(assignments, {
    now,
    withinHours: settings.blockWithinHours ?? 24,
    startHour: settings.blockStartHour ?? 20,
    endHour: settings.blockEndHour ?? 23,
    courseHistory: courseGrades,
  });

  const criticalMissed = missedOpen.filter((m) => m.priorityLevel === "critical_pivot");
  const lowValueLateCredit = missedOpen.filter((m) => m.priorityLevel === "low");
  const needsPivot = criticalMissed.length > 0 || inProgressAssignments.some((a) => a.hoursUntilDue !== null && a.hoursUntilDue <= 12);
  const pivotActions = [];
  for (const m of criticalMissed) {
    pivotActions.push({
      action: "reallocate_immediate_block",
      assignmentId: m.id,
      course: m.course,
      title: m.title,
      progressPercent: m.progressPercent,
      remainingPercent: m.remainingPercent,
      allocatedMinutes: m.estimatedRemainingMinutes,
      creditPercent: m.creditWindow.currentCreditPercent,
      reason: `Assignment is past due (${m.progressPercent}% done) but still submittable for ${m.creditWindow.currentCreditPercent}% credit.`,
      structuringAdvice: m.structuringAdvice,
    });
  }
  for (const l of lowValueLateCredit) {
    pivotActions.push({
      action: "report_low_value_late_credit",
      assignmentId: l.id,
      course: l.course,
      title: l.title,
      progressPercent: l.progressPercent,
      remainingPercent: l.remainingPercent,
      creditPercent: l.creditWindow.currentCreditPercent,
      reason: `Low-value late credit (${l.progressPercent}% earned, max ${l.creditWindow.currentCreditPercent}%). Do not displace current-week deadlines.`,
      structuringAdvice: l.structuringAdvice,
    });
  }
  for (const ip of inProgressAssignments) {
    if (ip.hoursUntilDue !== null && ip.hoursUntilDue <= 24) {
      pivotActions.push({
        action: "prioritize_in_progress_completion",
        assignmentId: ip.id,
        course: ip.course,
        title: ip.title,
        progressPercent: ip.progressPercent,
        remainingPercent: ip.remainingPercent,
        allocatedMinutes: ip.estimatedRemainingMinutes,
        hoursUntilDue: ip.hoursUntilDue,
        reason: `In-progress assignment (${ip.progressPercent}% done, ${ip.remainingPercent}% left) due in ${ip.hoursUntilDue}h.`,
        structuringAdvice: ip.structuringAdvice,
      });
    }
  }

  return {
    generatedAt: now.toISOString(),
    timezone: TZ,
    summary: {
      totalAssignments: analyzed.length,
      activeCount: currentAssignments.length,
      inProgressCount: inProgressAssignments.length,
      missedOpenCount: missedOpen.length,
      missedClosedCount: missedClosed.length,
      completedCount: completedAssignments.length,
      needsPivot,
      pivotSummary: needsPivot
        ? `Muse Pivot Active: ${missedOpen.length} missed-but-submittable assignment(s) and ${inProgressAssignments.length} in-progress assignment(s) dynamically prioritized in homework blocks.`
        : `Schedule on track: ${currentAssignments.length} active assignment(s), ${inProgressAssignments.length} in progress, 0 missed open assignments.`,
    },
    pivotPlan: {
      needsPivot,
      actions: pivotActions,
      dynamicBlocks,
    },
    currentAssignments,
    inProgressAssignments,
    missedAssignments,
    courseGrades,
    recentChanges: (changes ?? []).slice(0, 30),
  };
}

/**
 * Sliding-window rate limiter & circuit breaker for agentic MCP endpoints
 * to prevent runaway agent prompt loops.
 */
export class RateLimiter {
  constructor({ maxRequests = 60, windowMs = 60_000 } = {}) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }
  check(nowMs = Date.now()) {
    const cutoff = nowMs - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }
    this.timestamps.push(nowMs);
    return true;
  }
}

/**
 * Strictly validates incoming JSON-RPC 2.0 MCP messages and tool arguments.
 */
export function validateJsonRpcRequest(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    throw Object.assign(new Error("Invalid Request: message must be a JSON object"), { rpcCode: -32600 });
  }
  if (msg.jsonrpc !== "2.0") {
    throw Object.assign(new Error("Invalid Request: jsonrpc must be '2.0'"), { rpcCode: -32600 });
  }
  if (typeof msg.method !== "string" || !msg.method.trim()) {
    throw Object.assign(new Error("Invalid Request: method must be a non-empty string"), { rpcCode: -32600 });
  }
  if (msg.params !== undefined && (typeof msg.params !== "object" || msg.params === null || Array.isArray(msg.params))) {
    throw Object.assign(new Error("Invalid Params: params must be an object"), { rpcCode: -32602 });
  }
  return msg;
}

export function validateToolArguments(toolName, args = {}) {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw Object.assign(new Error("Tool arguments must be a JSON object"), { rpcCode: -32602 });
  }
  const out = {};
  if (args.course !== undefined) {
    if (typeof args.course !== "string" || args.course.length > 100) {
      throw Object.assign(new Error("course must be a string up to 100 chars"), { rpcCode: -32602 });
    }
    out.course = args.course.trim();
  }
  if (args.assignmentId !== undefined) {
    if (typeof args.assignmentId !== "string" || args.assignmentId.length > 200) {
      throw Object.assign(new Error("assignmentId must be a string up to 200 chars"), { rpcCode: -32602 });
    }
    out.assignmentId = args.assignmentId.trim();
  }
  if (args.includeCompleted !== undefined) {
    if (typeof args.includeCompleted !== "boolean") {
      throw Object.assign(new Error("includeCompleted must be a boolean"), { rpcCode: -32602 });
    }
    out.includeCompleted = args.includeCompleted;
  }
  for (const intKey of ["withinHours", "startHour", "endHour"]) {
    if (args[intKey] !== undefined) {
      const n = Number(args[intKey]);
      if (!Number.isInteger(n)) {
        throw Object.assign(new Error(`${intKey} must be an integer`), { rpcCode: -32602 });
      }
      out[intKey] = n;
    }
  }
  if (out.withinHours !== undefined && (out.withinHours < 1 || out.withinHours > 168)) {
    throw Object.assign(new Error("withinHours must be between 1 and 168"), { rpcCode: -32602 });
  }
  for (const hKey of ["startHour", "endHour"]) {
    if (out[hKey] !== undefined && (out[hKey] < 0 || out[hKey] > 23)) {
      throw Object.assign(new Error(`${hKey} must be between 0 and 23`), { rpcCode: -32602 });
    }
  }
  if (out.startHour !== undefined && out.endHour !== undefined && out.endHour <= out.startHour) {
    throw Object.assign(new Error("endHour must be greater than startHour"), { rpcCode: -32602 });
  }
  if (args.syncToGoogleCalendar !== undefined) {
    if (typeof args.syncToGoogleCalendar !== "boolean") {
      throw Object.assign(new Error("syncToGoogleCalendar must be a boolean"), { rpcCode: -32602 });
    }
    out.syncToGoogleCalendar = args.syncToGoogleCalendar;
  }
  return out;
}

export const MCP_TOOLS = Object.freeze([
  {
    name: "get_homework_rundown",
    description:
      "Returns the complete UIUC Collective Mind homework rundown for Muse AI: current assignments, live completion progress percentages, missed/overdue assignments requiring a schedule pivot, course grade histories with structuring feedback, and dynamically allocated homework blocks.",
    inputSchema: {
      type: "object",
      properties: {
        course: { type: "string", description: "Optional course filter (e.g., 'CS 128', 'CS 173')." },
        includeCompleted: { type: "boolean", description: "Include already graded/completed assignments in the rundown." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_assignment_progress",
    description:
      "Returns detailed completion progress (0-100%), remaining percentage, estimated remaining minutes, and credit windows for current and in-progress assignments.",
    inputSchema: {
      type: "object",
      properties: {
        course: { type: "string", description: "Optional course name to filter by." },
        assignmentId: { type: "string", description: "Optional specific assignment ID." },
        includeCompleted: { type: "boolean", description: "Include completed/graded assignments." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_missed_assignments_and_pivot_plan",
    description:
      "Detects missed/overdue assignments and in-progress assignments at risk of missing deadlines, checks remaining credit windows, and generates an automatic schedule pivot plan for Muse AI's homework block manager.",
    inputSchema: {
      type: "object",
      properties: {
        course: { type: "string", description: "Optional course name to filter by." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_course_grades_and_feedback_context",
    description:
      "Returns previous grades per course, course averages, performance trends (improving/declining/steady), weak topics where points were lost, and concrete guidance on how to structure upcoming homework blocks.",
    inputSchema: {
      type: "object",
      properties: {
        course: { type: "string", description: "Optional course name to filter by." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "replan_homework_blocks",
    description:
      "Dynamically rearranges and allocates homework blocks based on current assignment progress, missed assignments (pivoting tonight's block automatically), and previous course grades. Optionally syncs updated blocks directly to Google Calendar.",
    inputSchema: {
      type: "object",
      properties: {
        withinHours: { type: "integer", description: "Lookahead window in hours (1-168, default from settings)." },
        startHour: { type: "integer", description: "Baseline block start hour in America/Chicago (0-23)." },
        endHour: { type: "integer", description: "Baseline block end hour in America/Chicago (0-23)." },
        syncToGoogleCalendar: { type: "boolean", description: "If true and Google Calendar is connected, immediately push the replanned blocks." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "refresh_assignments",
    description:
      "Triggers an immediate live poll of all configured UIUC LMS sources (Canvas, PrairieLearn, CS 128, SmartPhysics, PrairieTest) and returns the updated Muse AI rundown.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
]);

export const MCP_RESOURCES = Object.freeze([
  {
    uri: "muse://homework/rundown",
    name: "Muse AI Full Homework & Progress Rundown",
    description: "Live JSON snapshot of current assignments, progress percentages, missed work, course grade history, and dynamic block allocations.",
    mimeType: "application/json",
  },
  {
    uri: "muse://homework/missed-pivot",
    name: "Missed Assignments & Dynamic Schedule Pivot Plan",
    description: "Missed/overdue assignments with credit windows and immediate homework block reallocation actions.",
    mimeType: "application/json",
  },
  {
    uri: "muse://homework/grades-feedback",
    name: "Course Grade History & Study Structuring Feedback",
    description: "Previous grades, course averages, trends, weak areas, and recommendations for structuring homework blocks.",
    mimeType: "application/json",
  },
  {
    uri: "muse://homework/schedule-blocks",
    name: "Dynamically Allocated Homework Blocks",
    description: "Current evening homework blocks with per-assignment minute allocations weighted by progress and past grades.",
    mimeType: "application/json",
  },
]);

export const MCP_PROMPTS = Object.freeze([
  {
    name: "muse_homework_pivot_and_feedback",
    description: "Generates a comprehensive Muse AI scheduling and assignment-structuring briefing using live progress, missed work, and past grades.",
    arguments: [
      {
        name: "course",
        description: "Optional course name to focus the feedback and schedule pivot on.",
        required: false,
      },
    ],
  },
]);

/**
 * MCP Server implementation supporting JSON-RPC 2.0 over HTTP, SSE, and Stdio.
 */
export class MuseMcpServer {
  constructor({
    store,
    getSettings = () => ({}),
    poller = null,
    onReplanBlocks = null,
    now = () => new Date(),
    log = () => {},
    rateLimiter = new RateLimiter({ maxRequests: 120, windowMs: 60_000 }),
    pollLimiter = new RateLimiter({ maxRequests: 5, windowMs: 300_000 }),
  } = {}) {
    this.store = store;
    this.getSettings = getSettings;
    this.poller = poller;
    this.onReplanBlocks = onReplanBlocks;
    this.now = now;
    this.log = log;
    this.rateLimiter = rateLimiter;
    this.pollLimiter = pollLimiter;
    this.sseClients = new Set();
    this.stdioListeners = new Set();
    this.lastUpdatedAt = null;
  }

  getRundown(overrides = {}) {
    const settings = { ...this.getSettings(), ...overrides };
    const assignments = this.store?.state?.assignments ?? [];
    const changes = this.store?.state?.changes ?? [];
    return buildMuseRundown(assignments, { changes, settings, now: this.now() });
  }

  status() {
    const r = this.getRundown();
    return {
      enabled: true,
      serverName: MCP_SERVER_NAME,
      protocolVersion: MCP_PROTOCOL_VERSION,
      connectedClients: this.sseClients.size + this.stdioListeners.size,
      lastUpdatedAt: this.lastUpdatedAt ?? this.store?.state?.lastPoll ?? r.generatedAt,
      summary: r.summary,
    };
  }

  /**
   * Automatically notifies all connected Muse AI / MCP clients that assignment
   * progress, grades, or schedule blocks have updated.
   */
  notifyUpdate() {
    this.lastUpdatedAt = this.now().toISOString();
    const rundown = this.getRundown();
    const notifications = [
      {
        jsonrpc: "2.0",
        method: "notifications/resources/updated",
        params: {
          uri: "muse://homework/rundown",
          updatedAt: this.lastUpdatedAt,
          summary: rundown.summary,
        },
      },
    ];
    if (rundown.summary.needsPivot) {
      notifications.push({
        jsonrpc: "2.0",
        method: "notifications/resources/updated",
        params: {
          uri: "muse://homework/missed-pivot",
          updatedAt: this.lastUpdatedAt,
          pivotPlan: rundown.pivotPlan,
        },
      });
    }

    for (const note of notifications) {
      for (const client of this.sseClients) {
        try {
          client.sendMessage(note);
        } catch {}
      }
      for (const sendStdio of this.stdioListeners) {
        try {
          sendStdio(note);
        } catch {}
      }
    }
    return rundown;
  }

  async handleJsonRpc(rawMsg) {
    if (!this.rateLimiter.check(this.now().getTime())) {
      return {
        jsonrpc: "2.0",
        id: rawMsg?.id ?? null,
        error: { code: -32029, message: "Rate limit exceeded on MCP endpoint" },
      };
    }

    let msg;
    try {
      msg = validateJsonRpcRequest(rawMsg);
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: rawMsg?.id ?? null,
        error: { code: e.rpcCode ?? -32600, message: e.message },
      };
    }

    // Notifications have no `id` and expect no response object
    const isNotification = msg.id === undefined;

    try {
      const { method, params = {} } = msg;

      if (method === "notifications/initialized" || method === "notifications/cancelled") {
        return null;
      }

      if (method === "initialize") {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: {
            protocolVersion: params.protocolVersion || MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: true, listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: {
              name: MCP_SERVER_NAME,
              version: MCP_SERVER_VERSION,
            },
          },
        };
      }

      if (method === "ping") {
        return { jsonrpc: "2.0", id: msg.id ?? null, result: {} };
      }

      if (method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: { tools: MCP_TOOLS },
        };
      }

      if (method === "tools/call") {
        const toolName = params.name;
        if (typeof toolName !== "string" || !toolName) {
          throw Object.assign(new Error("Tool name is required"), { rpcCode: -32602 });
        }
        const args = validateToolArguments(toolName, params.arguments ?? {});
        const toolResult = await this.#executeTool(toolName, args);
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(toolResult, null, 2),
              },
            ],
            structuredContent: toolResult,
            isError: false,
          },
        };
      }

      if (method === "resources/list") {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: { resources: MCP_RESOURCES },
        };
      }

      if (method === "resources/templates/list") {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: { resourceTemplates: [] },
        };
      }

      if (method === "resources/subscribe" || method === "resources/unsubscribe") {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: {},
        };
      }

      if (method === "resources/read") {
        const uri = params.uri;
        if (typeof uri !== "string" || !uri) {
          throw Object.assign(new Error("Resource uri is required"), { rpcCode: -32602 });
        }
        const payload = this.#readResource(uri);
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(payload, null, 2),
              },
            ],
          },
        };
      }

      if (method === "prompts/list") {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: { prompts: MCP_PROMPTS },
        };
      }

      if (method === "prompts/get") {
        const name = params.name;
        if (name !== "muse_homework_pivot_and_feedback") {
          throw Object.assign(new Error(`Unknown prompt: ${name}`), { rpcCode: -32602 });
        }
        const courseFilter = typeof params.arguments?.course === "string" ? params.arguments.course.trim() : null;
        const rundown = this.getRundown();
        const promptText = this.#buildBriefingPrompt(rundown, courseFilter);
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: {
            description: "Muse AI homework schedule pivot and assignment structuring guide",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: promptText,
                },
              },
            ],
          },
        };
      }

      if (isNotification) return null;
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
    } catch (e) {
      if (isNotification) return null;
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        error: {
          code: e.rpcCode ?? -32603,
          message: e.message || "Internal MCP server error",
        },
      };
    }
  }

  async #executeTool(toolName, args) {
    if (toolName === "get_homework_rundown") {
      const rundown = this.getRundown();
      const filterCourse = (list) =>
        args.course ? list.filter((a) => a.course.toLowerCase() === args.course.toLowerCase()) : list;
      const allAnalyzed = args.includeCompleted
        ? (this.store?.state?.assignments ?? []).map((a) =>
            analyzeAssignment(a, { now: this.now(), courseStats: rundown.courseGrades[a.course] ?? null })
          )
        : rundown.currentAssignments;
      return {
        generatedAt: rundown.generatedAt,
        summary: rundown.summary,
        pivotPlan: rundown.pivotPlan,
        assignments: filterCourse(allAnalyzed),
        missedAssignments: filterCourse(rundown.missedAssignments),
        courseGrades: args.course
          ? Object.fromEntries(
              Object.entries(rundown.courseGrades).filter(([k]) => k.toLowerCase() === args.course.toLowerCase())
            )
          : rundown.courseGrades,
        dynamicBlocks: rundown.pivotPlan.dynamicBlocks,
      };
    }

    if (toolName === "get_assignment_progress") {
      const rundown = this.getRundown();
      const baseList = args.includeCompleted
        ? (this.store?.state?.assignments ?? []).map((a) =>
            analyzeAssignment(a, { now: this.now(), courseStats: rundown.courseGrades[a.course] ?? null })
          )
        : rundown.currentAssignments;
      let items = baseList;
      if (args.course) {
        items = items.filter((a) => a.course.toLowerCase() === args.course.toLowerCase());
      }
      if (args.assignmentId) {
        items = items.filter((a) => a.id === args.assignmentId);
      }
      return {
        generatedAt: rundown.generatedAt,
        count: items.length,
        inProgressCount: items.filter((a) => a.progressPercent > 0 && a.progressPercent < 100).length,
        items: items.map((a) => ({
          id: a.id,
          course: a.course,
          title: a.title,
          source: a.source,
          dueAt: a.dueAt,
          status: a.status,
          grade: a.grade,
          progressPercent: a.progressPercent,
          remainingPercent: a.remainingPercent,
          progressState: a.progressState,
          estimatedRemainingMinutes: a.estimatedRemainingMinutes,
          isMissed: a.isMissed,
          isSubmittable: a.isSubmittable,
          creditWindow: a.creditWindow,
          structuringAdvice: a.structuringAdvice,
          url: a.url,
        })),
      };
    }

    if (toolName === "get_missed_assignments_and_pivot_plan") {
      const rundown = this.getRundown();
      const missed = args.course
        ? rundown.missedAssignments.filter((a) => a.course.toLowerCase() === args.course.toLowerCase())
        : rundown.missedAssignments;
      const actions = args.course
        ? rundown.pivotPlan.actions.filter((a) => a.course.toLowerCase() === args.course.toLowerCase())
        : rundown.pivotPlan.actions;
      return {
        generatedAt: rundown.generatedAt,
        needsPivot: actions.length > 0,
        pivotSummary: rundown.summary.pivotSummary,
        missedOpenCount: missed.filter((a) => a.progressState === "missed_open").length,
        missedClosedCount: missed.filter((a) => a.progressState === "missed_closed").length,
        missedAssignments: missed,
        pivotActions: actions,
        recommendedBlocks: rundown.pivotPlan.dynamicBlocks,
      };
    }

    if (toolName === "get_course_grades_and_feedback_context") {
      const rundown = this.getRundown();
      const courses = args.course
        ? Object.fromEntries(
            Object.entries(rundown.courseGrades).filter(([k]) => k.toLowerCase() === args.course.toLowerCase())
          )
        : rundown.courseGrades;
      return {
        generatedAt: rundown.generatedAt,
        courses,
      };
    }

    if (toolName === "replan_homework_blocks") {
      const s = this.getSettings();
      const withinHours = args.withinHours ?? s.blockWithinHours ?? 24;
      const startHour = args.startHour ?? s.blockStartHour ?? 20;
      const endHour = args.endHour ?? s.blockEndHour ?? 23;
      if (endHour <= startHour) {
        throw Object.assign(new Error("endHour must be greater than startHour"), { rpcCode: -32602 });
      }
      const assignments = this.store?.state?.assignments ?? [];
      const courseHistory = buildCourseGradeHistory(assignments, { now: this.now() });
      const blocks = planDynamicBlocks(assignments, {
        now: this.now(),
        withinHours,
        startHour,
        endHour,
        courseHistory,
      });

      let calendarSync = null;
      if (args.syncToGoogleCalendar && typeof this.onReplanBlocks === "function") {
        calendarSync = await this.onReplanBlocks({ withinHours, startHour, endHour, blocks });
      }

      return {
        generatedAt: this.now().toISOString(),
        parameters: { withinHours, startHour, endHour },
        blockCount: blocks.length,
        pivotedBlocks: blocks.filter((b) => b.pivoted).length,
        blocks,
        calendarSync,
      };
    }

    if (toolName === "refresh_assignments") {
      if (!this.pollLimiter.check(this.now().getTime())) {
        throw Object.assign(new Error("Poll rate limit reached; please wait before triggering another live refresh"), {
          rpcCode: -32029,
        });
      }
      if (this.poller && typeof this.poller.run === "function") {
        await this.poller.run();
      }
      return this.getRundown();
    }

    throw Object.assign(new Error(`Unknown tool: ${toolName}`), { rpcCode: -32602 });
  }

  #readResource(uri) {
    const rundown = this.getRundown();
    if (uri === "muse://homework/rundown") return rundown;
    if (uri === "muse://homework/missed-pivot") {
      return {
        generatedAt: rundown.generatedAt,
        needsPivot: rundown.pivotPlan.needsPivot,
        pivotSummary: rundown.summary.pivotSummary,
        missedAssignments: rundown.missedAssignments,
        pivotActions: rundown.pivotPlan.actions,
        dynamicBlocks: rundown.pivotPlan.dynamicBlocks,
      };
    }
    if (uri === "muse://homework/grades-feedback") {
      return {
        generatedAt: rundown.generatedAt,
        courseGrades: rundown.courseGrades,
      };
    }
    if (uri === "muse://homework/schedule-blocks") {
      return {
        generatedAt: rundown.generatedAt,
        dynamicBlocks: rundown.pivotPlan.dynamicBlocks,
      };
    }
    throw Object.assign(new Error(`Resource not found: ${uri}`), { rpcCode: -32602 });
  }

  #buildBriefingPrompt(rundown, courseFilter = null) {
    const filter = (list) =>
      courseFilter ? list.filter((a) => a.course.toLowerCase() === courseFilter.toLowerCase()) : list;
    const active = filter(rundown.currentAssignments);
    const missed = filter(rundown.missedAssignments);
    const courses = courseFilter
      ? Object.values(rundown.courseGrades).filter((c) => c.course.toLowerCase() === courseFilter.toLowerCase())
      : Object.values(rundown.courseGrades);

    return [
      "# Muse AI Homework & Schedule Pivot Briefing",
      `Generated at: ${formatChicago(rundown.generatedAt)} (${TZ})`,
      `Status: ${rundown.summary.pivotSummary}`,
      "",
      "## 1. Missed / Overdue Assignments & Immediate Schedule Pivots",
      missed.length
        ? missed
            .map(
              (m) =>
                `- [${m.progressState.toUpperCase()}] ${m.course} — ${m.title}: ${m.progressPercent}% complete (${m.remainingPercent}% remaining, ~${m.estimatedRemainingMinutes} min). ${m.structuringAdvice}`
            )
            .join("\n")
        : "- None! No missed assignments.",
      "",
      "## 2. Current & In-Progress Assignments",
      active.length
        ? active
            .map(
              (a) =>
                `- [${a.progressPercent}% done | ${a.priorityLevel}] ${a.course} — ${a.title} (due ${a.dueAt ? formatChicago(a.dueAt) : "undated"}): ~${a.estimatedRemainingMinutes} min remaining. ${a.structuringAdvice}`
            )
            .join("\n")
        : "- No active upcoming assignments.",
      "",
      "## 3. Previous Grades & Structuring Feedback by Course",
      courses.length
        ? courses
            .map(
              (c) =>
                `- **${c.course}** (Avg: ${c.averagePercent !== null ? c.averagePercent + "%" : "N/A"}, Trend: ${c.trend}, Time Multiplier: ${c.timeMultiplier}x): ${c.structuringFeedback}`
            )
            .join("\n")
        : "- No course grade history available yet.",
      "",
      "## 4. Dynamically Allocated Homework Blocks",
      rundown.pivotPlan.dynamicBlocks.length
        ? rundown.pivotPlan.dynamicBlocks
            .map(
              (b) =>
                `- **${b.date}** (${formatChicago(b.start)} – ${formatChicago(b.end)}${b.pivoted ? " [PIVOTED]" : ""}):\n` +
                b.allocations
                  .map(
                    (al) =>
                      `  • ${al.course} · ${al.title}: ${al.allocatedMinutes} min (${al.progressPercent}% -> 100%)`
                  )
                  .join("\n")
            )
            .join("\n")
        : "- No homework blocks currently scheduled in window.",
    ].join("\n");
  }

  /**
   * Handles HTTP GET (SSE stream) and POST (JSON-RPC 2.0 request) on `/mcp` or `/api/mcp`.
   */
  async handleHttpRequest(req, res, readBodyFn) {
    if (req.method === "GET") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
      };
      sendEvent("endpoint", "/mcp");
      const client = {
        sendMessage: (msg) => sendEvent("message", msg),
      };
      this.sseClients.add(client);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      const cleanup = () => {
        clearInterval(ping);
        this.sseClients.delete(client);
      };
      req.on("close", cleanup);
      res.on("close", cleanup);
      res.on("error", cleanup);
      return;
    }

    if (req.method === "POST") {
      const body = await readBodyFn(req);
      if (Array.isArray(body)) {
        const responses = (await Promise.all(body.map((item) => this.handleJsonRpc(item)))).filter(Boolean);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        return res.end(JSON.stringify(responses));
      }
      const response = await this.handleJsonRpc(body);
      if (response === null) {
        res.writeHead(202, { "cache-control": "no-store" });
        return res.end();
      }
      // Also broadcast response over SSE if any SSE transport client is waiting
      for (const client of this.sseClients) {
        try {
          client.sendMessage(response);
        } catch {}
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(response));
    }

    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  /**
   * Attaches the MCP server to a Stdio stream pair (e.g. process.stdin / process.stdout).
   * Supports newline-delimited JSON-RPC 2.0 messages.
   */
  attachStdio(input = process.stdin, output = process.stdout) {
    const send = (msg) => {
      if (!msg) return;
      output.write(JSON.stringify(msg) + "\n");
    };
    this.stdioListeners.add(send);

    let buffer = "";
    const onData = async (chunk) => {
      buffer += String(chunk);
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line || line.startsWith("Content-Length:")) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          send({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          });
          continue;
        }
        const reply = await this.handleJsonRpc(parsed);
        if (reply) send(reply);
      }
    };

    input.on("data", onData);
    return () => {
      input.off("data", onData);
      this.stdioListeners.delete(send);
    };
  }
}

/**
 * Persists the latest Muse AI rundown snapshot to `data/muse-rundown.json`
 * automatically on every poll so local agents and stdio MCP servers always have fresh data.
 */
export function syncMuseRundownFile({ store, settings = {}, dataDir, now = new Date(), log = () => {} }) {
  if (!dataDir || !store) return null;
  const rundown = buildMuseRundown(store.state.assignments ?? [], {
    changes: store.state.changes ?? [],
    settings,
    now,
  });
  try {
    mkdirSync(dataDir, { recursive: true });
    const target = join(dataDir, "muse-rundown.json");
    const tmp = target + ".tmp";
    writeFileSync(tmp, JSON.stringify(rundown, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, target);
  } catch (e) {
    log(`muse rundown write error: ${e.message}`);
  }
  return rundown;
}

/**
 * Automatically registers the UIUC Collective Mind MCP server into `.mcp.json`
 * and local MCP client config files so Muse AI connects with zero manual setup.
 */
export function autoRegisterMuseMcp({
  rootDir,
  dataDir,
  settingsFile,
  port = 4258,
  apiToken = "",
  configPaths = null,
  log = () => {},
} = {}) {
  if (!rootDir || !dataDir) return { registered: [] };
  const mcpScriptPath = join(rootDir, "scripts", "mcp-server.mjs");
  const serverEntry = {
    command: process.execPath || "node",
    args: [mcpScriptPath],
    env: {
      UCM_DATA_DIR: dataDir,
      ...(settingsFile ? { UCM_SETTINGS_FILE: settingsFile } : {}),
      ...(port ? { UCM_SERVER_URL: `http://127.0.0.1:${port}` } : {}),
      ...(apiToken ? { UCM_API_TOKEN: apiToken } : {}),
    },
  };

  // Determine target MCP config files to auto-register into
  const targets = configPaths ?? [
    join(rootDir, ".mcp.json"),
    join(dataDir, "mcp-config.json"),
    ...discoverDefaultMcpConfigPaths(),
  ];

  const registered = [];
  for (const filePath of targets) {
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        // Only create directories inside dataDir or rootDir; for optional external client dirs, skip if not installed
        if (filePath.startsWith(dataDir) || filePath.startsWith(rootDir)) {
          mkdirSync(dir, { recursive: true });
        } else {
          continue;
        }
      }
      let existing = {};
      if (existsSync(filePath)) {
        try {
          existing = JSON.parse(readFileSync(filePath, "utf8"));
        } catch {
          existing = {};
        }
      }
      if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
        existing = {};
      }
      const mcpServers =
        typeof existing.mcpServers === "object" && existing.mcpServers !== null && !Array.isArray(existing.mcpServers)
          ? { ...existing.mcpServers }
          : {};

      mcpServers["uiuc-collective-mind"] = serverEntry;
      const updated = { ...existing, mcpServers };
      const serialized = JSON.stringify(updated, null, 2) + "\n";

      const currentContent = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
      if (currentContent !== serialized) {
        const tmp = `${filePath}.${process.pid}.tmp`;
        writeFileSync(tmp, serialized, { mode: 0o600 });
        try {
          chmodSync(tmp, 0o600);
        } catch {}
        renameSync(tmp, filePath);
      }
      registered.push(filePath);
    } catch (e) {
      log(`MCP auto-register skipped ${filePath}: ${e.message}`);
    }
  }

  return { registered, serverEntry };
}

function discoverDefaultMcpConfigPaths() {
  try {
    const home = homedir();
    const candidates = [
      join(home, "Library", "Application Support", "com.meta.endo", "mcp.json"),
      join(home, "Library", "Application Support", "Muse", "mcp.json"),
      join(home, ".cursor", "mcp.json"),
      join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    ];
    return candidates.filter((p) => existsSync(dirname(p)));
  } catch {
    return [];
  }
}

/**
 * Resolves the active data directory (comparing repo `data/` and Electron userData `data/`)
 * so standalone stdio MCP invocations automatically read the freshest state.json.
 */
export function resolveActiveDataDir(defaultRootDir) {
  if (process.env.UCM_DATA_DIR && existsSync(process.env.UCM_DATA_DIR)) {
    return process.env.UCM_DATA_DIR;
  }
  const candidates = [join(defaultRootDir, "data")];
  try {
    const home = homedir();
    if (process.platform === "darwin") {
      candidates.push(
        join(home, "Library", "Application Support", "uiuc-collective-mind-desktop", "data"),
        join(home, "Library", "Application Support", "UIUC Collective Mind", "data")
      );
    } else if (process.platform === "win32" && process.env.APPDATA) {
      candidates.push(
        join(process.env.APPDATA, "uiuc-collective-mind-desktop", "data"),
        join(process.env.APPDATA, "UIUC Collective Mind", "data")
      );
    }
  } catch {}

  let bestDir = candidates[0];
  let bestMtime = -1;
  for (const dir of candidates) {
    const stateFile = join(dir, "state.json");
    if (existsSync(stateFile)) {
      try {
        const mtime = statSync(stateFile).mtimeMs;
        if (mtime > bestMtime) {
          bestMtime = mtime;
          bestDir = dir;
        }
      } catch {}
    }
  }
  return bestDir;
}
