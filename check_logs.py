import time
import json
def main():
    # Evaluate a script that checks for errors or console logs
    logs = js("""
        (window._test_logs || []).join('\\n')
    """)
    print("Logs:", logs)
main()
