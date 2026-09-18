import { NextResponse } from "next/server";
import { 
  PrairieLearnSyncRequestSchema,
  PrairieLearnCourseInstanceSchema,
  PrairieLearnAssessmentSchema,
  PrairieLearnAssessmentInstanceSchema,
  Assignment
} from "@/lib/schemas";
import { z } from "zod";

const MAX_COURSES = 20;
const MAX_ASSESSMENTS_PER_COURSE = 100;
const FETCH_TIMEOUT_MS = 10000;

export async function POST(req: Request) {
  try {
    let bodyUnknown: unknown;
    try {
      bodyUnknown = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsedRequest = PrairieLearnSyncRequestSchema.safeParse(bodyUnknown);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { success: false, error: parsedRequest.error.issues[0]?.message || "Invalid request payload." },
        { status: 400 }
      );
    }

    const { token } = parsedRequest.data;

    // 1. Fetch enrolled course instances from PrairieLearn API
    const coursesRes = await fetch("https://us.prairielearn.com/pl/api/v1/course_instances", {
      headers: { "Private-Token": token },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!coursesRes.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to authenticate with PrairieLearn (HTTP ${coursesRes.status})` },
        { status: coursesRes.status === 401 ? 401 : 502 }
      );
    }

    const rawCourses = await coursesRes.json();
    const coursesParsed = z.array(PrairieLearnCourseInstanceSchema).safeParse(rawCourses);
    const courses = coursesParsed.success ? coursesParsed.data.slice(0, MAX_COURSES) : [];

    const assignments: Assignment[] = [];

    // 2. Fetch assessments for each course (with loop control)
    for (const course of courses) {
      const courseId = course.id;
      const courseName = course.course?.short_name || `PL-${courseId}`;

      try {
        const assessmentsRes = await fetch(
          `https://us.prairielearn.com/pl/api/v1/course_instances/${courseId}/assessments`,
          {
            headers: { "Private-Token": token },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          }
        );

        if (!assessmentsRes.ok) continue;
        const rawAssessments = await assessmentsRes.json();
        const assessmentsParsed = z.array(PrairieLearnAssessmentSchema).safeParse(rawAssessments);
        const assessments = assessmentsParsed.success ? assessmentsParsed.data.slice(0, MAX_ASSESSMENTS_PER_COURSE) : [];

        // 3. Fetch assessment instances (grades) for the user in this course
        let instances: z.infer<typeof PrairieLearnAssessmentInstanceSchema>[] = [];
        try {
          const instancesRes = await fetch(
            `https://us.prairielearn.com/pl/api/v1/course_instances/${courseId}/assessment_instances`,
            {
              headers: { "Private-Token": token },
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            }
          );
          if (instancesRes.ok) {
            const rawInstances = await instancesRes.json();
            const instancesParsed = z.array(PrairieLearnAssessmentInstanceSchema).safeParse(rawInstances);
            if (instancesParsed.success) {
              instances = instancesParsed.data;
            }
          }
        } catch {
          // Gracefully continue with instances = [] if instances call fails
        }

        for (const a of assessments) {
          const instance = instances.find((inst) => String(inst.assessment_id) === String(a.id));

          let status: Assignment["status"] = "open";
          let grade: string | null = null;

          if (instance) {
            const score = instance.score_perc;
            if (score != null) {
              if (score >= 100) status = "graded";
              else if (score > 0) status = "submitted";
              grade = `${Math.round(score)}%`;
            }
          }

          assignments.push({
            id: `pl-${a.id}`,
            course: courseName,
            title: a.title || a.name || `Assessment ${a.id}`,
            dueAt: null,
            status,
            grade,
            url: `https://us.prairielearn.com/pl/course_instance/${courseId}/assessment/${a.id}`,
            source: "prairielearn",
          });
        }
      } catch (courseErr) {
        console.warn(`Failed to sync course ${courseId}:`, courseErr);
      }
    }

    return NextResponse.json({ success: true, data: assignments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal sync error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
