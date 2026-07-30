from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from reportlab.graphics import renderPDF, renderPS
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from skimage.measure import approximate_polygon, find_contours
from skimage.morphology import remove_small_holes, remove_small_objects
from svglib.svglib import svg2rlg


KIT_ROOT = Path(__file__).resolve().parents[1]
SOURCE = KIT_ROOT / "00-source" / "zonzon-logo-selected-original.png"
TRANSPARENT_SOURCE = (
    KIT_ROOT
    / "00-source"
    / "zonzon-logo-selected-transparent.png"
)

NAVY = "#0C1A22"
BLUE = "#2E90FA"
GOLD = "#F5B700"
OFF_WHITE = "#F8FAFC"
WHITE = "#FFFFFF"


def ensure_dirs() -> dict[str, Path]:
    paths = {
        "master_raster": KIT_ROOT / "01-master" / "raster",
        "master_vector": KIT_ROOT / "01-master" / "vector",
        "variants": KIT_ROOT / "02-variants",
        "web_png": KIT_ROOT / "03-web" / "png",
        "web_webp": KIT_ROOT / "03-web" / "webp",
        "print": KIT_ROOT / "04-print",
        "android": KIT_ROOT / "05-apps" / "android",
        "ios": KIT_ROOT / "05-apps" / "ios",
        "pwa": KIT_ROOT / "05-apps" / "pwa",
        "social": KIT_ROOT / "06-social-media",
        "office": KIT_ROOT / "07-office-email",
        "preview": KIT_ROOT / "08-preview",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def alpha_bbox(image: Image.Image, threshold: int = 20) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("No visible pixels found")
    return bbox


def crop_with_padding(
    image: Image.Image,
    bbox: tuple[int, int, int, int],
    padding: int,
) -> Image.Image:
    left, top, right, bottom = bbox
    box = (
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    )
    return image.crop(box)


def recolor(image: Image.Image, color: str) -> Image.Image:
    alpha = image.getchannel("A")
    result = Image.new("RGBA", image.size, color)
    result.putalpha(alpha)
    return result


def normalize_logo_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = np.asarray(rgba.getchannel("A"), dtype=np.float32)
    normalized = np.where(
        alpha <= 18,
        0,
        np.where(alpha >= 72, 255, ((alpha - 18) / 54) * 255),
    )
    result = rgba.copy()
    result.putalpha(Image.fromarray(normalized.clip(0, 255).astype(np.uint8)))
    return result


def resize_width(image: Image.Image, width: int) -> Image.Image:
    height = max(1, round(image.height * width / image.width))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def fit_inside(
    image: Image.Image,
    size: tuple[int, int],
    fill_ratio: float,
) -> Image.Image:
    max_width = max(1, round(size[0] * fill_ratio))
    max_height = max(1, round(size[1] * fill_ratio))
    ratio = min(max_width / image.width, max_height / image.height)
    target = (
        max(1, round(image.width * ratio)),
        max(1, round(image.height * ratio)),
    )
    return image.resize(target, Image.Resampling.LANCZOS)


def center_on_canvas(
    image: Image.Image,
    size: tuple[int, int],
    background: str | None,
    fill_ratio: float = 0.78,
) -> Image.Image:
    fitted = fit_inside(image, size, fill_ratio)
    mode = "RGBA"
    canvas_color = (0, 0, 0, 0) if background is None else background
    output = Image.new(mode, size, canvas_color)
    position = ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2)
    output.alpha_composite(fitted, position)
    return output


def compose_horizontal(symbol: Image.Image, wordmark: Image.Image) -> Image.Image:
    symbol_height = 700
    word_height = 205
    symbol_resized = symbol.resize(
        (round(symbol.width * symbol_height / symbol.height), symbol_height),
        Image.Resampling.LANCZOS,
    )
    word_resized = wordmark.resize(
        (round(wordmark.width * word_height / wordmark.height), word_height),
        Image.Resampling.LANCZOS,
    )
    gap = 96
    width = symbol_resized.width + gap + word_resized.width
    height = max(symbol_resized.height, word_resized.height) + 80
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    output.alpha_composite(symbol_resized, (0, (height - symbol_resized.height) // 2))
    output.alpha_composite(
        word_resized,
        (symbol_resized.width + gap, (height - word_resized.height) // 2),
    )
    return output


def save_png(image: Image.Image, path: Path, dpi: int = 300) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True, dpi=(dpi, dpi))


def save_webp(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", lossless=True, quality=100, method=6)


def save_jpeg(image: Image.Image, path: Path, background: str = WHITE) -> None:
    flat = Image.new("RGB", image.size, background)
    if image.mode == "RGBA":
        flat.paste(image, mask=image.getchannel("A"))
    else:
        flat.paste(image)
    path.parent.mkdir(parents=True, exist_ok=True)
    flat.save(path, "JPEG", quality=95, optimize=True, progressive=True)


def trace_svg(png_path: Path, svg_path: Path) -> None:
    svg_path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(png_path).convert("RGBA")
    if image.width > 1200:
        image = resize_width(image, 1200)
    alpha = np.asarray(image.getchannel("A"))
    pixels = np.asarray(image)[:, :, :3].astype(np.int32)
    brand_colors = np.array(
        [
            [12, 26, 34],
            [46, 144, 250],
            [245, 183, 0],
        ],
        dtype=np.int32,
    )
    distances = ((pixels[:, :, None, :] - brand_colors[None, None, :, :]) ** 2).sum(axis=3)
    indices = distances.argmin(axis=2)
    paths: list[str] = []
    for index, color in enumerate(brand_colors):
        mask = (indices == index) & (alpha > 48)
        mask = remove_small_objects(mask, max_size=17)
        mask = remove_small_holes(mask, max_size=17)
        if int(mask.sum()) < 20:
            continue
        commands: list[str] = []
        for contour in find_contours(
            mask.astype(np.uint8),
            0.5,
            fully_connected="high",
        ):
            simplified = approximate_polygon(contour, tolerance=1.0)
            if len(simplified) < 4:
                continue
            points = [f"{point[1]:.1f},{point[0]:.1f}" for point in simplified]
            commands.append(f"M{' L'.join(points)} Z")
        if commands:
            fill = f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"
            paths.append(
                f'  <path fill="{fill}" fill-rule="evenodd" d="{" ".join(commands)}"/>'
            )
    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{image.width}" '
            f'height="{image.height}" viewBox="0 0 {image.width} {image.height}">'
        ),
        '  <title>ZonZon logo</title>',
        '  <desc>Version vectorielle plate du logo ZonZon sélectionné</desc>',
        *paths,
        "</svg>",
    ]
    svg_path.write_text("\n".join(svg), encoding="utf-8")


def vector_print_exports(svg_path: Path, pdf_path: Path, eps_path: Path) -> None:
    drawing = svg2rlg(str(svg_path))
    if drawing is None:
        raise RuntimeError(f"Unable to read SVG: {svg_path}")
    renderPDF.drawToFile(drawing, str(pdf_path))
    renderPS.drawToFile(drawing, str(eps_path), fmt="EPS")


def export_web_variants(
    paths: dict[str, Path],
    assets: dict[str, Image.Image],
) -> None:
    png_widths = {
        "vertical": [4096, 2048, 1024, 512, 256],
        "horizontal": [4096, 2048, 1024, 512],
        "symbol": [2048, 1024, 512, 256, 128],
        "wordmark": [4096, 2048, 1024, 512, 256],
    }
    for name, widths in png_widths.items():
        for width in widths:
            resized = resize_width(assets[name], width)
            save_png(
                resized,
                paths["web_png"] / f"zonzon-{name}-color-{width}w.png",
                dpi=144,
            )
        for width in [1024, 512]:
            if width <= 512 and name == "wordmark":
                target = resize_width(assets[name], width)
            else:
                target = resize_width(assets[name], width)
            save_webp(
                target,
                paths["web_webp"] / f"zonzon-{name}-color-{width}w.webp",
            )


def export_platform_icons(paths: dict[str, Path], symbol: Image.Image) -> None:
    square_light = center_on_canvas(symbol, (1024, 1024), WHITE, 0.72)
    square_dark = center_on_canvas(recolor(symbol, WHITE), (1024, 1024), NAVY, 0.68)
    maskable = center_on_canvas(symbol, (1024, 1024), WHITE, 0.58)

    android_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    adaptive_sizes = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    for density, size in android_sizes.items():
        folder = paths["android"] / "launcher" / density
        save_png(square_light.resize((size, size), Image.Resampling.LANCZOS), folder / "ic_launcher.png")
        save_png(square_dark.resize((size, size), Image.Resampling.LANCZOS), folder / "ic_launcher_dark.png")
    for density, size in adaptive_sizes.items():
        folder = paths["android"] / "adaptive-foreground" / density
        foreground = center_on_canvas(symbol, (size, size), None, 0.62)
        save_png(foreground, folder / "ic_launcher_foreground.png")
    save_png(square_light, paths["android"] / "play-store-1024.png")
    save_png(square_light.resize((512, 512), Image.Resampling.LANCZOS), paths["android"] / "play-store-512.png")
    (paths["android"] / "adaptive-background-color.txt").write_text(
        f"{WHITE}\nAlternative sombre: {NAVY}\n",
        encoding="utf-8",
    )

    ios_sizes = {
        "Icon-20@2x.png": 40,
        "Icon-20@3x.png": 60,
        "Icon-29@2x.png": 58,
        "Icon-29@3x.png": 87,
        "Icon-40@2x.png": 80,
        "Icon-40@3x.png": 120,
        "Icon-60@2x.png": 120,
        "Icon-60@3x.png": 180,
        "Icon-76.png": 76,
        "Icon-76@2x.png": 152,
        "Icon-83.5@2x.png": 167,
        "Icon-AppStore-1024.png": 1024,
    }
    for filename, size in ios_sizes.items():
        save_png(
            square_light.resize((size, size), Image.Resampling.LANCZOS),
            paths["ios"] / filename,
        )

    for size in [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512]:
        save_png(
            square_light.resize((size, size), Image.Resampling.LANCZOS),
            paths["pwa"] / f"icon-{size}.png",
        )
    for size in [192, 512]:
        save_png(
            maskable.resize((size, size), Image.Resampling.LANCZOS),
            paths["pwa"] / f"icon-maskable-{size}.png",
        )
    save_png(
        square_light.resize((180, 180), Image.Resampling.LANCZOS),
        paths["pwa"] / "apple-touch-icon.png",
    )
    favicon_frames = [
        square_light.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")
        for size in [16, 32, 48]
    ]
    favicon_frames[0].save(
        paths["pwa"] / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=favicon_frames[1:],
    )


def export_social(paths: dict[str, Path], symbol: Image.Image, horizontal: Image.Image) -> None:
    specs = {
        "profile-1080x1080": (1080, 1080, "symbol", 0.62),
        "facebook-cover-1640x924": (1640, 924, "horizontal", 0.68),
        "linkedin-cover-1584x396": (1584, 396, "horizontal", 0.60),
        "x-header-1500x500": (1500, 500, "horizontal", 0.62),
        "youtube-banner-2560x1440": (2560, 1440, "horizontal", 0.44),
        "whatsapp-profile-500x500": (500, 500, "symbol", 0.62),
    }
    white_symbol = recolor(symbol, WHITE)
    white_horizontal = recolor(horizontal, WHITE)
    for name, (width, height, asset_name, ratio) in specs.items():
        asset = white_symbol if asset_name == "symbol" else white_horizontal
        image = center_on_canvas(asset, (width, height), NAVY, ratio)
        save_png(image, paths["social"] / f"{name}.png", dpi=144)
        save_jpeg(image, paths["social"] / f"{name}.jpg", NAVY)


def export_office(paths: dict[str, Path], assets: dict[str, Image.Image]) -> None:
    save_png(resize_width(assets["horizontal"], 1200), paths["office"] / "email-signature-1200.png", dpi=144)
    save_png(resize_width(assets["horizontal"], 600), paths["office"] / "email-signature-600.png", dpi=144)
    save_png(resize_width(assets["vertical"], 1600), paths["office"] / "documents-vertical-1600.png")
    save_png(resize_width(assets["horizontal"], 2400), paths["office"] / "presentations-horizontal-2400.png")
    save_jpeg(
        center_on_canvas(assets["vertical"], (2480, 3508), WHITE, 0.44),
        paths["office"] / "a4-cover-logo.jpg",
        WHITE,
    )


def create_brand_guide(paths: dict[str, Path]) -> None:
    output = KIT_ROOT / "GUIDE-RAPIDE-ZONZON.pdf"
    pdf = canvas.Canvas(str(output), pagesize=A4)
    page_width, page_height = A4
    pdf.setFillColor(HexColor(NAVY))
    pdf.rect(0, page_height - 48 * mm, page_width, 48 * mm, fill=1, stroke=0)
    pdf.setFillColor(HexColor(WHITE))
    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawString(20 * mm, page_height - 27 * mm, "ZonZon — Kit logo")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(20 * mm, page_height - 36 * mm, "Guide rapide d’utilisation")

    pdf.setFillColor(HexColor(NAVY))
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(20 * mm, page_height - 65 * mm, "Couleurs principales")
    swatches = [(NAVY, "Bleu nuit"), (BLUE, "Bleu mouvement"), (GOLD, "Jaune accent")]
    x = 20 * mm
    for color, label in swatches:
        pdf.setFillColor(HexColor(color))
        pdf.roundRect(x, page_height - 90 * mm, 42 * mm, 16 * mm, 3 * mm, fill=1, stroke=0)
        pdf.setFillColor(HexColor(NAVY))
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x, page_height - 96 * mm, label)
        pdf.setFont("Helvetica", 8)
        pdf.drawString(x, page_height - 101 * mm, color)
        x += 56 * mm

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(20 * mm, page_height - 120 * mm, "Quel fichier utiliser ?")
    rows = [
        ("Web / application", "PNG transparent ou WebP"),
        ("Impression grand format", "SVG vectoriel, PDF ou EPS"),
        ("Documents / présentations", "PNG horizontal 2400 px"),
        ("Icône d’application", "Dossiers Android, iOS ou PWA"),
        ("Réseaux sociaux", "Dossier 06-social-media"),
    ]
    y = page_height - 133 * mm
    pdf.setFont("Helvetica", 10)
    for usage, recommendation in rows:
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(24 * mm, y, usage)
        pdf.setFont("Helvetica", 10)
        pdf.drawString(82 * mm, y, recommendation)
        y -= 10 * mm

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(20 * mm, page_height - 190 * mm, "Règles essentielles")
    rules = [
        "Conserver les proportions : ne jamais étirer le logo.",
        "Garder une zone libre autour du logo équivalente à la hauteur du « o ».",
        "Utiliser la version blanche sur fond sombre.",
        "Ne pas recolorer l’accent jaune indépendamment.",
        "Tester toute impression CMJN avec l’imprimeur avant production.",
    ]
    y = page_height - 202 * mm
    pdf.setFont("Helvetica", 10)
    for rule in rules:
        pdf.drawString(24 * mm, y, f"• {rule}")
        y -= 8 * mm
    pdf.setFillColor(HexColor("#64748B"))
    pdf.setFont("Helvetica-Oblique", 8)
    pdf.drawString(
        20 * mm,
        16 * mm,
        "Source initiale raster ; SVG vectorisé automatiquement puis contrôlé visuellement.",
    )
    pdf.save()


def create_contact_sheet(paths: dict[str, Path], assets: dict[str, Image.Image]) -> None:
    width, height = 1800, 1500
    sheet = Image.new("RGB", (width, height), "#EEF2F6")
    draw = ImageDraw.Draw(sheet)
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    bold_path = Path("C:/Windows/Fonts/arialbd.ttf")
    title_font = ImageFont.truetype(str(bold_path), 54) if bold_path.exists() else ImageFont.load_default()
    label_font = ImageFont.truetype(str(font_path), 25) if font_path.exists() else ImageFont.load_default()
    draw.text((80, 45), "ZonZon — aperçu du kit logo", fill=NAVY, font=title_font)

    panels = [
        ("Logo vertical — couleur", assets["vertical"], WHITE),
        ("Logo horizontal — couleur", assets["horizontal"], WHITE),
        ("Symbole — couleur", assets["symbol"], WHITE),
        ("Logo blanc — fond sombre", recolor(assets["horizontal"], WHITE), NAVY),
        ("Logo monochrome sombre", recolor(assets["horizontal"], NAVY), WHITE),
        ("Icône d’application", assets["symbol"], OFF_WHITE),
    ]
    panel_width, panel_height = 800, 390
    for index, (label, image, background) in enumerate(panels):
        col = index % 2
        row = index // 2
        x = 80 + col * 850
        y = 135 + row * 430
        panel = center_on_canvas(image, (panel_width, panel_height - 55), background, 0.72)
        sheet.paste(panel.convert("RGB"), (x, y))
        draw.text((x, y + panel_height - 42), label, fill=NAVY, font=label_font)
    save_png(sheet.convert("RGBA"), paths["preview"] / "zonzon-logo-kit-preview.png", dpi=144)


def create_manifest() -> None:
    files = []
    for path in sorted(KIT_ROOT.rglob("*")):
        if not path.is_file() or path.name == "manifest.json":
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        files.append(
            {
                "path": path.relative_to(KIT_ROOT).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": digest,
            }
        )
    manifest = {
        "brand": "ZonZon",
        "version": "1.0",
        "source": SOURCE.name,
        "colors": {"navy": NAVY, "blue": BLUE, "gold": GOLD, "offWhite": OFF_WHITE},
        "files": files,
    }
    (KIT_ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--vectors-and-docs-only",
        action="store_true",
        help="Reuse the existing raster exports and finish vector/print/docs outputs.",
    )
    args = parser.parse_args()
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    if not TRANSPARENT_SOURCE.exists():
        raise FileNotFoundError(TRANSPARENT_SOURCE)
    paths = ensure_dirs()
    source = normalize_logo_alpha(Image.open(TRANSPARENT_SOURCE).convert("RGBA"))
    save_png(source, TRANSPARENT_SOURCE)

    full = crop_with_padding(source, alpha_bbox(source), 28)
    symbol_region = source.crop((0, 0, source.width, 720))
    symbol = crop_with_padding(symbol_region, alpha_bbox(symbol_region), 24)
    word_region = source.crop((0, 720, source.width, source.height))
    wordmark = crop_with_padding(word_region, alpha_bbox(word_region), 20)
    horizontal = compose_horizontal(symbol, wordmark)
    assets = {
        "vertical": full,
        "horizontal": horizontal,
        "symbol": symbol,
        "wordmark": wordmark,
    }

    if not args.vectors_and_docs_only:
        for name, image in assets.items():
            save_png(image, paths["master_raster"] / f"zonzon-{name}-color-transparent.png")
            save_png(recolor(image, NAVY), paths["variants"] / f"zonzon-{name}-mono-navy.png")
            save_png(recolor(image, WHITE), paths["variants"] / f"zonzon-{name}-mono-white.png")
            save_png(
                center_on_canvas(image, (2048, 2048), WHITE, 0.78),
                paths["variants"] / f"zonzon-{name}-on-white-2048.png",
            )
            save_png(
                center_on_canvas(recolor(image, WHITE), (2048, 2048), NAVY, 0.72),
                paths["variants"] / f"zonzon-{name}-white-on-navy-2048.png",
            )

        export_web_variants(paths, assets)
        export_platform_icons(paths, symbol)
        export_social(paths, symbol, horizontal)
        export_office(paths, assets)

    vector_targets = {
        "vertical-color": paths["master_raster"] / "zonzon-vertical-color-transparent.png",
        "horizontal-color": paths["master_raster"] / "zonzon-horizontal-color-transparent.png",
        "symbol-color": paths["master_raster"] / "zonzon-symbol-color-transparent.png",
        "wordmark-color": paths["master_raster"] / "zonzon-wordmark-color-transparent.png",
        "vertical-mono-navy": paths["variants"] / "zonzon-vertical-mono-navy.png",
        "horizontal-mono-navy": paths["variants"] / "zonzon-horizontal-mono-navy.png",
        "symbol-mono-navy": paths["variants"] / "zonzon-symbol-mono-navy.png",
        "wordmark-mono-navy": paths["variants"] / "zonzon-wordmark-mono-navy.png",
    }
    for name, png_path in vector_targets.items():
        svg_path = paths["master_vector"] / f"zonzon-{name}.svg"
        trace_svg(png_path, svg_path)
        if name in {"vertical-color", "horizontal-color", "symbol-color"}:
            vector_print_exports(
                svg_path,
                paths["print"] / f"zonzon-{name}-vector.pdf",
                paths["print"] / f"zonzon-{name}-vector.eps",
            )

    for name in ["vertical", "horizontal"]:
        white_background = center_on_canvas(assets[name], (4961, 3508), WHITE, 0.72)
        cmyk = white_background.convert("RGB").convert("CMYK")
        cmyk.save(
            paths["print"] / f"zonzon-{name}-cmyk-300dpi.tif",
            "TIFF",
            compression="tiff_lzw",
            dpi=(300, 300),
        )

    create_brand_guide(paths)
    create_contact_sheet(paths, assets)
    create_manifest()
    print(f"Logo kit generated in {KIT_ROOT}")


if __name__ == "__main__":
    main()
