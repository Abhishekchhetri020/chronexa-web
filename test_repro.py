import time
import traceback
import json

def main():
    try:
        print("Opening Chronexa Web...")
        new_tab("http://localhost:8000/")
        wait_for_load()
        time.sleep(2)
        
        # 1. Create a Blank School "AC School"
        print("Creating blank school 'AC School'...")
        js("if(window.CreateNew) window.CreateNew.createBlank({ schoolName: 'AC School' });")
        time.sleep(1)
        
        # 2. Inject 60 Teachers, 20 Classes, 10 Subjects, 1 Room, and generate lessons
        print("Injecting 60 teachers, 20 classes, 10 subjects...")
        injection_script = """
        const s = window.APP.school;
        s.name = "AC School";
        
        // Setup Bell Schedule, Days, Weeks, Terms
        s.days = [{id: 'd_1', name: 'Monday', short: 'Mon'}, {id: 'd_2', name: 'Tuesday', short: 'Tue'}, {id: 'd_3', name: 'Wednesday', short: 'Wed'}, {id: 'd_4', name: 'Thursday', short: 'Thu'}, {id: 'd_5', name: 'Friday', short: 'Fri'}];
        s.weeks = [{id: 'w_1', name: 'All Weeks', short: 'All'}];
        s.terms = [{id: 'term_1', name: 'Term 1', short: 'T1'}];
        
        s.bells = [{ id: 'b_1', name: 'Standard', periods: [
            { period: 1, startTime: '08:00', endTime: '08:45' },
            { period: 2, startTime: '08:45', endTime: '09:30' },
            { period: 3, startTime: '09:30', endTime: '10:15' },
            { period: 4, startTime: '10:15', endTime: '11:00' },
            { period: 5, startTime: '11:00', endTime: '11:45' }
        ]}];
        s.bell = 'b_1';
        
        // 10 Subjects
        for(let i=1; i<=10; i++) {
            s.subjects.push({ id: 'sub_'+i, name: 'Subject '+i, short: 'S'+i, color: '#e2e8f0' });
        }
        
        // 60 Teachers
        for(let i=1; i<=60; i++) {
            s.teachers.push({ id: 't_'+i, firstName: 'Teacher', lastName: ''+i, short: 'T'+i, color: '#bae6fd' });
        }
        
        // 20 Classes
        for(let i=1; i<=20; i++) {
            s.classes.push({ id: 'c_'+i, name: 'Class '+i, short: 'C'+i, color: '#fecaca', bellId: 'b_1' });
        }
        
        // 1 Room
        s.classrooms.push({ id: 'r_1', name: 'Main Hall', short: 'MH', color: '#bbf7d0', isShared: false });
        
        // Generate Lessons
        let lessonId = 1;
        for(let c of s.classes) {
            for(let i=1; i<=5; i++) {
                let sub = s.subjects[i-1];
                let t = s.teachers[(parseInt(c.id.split('_')[1]) + i) % 60];
                s.lessons.push({
                    id: 'l_'+(lessonId++),
                    subjectId: sub.id,
                    classIds: [c.id],
                    teacherIds: [t.id],
                    classroomIds: ['r_1'],
                    periodsPerWeek: 3,
                    duration: 1,
                    terms: 'def',
                    weeks: 'def',
                    days: 'def'
                });
            }
        }
        
        // Trigger a re-render to reflect the new data
        if(window.APP.events && window.APP.events.fire) {
            window.APP.events.fire('app:school-loaded');
        }
        return `Injected ${s.teachers.length} teachers, ${s.classes.length} classes, ${s.lessons.length} lessons.`;
        """
        res = js(injection_script)
        print("Injection result:", res)
        time.sleep(2)
        
        # 3. Simulate clicking "Generate"
        print("Clicking Generate to invoke the solver...")
        js("""
        let genBtn = Array.from(document.querySelectorAll('button, .chrx-topbar-item')).find(b => b.innerText.includes('Generate'));
        if(genBtn) genBtn.click();
        """)
        time.sleep(2)
        js("""
        let startGenBtn = Array.from(document.querySelectorAll('.chrx-dialog button')).find(b => b.innerText === 'Generate');
        if(startGenBtn) startGenBtn.click();
        """)
        print("Solver started. Waiting 5 seconds to observe performance...")
        time.sleep(5)
        
        status = js("document.querySelector('.chrx-solver-status') ? document.querySelector('.chrx-solver-status').innerText : 'No status UI found'")
        print("Solver Status UI:", status)
        
        # Click close dialog if it's there
        js("""
        let closeBtn = Array.from(document.querySelectorAll('.chrx-dialog button')).find(b => b.innerText === 'Close');
        if(closeBtn) closeBtn.click();
        """)
        time.sleep(1)
        
        # 4. Find UI Memory leak via re-renders
        print("Testing UI memory leak via grid re-renders...")
        js("""
        if(window.Editor && window.Editor.render) {
            let container = document.querySelector('.chrx-editor-grid-container');
            if(container) {
                for(let i=0; i<50; i++) {
                    window.Editor.render(container);
                }
            }
        }
        """)
        
        # Check event listeners on grid (requires manual Chrome DevTools 'getEventListeners', but we can check responsiveness)
        ping = js("Date.now()")
        print("UI responded after 50 rapid re-renders. (If it crashed, this wouldn't print).")
        
        # 5. Drag and Drop bug: silent data loss
        # We can simulate setting a card in hand and then clicking another card
        print("Testing silent data loss drag-and-drop bug...")
        card_count_before = js("window.APP.school.cards ? window.APP.school.cards.length : 0")
        
        js("""
        // Force the app to think a card is in hand
        if(window.EditorState) {
            window.EditorState.cardInHand = { id: 'c_fake_123', lessonId: 'l_1' };
            // Now "click" on another card to pick it up
            if(window.CanvasGeometry && window.CanvasGeometry.onMouseDown) {
                window.CanvasGeometry.onMouseDown({ clientX: 100, clientY: 100, preventDefault: ()=>{} });
            }
        }
        """)
        
        # Capture evidence
        capture_screenshot("/Users/abhishekchhetri/Developer/chronexa_web/bug_repro_2.png", full=True)
        print("Screenshot saved to bug_repro_2.png")
        
    except Exception as e:
        print("ERROR:", e)
        traceback.print_exc()

main()
