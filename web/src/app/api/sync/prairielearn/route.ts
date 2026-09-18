import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ success: false, error: "No PrairieLearn token provided." }, { status: 400 });
    }

    // 1. Fetch enrolled course instances from PrairieLearn API
    const coursesRes = await fetch("https://us.prairielearn.com/pl/api/v1/course_instances", {
      headers: { "Private-Token": token },
    });

    if (!coursesRes.ok) {
      const text = await coursesRes.text();
      return NextResponse.json(
        { success: false, error: `Failed to authenticate with PrairieLearn: ${coursesRes.status} ${text}` },
        { status: 401 }
      );
    }

    const courses = await coursesRes.json();
    const assignments = [];

    // 2. Fetch assessments for each course
    for (const course of courses) {
      const courseId = course.id;
      const courseName = course.course?.short_name || `PL-${courseId}`;

      const assessmentsRes = await fetch(`https://us.prairielearn.com/pl/api/v1/course_instances/${courseId}/assessments`, {
        headers: { "Private-Token": token },
      });

      if (!assessmentsRes.ok) continue;
      const assessments = await assessmentsRes.json();

      // 3. Fetch assessment instances (grades) for the user in this course
      const instancesRes = await fetch(`https://us.prairielearn.com/pl/api/v1/course_instances/${courseId}/assessment_instances`, {
        headers: { "Private-Token": token },
      });
      
      let instances = [];
      if (instancesRes.ok) {
        instances = await instancesRes.json();
      }

      for (const a of assessments) {
        // Find the instance corresponding to this assessment to get the score
        const instance = instances.find((inst: any) => inst.assessment_id === a.id);
        
        let status = "open";
        let grade = null;

        if (instance) {
          if (instance.score_perc >= 100) status = "graded";
          else if (instance.score_perc > 0) status = "submitted";
          
          grade = instance.score_perc != null ? `${Math.round(instance.score_perc)}%` : null;
        }

        // Determine if closed based on dates (if available)
        // PL API typically provides multiple access rules, but we'll use a basic date check if we have one
        // If not, we just rely on open/submitted/graded.

        assignments.push({
          id: `pl-${a.id}`,
          course: courseName,
          title: a.title || a.name || `Assessment ${a.id}`,
          dueAt: null, // The API doesn't easily expose the resolved due date for the specific user in the list view without access rules parsing
          status,
          grade,
          url: `https://us.prairielearn.com/pl/course_instance/${courseId}/assessment/${a.id}`,
          source: "prairielearn",
        });
      }
    }

    return NextResponse.json({ success: true, data: assignments });
  } catch (error: any) {
    console.error("PrairieLearn Sync Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
