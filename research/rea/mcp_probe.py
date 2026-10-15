#!/usr/bin/env python3
"""Read-only REA stdio inspection of the selected, already-downloaded IPA."""
import subprocess,json,pathlib
root=pathlib.Path(__file__).parent
p=subprocess.Popen(['/home/debian/.local/node-v22.20.0-linux-x64/bin/rea','--mcp'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=open(root/'mcp-stderr.log','w'),text=True)
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
 print(name, 'error' if 'error' in d else 'ok')
try:
 save('mcp-initialize',request('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'twitter-reconstruction-research','version':'1'}}))
 p.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n');p.stdin.flush()
 catalog=request('tools/list',{});save('mcp-tools',catalog)
 tools={t['name']:t for t in catalog['result']['tools']}
 for name in ['binary_session','open_binary','inspect_artifact','close_binary']:
  print(name,json.dumps(tools[name]['inputSchema']))
 save('mcp-session-before',request('tools/call',{'name':'binary_session','arguments':{}}))
 save('mcp-open-ipa',request('tools/call',{'name':'open_binary','arguments':{'path':'/home/debian/twitter/research/original-app/Twitter-3.1.1.ipa'}}))
 save('mcp-session-ipa',request('tools/call',{'name':'binary_session','arguments':{}}))
 save('mcp-inspect-ipa',request('tools/call',{'name':'inspect_artifact','arguments':{}}))
 save('mcp-close-ipa',request('tools/call',{'name':'close_binary','arguments':{}}))
finally:
 p.stdin.close();p.terminate();p.wait(timeout=5)
