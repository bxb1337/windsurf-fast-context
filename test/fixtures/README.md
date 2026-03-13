This directory contains deterministic, non-secret binary fixtures used by tests.

Fixtures:

- connect/connect-msg-1.bin - Connect frame (1-byte flags + 4-byte BE length + payload). Flags=0 (uncompressed). Payload: b"CONNECT\x01hello".
- connect/connect-msg-2.bin - Connect frame (1-byte flags + 4-byte BE length + payload). Flags=0 (uncompressed). Payload: b"CONNECT\x02world".
 - connect/frame-simple.bin - Connect frame (1-byte flags + 4-byte BE length + payload). Flags=0 (uncompressed). Payload: b"CONNECT\x01hello".
 - connect/frame-gzip.bin - Connect frame (1-byte flags + 4-byte BE length + payload). Flags=1 (gzip-compressed). Payload: b"CONNECT\x02world" gzipped; length field contains compressed payload length.
 - connect/frame-multi.bin - Two concatenated Connect frames (frame-simple + frame-simple) with no separators; parsers should read frames sequentially.
- protobuf/msg-1.bin - synthetic protobuf-like message: field1 (varint=150), field2 (string="alpha").
- protobuf/msg-2.bin - synthetic protobuf-like message: field1 (varint=42), field2 (string="beta").
- auth/auth-1.bin - synthetic auth frame: 4-byte timestamp + b"user:alice".
- auth/auth-2.bin - synthetic auth frame: 4-byte timestamp + b"user:bob".
- extra.bin - small generic binary blob ("EXTRA\x00\x01\x02").

Generation method:

All fixtures were generated deterministically with a small Python script included in the task run. No secrets or real tokens are present. Details:

- connect/*.bin: Connect framing: 1-byte flags (0 = uncompressed), followed by 4-byte big-endian payload length, then the payload bytes. Example generation (Node):

  node -e "const fs=require('fs'); const payload=Buffer.from('CONNECT\\x01hello','binary'); const out=Buffer.alloc(1+4+payload.length); out.writeUInt8(0,0); out.writeUInt32BE(payload.length,1); payload.copy(out,5); fs.writeFileSync('test/fixtures/connect/connect-msg-1.bin', out);"
- protobuf/*.bin: simple hand-crafted varint encoding + length-delimited string to mimic protobuf wire format for tests.
- auth/*.bin: 4-byte big-endian timestamp followed by ascii "user:<name>" string.

These files are safe to check into repository and used by unit tests that parse frames, protobuf messages, and auth frames.
