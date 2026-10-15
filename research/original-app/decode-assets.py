#!/usr/bin/env python3
"""Decode Apple CgBI PNGs, preserving originals in the extracted IPA tree.
CgBI uses raw DEFLATE and premultiplied BGRA. The output is browser RGBA PNG.
"""
from pathlib import Path
import struct,zlib,json,hashlib
ROOT=Path(__file__).resolve().parent
SRC=ROOT/'Twitter-3.1.1/Payload/Twitter.app'
DST=ROOT.parent.parent/'public/assets/original'

def chunk(t,b):
    return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)

def paeth(a,b,c):
    p=a+b-c;pa,pb,pc=abs(p-a),abs(p-b),abs(p-c)
    return a if pa<=pb and pa<=pc else b if pb<=pc else c

def decode(data):
    pos=8;parts=[]
    while pos<len(data):
        n=struct.unpack('>I',data[pos:pos+4])[0];t=data[pos+4:pos+8];b=data[pos+8:pos+8+n];parts.append((t,b));pos+=12+n
    ihdr=next(b for t,b in parts if t==b'IHDR');w,h,depth,color,comp,filt,interlace=struct.unpack('>IIBBBBB',ihdr)
    if not any(t==b'CgBI' for t,b in parts):return data,w,h,False
    assert depth==8 and interlace==0 and color in (2,6),(w,h,depth,color,interlace)
    bpp=4 if color==6 else 3;stride=w*bpp
    raw=zlib.decompress(b''.join(b for t,b in parts if t==b'IDAT'),-15)
    rows=[];previous=bytearray(stride)
    for y in range(h):
        off=y*(stride+1);filtertype=raw[off];row=bytearray(raw[off+1:off+1+stride])
        for x in range(stride):
            a=row[x-bpp] if x>=bpp else 0;b=previous[x];c=previous[x-bpp] if x>=bpp else 0
            predictor=0 if filtertype==0 else a if filtertype==1 else b if filtertype==2 else (a+b)//2 if filtertype==3 else paeth(a,b,c)
            row[x]=(row[x]+predictor)&255
        previous=row[:]
        for x in range(0,stride,bpp):
            row[x],row[x+2]=row[x+2],row[x]
            if bpp==4:
                alpha=row[x+3]
                if alpha:
                    for c in range(3):row[x+c]=min(255,(row[x+c]*255+alpha//2)//alpha)
        rows.append(b'\0'+row)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',ihdr)+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b''),w,h,True

if __name__=='__main__':
    DST.mkdir(parents=True,exist_ok=True);manifest=[]
    for p in sorted(SRC.glob('*.png')):
        original=p.read_bytes();out,w,h,converted=decode(original);(DST/p.name).write_bytes(out)
        manifest.append(dict(file=p.name,width=w,height=h,decodedCgBI=converted,originalSha256=hashlib.sha256(original).hexdigest(),browserSha256=hashlib.sha256(out).hexdigest()))
    (ROOT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Decoded {len(manifest)} assets to {DST}')
