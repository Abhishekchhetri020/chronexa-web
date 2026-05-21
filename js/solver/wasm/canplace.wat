(module
 (type $0 (func (param i32 i32 i32 i32 i32 i32 i32)))
 (type $1 (func (param i32 i32 i32) (result i32)))
 (type $2 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
 (global $assembly/canplace/days (mut i32) (i32.const 0))
 (global $assembly/canplace/periodsPerDay (mut i32) (i32.const 0))
 (global $assembly/canplace/subjectCount (mut i32) (i32.const 0))
 (global $assembly/canplace/teacherOccPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classGroupOccPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/roomOccPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/teacherAvailPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/teacherDayLoadPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classDayLoadPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classSubjectDayCtPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonTeacherFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonClassFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonClassGMaskPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonTeacherStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonTeacherCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonClassStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonClassCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonSubjectPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/teacherMaxPerDayPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classMaxPerDayPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/subjectDailyLimitPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/slotDayPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/slotPeriodPtr (mut i32) (i32.const 0))
 (memory $0 0)
 (export "setShape" (func $assembly/canplace/setShape))
 (export "bindArrays" (func $assembly/canplace/bindArrays))
 (export "canPlace" (func $assembly/canplace/canPlace))
 (export "memory" (memory $0))
 (func $assembly/canplace/setShape (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32)
  local.get $0
  global.set $assembly/canplace/days
  local.get $1
  global.set $assembly/canplace/periodsPerDay
  local.get $4
  global.set $assembly/canplace/subjectCount
 )
 (func $assembly/canplace/canPlace (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  local.get $1
  i32.const 2
  i32.shl
  local.tee $1
  global.get $assembly/canplace/slotDayPtr
  i32.add
  i32.load
  local.set $3
  i32.const 1
  global.get $assembly/canplace/slotPeriodPtr
  local.get $1
  i32.add
  i32.load
  local.tee $5
  i32.shl
  local.set $4
  local.get $0
  i32.const 2
  i32.shl
  local.tee $1
  global.get $assembly/canplace/lessonTeacherStartPtr
  i32.add
  i32.load
  local.set $6
  global.get $assembly/canplace/lessonTeacherCountPtr
  local.get $1
  i32.add
  i32.load
  local.set $7
  i32.const 0
  local.set $1
  loop $for-loop|0
   local.get $1
   local.get $7
   i32.lt_s
   if
    global.get $assembly/canplace/teacherOccPtr
    global.get $assembly/canplace/lessonTeacherFlatPtr
    local.get $1
    local.get $6
    i32.add
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.tee $8
    global.get $assembly/canplace/days
    i32.mul
    local.get $3
    i32.add
    local.tee $9
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.get $4
    i32.and
    if
     i32.const 1
     return
    end
    global.get $assembly/canplace/teacherAvailPtr
    local.get $9
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.get $4
    i32.and
    i32.eqz
    if
     i32.const 2
     return
    end
    global.get $assembly/canplace/teacherMaxPerDayPtr
    local.get $8
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.tee $8
    i32.const 0
    i32.ge_s
    if (result i32)
     global.get $assembly/canplace/teacherDayLoadPtr
     local.get $9
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.get $8
     i32.ge_s
    else
     i32.const 0
    end
    if
     i32.const 3
     return
    end
    local.get $1
    i32.const 1
    i32.add
    local.set $1
    br $for-loop|0
   end
  end
  local.get $0
  i32.const 2
  i32.shl
  local.tee $0
  global.get $assembly/canplace/lessonClassStartPtr
  i32.add
  i32.load
  local.set $6
  global.get $assembly/canplace/lessonClassCountPtr
  local.get $0
  i32.add
  i32.load
  local.set $7
  global.get $assembly/canplace/lessonSubjectPtr
  local.get $0
  i32.add
  i32.load
  local.set $8
  i32.const 0
  local.set $0
  loop $for-loop|1
   local.get $0
   local.get $7
   i32.lt_s
   if
    local.get $0
    local.get $6
    i32.add
    i32.const 2
    i32.shl
    local.tee $9
    global.get $assembly/canplace/lessonClassFlatPtr
    i32.add
    i32.load
    local.tee $10
    global.get $assembly/canplace/days
    i32.mul
    local.get $3
    i32.add
    local.set $1
    global.get $assembly/canplace/lessonClassGMaskPtr
    local.get $9
    i32.add
    i32.load
    global.get $assembly/canplace/classGroupOccPtr
    local.get $1
    global.get $assembly/canplace/periodsPerDay
    i32.mul
    local.get $5
    i32.add
    i32.const 2
    i32.shl
    i32.add
    i32.load
    i32.and
    if
     i32.const 4
     return
    end
    global.get $assembly/canplace/classMaxPerDayPtr
    local.get $10
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.tee $9
    i32.const 0
    i32.ge_s
    if (result i32)
     global.get $assembly/canplace/classDayLoadPtr
     local.get $1
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.get $9
     i32.ge_s
    else
     i32.const 0
    end
    if
     i32.const 6
     return
    end
    global.get $assembly/canplace/days
    local.get $10
    global.get $assembly/canplace/subjectCount
    i32.mul
    local.get $8
    i32.add
    i32.mul
    local.get $3
    i32.add
    i32.const 2
    i32.shl
    local.tee $1
    global.get $assembly/canplace/subjectDailyLimitPtr
    i32.add
    i32.load
    local.tee $9
    i32.const 0
    i32.ge_s
    if (result i32)
     global.get $assembly/canplace/classSubjectDayCtPtr
     local.get $1
     i32.add
     i32.load
     local.get $9
     i32.ge_s
    else
     i32.const 0
    end
    if
     i32.const 7
     return
    end
    local.get $0
    i32.const 1
    i32.add
    local.set $0
    br $for-loop|1
   end
  end
  local.get $2
  i32.const 0
  i32.ge_s
  if
   global.get $assembly/canplace/roomOccPtr
   local.get $2
   global.get $assembly/canplace/days
   i32.mul
   local.get $3
   i32.add
   i32.const 2
   i32.shl
   i32.add
   i32.load
   local.get $4
   i32.and
   if
    i32.const 8
    return
   end
  end
  i32.const 0
 )
 (func $assembly/canplace/bindArrays (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32) (param $8 i32) (param $9 i32) (param $10 i32) (param $11 i32) (param $12 i32) (param $13 i32) (param $14 i32) (param $15 i32) (param $16 i32) (param $17 i32) (param $18 i32) (param $19 i32) (param $20 i32)
  local.get $0
  global.set $assembly/canplace/teacherOccPtr
  local.get $2
  global.set $assembly/canplace/classGroupOccPtr
  local.get $3
  global.set $assembly/canplace/roomOccPtr
  local.get $4
  global.set $assembly/canplace/teacherAvailPtr
  local.get $5
  global.set $assembly/canplace/teacherDayLoadPtr
  local.get $6
  global.set $assembly/canplace/classDayLoadPtr
  local.get $7
  global.set $assembly/canplace/classSubjectDayCtPtr
  local.get $8
  global.set $assembly/canplace/lessonTeacherFlatPtr
  local.get $9
  global.set $assembly/canplace/lessonClassFlatPtr
  local.get $10
  global.set $assembly/canplace/lessonClassGMaskPtr
  local.get $11
  global.set $assembly/canplace/lessonTeacherStartPtr
  local.get $12
  global.set $assembly/canplace/lessonTeacherCountPtr
  local.get $13
  global.set $assembly/canplace/lessonClassStartPtr
  local.get $14
  global.set $assembly/canplace/lessonClassCountPtr
  local.get $15
  global.set $assembly/canplace/lessonSubjectPtr
  local.get $16
  global.set $assembly/canplace/teacherMaxPerDayPtr
  local.get $17
  global.set $assembly/canplace/classMaxPerDayPtr
  local.get $18
  global.set $assembly/canplace/subjectDailyLimitPtr
  local.get $19
  global.set $assembly/canplace/slotDayPtr
  local.get $20
  global.set $assembly/canplace/slotPeriodPtr
 )
)
