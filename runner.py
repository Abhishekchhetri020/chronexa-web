import subprocess
script = open('/Users/abhishekchhetri/Developer/chronexa_web/test_chronexa_load.py').read()
subprocess.run(['browser-harness', '-c', script])
