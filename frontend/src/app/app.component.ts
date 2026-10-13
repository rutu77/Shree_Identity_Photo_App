import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ElectronService } from './services/electron.service';

type Crop = { x: number; y: number; width: number; height: number };
type CropSource = { image: CanvasImageSource; width: number; height: number };

const PASSPORT_WIDTH = 413;
const PASSPORT_HEIGHT = 531;
const PASSPORT_ASPECT_RATIO = PASSPORT_WIDTH / PASSPORT_HEIGHT;
const ZOOM_STEP = 1.2;

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnDestroy {
  isDragging = false;
  errorMessage = '';
  printHint = '';
  brightness = 1;
  contrast = 1;
  saturation = 1;
  addBorder = false;
  showGridlines = false;
  copies: 6 | 8 = 6;
  zoom = 1;
  rotationDegrees = 0;
  cropConfirmed = false;
  sourceImage: HTMLImageElement | null = null;
  processedUrl = '';
  gridUrl = '';

  private cropCanvas: HTMLCanvasElement | undefined;
  private rotatedImage: HTMLCanvasElement | null = null;
  private basePhotoCanvas: HTMLCanvasElement | null = null;
  private gridBlob: Blob | null = null;
  private sourceImageUrl = '';
  private uploadVersion = 0;
  private centerX = 0.5;
  private centerY = 0.5;
  private dragPoint: { x: number; y: number } | null = null;
  private renderVersion = 0;

  @ViewChild('cropCanvas')
  set cropCanvasRef(element: ElementRef<HTMLCanvasElement> | undefined) {
    this.cropCanvas = element?.nativeElement;
    this.drawCropPreview();
  }

  constructor(private readonly electron: ElectronService) {}

  ngOnDestroy(): void {
    this.revoke(this.sourceImageUrl);
    this.revoke(this.processedUrl);
    this.revoke(this.gridUrl);
  }

  zoomIn(): void {
    this.setZoom(this.zoom * ZOOM_STEP);
  }

  zoomOut(): void {
    this.setZoom(this.zoom / ZOOM_STEP);
  }

  resetZoom(): void {
    this.zoom = 1;
    this.centerX = 0.5;
    this.centerY = 0.5;
    this.drawCropPreview();
  }

  rotatePhoto(direction: -1 | 1): void {
    const image = this.sourceImage;
    if (!image) {
      return;
    }

    this.rotationDegrees = (this.rotationDegrees + direction * 90 + 360) % 360;
    const rotatedCanvas = document.createElement('canvas');
    const swapsDimensions = this.rotationDegrees % 180 !== 0;
    rotatedCanvas.width = swapsDimensions ? image.naturalHeight : image.naturalWidth;
    rotatedCanvas.height = swapsDimensions ? image.naturalWidth : image.naturalHeight;
    const context = rotatedCanvas.getContext('2d');
    if (!context) {
      this.errorMessage = 'Could not rotate this photo. Please try again.';
      this.rotationDegrees = (this.rotationDegrees - direction * 90 + 360) % 360;
      return;
    }

    context.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    context.rotate((this.rotationDegrees * Math.PI) / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    this.rotatedImage = rotatedCanvas;
    this.centerX = 0.5;
    this.centerY = 0.5;
    this.errorMessage = '';
    this.drawCropPreview();
  }

  resetAdjustments(): void {
    this.brightness = 1;
    this.contrast = 1;
    this.saturation = 1;
    this.refreshPreviews();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(): void {
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.handleUpload(file);
    }
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void this.handleUpload(file);
    }
  }

  drawCropPreview(): void {
    const image = this.sourceImage;
    const canvas = this.cropCanvas;
    const context = canvas?.getContext('2d');
    if (!image || !canvas || !context || this.cropConfirmed) {
      return;
    }

    const cropSource = this.getCropSource();
    const crop = this.cropRect(cropSource);
    context.clearRect(0, 0, canvas.width, canvas.height);
    this.drawCrop(context, cropSource, crop, canvas.width, canvas.height);
    if (this.showGridlines) {
      this.drawPhotoGridlines(context, canvas.width, canvas.height);
    }
  }

  onCropPointerDown(event: PointerEvent): void {
    this.dragPoint = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
  }

  onCropPointerMove(event: PointerEvent): void {
    const canvas = this.cropCanvas;
    if (!this.dragPoint || !canvas || !this.sourceImage) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const cropSource = this.getCropSource();
    const crop = this.cropRect(cropSource);
    this.centerX -= ((event.clientX - this.dragPoint.x) / bounds.width) * (crop.width / cropSource.width);
    this.centerY -= ((event.clientY - this.dragPoint.y) / bounds.height) * (crop.height / cropSource.height);
    this.centerX = Math.max(0, Math.min(1, this.centerX));
    this.centerY = Math.max(0, Math.min(1, this.centerY));
    this.dragPoint = { x: event.clientX, y: event.clientY };
    this.drawCropPreview();
  }

  onCropPointerUp(): void {
    this.dragPoint = null;
  }

  onCropWheel(event: WheelEvent): void {
    event.preventDefault();
    this.setZoom(this.zoom * Math.exp(-event.deltaY * 0.002));
  }

  useThisCrop(): void {
    if (!this.sourceImage) {
      return;
    }

    const cropSource = this.getCropSource();
    const crop = this.cropRect(cropSource);
    const canvas = document.createElement('canvas');
    canvas.width = 413;
    canvas.height = 531;
    const context = canvas.getContext('2d');
    if (!context) {
      this.errorMessage = 'Could not prepare this photo. Please try another image.';
      return;
    }

    this.drawCrop(context, cropSource, crop, canvas.width, canvas.height);
    this.basePhotoCanvas = canvas;
    this.cropConfirmed = true;
    this.errorMessage = '';
    void this.refreshPreviews();
  }

  changeCrop(): void {
    this.cropConfirmed = false;
    this.drawCropPreview();
  }

  refreshPreviews(): void {
    if (!this.basePhotoCanvas) {
      return;
    }
    void this.renderPreviews();
  }

  setCopies(value: 6 | 8): void {
    this.copies = value;
    this.refreshPreviews();
  }

  async printNow(): Promise<void> {
    this.errorMessage = '';
    this.printHint = '';
    if (!this.gridBlob) {
      this.errorMessage = 'Please fit a photo first.';
      return;
    }

    const dataUrl = await this.blobToDataUrl(this.gridBlob);
    try {
      const sent = await this.electron.printPhoto(dataUrl);
      if (sent) {
        this.printHint = 'Print job sent to the printer.';
        return;
      }
    } catch {
      this.errorMessage = 'The photo could not be printed. Check the printer and try again.';
      return;
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'passport-4x6.png';
    link.click();
    this.printHint = 'Desktop printing is unavailable. The print sheet was saved as a picture.';
  }

  private async handleUpload(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.errorMessage = 'Please choose a photo (JPG or PNG).';
      return;
    }

    this.errorMessage = '';
    this.printHint = '';
    this.brightness = 1;
    this.contrast = 1;
    this.saturation = 1;
    this.addBorder = false;
    this.copies = 6;
    this.zoom = 1;
    this.rotationDegrees = 0;
    this.rotatedImage = null;
    this.showGridlines = false;
    this.centerX = 0.5;
    this.centerY = 0.5;
    this.cropConfirmed = false;
    this.basePhotoCanvas = null;
    this.gridBlob = null;
    this.sourceImage = null;
    this.revoke(this.sourceImageUrl);
    this.sourceImageUrl = '';
    this.replaceUrl('processed', '');
    this.replaceUrl('grid', '');

    const uploadVersion = ++this.uploadVersion;
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('The selected image could not be opened.'));
        image.src = imageUrl;
      });
      if (uploadVersion !== this.uploadVersion) {
        this.revoke(imageUrl);
        return;
      }
      this.sourceImageUrl = imageUrl;
      this.sourceImage = image;
      this.drawCropPreview();
    } catch {
      this.revoke(imageUrl);
      if (uploadVersion === this.uploadVersion) {
        this.errorMessage = 'Could not open that image. Please choose a JPG or PNG photo.';
      }
    }
  }

  private cropRect(image: CropSource): Crop {
    let width = image.width;
    let height = image.height;
    if (width / height > PASSPORT_ASPECT_RATIO) {
      width = height * PASSPORT_ASPECT_RATIO;
    } else {
      height = width / PASSPORT_ASPECT_RATIO;
    }
    width /= this.zoom;
    height /= this.zoom;

    let x = this.centerX * image.width - width / 2;
    let y = this.centerY * image.height - height / 2;
    if (this.zoom >= 1) {
      x = Math.max(0, Math.min(image.width - width, x));
      y = Math.max(0, Math.min(image.height - height, y));
    }
    return { x, y, width, height };
  }

  private setZoom(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    if (this.sourceImage) {
      const image = this.getCropSource();
      const frameWidth = Math.min(
        image.width,
        image.height * PASSPORT_ASPECT_RATIO,
      );
      const frameHeight = frameWidth / PASSPORT_ASPECT_RATIO;
      if (
        !Number.isFinite(frameWidth / value)
        || !Number.isFinite(frameHeight / value)
        || frameWidth / value === 0
        || frameHeight / value === 0
      ) {
        return;
      }
    }
    this.zoom = value;
    this.drawCropPreview();
  }

  private drawCrop(
    context: CanvasRenderingContext2D,
    image: CropSource,
    crop: Crop,
    outputWidth: number,
    outputHeight: number,
  ): void {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);

    const sourceX = Math.max(0, crop.x);
    const sourceY = Math.max(0, crop.y);
    const sourceRight = Math.min(image.width, crop.x + crop.width);
    const sourceBottom = Math.min(image.height, crop.y + crop.height);
    if (sourceRight <= sourceX || sourceBottom <= sourceY) {
      return;
    }

    const sourceWidth = sourceRight - sourceX;
    const sourceHeight = sourceBottom - sourceY;
    const destinationX = ((sourceX - crop.x) / crop.width) * outputWidth;
    const destinationY = ((sourceY - crop.y) / crop.height) * outputHeight;
    const destinationWidth = (sourceWidth / crop.width) * outputWidth;
    const destinationHeight = (sourceHeight / crop.height) * outputHeight;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image.image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destinationX,
      destinationY,
      destinationWidth,
      destinationHeight,
    );
  }

  private drawPhotoGridlines(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    context.save();
    context.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    context.lineWidth = 2;
    context.beginPath();
    for (let division = 1; division < 3; division++) {
      const x = (width * division) / 3;
      const y = (height * division) / 3;
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
    context.restore();
  }

  private async renderPreviews(): Promise<void> {
    const basePhoto = this.basePhotoCanvas;
    if (!basePhoto) {
      return;
    }

    const version = ++this.renderVersion;
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = basePhoto.width;
    photoCanvas.height = basePhoto.height;
    const photoContext = photoCanvas.getContext('2d');
    if (!photoContext) {
      this.errorMessage = 'Could not adjust this photo. Please try again.';
      return;
    }

    photoContext.filter = `brightness(${this.brightness}) contrast(${this.contrast}) saturate(${this.saturation})`;
    photoContext.drawImage(basePhoto, 0, 0);
    photoContext.filter = 'none';
    if (this.addBorder) {
      photoContext.strokeStyle = '#000000';
      photoContext.lineWidth = 2.5;
      photoContext.strokeRect(1.25, 1.25, photoCanvas.width - 2.5, photoCanvas.height - 2.5);
    }

    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = this.copies === 8 ? 1800 : 1200;
    gridCanvas.height = this.copies === 8 ? 1200 : 1800;
    const gridContext = gridCanvas.getContext('2d');
    if (!gridContext) {
      this.errorMessage = 'Could not make the print sheet. Please try again.';
      return;
    }
    this.drawGrid(gridContext, photoCanvas);

    try {
      const [photoBlob, gridBlob] = await Promise.all([
        this.canvasToBlob(photoCanvas),
        this.canvasToBlob(gridCanvas),
      ]);
      if (version !== this.renderVersion) {
        return;
      }
      this.replaceUrl('processed', photoBlob);
      this.replaceUrl('grid', gridBlob);
      this.gridBlob = gridBlob;
      this.errorMessage = '';
    } catch {
      this.errorMessage = 'Could not prepare the photo previews. Please try again.';
    }
  }

  private drawGrid(context: CanvasRenderingContext2D, photo: HTMLCanvasElement): void {
    const canvas = context.canvas;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const columns = this.copies === 6 ? 2 : 4;
    const rows = this.copies === 6 ? 3 : 2;
    const gapMm = this.copies === 8 ? 2.5 : 3;
    const gap = (gapMm / 25.4) * 300;
    const totalWidth = columns * photo.width + (columns - 1) * gap;
    const totalHeight = rows * photo.height + (rows - 1) * gap;
    const marginX = (canvas.width - totalWidth) / 2;
    const marginY = (canvas.height - totalHeight) / 2;

    for (let index = 0; index < this.copies; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = marginX + column * (photo.width + gap);
      const y = marginY + row * (photo.height + gap);
      context.drawImage(photo, x, y);
      context.strokeStyle = '#777777';
      context.lineWidth = 1;
      context.strokeRect(x, y, photo.width, photo.height);
    }
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas image could not be created.'));
        }
      }, 'image/png');
    });
  }

  private getCropSource(): CropSource {
    if (this.rotatedImage) {
      return {
        image: this.rotatedImage,
        width: this.rotatedImage.width,
        height: this.rotatedImage.height,
      };
    }
    const image = this.sourceImage;
    if (!image) {
      throw new Error('A photo must be loaded before cropping.');
    }
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  }

  private replaceUrl(target: 'processed' | 'grid', blob: Blob | ''): void {
    const oldUrl = target === 'processed' ? this.processedUrl : this.gridUrl;
    this.revoke(oldUrl);
    const newUrl = blob ? URL.createObjectURL(blob) : '';
    if (target === 'processed') {
      this.processedUrl = newUrl;
    } else {
      this.gridUrl = newUrl;
    }
  }

  private revoke(url: string): void {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}
