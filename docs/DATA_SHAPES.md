# Canonical data shapes (frontend ↔ backend contract)

Every agent works against THIS file. If you change a shape here, ping the other agents.

## SchoolData

```typescript
type SchoolData = {
  schoolName: string;
  bell: {
    periods: Array<{ index: number; label: string; startMin: number; endMin: number; isTeaching: boolean }>;
  };
  teachers: Array<{
    id: string;
    name: string;
    abbr?: string;
    maxGapsPerDay?: number;
    maxConsecutivePeriods?: number;
    timeOff?: Record<string, "available" | "preferred" | "unavailable">;  // key = `${dayIdx}_${periodIdx}`
  }>;
  classes: Array<{
    id: string;
    name: string;
    sections?: Array<{ id: string; name: string }>;
  }>;
  classrooms: Array<{
    id: string;
    name: string;
    capacity?: number;
    roomType?: string;
  }>;
  subjects: Array<{ id: string; name: string; abbr?: string }>;
  lessons: Array<{
    id: string;
    classIds: string[];
    teacherIds: string[];
    subjectId: string;
    periodsPerWeek: number;
    requiredRoomType?: string;
    preferredRoomId?: string;
    fixedDay?: number;
    fixedPeriod?: number;
    isLabDouble?: boolean;
  }>;
  // Optional: existing card placements when loading an already-built TT
  cards?: Array<{ lessonId: string; day: number; period: number; classroomId?: string }>;
};
```

## SolveRequest

```typescript
type SolveRequest = {
  school: SchoolData;
  options?: {
    algorithm?: "browser-csp" | "or-tools-cpsat";   // default: browser-csp
    timeLimitSec?: number;                            // default: 60
    seed?: number;                                    // for deterministic runs
    verbose?: boolean;
  };
};
```

## SolveResponse

```typescript
type SolveResponse = {
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIMEOUT" | "ERROR";
  assignment: Array<{
    lessonId: string;
    day: number;
    period: number;
    classroomId?: string;
    teacherId: string;
    classIds: string[];
  }>;
  stats: {
    placed: number;
    unplaced: number;
    hardConflicts: number;
    softScore: number;
    durationMs: number;
  };
  violations?: Array<{ ruleId: string; description: string }>;
};
```

## Endpoint contract (backend)

```
POST /solve
  Content-Type: application/json
  Body: SolveRequest
  → 200 OK  Body: SolveResponse
  → 400 / 500 with { error: string }
```

## Day / period indexing

- `dayIdx`: 0 = Mon, 1 = Tue, …, 5 = Sat (matches ASC daysdefs bitmask)
- `periodIdx`: 1-based to mirror ASC `<card period="N">`

## XML round-trip rule

The frontend is responsible for XML parsing (browser-side, no upload to server).
The backend only deals with JSON `SchoolData` + JSON `SolveResponse`.
The frontend re-serializes the JSON assignment back into the original XML file's structure for download.

## Versioning

All shapes carry an implicit `schemaVersion: 1` field. If we break a shape, bump to 2 and write a migration.
