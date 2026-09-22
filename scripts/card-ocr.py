#!/usr/bin/env python3
"""card-ocr: read the lettering on a rendered card with RapidOCR (PaddleOCR v4 models on ONNX).

The second, independent reader behind CaptainComfy's lettering gate. macOS Vision reads a fat
rounded D as an O now and then; on the same cards this recogniser got every letter right (14 cards,
43 phrases, 2026-09-22). It has no language model, so it never "corrects" a real misspelling either.

    card-ocr IMAGE.png                 a file on this machine
    card-ocr --url http://127.0.0.1:8188/view?filename=...   fetch a ComfyUI result first

Prints the same JSON as tools/ocr.swift in Card-Generator: {"width", "height", "lines": [{"text",
"confidence", "x", "y", "w", "h"}]} with boxes as fractions of the image, origin top-left, sorted
top to bottom. Installed by scripts/card-ocr-install.sh into ~/.local/card-ocr (its own venv).
"""
import json
import os
import sys
import tempfile
import urllib.request


def fetch(url):
    fd, path = tempfile.mkstemp(suffix=".png", prefix="card-ocr-")
    os.close(fd)
    with urllib.request.urlopen(url, timeout=60) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def main():
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--url":
        path, temp = fetch(args[1]), True
    elif len(args) == 1 and args[0] != "--url":
        path, temp = args[0], False
    else:
        sys.stderr.write("usage: card-ocr IMAGE | card-ocr --url VIEW_URL\n")
        sys.exit(2)
    try:
        import cv2
        from rapidocr_onnxruntime import RapidOCR
        image = cv2.imread(path)
        if image is None:
            sys.stderr.write("cannot read image: %s\n" % path)
            sys.exit(1)
        height, width = image.shape[:2]
        result, _ = RapidOCR()(image)
        lines = []
        for box, text, score in (result or []):
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            lines.append({"text": text, "confidence": float(score),
                          "x": min(xs) / width, "y": min(ys) / height,
                          "w": (max(xs) - min(xs)) / width, "h": (max(ys) - min(ys)) / height})
        # Reading order: rows (boxes whose vertical centres nearly coincide) top to bottom, then
        # left to right within a row, so a title split into two boxes keeps its word order.
        lines.sort(key=lambda l: l["y"] + l["h"] / 2.0)
        rows, row = [], []
        for line in lines:
            if row and abs((line["y"] + line["h"] / 2.0) - (row[-1]["y"] + row[-1]["h"] / 2.0)) > 0.6 * min(line["h"], row[-1]["h"]):
                rows.append(row)
                row = []
            row.append(line)
        if row:
            rows.append(row)
        lines = [l for r in rows for l in sorted(r, key=lambda l: l["x"])]
        print(json.dumps({"width": width, "height": height, "lines": lines}, ensure_ascii=False))
    finally:
        if temp:
            try:
                os.remove(path)
            except OSError:
                pass


if __name__ == "__main__":
    main()
