"""Exit 0 when the band of rows around y got darker ink between two screenshots.

Used by android.sh when the webview does not expose its text to the
accessibility tree: typing into the first row must put glyphs on it.
Pure standard library (PNG decode via zlib), so the runner needs nothing extra.
"""
import struct
import sys
import zlib


def load(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    at, idat, width, height, kind = 8, b"", 0, 0, 0
    while at < len(data):
        length, tag = struct.unpack(">I4s", data[at:at + 8])
        body = data[at + 8:at + 8 + length]
        if tag == b"IHDR":
            width, height, depth, kind = struct.unpack(">IIBB", body[:10])
        elif tag == b"IDAT":
            idat += body
        at += 12 + length
    channels = {2: 3, 6: 4}[kind]
    raw = zlib.decompress(idat)
    stride = width * channels
    rows, previous, at = [], bytearray(stride), 0
    for _ in range(height):
        kind_filter, line = raw[at], bytearray(raw[at + 1:at + 1 + stride])
        at += 1 + stride
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            corner = previous[i - channels] if i >= channels else 0
            if kind_filter == 1:
                line[i] = (line[i] + left) & 255
            elif kind_filter == 2:
                line[i] = (line[i] + up) & 255
            elif kind_filter == 3:
                line[i] = (line[i] + ((left + up) >> 1)) & 255
            elif kind_filter == 4:
                p = left + up - corner
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - corner)
                line[i] = (line[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else corner)) & 255
        rows.append(bytes(line))
        previous = line
    return width, height, channels, rows


def dark(image, top, bottom):
    width, height, channels, rows = image
    count = 0
    for y in range(max(0, top), min(height, bottom)):
        line = rows[y]
        for x in range(0, width * channels, channels):
            if line[x] + line[x + 1] + line[x + 2] < 3 * 110:
                count += 1
    return count


before, after, y = load(sys.argv[1]), load(sys.argv[2]), int(sys.argv[3])
band = max(12, before[1] // 40)
gain = dark(after, y - band, y + band) - dark(before, y - band, y + band)
print(f"ink gained on the row: {gain} px")
sys.exit(0 if gain > 30 else 1)
