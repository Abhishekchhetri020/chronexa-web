import subprocess
script = open('/Users/abhishekchhetri/Developer/chronexa_web/check_logs.py').read()
subprocess.run(['browser-harness', '-c', script])
