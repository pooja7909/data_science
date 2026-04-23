# security_spec.md

## 1. Data Invariants
- A `Mark` must belong to an existing `Student` and an existing `Assessment`.
- A `Student` must belong to a valid `YearGroup`.
- All documents must have a `teacherId` matching the authenticated user's UID.
- Every `Assessment` has a `maxMarks` ≥ 0.
- Every `Mark` score must be ≥ 0 and ≤ its parent Assessment's `maxMarks`.
- Boundaries must have percentages between 0 and 100.

## 2. The "Dirty Dozen" Payloads

### P1: Unauthorized Creation (Identity Spoofing)
Attempt to create a student with a `teacherId` of another user.
```json
{
  "name": "Hacker student",
  "yearGroup": 7,
  "teacherId": "someone_else_uid",
  "academicYear": "2025-26",
  "groupName": "7A"
}
```

### P2: Unauthorized Read (PII Leak)
Attempt to list students without being authenticated.
`GET /students` (No Auth)

### P3: Cross-Teacher Data Access
Attempt to read a student record belonging to a different teacher.
`GET /students/other_teacher_student_id` (Auth as User A)

### P4: Assessment Score Overflow
Attempt to save a mark with a score higher than maxMarks.
```json
{
  "studentId": "valid_id",
  "assessmentId": "valid_id",
  "score": 1000,
  "teacherId": "my_uid"
}
```

### P5: Invalid ID Injection (Resource Poisoning)
Attempt to create a document with a massive string ID.
`POST /students` { "id": "A".repeat(2000), ... }

### P6: Negative Score Injection
Attempt to save a mark with a negative score.
```json
{
  "studentId": "valid_id",
  "assessmentId": "valid_id",
  "score": -50,
  "teacherId": "my_uid"
}
```

### P7: Orphaned Mark Creation
Attempt to create a mark for a non-existent assessment.
```json
{
  "studentId": "valid_id",
  "assessmentId": "non_existent_id",
  "score": 50,
  "teacherId": "my_uid"
}
```

### P8: Global Config Sabotage
Attempt to overwrite global grade boundaries without being the owner/admin.
`doc(db, 'config', 'yearBoundaries').set({...})` (Unauthorized user)

### P9: Immutable Field Mutation
Attempt to change the `teacherId` or `studentId` of an existing Mark.
`PATCH /marks/mark_id` { "studentId": "new_student_id" }

### P10: ID Character Poisoning
Attempt task creation with special characters in ID meant to break regex.
`id: "!!!$$$###"`

### P11: PII Blanket Read
Attempt to read all users' data via a list query without a proper filter.
`collection(db, 'students').get()` -> Should be blocked if query doesn't filter by `teacherId`.

### P12: Terminal State Bypass
(N/A for this app as there is no specific terminal state yet, but let's use:)
Attempt to delete a student who has associated marks (Relational Integrity).
`DELETE /students/id` -> Should ideally check if marks exist? Actually, for Firestore, we usually allow it but we want to prevent orphaned data. Let's instead use:
Attempt to set a grade boundary percentage to > 100%.

## 3. The Test Runner

I will implement these tests in `firestore.rules.test.ts` after writing the rules.
