# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `default`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetUser*](#getuser)
  - [*MyCourses*](#mycourses)
  - [*MyAssignments*](#myassignments)
- [**Mutations**](#mutations)
  - [*UpsertUser*](#upsertuser)
  - [*UpsertCourse*](#upsertcourse)
  - [*AddEnrollment*](#addenrollment)
  - [*UpsertAssignment*](#upsertassignment)
  - [*UpsertUserAssignment*](#upsertuserassignment)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `default`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@uiuc-cmind/dataconnect` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@uiuc-cmind/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@uiuc-cmind/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `default` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetUser
You can execute the `GetUser` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
getUser(options?: ExecuteQueryOptions): QueryPromise<GetUserData, undefined>;

interface GetUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetUserData, undefined>;
}
export const getUserRef: GetUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getUser(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetUserData, undefined>;

interface GetUserRef {
  ...
  (dc: DataConnect): QueryRef<GetUserData, undefined>;
}
export const getUserRef: GetUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getUserRef:
```typescript
const name = getUserRef.operationName;
console.log(name);
```

### Variables
The `GetUser` query has no variables.
### Return Type
Recall that executing the `GetUser` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetUserData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetUserData {
  user?: {
    uid: string;
    email: string;
    courseConfigs?: string | null;
  } & User_Key;
}
```
### Using `GetUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getUser } from '@uiuc-cmind/dataconnect';


// Call the `getUser()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getUser();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getUser(dataConnect);

console.log(data.user);

// Or, you can use the `Promise` API.
getUser().then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

### Using `GetUser`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getUserRef } from '@uiuc-cmind/dataconnect';


// Call the `getUserRef()` function to get a reference to the query.
const ref = getUserRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getUserRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.user);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

## MyCourses
You can execute the `MyCourses` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
myCourses(options?: ExecuteQueryOptions): QueryPromise<MyCoursesData, undefined>;

interface MyCoursesRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyCoursesData, undefined>;
}
export const myCoursesRef: MyCoursesRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
myCourses(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyCoursesData, undefined>;

interface MyCoursesRef {
  ...
  (dc: DataConnect): QueryRef<MyCoursesData, undefined>;
}
export const myCoursesRef: MyCoursesRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the myCoursesRef:
```typescript
const name = myCoursesRef.operationName;
console.log(name);
```

### Variables
The `MyCourses` query has no variables.
### Return Type
Recall that executing the `MyCourses` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MyCoursesData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface MyCoursesData {
  enrollments: ({
    course: {
      name: string;
    } & Course_Key;
  })[];
}
```
### Using `MyCourses`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, myCourses } from '@uiuc-cmind/dataconnect';


// Call the `myCourses()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await myCourses();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await myCourses(dataConnect);

console.log(data.enrollments);

// Or, you can use the `Promise` API.
myCourses().then((response) => {
  const data = response.data;
  console.log(data.enrollments);
});
```

### Using `MyCourses`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, myCoursesRef } from '@uiuc-cmind/dataconnect';


// Call the `myCoursesRef()` function to get a reference to the query.
const ref = myCoursesRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = myCoursesRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.enrollments);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.enrollments);
});
```

## MyAssignments
You can execute the `MyAssignments` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
myAssignments(options?: ExecuteQueryOptions): QueryPromise<MyAssignmentsData, undefined>;

interface MyAssignmentsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyAssignmentsData, undefined>;
}
export const myAssignmentsRef: MyAssignmentsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
myAssignments(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyAssignmentsData, undefined>;

interface MyAssignmentsRef {
  ...
  (dc: DataConnect): QueryRef<MyAssignmentsData, undefined>;
}
export const myAssignmentsRef: MyAssignmentsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the myAssignmentsRef:
```typescript
const name = myAssignmentsRef.operationName;
console.log(name);
```

### Variables
The `MyAssignments` query has no variables.
### Return Type
Recall that executing the `MyAssignments` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MyAssignmentsData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `MyAssignments`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, myAssignments } from '@uiuc-cmind/dataconnect';


// Call the `myAssignments()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await myAssignments();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await myAssignments(dataConnect);

console.log(data.userAssignments);

// Or, you can use the `Promise` API.
myAssignments().then((response) => {
  const data = response.data;
  console.log(data.userAssignments);
});
```

### Using `MyAssignments`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, myAssignmentsRef } from '@uiuc-cmind/dataconnect';


// Call the `myAssignmentsRef()` function to get a reference to the query.
const ref = myAssignmentsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = myAssignmentsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.userAssignments);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.userAssignments);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `default` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## UpsertUser
You can execute the `UpsertUser` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
upsertUser(vars: UpsertUserVariables): MutationPromise<UpsertUserData, UpsertUserVariables>;

interface UpsertUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertUserVariables): MutationRef<UpsertUserData, UpsertUserVariables>;
}
export const upsertUserRef: UpsertUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
upsertUser(dc: DataConnect, vars: UpsertUserVariables): MutationPromise<UpsertUserData, UpsertUserVariables>;

interface UpsertUserRef {
  ...
  (dc: DataConnect, vars: UpsertUserVariables): MutationRef<UpsertUserData, UpsertUserVariables>;
}
export const upsertUserRef: UpsertUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the upsertUserRef:
```typescript
const name = upsertUserRef.operationName;
console.log(name);
```

### Variables
The `UpsertUser` mutation requires an argument of type `UpsertUserVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpsertUserVariables {
  email: string;
  courseConfigs?: string | null;
}
```
### Return Type
Recall that executing the `UpsertUser` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpsertUserData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpsertUserData {
  user_upsert: User_Key;
}
```
### Using `UpsertUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, upsertUser, UpsertUserVariables } from '@uiuc-cmind/dataconnect';

// The `UpsertUser` mutation requires an argument of type `UpsertUserVariables`:
const upsertUserVars: UpsertUserVariables = {
  email: ..., 
  courseConfigs: ..., // optional
};

// Call the `upsertUser()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await upsertUser(upsertUserVars);
// Variables can be defined inline as well.
const { data } = await upsertUser({ email: ..., courseConfigs: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await upsertUser(dataConnect, upsertUserVars);

console.log(data.user_upsert);

// Or, you can use the `Promise` API.
upsertUser(upsertUserVars).then((response) => {
  const data = response.data;
  console.log(data.user_upsert);
});
```

### Using `UpsertUser`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, upsertUserRef, UpsertUserVariables } from '@uiuc-cmind/dataconnect';

// The `UpsertUser` mutation requires an argument of type `UpsertUserVariables`:
const upsertUserVars: UpsertUserVariables = {
  email: ..., 
  courseConfigs: ..., // optional
};

// Call the `upsertUserRef()` function to get a reference to the mutation.
const ref = upsertUserRef(upsertUserVars);
// Variables can be defined inline as well.
const ref = upsertUserRef({ email: ..., courseConfigs: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = upsertUserRef(dataConnect, upsertUserVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_upsert);
});
```

## UpsertCourse
You can execute the `UpsertCourse` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
upsertCourse(vars: UpsertCourseVariables): MutationPromise<UpsertCourseData, UpsertCourseVariables>;

interface UpsertCourseRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertCourseVariables): MutationRef<UpsertCourseData, UpsertCourseVariables>;
}
export const upsertCourseRef: UpsertCourseRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
upsertCourse(dc: DataConnect, vars: UpsertCourseVariables): MutationPromise<UpsertCourseData, UpsertCourseVariables>;

interface UpsertCourseRef {
  ...
  (dc: DataConnect, vars: UpsertCourseVariables): MutationRef<UpsertCourseData, UpsertCourseVariables>;
}
export const upsertCourseRef: UpsertCourseRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the upsertCourseRef:
```typescript
const name = upsertCourseRef.operationName;
console.log(name);
```

### Variables
The `UpsertCourse` mutation requires an argument of type `UpsertCourseVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpsertCourseVariables {
  name: string;
}
```
### Return Type
Recall that executing the `UpsertCourse` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpsertCourseData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpsertCourseData {
  course_upsert: Course_Key;
}
```
### Using `UpsertCourse`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, upsertCourse, UpsertCourseVariables } from '@uiuc-cmind/dataconnect';

// The `UpsertCourse` mutation requires an argument of type `UpsertCourseVariables`:
const upsertCourseVars: UpsertCourseVariables = {
  name: ..., 
};

// Call the `upsertCourse()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await upsertCourse(upsertCourseVars);
// Variables can be defined inline as well.
const { data } = await upsertCourse({ name: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await upsertCourse(dataConnect, upsertCourseVars);

console.log(data.course_upsert);

// Or, you can use the `Promise` API.
upsertCourse(upsertCourseVars).then((response) => {
  const data = response.data;
  console.log(data.course_upsert);
});
```

### Using `UpsertCourse`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, upsertCourseRef, UpsertCourseVariables } from '@uiuc-cmind/dataconnect';

// The `UpsertCourse` mutation requires an argument of type `UpsertCourseVariables`:
const upsertCourseVars: UpsertCourseVariables = {
  name: ..., 
};

// Call the `upsertCourseRef()` function to get a reference to the mutation.
const ref = upsertCourseRef(upsertCourseVars);
// Variables can be defined inline as well.
const ref = upsertCourseRef({ name: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = upsertCourseRef(dataConnect, upsertCourseVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.course_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.course_upsert);
});
```

## AddEnrollment
You can execute the `AddEnrollment` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
addEnrollment(vars: AddEnrollmentVariables): MutationPromise<AddEnrollmentData, AddEnrollmentVariables>;

interface AddEnrollmentRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddEnrollmentVariables): MutationRef<AddEnrollmentData, AddEnrollmentVariables>;
}
export const addEnrollmentRef: AddEnrollmentRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
addEnrollment(dc: DataConnect, vars: AddEnrollmentVariables): MutationPromise<AddEnrollmentData, AddEnrollmentVariables>;

interface AddEnrollmentRef {
  ...
  (dc: DataConnect, vars: AddEnrollmentVariables): MutationRef<AddEnrollmentData, AddEnrollmentVariables>;
}
export const addEnrollmentRef: AddEnrollmentRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the addEnrollmentRef:
```typescript
const name = addEnrollmentRef.operationName;
console.log(name);
```

### Variables
The `AddEnrollment` mutation requires an argument of type `AddEnrollmentVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface AddEnrollmentVariables {
  courseName: string;
}
```
### Return Type
Recall that executing the `AddEnrollment` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `AddEnrollmentData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface AddEnrollmentData {
  enrollment_upsert: Enrollment_Key;
}
```
### Using `AddEnrollment`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, addEnrollment, AddEnrollmentVariables } from '@uiuc-cmind/dataconnect';

// The `AddEnrollment` mutation requires an argument of type `AddEnrollmentVariables`:
const addEnrollmentVars: AddEnrollmentVariables = {
  courseName: ..., 
};

// Call the `addEnrollment()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await addEnrollment(addEnrollmentVars);
// Variables can be defined inline as well.
const { data } = await addEnrollment({ courseName: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await addEnrollment(dataConnect, addEnrollmentVars);

console.log(data.enrollment_upsert);

// Or, you can use the `Promise` API.
addEnrollment(addEnrollmentVars).then((response) => {
  const data = response.data;
  console.log(data.enrollment_upsert);
});
```

### Using `AddEnrollment`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, addEnrollmentRef, AddEnrollmentVariables } from '@uiuc-cmind/dataconnect';

// The `AddEnrollment` mutation requires an argument of type `AddEnrollmentVariables`:
const addEnrollmentVars: AddEnrollmentVariables = {
  courseName: ..., 
};

// Call the `addEnrollmentRef()` function to get a reference to the mutation.
const ref = addEnrollmentRef(addEnrollmentVars);
// Variables can be defined inline as well.
const ref = addEnrollmentRef({ courseName: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = addEnrollmentRef(dataConnect, addEnrollmentVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.enrollment_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.enrollment_upsert);
});
```

## UpsertAssignment
You can execute the `UpsertAssignment` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
upsertAssignment(vars: UpsertAssignmentVariables): MutationPromise<UpsertAssignmentData, UpsertAssignmentVariables>;

interface UpsertAssignmentRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertAssignmentVariables): MutationRef<UpsertAssignmentData, UpsertAssignmentVariables>;
}
export const upsertAssignmentRef: UpsertAssignmentRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
upsertAssignment(dc: DataConnect, vars: UpsertAssignmentVariables): MutationPromise<UpsertAssignmentData, UpsertAssignmentVariables>;

interface UpsertAssignmentRef {
  ...
  (dc: DataConnect, vars: UpsertAssignmentVariables): MutationRef<UpsertAssignmentData, UpsertAssignmentVariables>;
}
export const upsertAssignmentRef: UpsertAssignmentRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the upsertAssignmentRef:
```typescript
const name = upsertAssignmentRef.operationName;
console.log(name);
```

### Variables
The `UpsertAssignment` mutation requires an argument of type `UpsertAssignmentVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpsertAssignmentVariables {
  courseName: string;
  title: string;
  dueDate?: TimestampString | null;
  externalId: string;
  url?: string | null;
  source?: string | null;
}
```
### Return Type
Recall that executing the `UpsertAssignment` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpsertAssignmentData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpsertAssignmentData {
  assignment_upsert: Assignment_Key;
}
```
### Using `UpsertAssignment`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, upsertAssignment, UpsertAssignmentVariables } from '@uiuc-cmind/dataconnect';

// The `UpsertAssignment` mutation requires an argument of type `UpsertAssignmentVariables`:
const upsertAssignmentVars: UpsertAssignmentVariables = {
  courseName: ..., 
  title: ..., 
  dueDate: ..., // optional
  externalId: ..., 
  url: ..., // optional
  source: ..., // optional
};

// Call the `upsertAssignment()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await upsertAssignment(upsertAssignmentVars);
// Variables can be defined inline as well.
const { data } = await upsertAssignment({ courseName: ..., title: ..., dueDate: ..., externalId: ..., url: ..., source: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await upsertAssignment(dataConnect, upsertAssignmentVars);

console.log(data.assignment_upsert);

// Or, you can use the `Promise` API.
upsertAssignment(upsertAssignmentVars).then((response) => {
  const data = response.data;
  console.log(data.assignment_upsert);
});
```

### Using `UpsertAssignment`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, upsertAssignmentRef, UpsertAssignmentVariables } from '@uiuc-cmind/dataconnect';

// The `UpsertAssignment` mutation requires an argument of type `UpsertAssignmentVariables`:
const upsertAssignmentVars: UpsertAssignmentVariables = {
  courseName: ..., 
  title: ..., 
  dueDate: ..., // optional
  externalId: ..., 
  url: ..., // optional
  source: ..., // optional
};

// Call the `upsertAssignmentRef()` function to get a reference to the mutation.
const ref = upsertAssignmentRef(upsertAssignmentVars);
// Variables can be defined inline as well.
const ref = upsertAssignmentRef({ courseName: ..., title: ..., dueDate: ..., externalId: ..., url: ..., source: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = upsertAssignmentRef(dataConnect, upsertAssignmentVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.assignment_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.assignment_upsert);
});
```

## UpsertUserAssignment
You can execute the `UpsertUserAssignment` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
upsertUserAssignment(vars: UpsertUserAssignmentVariables): MutationPromise<UpsertUserAssignmentData, UpsertUserAssignmentVariables>;

interface UpsertUserAssignmentRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpsertUserAssignmentVariables): MutationRef<UpsertUserAssignmentData, UpsertUserAssignmentVariables>;
}
export const upsertUserAssignmentRef: UpsertUserAssignmentRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
upsertUserAssignment(dc: DataConnect, vars: UpsertUserAssignmentVariables): MutationPromise<UpsertUserAssignmentData, UpsertUserAssignmentVariables>;

interface UpsertUserAssignmentRef {
  ...
  (dc: DataConnect, vars: UpsertUserAssignmentVariables): MutationRef<UpsertUserAssignmentData, UpsertUserAssignmentVariables>;
}
export const upsertUserAssignmentRef: UpsertUserAssignmentRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the upsertUserAssignmentRef:
```typescript
const name = upsertUserAssignmentRef.operationName;
console.log(name);
```

### Variables
The `UpsertUserAssignment` mutation requires an argument of type `UpsertUserAssignmentVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpsertUserAssignmentVariables {
  assignmentExternalId: string;
  score?: string | null;
  status?: string | null;
}
```
### Return Type
Recall that executing the `UpsertUserAssignment` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpsertUserAssignmentData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpsertUserAssignmentData {
  userAssignment_upsert: UserAssignment_Key;
}
```
### Using `UpsertUserAssignment`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, upsertUserAssignment, UpsertUserAssignmentVariables } from '@uiuc-cmind/dataconnect';

// The `UpsertUserAssignment` mutation requires an argument of type `UpsertUserAssignmentVariables`:
const upsertUserAssignmentVars: UpsertUserAssignmentVariables = {
  assignmentExternalId: ..., 
  score: ..., // optional
  status: ..., // optional
};

// Call the `upsertUserAssignment()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await upsertUserAssignment(upsertUserAssignmentVars);
// Variables can be defined inline as well.
const { data } = await upsertUserAssignment({ assignmentExternalId: ..., score: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await upsertUserAssignment(dataConnect, upsertUserAssignmentVars);

console.log(data.userAssignment_upsert);

// Or, you can use the `Promise` API.
upsertUserAssignment(upsertUserAssignmentVars).then((response) => {
  const data = response.data;
  console.log(data.userAssignment_upsert);
});
```

### Using `UpsertUserAssignment`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, upsertUserAssignmentRef, UpsertUserAssignmentVariables } from '@uiuc-cmind/dataconnect';

// The `UpsertUserAssignment` mutation requires an argument of type `UpsertUserAssignmentVariables`:
const upsertUserAssignmentVars: UpsertUserAssignmentVariables = {
  assignmentExternalId: ..., 
  score: ..., // optional
  status: ..., // optional
};

// Call the `upsertUserAssignmentRef()` function to get a reference to the mutation.
const ref = upsertUserAssignmentRef(upsertUserAssignmentVars);
// Variables can be defined inline as well.
const ref = upsertUserAssignmentRef({ assignmentExternalId: ..., score: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = upsertUserAssignmentRef(dataConnect, upsertUserAssignmentVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.userAssignment_upsert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.userAssignment_upsert);
});
```

