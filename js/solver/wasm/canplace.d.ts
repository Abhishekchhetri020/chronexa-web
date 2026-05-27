declare namespace __AdaptedExports {
  /** Exported memory */
  export const memory: WebAssembly.Memory;
  // Exported runtime interface
  export function __new(size: number, id: number): number;
  export function __pin(ptr: number): number;
  export function __unpin(ptr: number): void;
  export function __collect(): void;
  export const __rtti_base: number;
  /**
   * assembly/canplace/setShape
   * @param d `i32`
   * @param ppd `i32`
   * @param sc `i32`
   * @param ts `i32`
   */
  export function setShape(d: number, ppd: number, sc: number, ts: number): void;
  /**
   * assembly/canplace/bindArrays
   * @param pTeacherOcc `usize`
   * @param pTeacherAvail `usize`
   * @param pClassGroupOcc `usize`
   * @param pRoomOcc `usize`
   * @param pTeacherDayLoad `usize`
   * @param pClassDayLoad `usize`
   * @param pClassSubjectDayCt `usize`
   * @param pClassSubjectTotalPlaced `usize`
   * @param pSlotDay `usize`
   * @param pSlotPeriod `usize`
   * @param pLessonTeacherStart `usize`
   * @param pLessonTeacherCount `usize`
   * @param pLessonTeacherFlat `usize`
   * @param pLessonClassStart `usize`
   * @param pLessonClassCount `usize`
   * @param pLessonClassFlat `usize`
   * @param pLessonClassPacked `usize`
   * @param pLessonSubject `usize`
   * @param pLessonFixedSlot `usize`
   * @param pLessonMustFirstLast `usize`
   * @param pLessonAssigned `usize`
   * @param pLessonAssignedSlot `usize`
   * @param pTeacherMaxPerDay `usize`
   * @param pClassMaxPerDay `usize`
   * @param pClassValidPeriodMask `usize`
   * @param pSubjectDailyLimit `usize`
   * @param pSubjectDailyMin `usize`
   * @param pSessionsByClassSubject `usize`
   */
  export function bindArrays(pTeacherOcc: number, pTeacherAvail: number, pClassGroupOcc: number, pRoomOcc: number, pTeacherDayLoad: number, pClassDayLoad: number, pClassSubjectDayCt: number, pClassSubjectTotalPlaced: number, pSlotDay: number, pSlotPeriod: number, pLessonTeacherStart: number, pLessonTeacherCount: number, pLessonTeacherFlat: number, pLessonClassStart: number, pLessonClassCount: number, pLessonClassFlat: number, pLessonClassPacked: number, pLessonSubject: number, pLessonFixedSlot: number, pLessonMustFirstLast: number, pLessonAssigned: number, pLessonAssignedSlot: number, pTeacherMaxPerDay: number, pClassMaxPerDay: number, pClassValidPeriodMask: number, pSubjectDailyLimit: number, pSubjectDailyMin: number, pSessionsByClassSubject: number): void;
  /**
   * assembly/canplace/bindRelations
   * @param pN1Start `usize`
   * @param pN1Count `usize`
   * @param pN1Flat `usize`
   * @param pN0Start `usize`
   * @param pN0Count `usize`
   * @param pN0Flat `usize`
   * @param pSDStart `usize`
   * @param pSDCount `usize`
   * @param pSDFlat `usize`
   * @param pFAnyStart `usize`
   * @param pFAnyCount `usize`
   * @param pFAnyFlat `usize`
   * @param pFBeforeStart `usize`
   * @param pFBeforeCount `usize`
   * @param pFBeforeFlat `usize`
   * @param pFAfterStart `usize`
   * @param pFAfterCount `usize`
   * @param pFAfterFlat `usize`
   * @param pSimStart `usize`
   * @param pSimCount `usize`
   * @param pSimFlat `usize`
   * @param pN7Start `usize`
   * @param pN7Count `usize`
   * @param pN7Flat `usize`
   * @param pBreakPeriods `usize`
   * @param breakCount `i32`
   */
  export function bindRelations(pN1Start: number, pN1Count: number, pN1Flat: number, pN0Start: number, pN0Count: number, pN0Flat: number, pSDStart: number, pSDCount: number, pSDFlat: number, pFAnyStart: number, pFAnyCount: number, pFAnyFlat: number, pFBeforeStart: number, pFBeforeCount: number, pFBeforeFlat: number, pFAfterStart: number, pFAfterCount: number, pFAfterFlat: number, pSimStart: number, pSimCount: number, pSimFlat: number, pN7Start: number, pN7Count: number, pN7Flat: number, pBreakPeriods: number, breakCount: number): void;
  /**
   * assembly/canplace/canPlace
   * @param lessonIdx `i32`
   * @param slot `i32`
   * @param roomIdx `i32`
   * @returns `i32`
   */
  export function canPlace(lessonIdx: number, slot: number, roomIdx: number): number;
}
/** Instantiates the compiled WebAssembly module with the given imports. */
export declare function instantiate(module: WebAssembly.Module, imports: {
  env: unknown,
}): Promise<typeof __AdaptedExports>;
