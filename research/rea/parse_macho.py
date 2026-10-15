#!/usr/bin/env python3
"""Read-only, bounded Mach-O/Objective-C 2 metadata evidence (32-bit ARM).

This is a custom parser, not REA output or runtime observation. Offsets in the
JSON refer to the complete input file, including a fat-slice offset if present.
"""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path


def parse(path):
    raw = path.read_bytes()
    slices = []
    if raw[:4] == b'\xca\xfe\xba\xbe':
        count, = struct.unpack_from('>I', raw, 4)
        for i in range(count):
            cpu, subtype, offset, size, align = struct.unpack_from('>5I', raw, 8 + i * 20)
            slices.append((offset, size, cpu, subtype))
        container = 'fat-big-endian'
    else:
        slices = [(0, len(raw), None, None)]
        container = 'thin'
    result = {'source': str(path.resolve()), 'sha256': hashlib.sha256(raw).hexdigest(),
              'size': len(raw), 'container': container, 'analysis': 'custom read-only static metadata parser',
              'limitations': ['No code executed.', 'Metadata names establish declarations, not runtime behavior.',
                              'Only little-endian 32-bit Mach-O Objective-C 2 metadata is parsed.',
                              'External class references may be zero before dyld binding.',
                              'No panel dimensions or gesture thresholds are inferred from names.'], 'slices': []}
    for base, size, _, _ in slices:
        b = raw[base:base + size]
        if b[:4] != b'\xce\xfa\xed\xfe':
            result['slices'].append({'file_offset': base, 'size': size, 'error': 'unsupported slice magic'})
            continue
        _, cpu, subtype, filetype, ncmds, sizeofcmds, flags = struct.unpack_from('<7I', b)
        item = {'file_offset': base, 'size': size, 'cpu_type': cpu, 'cpu_subtype': subtype,
                'filetype': filetype, 'flags': flags, 'load_commands': [], 'sections': [], 'encryption': [], 'classes': [], 'categories': []}
        segments = []
        cursor = 28
        for _ in range(ncmds):
            cmd, length = struct.unpack_from('<II', b, cursor)
            if length < 8 or cursor + length > 28 + sizeofcmds:
                raise ValueError('Invalid load command bounds')
            item['load_commands'].append({'command': hex(cmd), 'file_offset': base + cursor, 'size': length})
            if cmd == 1:
                _, _, name, va, vsize, off, fsize, maxprot, initprot, nsects, segflags = struct.unpack_from('<II16s8I', b, cursor)
                segments.append((va, vsize, off, fsize))
                for index in range(nsects):
                    values = struct.unpack_from('<16s16s9I', b, cursor + 56 + index * 68)
                    item['sections'].append({'name': values[0].rstrip(b'\0').decode(), 'segment': values[1].rstrip(b'\0').decode(),
                                             'vm_address': values[2], 'size': values[3], 'file_offset': base + values[4], 'flags': values[8]})
            elif cmd == 0x21:
                cryptoff, cryptsize, cryptid = struct.unpack_from('<3I', b, cursor + 8)
                item['encryption'].append({'command_file_offset': base + cursor, 'cryptoff': cryptoff,
                                           'absolute_cryptoff': base + cryptoff, 'cryptsize': cryptsize, 'cryptid': cryptid})
            cursor += length

        def offset(va, count=1):
            for start, span, off, fsize in segments:
                if start <= va and va + count <= start + fsize:
                    found = off + va - start
                    if found + count <= len(b):
                        return found
            raise ValueError(f'Unmapped VM address {va:#x}')

        def words(va, count):
            return struct.unpack_from('<' + 'I' * count, b, offset(va, count * 4))

        def cstring(va):
            off = offset(va)
            end = b.find(b'\0', off, min(off + 65536, len(b)))
            if end < 0:
                raise ValueError('Unterminated string')
            return b[off:end].decode('utf-8', errors='replace')

        def methods(va):
            if not va:
                return []
            entryflags, count = words(va, 2)
            entrysize = entryflags & 0xffff
            if entrysize != 12 or count > 10000:
                raise ValueError(f'Unsupported method list entry size {entrysize}, count {count}')
            found = []
            for i in range(count):
                record = va + 8 + i * entrysize
                name, types, imp = words(record, 3)
                found.append({'selector': cstring(name), 'type_encoding': cstring(types),
                              'record_file_offset': base + offset(record), 'selector_file_offset': base + offset(name),
                              'implementation_vm_address': imp, 'implementation_file_offset': base + offset(imp & ~1),
                              'thumb': bool(imp & 1)})
            return found

        def class_ro(va):
            return words(words(va, 5)[4] & ~3, 10)

        for section in item['sections']:
            if section['name'] != '__objc_classlist':
                continue
            for off in range(section['file_offset'] - base, section['file_offset'] - base + section['size'], 4):
                classva, = struct.unpack_from('<I', b, off)
                isa, superclass, cache, vtable, data = words(classva, 5)
                ro = class_ro(classva)
                record = {'name': cstring(ro[4]), 'class_vm_address': classva, 'class_file_offset': base + offset(classva),
                          'classlist_pointer_file_offset': base + off, 'ro_vm_address': data & ~3,
                          'instance_start': ro[1], 'instance_size': ro[2],
                          'methods': methods(ro[5]), 'class_methods': methods(class_ro(isa)[5]), 'ivars': []}
                if superclass:
                    record['superclass'] = cstring(class_ro(superclass)[4])
                if ro[7]:
                    entrysize, count = words(ro[7], 2)
                    if entrysize != 20 or count > 10000:
                        raise ValueError('Unsupported ivar list')
                    for i in range(count):
                        ivarva = ro[7] + 8 + i * entrysize
                        offsetptr, name, types, alignment, ivarsize = words(ivarva, 5)
                        record['ivars'].append({'name': cstring(name), 'type_encoding': cstring(types),
                                                'offset_pointer_vm_address': offsetptr,
                                                'offset_pointer_file_offset': base + offset(offsetptr),
                                                'instance_offset': words(offsetptr, 1)[0], 'size': ivarsize,
                                                'alignment_log2': alignment, 'record_file_offset': base + offset(ivarva)})
                item['classes'].append(record)
        for section in item['sections']:
            if section['name'] != '__objc_catlist':
                continue
            for off in range(section['file_offset'] - base, section['file_offset'] - base + section['size'], 4):
                categoryva, = struct.unpack_from('<I', b, off)
                name, cls, instance_methods, class_methods, protocols, props = words(categoryva, 6)
                item['categories'].append({'name': cstring(name), 'category_vm_address': categoryva,
                    'category_file_offset': base + offset(categoryva), 'class_vm_address': cls,
                    'class_name': cstring(class_ro(cls)[4]) if cls else None,
                    'methods': methods(instance_methods), 'class_methods': methods(class_methods)})
        result['slices'].append(item)
    return result


def panel_disassembly(evidence, output):
    """Optional Capstone detail; method ranges are deliberately only bounded."""
    import capstone
    raw = Path(evidence['source']).read_bytes()
    wanted = {
        'ABSwipeColumnScrollView': ['initWithFrame:', 'animate', '_endScroll:', '_animateToDestinationOffset', '_didScroll:', 'jiggle'],
        'ABSwipeColumnViewController': ['swipeView:willSwipeToOffset:throwing:', 'swipePointsForSwipeView:proposedOffset:',
            '_updateLayout:', 'loadView', 'bestOffsetForPossibleOffsets:fromOffset:toOffset:inDirection:',
            'nearestOffsetForPossibleOffsets:fromOffset:toOffset:'],
        'ABScrollGestureRecognizer': ['touchesMoved:withEvent:', 'touchesEnded:withEvent:', 'touchesBegan:withEvent:']}
    lines = [f'# Custom Capstone {capstone.__version__} disassembly; static only, not REA output.',
             '# Source SHA256: ' + evidence['sha256'],
             '# Range stops at next Objective-C method implementation known from metadata; literal pools can be decoded as instructions.',
             '# PC-relative literal annotations include the exact literal VM address, raw value and interpretation candidates.']
    for item in evidence['slices']:
        base = item['file_offset']
        b = raw[base:base + item['size']]
        classes = item['classes']
        addresses = sorted(set(m['implementation_vm_address'] & ~1 for c in classes + item['categories'] for m in c['methods'] + c['class_methods']))
        symbols = {}
        symtab = next(c for c in item['load_commands'] if c['command'] == '0x2')
        _, _, symoff, nsyms, stroff, strsize = struct.unpack_from('<6I', raw, symtab['file_offset'])
        for i in range(nsyms):
            st, typ, sect, desc, value = struct.unpack_from('<IBBHI', b, symoff + i * 12)
            name = b[stroff + st:b.find(b'\0', stroff + st)].decode(errors='replace')
            symbols.setdefault(value, name)
        dynamic = next(c for c in item['load_commands'] if c['command'] == '0xb')
        dy = struct.unpack_from('<20I', raw, dynamic['file_offset'])
        stubs = next(s for s in item['sections'] if s['name'] == '__symbol_stub4')
        for i in range(stubs['size'] // 12):
            ind, = struct.unpack_from('<I', b, dy[14] + i * 4)
            if ind < nsyms:
                st, = struct.unpack_from('<I', b, symoff + ind * 12)
                symbols[stubs['vm_address'] + i * 12] = b[stroff + st:b.find(b'\0', stroff + st)].decode(errors='replace')

        def off(va):
            s = next(s for s in item['sections'] if s['vm_address'] <= va < s['vm_address'] + s['size'])
            return s['file_offset'] - base + va - s['vm_address']

        refs = next(s for s in item['sections'] if s['name'] == '__objc_selrefs')
        for delta in range(0, refs['size'], 4):
            at = refs['file_offset'] - base + delta
            pointer, = struct.unpack_from('<I', b, at)
            position = off(pointer)
            symbols[refs['vm_address'] + delta] = 'selector-ref:' + b[position:b.find(b'\0', position)].decode(errors='replace')
        cfstrings = next(s for s in item['sections'] if s['name'] == '__cfstring')
        for delta in range(0, cfstrings['size'], 16):
            _, flags, pointer, length = struct.unpack_from('<4I', raw, cfstrings['file_offset'] + delta)
            try:
                position = off(pointer)
                symbols[cfstrings['vm_address'] + delta] = 'CFString:' + b[position:position + length].decode(errors='replace')
            except StopIteration:
                pass
        cs = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_THUMB)
        for c in classes + item['categories']:
            for m in c['methods']:
                if m['selector'] not in wanted.get(c['name'], []) and m['selector'] != 'ab_swipeColumnWidth:':
                    continue
                start = m['implementation_vm_address'] & ~1
                end = next(a for a in addresses if a > start)
                startoff = m['implementation_file_offset']
                lines.append(f"\n## -[{c['name']} {m['selector']}] VM {start:#x} file {startoff:#x} bounded end {end:#x}")
                for insn in cs.disasm(raw[startoff:startoff + end - start], start):
                    annotation = ''
                    match = re.search(r'\[pc(?:, #(0x[0-9a-f]+|[0-9]+))?\]', insn.op_str)
                    if insn.mnemonic == 'ldr' and match:
                        literal = ((insn.address + 4) & ~3) + (int(match[1], 0) if match[1] else 0)
                        try:
                            value, = struct.unpack_from('<I', b, off(literal))
                            annotation = f' ; literal@{literal:#x}={value:#x}'
                            if value in symbols:
                                annotation += ' ' + symbols[value]
                            else:
                                number, = struct.unpack('<f', struct.pack('<I', value))
                                if abs(number) > 1e-12 and abs(number) < 1e10:
                                    annotation += f' float32-candidate={number:g}'
                        except (StopIteration, struct.error):
                            annotation = ' ; literal outside mapped sections'
                    elif insn.mnemonic in ('bl', 'blx') and insn.op_str.startswith('#0x'):
                        annotation = ' ; ' + symbols.get(int(insn.op_str[1:], 16), 'unresolved target')
                    lines.append(f'{insn.address:#010x} {insn.bytes.hex():12s} {insn.mnemonic:8s} {insn.op_str}{annotation}')
    output.write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('binary', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--focus-output', type=Path)
    parser.add_argument('--disassembly-output', type=Path, help='Optional; requires the capstone Python package')
    args = parser.parse_args()
    evidence = parse(args.binary)
    args.output.write_text(json.dumps(evidence, indent=2) + '\n')
    if args.disassembly_output:
        panel_disassembly(evidence, args.disassembly_output)
    if args.focus_output:
        focused = {key: value for key, value in evidence.items() if key != 'slices'}
        focused['selection'] = 'Class names matching panel|stack|gesture|pinch|swipe|ipad|tablet|column|root|drag, case insensitive'
        focused['slices'] = [{**{key: value for key, value in item.items() if key not in ('classes', 'categories')},
                              'total_class_count': len(item.get('classes', [])),
                              'total_category_count': len(item.get('categories', [])),
                              'categories': [record for record in item.get('categories', []) if re.search(r'panel|stack|gesture|pinch|swipe|ipad|tablet|column|root|drag', record['name'], re.I)],
                              'classes': [record for record in item.get('classes', []) if re.search(r'panel|stack|gesture|pinch|swipe|ipad|tablet|column|root|drag', record['name'], re.I)]}
                             for item in evidence['slices']]
        args.focus_output.write_text(json.dumps(focused, indent=2) + '\n')
