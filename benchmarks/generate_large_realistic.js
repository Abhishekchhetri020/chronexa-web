const fs = require('fs');

console.log('=== Generating Realistic Large School Benchmark ===\n');

// Configuration
const NUM_CLASSES = 18;  // Reduced from 20 for better feasibility
const NUM_TEACHERS = 35; // Increased from 30 for more capacity
const NUM_SUBJECTS = 12;
const MAX_PERIODS_PER_WEEK = 28;

// Subject definitions
const subjects = [
    {id: "s1", name: "Math", periodsPerWeek: 5},
    {id: "s2", name: "English", periodsPerWeek: 5},
    {id: "s3", name: "Science", periodsPerWeek: 4},
    {id: "s4", name: "Physics", periodsPerWeek: 4},
    {id: "s5", name: "History", periodsPerWeek: 3},
    {id: "s6", name: "Geography", periodsPerWeek: 3},
    {id: "s7", name: "Foreign Lang", periodsPerWeek: 3},
    {id: "s8", name: "Economics", periodsPerWeek: 3},
    {id: "s9", name: "Art", periodsPerWeek: 2},
    {id: "s10", name: "Music", periodsPerWeek: 2},
    {id: "s11", name: "PE", periodsPerWeek: 2},
    {id: "s12", name: "Computer", periodsPerWeek: 2}
];

// Calculate total teaching demand
const periodsPerClass = subjects.reduce((sum, s) => sum + s.periodsPerWeek, 0);
const totalPeriods = NUM_CLASSES * periodsPerClass;
const totalCapacity = NUM_TEACHERS * MAX_PERIODS_PER_WEEK;

console.log(`Configuration:`);
console.log(`  Classes: ${NUM_CLASSES}`);
console.log(`  Teachers: ${NUM_TEACHERS}`);
console.log(`  Subjects: ${NUM_SUBJECTS}`);
console.log(`  Max periods/teacher: ${MAX_PERIODS_PER_WEEK}`);
console.log(`\nCapacity analysis:`);
console.log(`  Periods per class: ${periodsPerClass}`);
console.log(`  Total periods needed: ${totalPeriods}`);
console.log(`  Total capacity: ${totalCapacity}`);
console.log(`  Utilization: ${((totalPeriods/totalCapacity)*100).toFixed(1)}%`);
console.log(`  Feasible: ${totalPeriods <= totalCapacity ? 'YES ✓' : 'NO ✗'}`);

if (totalPeriods > totalCapacity) {
    console.error('ERROR: Insufficient capacity');
    process.exit(1);
}

// Calculate teachers needed per subject
const teachersPerSubject = {};
subjects.forEach(s => {
    // Each teacher can teach this subject to at most floor(MAX_PERIODS / periodsPerWeek) classes
    const maxClassesPerTeacher = Math.floor(MAX_PERIODS_PER_WEEK / s.periodsPerWeek);
    const teachersNeeded = Math.ceil(NUM_CLASSES / maxClassesPerTeacher);
    teachersPerSubject[s.id] = {
        needed: teachersNeeded,
        maxClasses: maxClassesPerTeacher
    };
});

console.log('\nTeachers needed per subject:');
Object.entries(teachersPerSubject).forEach(([sid, info]) => {
    const s = subjects.find(s => s.id === sid);
    console.log(`  ${sid} (${s.name}, ${s.periodsPerWeek}p): ${info.needed} teachers (max ${info.maxClasses} classes each)`);
});

// Create teachers and assign subjects
const teachers = [];
const subjectTeachers = {};
subjects.forEach(s => {
    subjectTeachers[s.id] = [];
});

// Seed random for reproducibility
let seed = 12345;
function random() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
}

// Assign each teacher to 2-3 subjects strategically
for (let i = 1; i <= NUM_TEACHERS; i++) {
    const tid = `t${i}`;
    teachers.push({
        id: tid,
        name: `Teacher ${i}`,
        maxHoursPerWeek: MAX_PERIODS_PER_WEEK,
        subjects: []
    });
}

// Sort subjects by demand (highest first)
const sortedSubjects = [...subjects].sort((a, b) => 
    (NUM_CLASSES * b.periodsPerWeek) - (NUM_CLASSES * a.periodsPerWeek)
);

// Assign teachers to subjects based on need
sortedSubjects.forEach(s => {
    const needed = teachersPerSubject[s.id].needed;
    const current = subjectTeachers[s.id].length;
    
    for (let i = current; i < needed; i++) {
        // Find a teacher with capacity and not too many assignments
        const available = teachers.filter(t => 
            t.subjects.length < 3 && 
            !t.subjects.includes(s.id)
        );
        
        if (available.length === 0) {
            console.error(`ERROR: Cannot assign teacher to ${s.id}`);
            process.exit(1);
        }
        
        // Prefer teacher with fewest assignments
        available.sort((a, b) => a.subjects.length - b.subjects.length);
        const teacher = available[0];
        
        teacher.subjects.push(s.id);
        subjectTeachers[s.id].push(teacher.id);
    }
});

// Verify assignments
console.log('\nTeacher assignments summary:');
const assignmentCounts = [0, 0, 0, 0];
teachers.forEach(t => {
    assignmentCounts[t.subjects.length]++;
});
assignmentCounts.forEach((count, idx) => {
    if (count > 0) {
        console.log(`  ${idx} subjects: ${count} teachers`);
    }
});

// Generate classes
const classes = [];
for (let i = 1; i <= NUM_CLASSES; i++) {
    classes.push({
        id: `c${i}`,
        name: `Grade ${Math.ceil(i/4)}${String.fromCharCode(64 + ((i-1) % 4) + 1)}`
    });
}

// Generate rooms
const rooms = [];
for (let i = 1; i <= 25; i++) {
    rooms.push({
        id: `r${i}`,
        name: i <= 20 ? `Room ${100 + i}` : (i <= 23 ? `Lab ${i-20}` : `Gym ${i-23}`)
    });
}

// Generate lessons with balanced teacher assignment
const lessons = [];
let lessonId = 1;
const teacherWorkload = {};
teachers.forEach(t => {
    teacherWorkload[t.id] = 0;
});

// For each subject, assign teachers to classes
subjects.forEach(s => {
    const subjectTeacherList = subjectTeachers[s.id];
    const maxClassesPerTeacher = teachersPerSubject[s.id].maxClasses;
    
    // Distribute classes evenly among subject teachers
    const teacherAssignments = {};
    subjectTeacherList.forEach(tid => {
        teacherAssignments[tid] = [];
    });
    
    classes.forEach(c => {
        // Find teacher with capacity
        const available = subjectTeacherList.filter(tid => 
            teacherAssignments[tid].length < maxClassesPerTeacher &&
            teacherWorkload[tid] + s.periodsPerWeek <= MAX_PERIODS_PER_WEEK
        );
        
        if (available.length === 0) {
            console.error(`ERROR: No available teacher for ${c.id}-${s.id}`);
            console.error(`  Subject teachers:`, subjectTeacherList);
            console.error(`  Assignments:`, subjectTeacherList.map(tid => 
                `${tid}:${teacherAssignments[tid].length}/${maxClassesPerTeacher}`
            ));
            console.error(`  Workloads:`, subjectTeacherList.map(tid => 
                `${tid}:${teacherWorkload[tid]}/${MAX_PERIODS_PER_WEEK}`
            ));
            process.exit(1);
        }
        
        // Prefer least loaded teacher
        available.sort((a, b) => teacherWorkload[a] - teacherWorkload[b]);
        const teacherId = available[0];
        
        teacherAssignments[teacherId].push(c.id);
        teacherWorkload[teacherId] += s.periodsPerWeek;
        
        lessons.push({
            id: `l${lessonId++}`,
            classIds: [c.id],
            teacherIds: [teacherId],
            subjectId: s.id,
            periodsPerWeek: s.periodsPerWeek,
            periodLength: 1,
            roomId: `r${Math.floor(random() * rooms.length) + 1}`
        });
    });
});

// Report workload distribution
console.log('\n=== Teacher Workload Distribution ===');
const workloads = Object.values(teacherWorkload).sort((a, b) => a - b);
console.log(`Min: ${workloads[0]}`);
console.log(`Max: ${workloads[workloads.length - 1]}`);
console.log(`Avg: ${(workloads.reduce((a, b) => a + b, 0) / workloads.length).toFixed(1)}`);
console.log(`Median: ${workloads[Math.floor(workloads.length / 2)]}`);

console.log('\nTop 5 most loaded teachers:');
Object.entries(teacherWorkload)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([tid, load]) => {
        const t = teachers.find(t => t.id === tid);
        console.log(`  ${tid} (${t.subjects.join(',')}): ${load}/${MAX_PERIODS_PER_WEEK} periods (${((load/MAX_PERIODS_PER_WEEK)*100).toFixed(1)}%)`);
    });

console.log('\nBottom 5 least loaded teachers:');
Object.entries(teacherWorkload)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .forEach(([tid, load]) => {
        const t = teachers.find(t => t.id === tid);
        console.log(`  ${tid} (${t.subjects.join(',')}): ${load}/${MAX_PERIODS_PER_WEEK} periods (${((load/MAX_PERIODS_PER_WEEK)*100).toFixed(1)}%)`);
    });

// Final validation
console.log(`\n=== Final Validation ===`);
console.log(`Lessons: ${lessons.length}`);
console.log(`Total periods: ${lessons.reduce((sum, l) => sum + l.periodsPerWeek, 0)}`);
console.log(`Max teacher workload: ${workloads[workloads.length - 1]} (limit: ${MAX_PERIODS_PER_WEEK})`);
console.log(`Feasible: ${workloads[workloads.length - 1] <= MAX_PERIODS_PER_WEEK ? 'YES ✓' : 'NO ✗'}`);

// Save benchmark
const benchmark = {
    version: "2.0",
    metadata: {
        name: "Large School Realistic Benchmark",
        description: `${NUM_CLASSES} classes, ${NUM_TEACHERS} teachers, ${NUM_SUBJECTS} subjects, ${lessons.length} lessons`,
        classes: NUM_CLASSES,
        teachers: NUM_TEACHERS,
        subjects: NUM_SUBJECTS,
        days: 6,
        periodsPerDay: 8,
        slotsPerWeek: 48
    },
    teachers,
    subjects,
    classes,
    rooms,
    lessons,
    hardConstraints: [
        {
            type: "teacherMaxHoursPerWeek",
            description: "No teacher can teach more than their maxHoursPerWeek",
            enforcement: "hard"
        }
    ],
    softConstraints: [
        {
            type: "minimizeTeacherGaps",
            weight: 10,
            description: "Minimize gaps in teacher schedules"
        },
        {
            type: "preferConsecutive",
            weight: 5,
            description: "Prefer consecutive periods for same subject"
        },
        {
            type: "distributeEvenly",
            weight: 5,
            description: "Distribute lessons evenly across week"
        }
    ]
};

fs.writeFileSync('benchmarks/large_school_realistic.json', JSON.stringify(benchmark, null, 2));
console.log('\nSaved to benchmarks/large_school_realistic.json');
