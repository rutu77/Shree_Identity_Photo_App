import { Injectable } from '@angular/core';

type ElectronApi = {
  printPhoto: (imageDataUrl: string) => Promise<void>;
};

@Injectable({ providedIn: 'root' })
export class ElectronService {
  private api(): ElectronApi | undefined {
    return (window as Window & { electronAPI?: ElectronApi }).electronAPI;
  }

  isElectron(): boolean {
    return !!this.api()?.printPhoto;
  }

  async printPhoto(imageDataUrl: string): Promise<boolean> {
    const api = this.api();
    if (!api?.printPhoto) {
      return false;
    }
    await api.printPhoto(imageDataUrl);
    return true;
  }
}
