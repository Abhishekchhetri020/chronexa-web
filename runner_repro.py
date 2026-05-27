import subprocess
script = open('/Users/abhishekchhetri/Developer/chronexa_web/test_repro.py').read()
subprocess.run(['browser-harness', '-c', script])
