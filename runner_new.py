import subprocess
script = open('/Users/abhishekchhetri/Developer/chronexa_web/test_chronexa_new.py').read()
subprocess.run(['browser-harness', '-c', script])
