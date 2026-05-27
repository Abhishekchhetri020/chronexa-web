/**
 * SolverLearning - Machine Learning layer for Chronexa CSP solver
 * 
 * Learns from every solve to improve future performance:
 * 1. Variable difficulty: Which lesson types cause backtracking
 * 2. Slot success patterns: Which time slots work for which lesson patterns
 * 
 * All learning stays in localStorage (browser-only, no network requests).
 */

const VERSION = 1;
const STORAGE_PREFIX = 'chronexa_solver_learning_v';

/**
 * FNV-1a hash (fast, non-cryptographic, sufficient for pattern keys)
 */
function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;  // multiply and keep as unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Compute pattern hash for a lesson (teacher + subject + class structure)
 */
function lessonPatternKey(model, lessonIdx) {
  // Get first teacher from the flat array
  const tStart = model.lessonTeacherStart[lessonIdx];
  const tCount = model.lessonTeacherCount[lessonIdx];
  const t = tCount > 0 ? model.lessonTeacherFlat[tStart] : -1;
  
  const s = model.lessonSubject[lessonIdx];
  
  // Get class IDs from the flat array
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  
  const classIds = [];
  for (let i = 0; i < classCount; i++) {
    classIds.push(model.lessonClassFlat[classStart + i]);
  }
  classIds.sort((a, b) => a - b);
  
  const key = `t${t}:s${s}:c${classIds.join(',')}`;
  return key;
}

/**
 * Compute slot pattern hash (day + period + subject + class grade level)
 */
function slotPatternKey(model, lessonIdx, slot) {
  const d = model.slotDay[slot];
  const p = model.slotPeriod[slot];
  const s = model.lessonSubject[lessonIdx];
  
  // Approximate grade level from class IDs
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  let gradeLevel = 0;
  if (classCount > 0) {
    const firstClass = model.lessonClassFlat[classStart];
    gradeLevel = Math.floor(firstClass / 4); // rough: 0-3 = grade 1, 4-7 = grade 2, etc.
  }
  
  return `d${d}:p${p}:s${s}:g${gradeLevel}`;
}

export class SolverLearning {
  constructor(schoolHash) {
    this.schoolHash = schoolHash;
    this.storageKey = `${STORAGE_PREFIX}${VERSION}_${schoolHash}`;
    
    // Variable difficulty: lessonPattern -> {backtracks, successes}
    this.variableDifficulty = new Map();
    
    // Slot success: slotPattern -> Map<slotIdx, {successes, failures}>
    this.slotSuccess = new Map();
    
    // Runtime tracking (current solve)
    this.backtrackCounts = new Array(65536).fill(0);  // up to 65536 lessons
    this.lastPlacements = new Array(65536).fill(-1);  // last slot tried for each lesson
    
    this.load();
  }
  
  /**
   * Load learning data from localStorage (no-op if localStorage unavailable)
   */
  load() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      
      const data = JSON.parse(raw);
      if (data.version !== VERSION) return;
      
      // Restore variable difficulty
      for (const [key, val] of Object.entries(data.variableDifficulty || {})) {
        this.variableDifficulty.set(key, val);
      }
      
      // Restore slot success patterns
      for (const [slotKey, slotMap] of Object.entries(data.slotSuccess || {})) {
        const map = new Map();
        for (const [slotIdx, counts] of Object.entries(slotMap || {})) {
          map.set(parseInt(slotIdx), counts);
        }
        this.slotSuccess.set(slotKey, map);
      }
    } catch (e) {
      console.warn('[SolverLearning] Failed to load:', e);
    }
  }
  
  /**
   * Save learning data to localStorage (no-op if localStorage unavailable)
   */
  save() {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = {
        version: VERSION,
        timestamp: new Date().toISOString(),
        variableDifficulty: Object.fromEntries(this.variableDifficulty),
        slotSuccess: Object.fromEntries(
          Array.from(this.slotSuccess.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
        ),
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn('[SolverLearning] Failed to save:', e);
    }
  }
  
  /**
   * Clear all learning data for this school
   */
  clear() {
    this.variableDifficulty.clear();
    this.slotSuccess.clear();
    this.backtrackCounts.fill(0);
    this.lastPlacements.fill(-1);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.storageKey);
    }
  }
  
  /**
   * Record that a lesson caused a backtrack (hard to place)
   */
  onBacktrack(lessonIdx) {
    this.backtrackCounts[lessonIdx]++;
  }
  
  /**
   * Record successful placement of a lesson
   */
  onSuccess(model, lessonIdx, slot, room) {
    // Update variable difficulty
    const pattern = lessonPatternKey(model, lessonIdx);
    const diff = this.variableDifficulty.get(pattern) || { backtracks: 0, successes: 0 };
    diff.backtracks += this.backtrackCounts[lessonIdx];
    diff.successes += 1;
    this.variableDifficulty.set(pattern, diff);
    
    // Reset backtrack counter for next solve
    this.backtrackCounts[lessonIdx] = 0;
    
    // Update slot success pattern
    const slotPattern = slotPatternKey(model, lessonIdx, slot);
    let slotMap = this.slotSuccess.get(slotPattern);
    if (!slotMap) {
      slotMap = new Map();
      this.slotSuccess.set(slotPattern, slotMap);
    }
    const counts = slotMap.get(slot) || { successes: 0, failures: 0 };
    counts.successes += 1;
    slotMap.set(slot, counts);
    
    // Update failures for slots we tried but didn't use
    const lastSlot = this.lastPlacements[lessonIdx];
    if (lastSlot !== -1 && lastSlot !== slot) {
      const failCounts = slotMap.get(lastSlot) || { successes: 0, failures: 0 };
      failCounts.failures += 1;
      slotMap.set(lastSlot, failCounts);
    }
    this.lastPlacements[lessonIdx] = -1;
  }
  
  /**
   * Record that we tried a slot but it didn't work out
   */
  onSlotTried(lessonIdx, slot) {
    this.lastPlacements[lessonIdx] = slot;
  }
  
  /**
   * Get learned priority score for variable ordering
   * Higher score = harder lesson = should be tried first
   */
  getVariablePriority(model, lessonIdx) {
    const pattern = lessonPatternKey(model, lessonIdx);
    const diff = this.variableDifficulty.get(pattern);
    if (!diff) return 0;
    
    // Difficulty score = backtracks per success
    if (diff.successes === 0) return diff.backtracks * 2;  // new pattern, assume hard
    return diff.backtracks / diff.successes;
  }
  
  /**
   * Get learned success rate for a slot
   * Returns probability estimate [0, 1]
   */
  getSlotSuccessRate(model, lessonIdx, slot) {
    const slotPattern = slotPatternKey(model, lessonIdx, slot);
    const slotMap = this.slotSuccess.get(slotPattern);
    if (!slotMap) return 0.5;  // unknown = 50%
    
    const counts = slotMap.get(slot);
    if (!counts) return 0.5;
    
    const total = counts.successes + counts.failures;
    if (total === 0) return 0.5;
    
    // Bayesian estimate with smoothing
    return (counts.successes + 0.5) / (total + 1.0);
  }
  
  /**
   * Get statistics about learning progress
   */
  getStats() {
    const varPatterns = this.variableDifficulty.size;
    const slotPatterns = this.slotSuccess.size;
    
    let totalBacktracks = 0;
    let totalSuccesses = 0;
    for (const diff of this.variableDifficulty.values()) {
      totalBacktracks += diff.backtracks;
      totalSuccesses += diff.successes;
    }
    
    return {
      variablePatterns: varPatterns,
      slotPatterns: slotPatterns,
      totalBacktracks,
      totalSuccesses,
      avgDifficulty: totalSuccesses > 0 ? (totalBacktracks / totalSuccesses).toFixed(2) : 'N/A',
    };
  }
  
  /**
   * Clear all learning data (admin function, no-op if localStorage unavailable)
   */
  static clearAll() {
    if (typeof localStorage === 'undefined') return 0;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
    return keys.length;
  }
}

/**
 * Factory: create SolverLearning instance for a school
 */
export function createLearningForSchool(school) {
  // Hash school structure (teachers, subjects, classes, time slots)
  const structure = {
    teacherCount: school.teachers?.length || 0,
    subjectCount: school.subjects?.length || 0,
    classCount: school.classes?.length || 0,
    daysPerWeek: school.daysPerWeek || 5,
    periodsPerDay: school.periodsPerDay || school.bells?.[0]?.periods?.length || 8,
  };
  
  const hash = fnv1aHash(JSON.stringify(structure));
  return new SolverLearning(hash);
}

/**
 * Clear all learning data (admin function)
 */
export function clearAllLearning() {
  return SolverLearning.clearAll();
}
