"""
S0 — Ingest & normalise.  (docs/ARCHITECTURE_V2.md §5/S0)

Prepares a user-uploaded photo for the VLM. That is all it does.

CRITICAL RULE: do not binarise, do not threshold, do not morph.

`ml_pipeline/preprocessing/` (deskew, denoise, binarise) was built for TrOCR and
it actively DESTROYS VLM input quality — VLMs are trained on natural photographs
and use stroke gradient, ink density and colour to disambiguate overlapping
characters. A 1-bit image throws all of that away. With TrOCR cut from the
serving path (§3.3) that package has no remaining consumer. Do not import it here.

Why the resize matters: one eval image is 2400x3600 = 11,520 image tokens raw
versus 2,185 resized. That single page cost more than the other four combined.
The resize is worth ~21% of the API bill (§6.5).
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Union

from PIL import Image, ImageOps

# Claude bills images at roughly (width * height) / 750 tokens.
TOKENS_PER_PIXEL_DIVISOR = 750

# Longest edge, in pixels. Below ~1000 handwriting legibility starts to suffer;
# above ~1568 we pay for resolution the model does not use. Tunable on the dev
# split — this is a real accuracy/cost dial.
MAX_EDGE = 1568

# JPEG quality for the bytes we send. 92 is visually lossless for handwriting
# and roughly halves the payload versus 100.
JPEG_QUALITY = 92

# Applied only when the image is genuinely flat (see _needs_contrast_help).
AUTOCONTRAST_CUTOFF_PCT = 1


@dataclass(frozen=True)
class NormalisedImage:
    """A page ready for S1, plus everything the cache and spend guard need."""

    image: Image.Image
    jpeg_bytes: bytes
    sha256: str
    width: int
    height: int
    original_width: int
    original_height: int
    autocontrast_applied: bool

    @property
    def estimated_image_tokens(self) -> int:
        return round(self.width * self.height / TOKENS_PER_PIXEL_DIVISOR)

    @property
    def original_estimated_image_tokens(self) -> int:
        return round(
            self.original_width * self.original_height / TOKENS_PER_PIXEL_DIVISOR
        )

    def __repr__(self) -> str:  # keeps log lines readable
        return (
            f"NormalisedImage({self.original_width}x{self.original_height}"
            f" -> {self.width}x{self.height}, "
            f"{self.original_estimated_image_tokens}->{self.estimated_image_tokens} tok, "
            f"sha={self.sha256[:8]})"
        )


def _needs_contrast_help(img: Image.Image) -> bool:
    """True only when the photo is genuinely flat.

    Autocontrast on an already-well-exposed page is a mild negative (it can clip
    faint pen strokes), so this is deliberately conservative: we act only when
    the luminance range is compressed into less than half the available scale.
    """
    lo, hi = img.convert("L").getextrema()
    return (hi - lo) < 128


def normalise(source: Union[str, Path, bytes, Image.Image]) -> NormalisedImage:
    """Ingest a page from a path, raw bytes, or a PIL image.

    Steps, in order:
      1. EXIF transpose  — phone photos are frequently rotated in metadata only
      2. Convert to RGB  — drops alpha, normalises palette/greyscale inputs
      3. Autocontrast    — only if the image is genuinely flat
      4. Downscale       — longest edge to MAX_EDGE, aspect preserved
      5. Encode JPEG     — these are the exact bytes sent to the API

    The returned sha256 is of the FINAL jpeg bytes, not the source file. That
    makes the response cache self-invalidating: any change to this function
    changes the bytes, changes the hash, and misses the cache — which is the
    behaviour we want.
    """
    if isinstance(source, Image.Image):
        img = source
    elif isinstance(source, bytes):
        img = Image.open(io.BytesIO(source))
    else:
        img = Image.open(Path(source))

    # 1. EXIF orientation. Must happen before we read .size for the resize.
    img = ImageOps.exif_transpose(img)

    original_width, original_height = img.size

    # 2. RGB. VLMs want a natural 3-channel image.
    img = img.convert("RGB")

    # 3. Conservative exposure fix.
    autocontrast_applied = _needs_contrast_help(img)
    if autocontrast_applied:
        img = ImageOps.autocontrast(img, cutoff=AUTOCONTRAST_CUTOFF_PCT)

    # 4. Downscale only. Never upscale a small image — it adds tokens and no
    #    information, and the model handles small inputs fine.
    longest = max(img.size)
    if longest > MAX_EDGE:
        scale = MAX_EDGE / longest
        img = img.resize(
            (max(1, int(img.width * scale)), max(1, int(img.height * scale))),
            Image.LANCZOS,
        )

    # 5. Encode once; reuse for both the hash and the API call.
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY)
    jpeg_bytes = buf.getvalue()

    return NormalisedImage(
        image=img,
        jpeg_bytes=jpeg_bytes,
        sha256=hashlib.sha256(jpeg_bytes).hexdigest(),
        width=img.width,
        height=img.height,
        original_width=original_width,
        original_height=original_height,
        autocontrast_applied=autocontrast_applied,
    )


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("usage: python -m ingest.normalise <image> [<image> ...]")
        raise SystemExit(1)

    total_before = total_after = 0
    for path in sys.argv[1:]:
        n = normalise(path)
        total_before += n.original_estimated_image_tokens
        total_after += n.estimated_image_tokens
        flag = "  (autocontrast)" if n.autocontrast_applied else ""
        print(f"{Path(path).name:12} {n!r}{flag}")

    if len(sys.argv) > 2:
        saved = total_before - total_after
        pct = 100 * saved / total_before if total_before else 0
        print(f"\ntotal image tokens {total_before} -> {total_after} "
              f"({saved} saved, {pct:.0f}%)")
