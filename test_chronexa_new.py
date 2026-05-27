import time
import traceback

def main():
    try:
        # Click "New Build fresh"
        js("""
        let newBtn = Array.from(document.querySelectorAll('.app-card')).find(c => c.innerText.includes('New\\nBuild fresh'));
        if(newBtn) { newBtn.click(); }
        else {
            let b = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('New'));
            if(b) b.click();
        }
        """)
        time.sleep(1)
        
        # Close the tour if it's there
        js("""
        let skip = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Skip tour'));
        if(skip) skip.click();
        """)
        time.sleep(1)
        
        # See what's on the screen now
        text = js("document.body.innerText")
        print("--- AFTER NEW ---")
        print(text[:1000])
        
    except Exception as e:
        print("ERROR:", e)
        traceback.print_exc()

main()
