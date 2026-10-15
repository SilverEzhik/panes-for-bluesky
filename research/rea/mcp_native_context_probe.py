#!/usr/bin/env python3
"""Open the real native target once, collect focused REA/Ghidra evidence, close."""
import subprocess,json,pathlib,os
root=pathlib.Path(__file__).parent
env=dict(os.environ,GHIDRA_INSTALL_DIR='/home/debian/.local/share/rea-tools/ghidra_12.1.4_PUBLIC',JAVA_HOME='/home/debian/.local/share/rea-tools/jdk-21.0.12.1+1',REA_GHIDRA_STARTUP_TIMEOUT_MS='600000',REA_GHIDRA_DISABLED_ANALYZERS='Non-Returning Functions - Discovered')
p=subprocess.Popen(['/home/debian/.local/node-v22.20.0-linux-x64/bin/rea','--mcp'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=open(root/'mcp-native-context-stderr.log','w'),text=True)
n=0

def request(method,params):
 global n
 n+=1
 p.stdin.write(json.dumps({'jsonrpc':'2.0','id':n,'method':method,'params':params})+'\n');p.stdin.flush()
 while True:
  line=p.stdout.readline()
  if not line: raise RuntimeError('MCP closed')
  d=json.loads(line)
  if d.get('id')==n:return d

def save(name,d):
 (root/(name+'.json')).write_text(json.dumps(d,indent=2))
 print(name, 'error' if 'error' in d else 'ok',flush=True)

def call(name,args,out):
 save(out,request('tools/call',{'name':name,'arguments':args}))
try:
 save('mcp-native-context-initialize',request('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'twitter-native-research','version':'1'}}))
 p.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n');p.stdin.flush()
 call('open_binary',{'path':'/home/debian/twitter/research/original-app/Twitter-3.1.1/Payload/Twitter.app/Twitter','provider_id':'ghidra'},'mcp-native-context-open')
 call('binary_session',{},'mcp-native-context-session')
 for name,address in [('needs-wide', '0xa0370'), ('link-needs-wide', '0x9d5e8'), ('autoselect', '0x9ec20'), ('select-link', '0xa0208'), ('go-selected', '0xa0440'), ('set-subcontroller', '0x9e210'), ('push-controller', '0x9aedc'), ('sidebar-set-root', '0x8209c'), ('sidebar-select-item', '0x81fa8'), ('status-cell-init', '0xa143c'), ('status-cell-initialize', '0xa1524'), ('tweet-renderer', '0x9fcb4')]:
  call('procedure_pseudo_code',{'procedure':address},'mcp-native-context-'+name)
 call('close_binary',{},'mcp-native-context-close')
finally:
 p.stdin.close();p.terminate();p.wait(timeout=10)
