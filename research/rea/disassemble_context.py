"""Bounded custom Capstone observation from preserved metadata; not REA Evidence."""
import json,struct,pathlib,capstone
root=pathlib.Path(__file__).parent
x=json.loads((root/'macho-static-3.1.1.json').read_text());s=x['slices'][0];b=pathlib.Path(x['source']).read_bytes()
def off(v):return next(q['file_offset']+v-q['vm_address'] for q in s['sections'] if q['vm_address']<=v<q['vm_address']+q['size'])
syms={};q=next(q for q in s['sections'] if q['name']=='__objc_selrefs')
for i in range(0,q['size'],4):
 p=struct.unpack_from('<I',b,q['file_offset']+i)[0];j=off(p);syms[q['vm_address']+i]=b[j:b.find(b'\0',j)].decode(errors='replace')
for c in s['classes']:
 for iv in c['ivars']:syms[iv['offset_pointer_vm_address']]=c['name']+'::'+iv['name']
q=next(q for q in s['sections'] if q['name']=='__cfstring')
for i in range(0,q['size'],16):
 _,flags,p,n=struct.unpack_from('<4I',b,q['file_offset']+i)
 try:syms[q['vm_address']+i]='CFString:'+b[off(p):off(p)+n].decode(errors='replace')
 except StopIteration:pass
q=next(q for q in s['load_commands'] if q['command']=='0x2')
_,_,so,n,st,sz=struct.unpack_from('<6I',b,q['file_offset'])
for i in range(n):
 k,t,se,de,v=struct.unpack_from('<IBBHI',b,so+i*12)
 if v:syms.setdefault(v,b[st+k:b.find(b'\0',st+k)].decode(errors='replace'))
starts=sorted(set(m['implementation_vm_address']&~1 for c in s['classes']+s['categories'] for m in c['methods']+c['class_methods']))
cs=capstone.Cs(capstone.CS_ARCH_ARM,capstone.CS_MODE_THUMB);cs.detail=True
out=['Custom Capstone static disassembly, not REA Evidence.','Source SHA256 '+x['sha256'],'Bounded at next known Objective-C IMP; may include literal pools.']
for addr in [0xa0370,0x9d5e8,0x9ec20,0xbe38,0x9d9ac,0x9aedc,0x8209c,0x84ab4,0x8c6bc,0xa1524,0xa0208,0x9e210,0xa0440]:
 end=next(a for a in starts if a>addr);out.append('\nMethod '+hex(addr))
 for ins in cs.disasm(b[off(addr):off(addr)+end-addr],addr):
  note=''
  if ins.mnemonic=='ldr' and len(ins.operands)>1 and ins.operands[1].type==capstone.arm.ARM_OP_MEM and ins.operands[1].mem.base==capstone.arm.ARM_REG_PC:
   p=((ins.address+4)&~3)+ins.operands[1].mem.disp;v=struct.unpack_from('<I',b,off(p))[0];note=' ; literal '+hex(p)+' = '+hex(v)+' '+syms.get(v,'')
  out.append(f'{ins.address:#x} {ins.mnemonic} {ins.op_str}{note}')
(root/'native-context-width-disassembly.txt').write_text('\n'.join(out)+'\n')
