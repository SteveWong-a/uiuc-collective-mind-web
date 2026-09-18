import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface AddEnrollmentData {
  enrollment_upsert: Enrollment_Key;
}

export interface AddEnrollmentVariables {
  courseName: string;
}

export interface Assignment_Key {
  externalId: string;
  __typename?: 'Assignment_Key';
}

export interface Course_Key {
  name: string;
  __typename?: 'Course_Key';
}

export interface Enrollment_Key {
  userUid: string;
  courseName: string;
  __typename?: 'Enrollment_Key';
}

export interface GetUserData {
  user?: {
    uid: string;
    email: string;
    courseConfigs?: string | null;
  } & User_Key;
}

export interface MyAssignmentsData {
  userAssignments: ({
    assignment: {
      title: string;
      dueDate?: TimestampString | null;
      externalId: string;
      course: {
        name: string;
      } & Course_Key;
    } & Assignment_Key;
    score?: string | null;
    status?: string | null;
  })[];
}

export interface MyCoursesData {
  enrollments: ({
    course: {
      name: string;
    } & Course_Key;
  })[];
}

export interface UpsertAssignmentData {
  assignment_upsert: Assignment_Key;
}

export interface UpsertAssignmentVariables {
  courseName: string;
  title: string;
  dueDate?: TimestampString | null;
  externalId: string;
  url?: string | null;
  source?: string | null;
}

export interface UpsertCourseData {
  course_upsert: Course_Key;
}

export interface UpsertCourseVariables {
  name: string;
}

export interface UpsertUserAssignmentData {
  userAssignment_upsert: UserAssignment_Key;
}

export interface UpsertUserAssignmentVariables {
  assignmentExternalId: string;
  score?: string | null;
  status?: string | null;
}

export interface UpsertUserData {
  user_upsert: User_Key;
}

export interface UpsertUserVariables {
  email: string;
  courseConfigs?: string | null;
}

export interface UserAssignment_Key {
  userUid: string;
  assignmentExternalId: string;
  __typename?: 'UserAssignment_Key';
}

export interface User_Key {
  uid: string;
  __typename?: 'User_Key';
}

interface UpsertUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertUserVariables): MutationRef<UpsertUserData, UpsertUserVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpsertUserVariables): MutationRef<UpsertUserData, UpsertUserVariables>;
  operationName: string;
}
export const upsertUserRef: UpsertUserRef;

export function upsertUser(vars: UpsertUserVariables): MutationPromise<UpsertUserData, UpsertUserVariables>;
export function upsertUser(dc: DataConnect, vars: UpsertUserVariables): MutationPromise<UpsertUserData, UpsertUserVariables>;

interface UpsertCourseRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertCourseVariables): MutationRef<UpsertCourseData, UpsertCourseVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpsertCourseVariables): MutationRef<UpsertCourseData, UpsertCourseVariables>;
  operationName: string;
}
export const upsertCourseRef: UpsertCourseRef;

export function upsertCourse(vars: UpsertCourseVariables): MutationPromise<UpsertCourseData, UpsertCourseVariables>;
export function upsertCourse(dc: DataConnect, vars: UpsertCourseVariables): MutationPromise<UpsertCourseData, UpsertCourseVariables>;

interface AddEnrollmentRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddEnrollmentVariables): MutationRef<AddEnrollmentData, AddEnrollmentVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: AddEnrollmentVariables): MutationRef<AddEnrollmentData, AddEnrollmentVariables>;
  operationName: string;
}
export const addEnrollmentRef: AddEnrollmentRef;

export function addEnrollment(vars: AddEnrollmentVariables): MutationPromise<AddEnrollmentData, AddEnrollmentVariables>;
export function addEnrollment(dc: DataConnect, vars: AddEnrollmentVariables): MutationPromise<AddEnrollmentData, AddEnrollmentVariables>;

interface UpsertAssignmentRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertAssignmentVariables): MutationRef<UpsertAssignmentData, UpsertAssignmentVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpsertAssignmentVariables): MutationRef<UpsertAssignmentData, UpsertAssignmentVariables>;
  operationName: string;
}
export const upsertAssignmentRef: UpsertAssignmentRef;

export function upsertAssignment(vars: UpsertAssignmentVariables): MutationPromise<UpsertAssignmentData, UpsertAssignmentVariables>;
export function upsertAssignment(dc: DataConnect, vars: UpsertAssignmentVariables): MutationPromise<UpsertAssignmentData, UpsertAssignmentVariables>;

interface UpsertUserAssignmentRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertUserAssignmentVariables): MutationRef<UpsertUserAssignmentData, UpsertUserAssignmentVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpsertUserAssignmentVariables): MutationRef<UpsertUserAssignmentData, UpsertUserAssignmentVariables>;
  operationName: string;
}
export const upsertUserAssignmentRef: UpsertUserAssignmentRef;

export function upsertUserAssignment(vars: UpsertUserAssignmentVariables): MutationPromise<UpsertUserAssignmentData, UpsertUserAssignmentVariables>;
export function upsertUserAssignment(dc: DataConnect, vars: UpsertUserAssignmentVariables): MutationPromise<UpsertUserAssignmentData, UpsertUserAssignmentVariables>;

interface GetUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetUserData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetUserData, undefined>;
  operationName: string;
}
export const getUserRef: GetUserRef;

export function getUser(options?: ExecuteQueryOptions): QueryPromise<GetUserData, undefined>;
export function getUser(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetUserData, undefined>;

interface MyCoursesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyCoursesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<MyCoursesData, undefined>;
  operationName: string;
}
export const myCoursesRef: MyCoursesRef;

export function myCourses(options?: ExecuteQueryOptions): QueryPromise<MyCoursesData, undefined>;
export function myCourses(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyCoursesData, undefined>;

interface MyAssignmentsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyAssignmentsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<MyAssignmentsData, undefined>;
  operationName: string;
}
export const myAssignmentsRef: MyAssignmentsRef;

export function myAssignments(options?: ExecuteQueryOptions): QueryPromise<MyAssignmentsData, undefined>;
export function myAssignments(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyAssignmentsData, undefined>;

