import { z } from "zod";

/**
 * Schema for Course Configuration entries
 */
export const CourseConfigSchema = z.object({
  source: z.enum(["prairielearn", "smartphysics", "cs128", "prairietest"]),
  course: z.string().min(1, "Course name is required").max(50),
  instanceId: z.string().max(50).optional(),
  enrollmentId: z.string().max(50).optional(),
});

export const CourseConfigsArraySchema = z.array(CourseConfigSchema);

export type CourseConfig = z.infer<typeof CourseConfigSchema>;

/**
 * Schema for PrairieLearn Sync API Request Body
 */
export const PrairieLearnSyncRequestSchema = z.object({
  token: z.string().min(1, "PrairieLearn API token is required"),
});

export type PrairieLearnSyncRequest = z.infer<typeof PrairieLearnSyncRequestSchema>;

/**
 * Schemas for external PrairieLearn API responses (validating untrusted external data)
 */
export const PrairieLearnCourseInstanceSchema = z.object({
  id: z.union([z.number(), z.string()]),
  course: z
    .object({
      short_name: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
});

export const PrairieLearnAssessmentSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string().optional(),
  name: z.string().optional(),
  tid: z.string().optional(),
});

export const PrairieLearnAssessmentInstanceSchema = z.object({
  assessment_id: z.union([z.number(), z.string()]),
  score_perc: z.number().nullable().optional(),
  open: z.boolean().optional(),
});

/**
 * Standardized Assignment Schema
 */
export const AssignmentStatusSchema = z.enum([
  "open",
  "submitted",
  "graded",
  "closed",
  "unknown",
  "in_progress",
]);

export const AssignmentSchema = z.object({
  id: z.string().min(1),
  course: z.string().min(1),
  title: z.string().min(1),
  dueAt: z.string().nullable(),
  status: AssignmentStatusSchema,
  grade: z.string().nullable(),
  url: z.string().nullable().optional(),
  source: z.string().min(1),
  details: z.string().nullable().optional(),
});

export type Assignment = z.infer<typeof AssignmentSchema>;
