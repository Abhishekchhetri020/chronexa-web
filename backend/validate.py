import json, sys, collections, math
import solver_cpsat
school=json.load(open('/tmp/demo_school.json'))
tl=int(sys.argv[1]) if len(sys.argv)>1 else 90
soft = (sys.argv[2]!='nosoft') if len(sys.argv)>2 else True
r=solver_cpsat.build_and_solve(school, time_limit_sec=tl, num_workers=8, soft=soft)
print("STATS:", json.dumps(r['stats']))
A=r['assignment']
les={l['id']:l for l in school['lessons']}
subj={s['id']:(s.get('name') or s.get('abbr')) for s in school['subjects']}
classname={c['id']:c.get('name') for c in school['classes']}
teachname={t['id']:(t.get('name') or t.get('abbr')) for t in school['teachers']}
days=school['daysPerWeek']; periods=[p['index'] for p in school['bell']['periods'] if p.get('isTeaching',True)is not False]
# 1. SMP doubles contiguous
byles_day=collections.defaultdict(lambda: collections.defaultdict(list))
for a in A: byles_day[a['lessonId']][a['day']].append(a['period'])
bad=0; tot_smp=0
for lid,l in les.items():
    if not l.get('isLabDouble'): continue
    for d,ps in byles_day[lid].items():
        ps=sorted(ps); tot_smp+=1
        if not (len(ps)==2 and ps[1]==ps[0]+1): bad+=1
print("SMP doubles: %d day-blocks, NON-contiguous=%d"%(tot_smp,bad))
# 2. EVS spread: count classes where a 6/wk subject has >1 on a day
cs_day=collections.defaultdict(lambda: collections.defaultdict(int))
for a in A:
    l=les[a['lessonId']]; s=l['subjectId']
    for c in l.get('classIds',[]): cs_day[(c,s)][a['day']]+=1
over1=0; samples=[]
for (c,s),dc in cs_day.items():
    tot=sum(dc.values()); cap=math.ceil(tot/days); mx=max(dc.values())
    if mx>cap:
        over1+=1
        if len(samples)<5: samples.append((classname.get(c),subj.get(s),'tot=%d maxday=%d cap=%d'%(tot,mx,cap)))
print("subject (class,subj) still over ideal cap: %d"%over1)
for x in samples: print("   ",x)
# show I A EVS distribution
for (c,s),dc in cs_day.items():
    if classname.get(c)=='I A' and 'E.V.S' in (subj.get(s) or ''):
        print("   I A E.V.S per-day:", dict(sorted(dc.items()))); break
# 3. teacher gaps: total interior idle gaps across all teachers
tg=collections.defaultdict(lambda: collections.defaultdict(set))
for a in A:
    l=les[a['lessonId']]
    for t in l.get('teacherIds',[]): tg[t][a['day']].add(a['period'])
gaps=0
for t,dd in tg.items():
    for d,ps in dd.items():
        ps=sorted(ps)
        if len(ps)>=2:
            gaps += (ps[-1]-ps[0]+1) - len(ps)
print("TOTAL teacher idle gaps (interior): %d"%gaps)
