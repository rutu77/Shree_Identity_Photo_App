import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('supports repeated zoom changes and resetting the crop view', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;

    app.zoomOut();
    expect(app.zoom).toBeCloseTo(1 / 1.2);

    for (let index = 0; index < 100; index++) {
      app.zoomIn();
    }
    expect(app.zoom).toBeGreaterThan(3);

    app.resetZoom();
    expect(app.zoom).toBe(1);
  });

  it('zooms with the mouse wheel without scrolling the page', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const event = new WheelEvent('wheel', { deltaY: -120, cancelable: true });

    app.onCropWheel(event);

    expect(event.defaultPrevented).toBeTrue();
    expect(app.zoom).toBeGreaterThan(1);
  });

  it('resets brightness, contrast, and saturation without changing border choice', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.brightness = 1.4;
    app.contrast = 0.7;
    app.saturation = 1.8;
    app.addBorder = true;

    app.resetAdjustments();

    expect(app.brightness).toBe(1);
    expect(app.contrast).toBe(1);
    expect(app.saturation).toBe(1);
    expect(app.addBorder).toBeTrue();
  });

  it('keeps the print preview in 4x6 proportions and uses landscape for eight photos', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;

    expect(app.pageAspectRatio()).toBe('1200 / 1800');
    app.setCopies(8);
    expect(app.pageAspectRatio()).toBe('1800 / 1200');

    app.setCopies(6);
    expect(app.pageAspectRatio()).toBe('1200 / 1800');
  });
});
