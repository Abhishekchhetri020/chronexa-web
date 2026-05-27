(module
 (type $0 (func (param i32 i32 i32 i32)))
 (type $1 (func))
 (type $2 (func (param i32 i32 i32) (result i32)))
 (type $3 (func (param i32)))
 (type $4 (func (param i32) (result i32)))
 (type $5 (func (param i32 i32) (result i32)))
 (type $6 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
 (type $7 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
 (import "env" "abort" (func $~lib/builtins/abort (param i32 i32 i32 i32)))
 (global $assembly/canplace/days (mut i32) (i32.const 0))
 (global $assembly/canplace/periodsPerDay (mut i32) (i32.const 0))
 (global $assembly/canplace/subjectCount (mut i32) (i32.const 0))
 (global $assembly/canplace/teacherOccPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/teacherAvailPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classGroupOccPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/roomOccPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/teacherDayLoadPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classDayLoadPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classSubjectDayCtPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classSubjectTotalPlacedPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/slotDayPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/slotPeriodPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonTeacherStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonTeacherCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonTeacherFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonClassStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonClassCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonClassFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonClassPackedPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonSubjectPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonFixedSlotPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonMustFirstLastPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonAssignedPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/lessonAssignedSlotPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/teacherMaxPerDayPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classMaxPerDayPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/classValidPeriodMaskPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/subjectDailyLimitPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/subjectDailyMinPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/sessionsByClassSubjectPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n1PartnersStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n1PartnersCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n1PartnersFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n0PartnersStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n0PartnersCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n0PartnersFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/sdPartnersStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/sdPartnersCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/sdPartnersFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fAnyStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fAnyCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fAnyFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fBeforeStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fBeforeCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fBeforeFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fAfterStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fAfterCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/fAfterFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/simPartnersStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/simPartnersCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/simPartnersFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n7PartnersStartPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n7PartnersCountPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/n7PartnersFlatPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/breakPeriodsPtr (mut i32) (i32.const 0))
 (global $assembly/canplace/breakPeriodsLength (mut i32) (i32.const 0))
 (global $~lib/rt/stub/offset (mut i32) (i32.const 0))
 (global $~lib/rt/__rtti_base i32 (i32.const 1168))
 (memory $0 1)
 (data $0 (i32.const 1036) "<")
 (data $0.1 (i32.const 1048) "\02\00\00\00(\00\00\00A\00l\00l\00o\00c\00a\00t\00i\00o\00n\00 \00t\00o\00o\00 \00l\00a\00r\00g\00e")
 (data $1 (i32.const 1100) "<")
 (data $1.1 (i32.const 1112) "\02\00\00\00\1e\00\00\00~\00l\00i\00b\00/\00r\00t\00/\00s\00t\00u\00b\00.\00t\00s")
 (data $2 (i32.const 1168) "\04\00\00\00 \00\00\00 \00\00\00 ")
 (export "setShape" (func $assembly/canplace/setShape))
 (export "bindArrays" (func $assembly/canplace/bindArrays))
 (export "bindRelations" (func $assembly/canplace/bindRelations))
 (export "canPlace" (func $assembly/canplace/canPlace))
 (export "__new" (func $~lib/rt/stub/__new))
 (export "__pin" (func $~lib/rt/stub/__pin))
 (export "__unpin" (func $~lib/rt/stub/__unpin))
 (export "__collect" (func $~lib/rt/stub/__collect))
 (export "__rtti_base" (global $~lib/rt/__rtti_base))
 (export "memory" (memory $0))
 (start $~start)
 (func $~start
  i32.const 1196
  global.set $~lib/rt/stub/offset
 )
 (func $~lib/rt/stub/__unpin (param $0 i32)
 )
 (func $~lib/rt/stub/__pin (param $0 i32) (result i32)
  local.get $0
 )
 (func $~lib/rt/stub/__new (param $0 i32) (param $1 i32) (result i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  local.get $0
  i32.const 1073741804
  i32.gt_u
  if
   i32.const 1056
   i32.const 1120
   i32.const 86
   i32.const 30
   call $~lib/builtins/abort
   unreachable
  end
  local.get $0
  i32.const 16
  i32.add
  local.tee $3
  i32.const 1073741820
  i32.gt_u
  if
   i32.const 1056
   i32.const 1120
   i32.const 33
   i32.const 29
   call $~lib/builtins/abort
   unreachable
  end
  global.get $~lib/rt/stub/offset
  i32.const 4
  i32.add
  local.tee $2
  local.get $3
  i32.const 19
  i32.add
  i32.const -16
  i32.and
  i32.const 4
  i32.sub
  local.tee $3
  i32.add
  local.tee $4
  memory.size
  local.tee $5
  i32.const 16
  i32.shl
  i32.const 15
  i32.add
  i32.const -16
  i32.and
  local.tee $6
  i32.gt_u
  if
   local.get $5
   local.get $4
   local.get $6
   i32.sub
   i32.const 65535
   i32.add
   i32.const -65536
   i32.and
   i32.const 16
   i32.shr_u
   local.tee $6
   local.get $5
   local.get $6
   i32.gt_s
   select
   memory.grow
   i32.const 0
   i32.lt_s
   if
    local.get $6
    memory.grow
    i32.const 0
    i32.lt_s
    if
     unreachable
    end
   end
  end
  global.get $~lib/rt/stub/offset
  local.get $4
  global.set $~lib/rt/stub/offset
  local.get $3
  i32.store
  local.get $2
  i32.const 4
  i32.sub
  local.tee $3
  i32.const 0
  i32.store offset=4
  local.get $3
  i32.const 0
  i32.store offset=8
  local.get $3
  local.get $1
  i32.store offset=12
  local.get $3
  local.get $0
  i32.store offset=16
  local.get $2
  i32.const 16
  i32.add
 )
 (func $~lib/rt/stub/__collect
 )
 (func $assembly/canplace/setShape (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32)
  local.get $0
  global.set $assembly/canplace/days
  local.get $1
  global.set $assembly/canplace/periodsPerDay
  local.get $2
  global.set $assembly/canplace/subjectCount
 )
 (func $assembly/canplace/canPlaceCore (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  local.get $1
  i32.const 2
  i32.shl
  local.tee $3
  global.get $assembly/canplace/slotDayPtr
  i32.add
  i32.load
  local.set $4
  i32.const 1
  global.get $assembly/canplace/slotPeriodPtr
  local.get $3
  i32.add
  i32.load
  local.tee $6
  i32.shl
  local.set $5
  global.get $assembly/canplace/lessonFixedSlotPtr
  local.get $0
  i32.const 2
  i32.shl
  i32.add
  i32.load
  local.tee $3
  local.get $1
  i32.ne
  local.get $3
  i32.const 0
  i32.ge_s
  i32.and
  if
   i32.const 21
   return
  end
  local.get $0
  i32.const 2
  i32.shl
  local.tee $1
  global.get $assembly/canplace/lessonTeacherStartPtr
  i32.add
  i32.load
  local.set $3
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
    local.get $3
    i32.add
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.tee $8
    global.get $assembly/canplace/days
    i32.mul
    local.get $4
    i32.add
    local.tee $9
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.get $5
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
    local.get $5
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
  local.set $8
  global.get $assembly/canplace/lessonClassCountPtr
  local.get $0
  i32.add
  i32.load
  local.set $9
  global.get $assembly/canplace/lessonSubjectPtr
  local.get $0
  i32.add
  i32.load
  local.set $10
  i32.const 0
  local.set $0
  loop $for-loop|1
   local.get $0
   local.get $9
   i32.lt_s
   if
    global.get $assembly/canplace/lessonClassFlatPtr
    local.get $0
    local.get $8
    i32.add
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.tee $7
    global.get $assembly/canplace/days
    i32.mul
    local.get $4
    i32.add
    local.set $3
    global.get $assembly/canplace/classValidPeriodMaskPtr
    if
     global.get $assembly/canplace/classValidPeriodMaskPtr
     local.get $7
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.get $5
     i32.and
     i32.eqz
     if
      i32.const 29
      return
     end
    end
    global.get $assembly/canplace/lessonClassPackedPtr
    local.get $0
    local.get $8
    i32.add
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.set $11
    global.get $assembly/canplace/classGroupOccPtr
    local.get $3
    global.get $assembly/canplace/periodsPerDay
    i32.mul
    local.get $6
    i32.add
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.tee $12
    if
     local.get $12
     i32.const 65535
     i32.and
     local.tee $1
     i32.const 65535
     i32.eq
     local.get $11
     i32.const 65535
     i32.and
     local.tee $13
     i32.const 65535
     i32.eq
     i32.or
     local.get $1
     local.get $13
     i32.ne
     i32.or
     if
      i32.const 4
      return
     end
     local.get $11
     i32.const 16
     i32.shr_u
     local.get $12
     i32.const 16
     i32.shr_u
     i32.and
     if
      i32.const 4
      return
     end
    end
    global.get $assembly/canplace/classMaxPerDayPtr
    local.get $7
    i32.const 2
    i32.shl
    i32.add
    i32.load
    local.tee $1
    i32.const 0
    i32.ge_s
    if (result i32)
     global.get $assembly/canplace/classDayLoadPtr
     local.get $3
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.get $1
     i32.ge_s
    else
     i32.const 0
    end
    if
     i32.const 6
     return
    end
    global.get $assembly/canplace/days
    local.get $7
    global.get $assembly/canplace/subjectCount
    i32.mul
    local.get $10
    i32.add
    i32.mul
    local.get $4
    i32.add
    local.tee $1
    i32.const 2
    i32.shl
    local.tee $3
    global.get $assembly/canplace/subjectDailyLimitPtr
    i32.add
    i32.load
    local.tee $11
    i32.const 0
    i32.ge_s
    if (result i32)
     global.get $assembly/canplace/classSubjectDayCtPtr
     local.get $3
     i32.add
     i32.load
     local.get $11
     i32.ge_s
    else
     i32.const 0
    end
    if
     i32.const 7
     return
    end
    global.get $assembly/canplace/subjectDailyMinPtr
    if
     local.get $7
     global.get $assembly/canplace/subjectCount
     i32.mul
     local.get $10
     i32.add
     i32.const 2
     i32.shl
     local.tee $3
     global.get $assembly/canplace/subjectDailyMinPtr
     i32.add
     i32.load
     local.tee $11
     i32.const 0
     i32.gt_s
     if
      global.get $assembly/canplace/classSubjectDayCtPtr
      local.get $1
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.get $11
      i32.ge_s
      if
       global.get $assembly/canplace/sessionsByClassSubjectPtr
       local.get $3
       i32.add
       i32.load
       global.get $assembly/canplace/classSubjectTotalPlacedPtr
       local.get $3
       i32.add
       i32.load
       i32.sub
       i32.const 1
       i32.sub
       local.set $12
       i32.const 0
       local.set $3
       i32.const 0
       local.set $1
       loop $for-loop|2
        local.get $1
        global.get $assembly/canplace/days
        i32.lt_s
        if
         local.get $1
         local.get $4
         i32.ne
         if
          local.get $3
          i32.const 1
          i32.add
          local.get $3
          global.get $assembly/canplace/classSubjectDayCtPtr
          global.get $assembly/canplace/days
          local.get $7
          global.get $assembly/canplace/subjectCount
          i32.mul
          local.get $10
          i32.add
          i32.mul
          local.get $1
          i32.add
          i32.const 2
          i32.shl
          i32.add
          i32.load
          local.get $11
          i32.lt_s
          select
          local.set $3
         end
         local.get $1
         i32.const 1
         i32.add
         local.set $1
         br $for-loop|2
        end
       end
       local.get $3
       local.get $12
       i32.gt_s
       if
        i32.const 30
        return
       end
      end
     end
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
   local.get $4
   i32.add
   i32.const 2
   i32.shl
   i32.add
   i32.load
   local.get $5
   i32.and
   if
    i32.const 8
    return
   end
  end
  i32.const 0
 )
 (func $assembly/canplace/canPlace (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  local.get $0
  local.get $1
  local.get $2
  call $assembly/canplace/canPlaceCore
  local.tee $2
  if
   local.get $2
   return
  end
  local.get $1
  i32.const 2
  i32.shl
  local.tee $1
  global.get $assembly/canplace/slotDayPtr
  i32.add
  i32.load
  local.set $4
  global.get $assembly/canplace/slotPeriodPtr
  local.get $1
  i32.add
  i32.load
  local.set $5
  global.get $assembly/canplace/n1PartnersStartPtr
  if
   local.get $0
   i32.const 2
   i32.shl
   local.tee $1
   global.get $assembly/canplace/n1PartnersStartPtr
   i32.add
   i32.load
   local.set $2
   global.get $assembly/canplace/n1PartnersCountPtr
   local.get $1
   i32.add
   i32.load
   local.set $1
   loop $for-loop|0
    local.get $1
    local.get $3
    i32.gt_s
    if
     global.get $assembly/canplace/n1PartnersFlatPtr
     local.get $2
     local.get $3
     i32.add
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.tee $6
     global.get $assembly/canplace/lessonAssignedPtr
     i32.add
     i32.load8_u
     if
      global.get $assembly/canplace/lessonAssignedSlotPtr
      local.get $6
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee $6
      i32.const 0
      i32.ge_s
      if (result i32)
       local.get $4
       global.get $assembly/canplace/slotDayPtr
       local.get $6
       i32.const 2
       i32.shl
       i32.add
       i32.load
       i32.eq
      else
       i32.const 0
      end
      if
       i32.const 22
       return
      end
     end
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|0
    end
   end
  end
  global.get $assembly/canplace/n0PartnersStartPtr
  if
   local.get $0
   i32.const 2
   i32.shl
   local.tee $1
   global.get $assembly/canplace/n0PartnersStartPtr
   i32.add
   i32.load
   local.set $2
   global.get $assembly/canplace/n0PartnersCountPtr
   local.get $1
   i32.add
   i32.load
   local.set $1
   i32.const 0
   local.set $3
   loop $for-loop|1
    local.get $1
    local.get $3
    i32.gt_s
    if
     global.get $assembly/canplace/n0PartnersFlatPtr
     local.get $2
     local.get $3
     i32.add
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.tee $6
     global.get $assembly/canplace/lessonAssignedPtr
     i32.add
     i32.load8_u
     if
      global.get $assembly/canplace/lessonAssignedSlotPtr
      local.get $6
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee $6
      i32.const 0
      i32.ge_s
      if (result i32)
       local.get $4
       global.get $assembly/canplace/slotDayPtr
       local.get $6
       i32.const 2
       i32.shl
       i32.add
       i32.load
       i32.eq
      else
       i32.const 0
      end
      if
       global.get $assembly/canplace/slotPeriodPtr
       local.get $6
       i32.const 2
       i32.shl
       i32.add
       i32.load
       local.get $5
       i32.sub
       local.tee $6
       i32.const -1
       i32.eq
       local.get $6
       i32.const 1
       i32.eq
       i32.or
       if
        i32.const 23
        return
       end
      end
     end
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|1
    end
   end
  end
  global.get $assembly/canplace/sdPartnersStartPtr
  if
   local.get $0
   i32.const 2
   i32.shl
   local.tee $1
   global.get $assembly/canplace/sdPartnersStartPtr
   i32.add
   i32.load
   local.set $2
   global.get $assembly/canplace/sdPartnersCountPtr
   local.get $1
   i32.add
   i32.load
   local.set $1
   i32.const 0
   local.set $3
   loop $for-loop|2
    local.get $1
    local.get $3
    i32.gt_s
    if
     global.get $assembly/canplace/sdPartnersFlatPtr
     local.get $2
     local.get $3
     i32.add
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.tee $6
     global.get $assembly/canplace/lessonAssignedPtr
     i32.add
     i32.load8_u
     if
      global.get $assembly/canplace/lessonAssignedSlotPtr
      local.get $6
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee $6
      i32.const 0
      i32.ge_s
      if (result i32)
       local.get $4
       global.get $assembly/canplace/slotDayPtr
       local.get $6
       i32.const 2
       i32.shl
       i32.add
       i32.load
       i32.ne
      else
       i32.const 0
      end
      if
       i32.const 24
       return
      end
     end
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|2
    end
   end
  end
  global.get $assembly/canplace/lessonMustFirstLastPtr
  if
   global.get $assembly/canplace/lessonMustFirstLastPtr
   local.get $0
   i32.add
   i32.load8_u
   if
    local.get $5
    global.get $assembly/canplace/periodsPerDay
    i32.const 1
    i32.sub
    i32.ne
    i32.const 0
    local.get $5
    select
    if
     i32.const 25
     return
    end
   end
  end
  global.get $assembly/canplace/fAnyStartPtr
  if
   local.get $0
   i32.const 2
   i32.shl
   local.tee $1
   global.get $assembly/canplace/fAnyStartPtr
   i32.add
   i32.load
   local.set $2
   global.get $assembly/canplace/fAnyCountPtr
   local.get $1
   i32.add
   i32.load
   local.set $1
   i32.const 0
   local.set $3
   loop $for-loop|3
    local.get $1
    local.get $3
    i32.gt_s
    if
     global.get $assembly/canplace/fAnyFlatPtr
     local.get $2
     local.get $3
     i32.add
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.tee $6
     global.get $assembly/canplace/lessonAssignedPtr
     i32.add
     i32.load8_u
     if
      global.get $assembly/canplace/lessonAssignedSlotPtr
      local.get $6
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee $6
      i32.const 0
      i32.ge_s
      if
       local.get $4
       global.get $assembly/canplace/slotDayPtr
       local.get $6
       i32.const 2
       i32.shl
       i32.add
       i32.load
       i32.ne
       if
        i32.const 26
        return
       end
       global.get $assembly/canplace/slotPeriodPtr
       local.get $6
       i32.const 2
       i32.shl
       i32.add
       i32.load
       local.get $5
       i32.sub
       local.tee $6
       i32.const -1
       i32.ne
       local.get $6
       i32.const 1
       i32.ne
       i32.and
       if
        i32.const 26
        return
       end
      end
     end
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|3
    end
   end
  end
  global.get $assembly/canplace/simPartnersStartPtr
  if
   local.get $0
   i32.const 2
   i32.shl
   local.tee $1
   global.get $assembly/canplace/simPartnersStartPtr
   i32.add
   i32.load
   local.set $2
   global.get $assembly/canplace/simPartnersCountPtr
   local.get $1
   i32.add
   i32.load
   local.set $1
   i32.const 0
   local.set $3
   loop $for-loop|4
    local.get $1
    local.get $3
    i32.gt_s
    if
     global.get $assembly/canplace/simPartnersFlatPtr
     local.get $2
     local.get $3
     i32.add
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.tee $6
     global.get $assembly/canplace/lessonAssignedPtr
     i32.add
     i32.load8_u
     if
      global.get $assembly/canplace/lessonAssignedSlotPtr
      local.get $6
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee $6
      i32.const 0
      i32.ge_s
      if
       local.get $4
       local.get $6
       i32.const 2
       i32.shl
       local.tee $6
       global.get $assembly/canplace/slotDayPtr
       i32.add
       i32.load
       i32.eq
       if (result i32)
        local.get $5
        global.get $assembly/canplace/slotPeriodPtr
        local.get $6
        i32.add
        i32.load
        i32.ne
       else
        i32.const 0
       end
       if
        i32.const 27
        return
       end
      end
     end
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|4
    end
   end
  end
  global.get $assembly/canplace/breakPeriodsLength
  i32.const 0
  i32.gt_s
  i32.const 0
  global.get $assembly/canplace/breakPeriodsPtr
  i32.const 0
  global.get $assembly/canplace/n7PartnersStartPtr
  select
  select
  if
   local.get $0
   i32.const 2
   i32.shl
   local.tee $1
   global.get $assembly/canplace/n7PartnersStartPtr
   i32.add
   i32.load
   local.set $6
   global.get $assembly/canplace/n7PartnersCountPtr
   local.get $1
   i32.add
   i32.load
   local.set $8
   i32.const 0
   local.set $3
   loop $for-loop|5
    local.get $3
    local.get $8
    i32.lt_s
    if
     global.get $assembly/canplace/n7PartnersFlatPtr
     local.get $3
     local.get $6
     i32.add
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.tee $1
     global.get $assembly/canplace/lessonAssignedPtr
     i32.add
     i32.load8_u
     if
      block $for-continue|5
       global.get $assembly/canplace/lessonAssignedSlotPtr
       local.get $1
       i32.const 2
       i32.shl
       i32.add
       i32.load
       local.tee $1
       i32.const 0
       i32.lt_s
       br_if $for-continue|5
       local.get $4
       local.get $1
       i32.const 2
       i32.shl
       local.tee $1
       global.get $assembly/canplace/slotDayPtr
       i32.add
       i32.load
       i32.ne
       br_if $for-continue|5
       local.get $5
       global.get $assembly/canplace/slotPeriodPtr
       local.get $1
       i32.add
       i32.load
       local.tee $1
       local.get $1
       local.get $5
       i32.gt_s
       select
       local.set $9
       local.get $5
       local.get $1
       local.get $1
       local.get $5
       i32.lt_s
       select
       local.set $2
       i32.const 0
       local.set $1
       loop $for-loop|6
        local.get $1
        global.get $assembly/canplace/breakPeriodsLength
        i32.lt_s
        if
         local.get $2
         global.get $assembly/canplace/breakPeriodsPtr
         local.get $1
         i32.const 2
         i32.shl
         i32.add
         i32.load
         local.tee $7
         i32.gt_s
         local.get $7
         local.get $9
         i32.gt_s
         i32.and
         if
          i32.const 28
          return
         end
         local.get $1
         i32.const 1
         i32.add
         local.set $1
         br $for-loop|6
        end
       end
      end
     end
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|5
    end
   end
  end
  global.get $assembly/canplace/fBeforeStartPtr
  if
   local.get $0
   i32.const 2
   i32.shl
   local.tee $1
   global.get $assembly/canplace/fBeforeStartPtr
   i32.add
   i32.load
   local.set $2
   global.get $assembly/canplace/fBeforeCountPtr
   local.get $1
   i32.add
   i32.load
   local.set $1
   i32.const 0
   local.set $3
   loop $for-loop|7
    local.get $1
    local.get $3
    i32.gt_s
    if
     global.get $assembly/canplace/fBeforeFlatPtr
     local.get $2
     local.get $3
     i32.add
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.tee $6
     global.get $assembly/canplace/lessonAssignedPtr
     i32.add
     i32.load8_u
     if
      global.get $assembly/canplace/lessonAssignedSlotPtr
      local.get $6
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee $6
      i32.const 0
      i32.ge_s
      if
       local.get $4
       local.get $6
       i32.const 2
       i32.shl
       local.tee $6
       global.get $assembly/canplace/slotDayPtr
       i32.add
       i32.load
       i32.eq
       if (result i32)
        global.get $assembly/canplace/slotPeriodPtr
        local.get $6
        i32.add
        i32.load
        local.get $5
        i32.const 1
        i32.add
        i32.eq
       else
        i32.const 0
       end
       i32.eqz
       if
        i32.const 26
        return
       end
      end
     end
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|7
    end
   end
  end
  global.get $assembly/canplace/fAfterStartPtr
  if
   local.get $0
   i32.const 2
   i32.shl
   local.tee $0
   global.get $assembly/canplace/fAfterStartPtr
   i32.add
   i32.load
   local.set $1
   global.get $assembly/canplace/fAfterCountPtr
   local.get $0
   i32.add
   i32.load
   local.set $2
   i32.const 0
   local.set $0
   loop $for-loop|8
    local.get $0
    local.get $2
    i32.lt_s
    if
     global.get $assembly/canplace/fAfterFlatPtr
     local.get $0
     local.get $1
     i32.add
     i32.const 2
     i32.shl
     i32.add
     i32.load
     local.tee $3
     global.get $assembly/canplace/lessonAssignedPtr
     i32.add
     i32.load8_u
     if
      global.get $assembly/canplace/lessonAssignedSlotPtr
      local.get $3
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee $3
      i32.const 0
      i32.ge_s
      if
       local.get $4
       local.get $3
       i32.const 2
       i32.shl
       local.tee $3
       global.get $assembly/canplace/slotDayPtr
       i32.add
       i32.load
       i32.eq
       if (result i32)
        global.get $assembly/canplace/slotPeriodPtr
        local.get $3
        i32.add
        i32.load
        local.get $5
        i32.const 1
        i32.sub
        i32.eq
       else
        i32.const 0
       end
       i32.eqz
       if
        i32.const 26
        return
       end
      end
     end
     local.get $0
     i32.const 1
     i32.add
     local.set $0
     br $for-loop|8
    end
   end
  end
  i32.const 0
 )
 (func $assembly/canplace/bindRelations (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32) (param $8 i32) (param $9 i32) (param $10 i32) (param $11 i32) (param $12 i32) (param $13 i32) (param $14 i32) (param $15 i32) (param $16 i32) (param $17 i32) (param $18 i32) (param $19 i32) (param $20 i32) (param $21 i32) (param $22 i32) (param $23 i32) (param $24 i32) (param $25 i32)
  local.get $0
  global.set $assembly/canplace/n1PartnersStartPtr
  local.get $1
  global.set $assembly/canplace/n1PartnersCountPtr
  local.get $2
  global.set $assembly/canplace/n1PartnersFlatPtr
  local.get $3
  global.set $assembly/canplace/n0PartnersStartPtr
  local.get $4
  global.set $assembly/canplace/n0PartnersCountPtr
  local.get $5
  global.set $assembly/canplace/n0PartnersFlatPtr
  local.get $6
  global.set $assembly/canplace/sdPartnersStartPtr
  local.get $7
  global.set $assembly/canplace/sdPartnersCountPtr
  local.get $8
  global.set $assembly/canplace/sdPartnersFlatPtr
  local.get $9
  global.set $assembly/canplace/fAnyStartPtr
  local.get $10
  global.set $assembly/canplace/fAnyCountPtr
  local.get $11
  global.set $assembly/canplace/fAnyFlatPtr
  local.get $12
  global.set $assembly/canplace/fBeforeStartPtr
  local.get $13
  global.set $assembly/canplace/fBeforeCountPtr
  local.get $14
  global.set $assembly/canplace/fBeforeFlatPtr
  local.get $15
  global.set $assembly/canplace/fAfterStartPtr
  local.get $16
  global.set $assembly/canplace/fAfterCountPtr
  local.get $17
  global.set $assembly/canplace/fAfterFlatPtr
  local.get $18
  global.set $assembly/canplace/simPartnersStartPtr
  local.get $19
  global.set $assembly/canplace/simPartnersCountPtr
  local.get $20
  global.set $assembly/canplace/simPartnersFlatPtr
  local.get $21
  global.set $assembly/canplace/n7PartnersStartPtr
  local.get $22
  global.set $assembly/canplace/n7PartnersCountPtr
  local.get $23
  global.set $assembly/canplace/n7PartnersFlatPtr
  local.get $24
  global.set $assembly/canplace/breakPeriodsPtr
  local.get $25
  global.set $assembly/canplace/breakPeriodsLength
 )
 (func $assembly/canplace/bindArrays (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32) (param $8 i32) (param $9 i32) (param $10 i32) (param $11 i32) (param $12 i32) (param $13 i32) (param $14 i32) (param $15 i32) (param $16 i32) (param $17 i32) (param $18 i32) (param $19 i32) (param $20 i32) (param $21 i32) (param $22 i32) (param $23 i32) (param $24 i32) (param $25 i32) (param $26 i32) (param $27 i32)
  local.get $0
  global.set $assembly/canplace/teacherOccPtr
  local.get $1
  global.set $assembly/canplace/teacherAvailPtr
  local.get $2
  global.set $assembly/canplace/classGroupOccPtr
  local.get $3
  global.set $assembly/canplace/roomOccPtr
  local.get $4
  global.set $assembly/canplace/teacherDayLoadPtr
  local.get $5
  global.set $assembly/canplace/classDayLoadPtr
  local.get $6
  global.set $assembly/canplace/classSubjectDayCtPtr
  local.get $7
  global.set $assembly/canplace/classSubjectTotalPlacedPtr
  local.get $8
  global.set $assembly/canplace/slotDayPtr
  local.get $9
  global.set $assembly/canplace/slotPeriodPtr
  local.get $10
  global.set $assembly/canplace/lessonTeacherStartPtr
  local.get $11
  global.set $assembly/canplace/lessonTeacherCountPtr
  local.get $12
  global.set $assembly/canplace/lessonTeacherFlatPtr
  local.get $13
  global.set $assembly/canplace/lessonClassStartPtr
  local.get $14
  global.set $assembly/canplace/lessonClassCountPtr
  local.get $15
  global.set $assembly/canplace/lessonClassFlatPtr
  local.get $16
  global.set $assembly/canplace/lessonClassPackedPtr
  local.get $17
  global.set $assembly/canplace/lessonSubjectPtr
  local.get $18
  global.set $assembly/canplace/lessonFixedSlotPtr
  local.get $19
  global.set $assembly/canplace/lessonMustFirstLastPtr
  local.get $20
  global.set $assembly/canplace/lessonAssignedPtr
  local.get $21
  global.set $assembly/canplace/lessonAssignedSlotPtr
  local.get $22
  global.set $assembly/canplace/teacherMaxPerDayPtr
  local.get $23
  global.set $assembly/canplace/classMaxPerDayPtr
  local.get $24
  global.set $assembly/canplace/classValidPeriodMaskPtr
  local.get $25
  global.set $assembly/canplace/subjectDailyLimitPtr
  local.get $26
  global.set $assembly/canplace/subjectDailyMinPtr
  local.get $27
  global.set $assembly/canplace/sessionsByClassSubjectPtr
 )
)
