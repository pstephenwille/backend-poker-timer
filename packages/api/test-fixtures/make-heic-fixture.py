"""Builds test-fixtures/landscape.heic: a 2400x1800 HEVC still in a minimal HEIF container.

ffmpeg can encode HEVC but has no HEIF muxer, so this script takes x265's Annex B
output and wraps it in the boxes libheif needs: ftyp, meta (hdlr, pitm, iinf,
iloc, iprp with hvcC and ispe) and mdat. Requires ffmpeg with libx265.

Run from packages/api:  python3 test-fixtures/make-heic-fixture.py
"""

import struct
import subprocess
import tempfile
from pathlib import Path

WIDTH = 2400
HEIGHT = 1800
OUTPUT = Path(__file__).parent / "landscape.heic"

NAL_VPS = 32
NAL_SPS = 33
NAL_PPS = 34
PARAMETER_SET_TYPES = (NAL_VPS, NAL_SPS, NAL_PPS)
NAL_LENGTH_SIZE = 4
MAIN_PROFILE = 1
MAIN_PROFILE_COMPATIBILITY = 0x60000000
LEVEL_5_1 = 153
CHROMA_420 = 1
ITEM_ID = 1


def box(box_type: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + box_type + payload


def full_box(box_type: bytes, version: int, flags: int, payload: bytes) -> bytes:
    return box(box_type, struct.pack(">I", (version << 24) | flags) + payload)


def encode_hevc() -> bytes:
    with tempfile.TemporaryDirectory() as directory:
        stream = Path(directory) / "still.hevc"
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", f"testsrc2=size={WIDTH}x{HEIGHT}",
                "-frames:v", "1", "-c:v", "libx265", "-pix_fmt", "yuv420p",
                "-x265-params", "log-level=error:keyint=1:crf=35",
                "-f", "hevc", str(stream),
            ],
            check=True,
        )
        return stream.read_bytes()


def split_annex_b(stream: bytes) -> list[bytes]:
    units = []
    for chunk in stream.split(b"\x00\x00\x01"):
        unit = chunk.rstrip(b"\x00")
        if unit:
            units.append(unit)
    return units


def nal_type(unit: bytes) -> int:
    return (unit[0] >> 1) & 0x3F


def hvcc(parameter_sets: dict[int, bytes]) -> bytes:
    header = struct.pack(
        ">BBI6sBHBBBBHB",
        1,
        MAIN_PROFILE,
        MAIN_PROFILE_COMPATIBILITY,
        b"\x90\x00\x00\x00\x00\x00",
        LEVEL_5_1,
        0xF000,
        0xFC,
        0xFC | CHROMA_420,
        0xF8,
        0xF8,
        0,
        0x0F | (NAL_LENGTH_SIZE - 1),
    )
    arrays = b""
    for unit_type in PARAMETER_SET_TYPES:
        unit = parameter_sets[unit_type]
        arrays += struct.pack(">BHH", 0x80 | unit_type, 1, len(unit)) + unit
    return box(b"hvcC", header + struct.pack(">B", len(PARAMETER_SET_TYPES)) + arrays)


def heif(units: list[bytes]) -> bytes:
    parameter_sets = {nal_type(u): u for u in units if nal_type(u) in PARAMETER_SET_TYPES}
    image_data = b"".join(
        struct.pack(">I", len(u)) + u for u in units if nal_type(u) not in PARAMETER_SET_TYPES and nal_type(u) < NAL_VPS
    )

    ftyp = box(b"ftyp", b"heic" + struct.pack(">I", 0) + b"mif1heic")
    hdlr = full_box(b"hdlr", 0, 0, struct.pack(">I", 0) + b"pict" + b"\x00" * 12 + b"\x00")
    pitm = full_box(b"pitm", 0, 0, struct.pack(">H", ITEM_ID))
    infe = full_box(b"infe", 2, 0, struct.pack(">HH", ITEM_ID, 0) + b"hvc1" + b"\x00")
    iinf = full_box(b"iinf", 0, 0, struct.pack(">H", 1) + infe)
    ispe = full_box(b"ispe", 0, 0, struct.pack(">II", WIDTH, HEIGHT))
    ipco = box(b"ipco", hvcc(parameter_sets) + ispe)
    ipma = full_box(b"ipma", 0, 0, struct.pack(">IHBBB", 1, ITEM_ID, 2, 0x81, 0x02))
    iprp = box(b"iprp", ipco + ipma)

    def meta_with(offset: int) -> bytes:
        iloc = full_box(
            b"iloc", 0, 0,
            struct.pack(">BBH", 0x44, 0x00, 1)
            + struct.pack(">HHH", ITEM_ID, 0, 1)
            + struct.pack(">II", offset, len(image_data)),
        )
        return full_box(b"meta", 0, 0, hdlr + pitm + iinf + iloc + iprp)

    placeholder = meta_with(0)
    data_offset = len(ftyp) + len(placeholder) + 8
    return ftyp + meta_with(data_offset) + box(b"mdat", image_data)


if __name__ == "__main__":
    OUTPUT.write_bytes(heif(split_annex_b(encode_hevc())))
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
