
#!/usr/bin/env python3

"""
Genera códigos de desbloqueo (MVP) con checksum compatible con app.js.
Uso:
  python scripts/make_codes.py 50
"""
from __future__ import annotations
import sys, random, string

def checksum(prefix: str) -> str:
    h = 0
    for ch in prefix:
        h = (h*31 + ord(ch)) & 0xFFFFFFFF
    # base36 4 chars
    n = h % (36**4)
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    out = ""
    for _ in range(4):
        out = alphabet[n % 36] + out
        n //= 36
    return out

def rand4() -> str:
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return "".join(random.choice(alphabet) for _ in range(4))

def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    for _ in range(n):
        a, b = rand4(), rand4()
        prefix = f"IRAV-{a}-{b}"
        c = checksum(prefix)
        print(f"{prefix}-{c}")

if __name__ == "__main__":
    main()
