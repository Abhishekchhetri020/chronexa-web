import time
import json
import traceback

def main():
    try:
        new_tab("http://localhost:8000/")
        wait_for_load()
        time.sleep(2) # Give it a moment to initialize the SPA
        
        # Get the text of the page to see what buttons are there
        text = js("document.body.innerText")
        html = js("document.body.innerHTML")
        print("--- PAGE TEXT ---")
        print(text[:1000])
        
        # Try to find the wizard or add buttons
        buttons = js("Array.from(document.querySelectorAll('button')).map(b => b.innerText).join(', ')")
        print("--- BUTTONS ---")
        print(buttons)
        
    except Exception as e:
        print("ERROR:", e)
        traceback.print_exc()

main()
