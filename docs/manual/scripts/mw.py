#!/usr/bin/env python3
import sys, base64
mode, path = sys.argv[1], sys.argv[2]
data = sys.stdin.read()
content = base64.b64decode(data).decode("utf-8")
m = "a" if mode == "append" else "w"
with open(path, m, encoding="utf-8") as f:
    f.write(content)
print(f"{mode} {len(content)} bytes -> {path}")
