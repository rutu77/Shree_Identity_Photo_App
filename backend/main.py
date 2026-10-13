"""
Photo Studio AI engine.

Endpoints:
  POST /process-photo  — face-aware passport crop + white background
  POST /generate-grid  — 4x6 print sheet with 6 or 8 copies
  POST /enhance        — brightness / contrast
""" 

from __future__ import annotations

import io
from typing import Literal

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageDraw, ImageEnhance, ImageOps
from rembg import remove

app = FastAPI(title="Photo Studio AI Engine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DPI = 300
PASSPORT_CM = (3.5, 4.5)  # width x height (India / many EU ID photos)
PAPER_INCH = (4.0, 6.0)  # print paper
WHITE = (255, 255, 255)


def cm_to_px(cm: float, dpi: int = DPI) -> int:
    return int(round((cm / 2.54) * dpi))


def inches_to_px(inches: float, dpi: int = DPI) -> int:
    return int(round(inches * dpi))


PASSPORT_PX = (cm_to_px(PASSPORT_CM[0]), cm_to_px(PASSPORT_CM[1]))  # ~413 x 531
PAPER_PX = (inches_to_px(PAPER_INCH[0]), inches_to_px(PAPER_INCH[1]))  # 1200 x 1800


def _read_upload_bgr(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not read the uploaded image.")
    return image


def _pil_to_png_bytes(image: Image.Image) -> bytes:
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _png_response(image: Image.Image) -> Response:
    return Response(content=_pil_to_png_bytes(image), media_type="image/png")


def _largest_face(gray: np.ndarray) -> tuple[int, int, int, int] | None:
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        return None
    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        flags=cv2.CASCADE_SCALE_IMAGE,
        minSize=(80, 80),
    )
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda f: int(f[2]) * int(f[3]))
    return int(x), int(y), int(w), int(h)


def crop_to_passport(bgr: np.ndarray) -> np.ndarray:
    """Crop around the detected face to a 3.5 x 4.5 cm identity ratio."""
    height, width = bgr.shape[:2]
    target_w, target_h = PASSPORT_PX
    target_ratio = target_w / target_h

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    face = _largest_face(gray)

    if face is not None:
        fx, fy, fw, fh = face
        # Identity photos: face ~70–75% of height, a little space above the head.
        crop_h = int(fh / 0.72)
        crop_w = int(crop_h * target_ratio)
        center_x = fx + fw // 2
        # Eyes sit near the upper third of the face box.
        eye_y = fy + int(fh * 0.38)
        top = int(eye_y - crop_h * 0.45)
        left = center_x - crop_w // 2
    else:
        # No face: keep as much of the image as possible at the passport ratio.
        if width / height >= target_ratio:
            crop_h = height
            crop_w = int(height * target_ratio)
        else:
            crop_w = width
            crop_h = int(width / target_ratio)
        left = (width - crop_w) // 2
        top = (height - crop_h) // 2

    # Extra padding so rembg has hair/shoulders to work with, then we recrop.
    pad = int(max(crop_w, crop_h) * 0.18)
    x1 = max(0, left - pad)
    y1 = max(0, top - pad)
    x2 = min(width, left + crop_w + pad)
    y2 = min(height, top + crop_h + pad)
    padded = bgr[y1:y2, x1:x2]
    if padded.size == 0:
        padded = bgr

    rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
    cutout = remove(Image.fromarray(rgb))
    if not isinstance(cutout, Image.Image):
        cutout = Image.open(io.BytesIO(cutout)).convert("RGBA")
    else:
        cutout = cutout.convert("RGBA")

    white = Image.new("RGBA", cutout.size, (*WHITE, 255))
    composed = Image.alpha_composite(white, cutout).convert("RGB")

    # Final tight crop back to passport ratio, centered.
    cw, ch = composed.size
    if cw / ch >= target_ratio:
        final_h = ch
        final_w = int(ch * target_ratio)
    else:
        final_w = cw
        final_h = int(cw / target_ratio)
    left_f = max(0, (cw - final_w) // 2)
    top_f = max(0, (ch - final_h) // 2)
    composed = composed.crop((left_f, top_f, left_f + final_w, top_f + final_h))
    composed = ImageOps.fit(composed, (target_w, target_h), method=Image.Resampling.LANCZOS)
    return cv2.cvtColor(np.array(composed), cv2.COLOR_RGB2BGR)


def bgr_to_pil(bgr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def generate_print_grid(photo: Image.Image, copies: Literal[6, 8]) -> Image.Image:
    """Tile the passport photo onto a 4x6 inch sheet at 300 DPI with cut lines."""
    paper_w, paper_h = PAPER_PX
    canvas = Image.new("RGB", (paper_w, paper_h), WHITE)
    draw = ImageDraw.Draw(canvas)

    cols, rows = (2, 3) if copies == 6 else (2, 4)
    margin = inches_to_px(0.15)
    gap = inches_to_px(0.08)

    cell_w = (paper_w - 2 * margin - (cols - 1) * gap) // cols
    cell_h = (paper_h - 2 * margin - (rows - 1) * gap) // rows

    fitted = ImageOps.contain(photo.convert("RGB"), (cell_w, cell_h), method=Image.Resampling.LANCZOS)
    pw, ph = fitted.size

    for row in range(rows):
        for col in range(cols):
            x = margin + col * (cell_w + gap) + (cell_w - pw) // 2
            y = margin + row * (cell_h + gap) + (cell_h - ph) // 2
            canvas.paste(fitted, (x, y))
            # Cut-line / border around each copy.
            draw.rectangle(
                [x, y, x + pw - 1, y + ph - 1],
                outline=(40, 40, 40),
                width=2,
            )

    return canvas


def enhance_image(photo: Image.Image, brightness: float, contrast: float) -> Image.Image:
    result = photo.convert("RGB")
    if abs(brightness - 1.0) > 1e-3:
        result = ImageEnhance.Brightness(result).enhance(brightness)
    if abs(contrast - 1.0) > 1e-3:
        result = ImageEnhance.Contrast(result).enhance(contrast)
    return result


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process-photo")
async def process_photo(file: UploadFile = File(...)) -> Response:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    bgr = _read_upload_bgr(data)
    processed = crop_to_passport(bgr)
    return _png_response(bgr_to_pil(processed))


@app.post("/generate-grid")
async def generate_grid(
    file: UploadFile = File(...),
    copies: int = Form(6),
) -> Response:
    if copies not in (6, 8):
        raise HTTPException(status_code=400, detail="copies must be 6 or 8.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    try:
        photo = Image.open(io.BytesIO(data))
        photo = ImageOps.exif_transpose(photo)
    except Exception as exc:  # noqa: BLE001 — invalid uploads should be 400s
        raise HTTPException(status_code=400, detail="Could not read the uploaded image.") from exc
    grid = generate_print_grid(photo, copies=copies)  # type: ignore[arg-type]
    return _png_response(grid)


@app.post("/enhance")
async def enhance(
    file: UploadFile = File(...),
    brightness: float = Form(1.0),
    contrast: float = Form(1.0),
) -> Response:
    if brightness <= 0 or contrast <= 0:
        raise HTTPException(status_code=400, detail="brightness and contrast must be greater than 0.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    try:
        photo = Image.open(io.BytesIO(data))
        photo = ImageOps.exif_transpose(photo)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Could not read the uploaded image.") from exc
    enhanced = enhance_image(photo, brightness=brightness, contrast=contrast)
    return _png_response(enhanced)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
