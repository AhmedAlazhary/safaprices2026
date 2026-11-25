"""Compose the untouched SAFATRANS logo onto a supplied truck photo.

The scene path is supplied by the operator; logo.png is only read, never rewritten.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance, ImageFilter


def solve_linear(matrix: list[list[float]], values: list[float]) -> list[float]:
    size = len(values)
    augmented = [row[:] + [values[index]] for index, row in enumerate(matrix)]
    for pivot in range(size):
        best = max(range(pivot, size), key=lambda row: abs(augmented[row][pivot]))
        augmented[pivot], augmented[best] = augmented[best], augmented[pivot]
        divisor = augmented[pivot][pivot]
        if abs(divisor) < 1e-12:
            raise ValueError("Logo placement points are degenerate")
        augmented[pivot] = [value / divisor for value in augmented[pivot]]
        for row in range(size):
            if row == pivot:
                continue
            factor = augmented[row][pivot]
            augmented[row] = [a - factor * b for a, b in zip(augmented[row], augmented[pivot])]
    return [augmented[index][-1] for index in range(size)]


def perspective_coefficients(points: list[tuple[float, float]], width: int, height: int) -> tuple[float, ...]:
    # Pillow's PERSPECTIVE transform maps each output point back to source coordinates.
    source = [(0, 0), (width, 0), (width, height), (0, height)]
    rows: list[list[float]] = []
    values: list[float] = []
    for (x, y), (u, v) in zip(points, source):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.append(u)
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y]); values.append(v)
    return tuple(solve_linear(rows, values))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", required=True, type=Path)
    parser.add_argument("--logo", type=Path, default=Path("logo.png"))
    parser.add_argument("--output", type=Path, default=Path("pictures/safatrans-hero.webp"))
    args = parser.parse_args()

    scene = Image.open(args.scene).convert("RGB")
    logo = Image.open(args.logo).convert("RGBA")
    alpha = logo.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError("The original logo contains no visible pixels")
    logo = logo.crop(bounds)

    # Perspective decal aligned to the visible side of the trailer in the supplied scene.
    corners = [(660, 486), (884, 414), (884, 480), (660, 552)]
    width, height = 800, 260
    decal = logo.resize((width, height), Image.Resampling.LANCZOS)
    coefficients = perspective_coefficients(corners, width, height)
    warped = decal.transform(scene.size, Image.Transform.PERSPECTIVE, coefficients,
                             Image.Resampling.BICUBIC)

    # A faint soft shadow gives the original mark a printed-decal edge without redrawing it.
    shadow_alpha = warped.getchannel("A").filter(ImageFilter.GaussianBlur(2.2))
    shadow_alpha = ImageEnhance.Brightness(shadow_alpha).enhance(0.22)
    shadow = Image.new("RGBA", scene.size, (18, 28, 38, 0))
    shadow.putalpha(shadow_alpha)
    shifted_shadow = Image.new("RGBA", scene.size, (0, 0, 0, 0))
    shifted_shadow.alpha_composite(shadow, (2, 2))

    result = scene.convert("RGBA")
    result = Image.alpha_composite(result, shifted_shadow)
    result = Image.alpha_composite(result, warped)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.convert("RGB").save(args.output, "WEBP", quality=88, method=6)
    print(f"Created {args.output} ({scene.width}x{scene.height}); original logo unchanged")


if __name__ == "__main__":
    main()
