chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_CANVAS_DATA") {
    (async () => {
      try {
        const data = await scrapeCanvas();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  
  if (message.type === "FETCH_HTML") {
    (async () => {
      try {
        const res = await fetch(message.url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const text = await res.text();
        sendResponse({ success: true, data: text });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

async function scrapeCanvas() {
  // 1. Get user's active courses
  // include[]=term helps us filter to current courses if needed, per_page=100 gets all
  const coursesRes = await fetch(
    "https://canvas.illinois.edu/api/v1/users/self/courses?enrollment_state=active&include[]=term&per_page=100"
  );
  
  if (!coursesRes.ok) {
    throw new Error("Canvas authentication failed. Please log in to Canvas in another tab first.");
  }
  
  let coursesText = await coursesRes.text();
  // Canvas returns while(1); to prevent JSON hijacking. We must strip it.
  if (coursesText.startsWith("while(1);")) {
    coursesText = coursesText.substring(9);
  }
  
  const courses = JSON.parse(coursesText);
  const assignments = [];
  
  // 2. Fetch assignments for each active course
  for (const course of courses) {
    // Skip if it's restricted or has no ID
    if (!course.id || course.access_restricted_by_date) continue;
    
    // Fetch assignments and include the user's submission data (status/grade)
    const assignRes = await fetch(
      `https://canvas.illinois.edu/api/v1/courses/${course.id}/assignments?include[]=submission&per_page=100`
    );
    
    if (!assignRes.ok) continue;
    
    let assignText = await assignRes.text();
    if (assignText.startsWith("while(1);")) assignText = assignText.substring(9);
    
    const courseAssignments = JSON.parse(assignText);
    
    for (const a of courseAssignments) {
      assignments.push({
        id: `canvas-${a.id}`,
        course: course.course_code || course.name,
        title: a.name,
        dueAt: a.due_at || null,
        status: getStatus(a),
        grade: getGrade(a),
        url: a.html_url,
        source: "canvas"
      });
    }
  }
  
  return assignments;
}

function getStatus(assignment) {
  const sub = assignment.submission;
  if (!sub) return "open";
  if (sub.workflow_state === "graded") return "graded";
  if (sub.workflow_state === "submitted") return "submitted";
  if (sub.workflow_state === "unsubmitted") return "open";
  return "unknown";
}

function getGrade(assignment) {
  const sub = assignment.submission;
  if (!sub || sub.workflow_state !== "graded") return null;
  
  if (sub.entered_score !== null && assignment.points_possible) {
    const pct = (sub.entered_score / assignment.points_possible) * 100;
    return `${Math.round(pct)}%`;
  }
  return sub.entered_grade || null;
}
