import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PhotoApiService {
  private readonly baseUrl = 'http://127.0.0.1:8000';

  constructor(private readonly http: HttpClient) {}

  processPhoto(file: File): Promise<Blob> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(
      this.http.post(`${this.baseUrl}/process-photo`, form, { responseType: 'blob' }),
    );
  }

  enhancePhoto(file: Blob, brightness: number, contrast: number): Promise<Blob> {
    const form = new FormData();
    form.append('file', file, 'photo.png');
    form.append('brightness', String(brightness));
    form.append('contrast', String(contrast));
    return firstValueFrom(
      this.http.post(`${this.baseUrl}/enhance`, form, { responseType: 'blob' }),
    );
  }

  generateGrid(file: Blob, copies: 6 | 8): Promise<Blob> {
    const form = new FormData();
    form.append('file', file, 'photo.png');
    form.append('copies', String(copies));
    return firstValueFrom(
      this.http.post(`${this.baseUrl}/generate-grid`, form, { responseType: 'blob' }),
    );
  }
}
