"""
Synthetic Prescription Generator
Generates synthetic handwritten prescription images for TrOCR training.
Uses TRDG (Text Recognition Data Generator) or falls back to PIL-based generation.
"""
import os
import random
import json
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from PIL import Image, ImageDraw, ImageFont

# Medicine database from BD Prescription Dataset
BD_MEDICINES = [
    "Beklo", "Maxima", "Leptic", "Esoral", "Omastin", "Esonix", "Canazole", "Fixal",
    "Progut", "Diflu", "Montair", "Flexilax", "Maxpro", "Vifas", "Conaz", "Fexofast",
    "Fenadin", "Telfast", "Dinafex", "Ritch", "Renova", "Flugal", "Axodin", "Sergel",
    "Nexum", "Opton", "Nexcap", "Fexo", "Montex", "Exium", "Lumona", "Napa",
    "Azithrocin", "Atrizin", "Monas", "Nidazyl", "Metsina", "Baclon", "Rozith",
    "Bicozin", "Ace", "Amodis", "Alatrol", "Napa Extend", "Rivotril", "Montene",
    "Filmet", "Aceta", "Tamen", "Bacmax", "Disopan", "Rhinil", "Flamyd", "Metro",
    "Zithrin", "Candinil", "Lucan-R", "Backtone", "Bacaid", "Etizin", "Az",
    "Romycin", "Azyth", "Cetisoft", "Dancel", "Tridosil", "Nizoder", "Ketoral",
    "Ketocon", "Ketotab", "Ketozol", "Denixil", "Provair", "Odmon", "Baclofen",
    "MKast", "Trilock", "Flexibac",
]

DOSAGES = ["5mg", "10mg", "20mg", "25mg", "50mg", "100mg", "200mg", "250mg", "400mg", "500mg", "1g"]
FREQUENCIES = ["OD", "BD", "TDS", "QID", "1-0-1", "1-1-1", "0-0-1", "1-0-0", "SOS", "HS"]
DURATIONS = ["3 days", "5 days", "7 days", "10 days", "14 days", "1 month", "2 weeks"]
INSTRUCTIONS = ["After meal", "Before meal", "With water", "Empty stomach", "At bedtime",
                 "With food", "As directed"]


def generate_prescription_text(rng: random.Random, num_medicines: int = None) -> Tuple[str, List[Dict]]:
    """Generate realistic prescription text with structured metadata."""
    if num_medicines is None:
        num_medicines = rng.randint(2, 5)

    medicines = []
    lines = []

    for med_name in rng.sample(BD_MEDICINES, min(num_medicines, len(BD_MEDICINES))):
        dosage = rng.choice(DOSAGES)
        freq = rng.choice(FREQUENCIES)
        duration = rng.choice(DURATIONS)
        instruction = rng.choice(INSTRUCTIONS)

        # Vary the format to simulate real handwriting variability
        fmt = rng.choice([
            f"{med_name} {dosage} {freq} x {duration}",
            f"{med_name} ({dosage}) - {freq}",
            f"{med_name} {dosage}\n  {freq} - {duration} - {instruction}",
            f"Tab. {med_name} {dosage} {freq}",
            f"{med_name} {dosage} {freq} ({instruction})",
        ])
        lines.append(fmt)
        medicines.append({
            "name": med_name,
            "dosage": dosage,
            "frequency": freq,
            "duration": duration,
            "instructions": instruction,
        })

    return "\n".join(lines), medicines


def add_handwriting_noise(image: Image.Image, rng: random.Random) -> Image.Image:
    """Add realistic noise to simulate handwriting variability."""
    import numpy as np

    arr = np.array(image)

    # Add slight Gaussian noise
    noise = rng.gauss(0, 3)
    arr = np.clip(arr.astype(float) + noise, 0, 255).astype(np.uint8)

    # Random slight rotation (-3 to +3 degrees)
    angle = rng.uniform(-3, 3)
    image = Image.fromarray(arr)
    image = image.rotate(angle, fillcolor=(255, 255, 255), expand=False)

    return image


def generate_pil_prescription(
    text: str,
    width: int = 800,
    font_size: int = 24,
    rng: random.Random = None,
) -> Image.Image:
    """
    Generate a synthetic prescription image using PIL.
    Fallback when TRDG is not available.
    """
    if rng is None:
        rng = random.Random()

    # Create white background with slight off-white variation
    bg_shade = rng.randint(240, 255)
    lines = text.split("\n")
    line_height = font_size + rng.randint(8, 16)
    height = max(200, len(lines) * line_height + 80)

    image = Image.new("RGB", (width, height), (bg_shade, bg_shade, bg_shade))
    draw = ImageDraw.Draw(image)

    # Try to load a font, fall back to default
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    # Draw text with slight position variation per line (simulating handwriting)
    y = 30 + rng.randint(0, 10)
    for line in lines:
        x = 30 + rng.randint(-5, 5)
        # Slightly vary ink color
        ink = rng.randint(0, 40)
        draw.text((x, y), line, fill=(ink, ink, ink + rng.randint(0, 20)), font=font)
        y += line_height + rng.randint(-2, 4)

    # Add handwriting noise
    image = add_handwriting_noise(image, rng)

    return image


def generate_dataset(
    output_dir: str,
    num_samples: int = 100,
    seed: int = 42,
    format: str = "png",
) -> None:
    """
    Generate a dataset of synthetic prescription images with labels.

    Args:
        output_dir: Directory to save generated images and labels.
        num_samples: Number of prescription images to generate.
        seed: Random seed for reproducibility.
        format: Image format (png, jpg).
    """
    rng = random.Random(seed)
    output_path = Path(output_dir)
    images_dir = output_path / "images"
    labels_dir = output_path / "labels"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    manifest = []

    for i in range(num_samples):
        # Generate text and metadata
        text, medicines = generate_prescription_text(rng)

        # Generate image
        font_size = rng.randint(18, 32)
        width = rng.choice([600, 700, 800, 900])
        image = generate_pil_prescription(text, width=width, font_size=font_size, rng=rng)

        # Save image
        img_filename = f"prescription_{i:05d}.{format}"
        image.save(images_dir / img_filename)

        # Save label
        label = {
            "image": img_filename,
            "text": text,
            "medicines": medicines,
            "font_size": font_size,
            "width": width,
        }
        label_filename = f"prescription_{i:05d}.json"
        with open(labels_dir / label_filename, "w") as f:
            json.dump(label, f, indent=2)

        manifest.append({"image": img_filename, "label": label_filename, "text": text})

        if (i + 1) % 50 == 0:
            print(f"Generated {i + 1}/{num_samples} prescriptions")

    # Save manifest
    with open(output_path / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDataset generated: {num_samples} images in {output_dir}")
    print(f"  Images: {images_dir}")
    print(f"  Labels: {labels_dir}")
    print(f"  Manifest: {output_path / 'manifest.json'}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate synthetic prescription images")
    parser.add_argument("--output", "-o", default="./data/synthetic", help="Output directory")
    parser.add_argument("--num", "-n", type=int, default=100, help="Number of samples")
    parser.add_argument("--seed", "-s", type=int, default=42, help="Random seed")
    parser.add_argument("--format", "-f", choices=["png", "jpg"], default="png", help="Image format")
    args = parser.parse_args()

    generate_dataset(args.output, args.num, args.seed, args.format)
