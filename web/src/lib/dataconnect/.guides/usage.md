# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { upsertUser, upsertCourse, addEnrollment, upsertAssignment, upsertUserAssignment, getUser, myCourses, myAssignments } from '@uiuc-cmind/dataconnect';


// Operation UpsertUser:  For variables, look at type UpsertUserVars in ../index.d.ts
const { data } = await UpsertUser(dataConnect, upsertUserVars);

// Operation UpsertCourse:  For variables, look at type UpsertCourseVars in ../index.d.ts
const { data } = await UpsertCourse(dataConnect, upsertCourseVars);

// Operation AddEnrollment:  For variables, look at type AddEnrollmentVars in ../index.d.ts
const { data } = await AddEnrollment(dataConnect, addEnrollmentVars);

// Operation UpsertAssignment:  For variables, look at type UpsertAssignmentVars in ../index.d.ts
const { data } = await UpsertAssignment(dataConnect, upsertAssignmentVars);

// Operation UpsertUserAssignment:  For variables, look at type UpsertUserAssignmentVars in ../index.d.ts
const { data } = await UpsertUserAssignment(dataConnect, upsertUserAssignmentVars);

// Operation GetUser: 
const { data } = await GetUser(dataConnect);

// Operation MyCourses: 
const { data } = await MyCourses(dataConnect);

// Operation MyAssignments: 
const { data } = await MyAssignments(dataConnect);


```