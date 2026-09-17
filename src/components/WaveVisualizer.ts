import { audioEngine } from '../services/audioEngine';

export class WaveVisualizer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  private barCount = 42;
  private isDragging = false;
  private staticWaveformData: number[] = [];

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`WaveVisualizer container #${containerId} not found`);
    this.container = el;

    this.container.innerHTML = `
      <div class="w-full flex flex-col gap-2 select-none">
        <div class="relative w-full h-12 flex items-center cursor-pointer touch-none" id="waveform-touch-zone">
          <canvas id="waveform-canvas" class="w-full h-full"></canvas>
        </div>
        <div class="flex justify-between items-center text-xs font-medium text-white/50 px-1">
          <span id="time-current">00:00</span>
          <span id="badge-quality" class="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-sonic-green font-mono">320 KBPS</span>
          <span id="time-total">00:00</span>
        </div>
      </div>
    `;

    this.canvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.generateStaticWaveform();
    this.setupResize();
    this.setupTouchSeeking();
    this.startLoop();
  }

  private generateStaticWaveform() {
    this.staticWaveformData = [];
    for (let i = 0; i < this.barCount; i++) {
      // Harmonic wave shape with natural peaks
      const base = Math.sin((i / this.barCount) * Math.PI);
      const noise = (Math.random() * 0.35 + 0.15);
      this.staticWaveformData.push(Math.min(1.0, Math.max(0.15, base * 0.7 + noise * 0.4)));
    }
  }

  private setupResize() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);
  }

  private setupTouchSeeking() {
    const zone = document.getElementById('waveform-touch-zone');
    if (!zone) return;

    const handleSeek = (clientX: number) => {
      const rect = zone.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percent = (clickX / rect.width) * 100;
      audioEngine.seekPercent(percent);
    };

    zone.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      zone.setPointerCapture(e.pointerId);
      handleSeek(e.clientX);
    });

    zone.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        handleSeek(e.clientX);
      }
    });

    zone.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    zone.addEventListener('pointercancel', () => {
      this.isDragging = false;
    });
  }

  private formatTime(sec: number): string {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  private startLoop() {
    const timeCurrentEl = document.getElementById('time-current');
    const timeTotalEl = document.getElementById('time-total');

    const draw = () => {
      const w = this.canvas.getBoundingClientRect().width;
      const h = this.canvas.getBoundingClientRect().height;
      this.ctx.clearRect(0, 0, w, h);

      const duration = audioEngine.duration;
      const current = audioEngine.currentTime;
      const percent = duration > 0 ? (current / duration) : 0;

      if (timeCurrentEl) timeCurrentEl.textContent = this.formatTime(current);
      if (timeTotalEl) timeTotalEl.textContent = this.formatTime(duration);

      const realAudioData = audioEngine.isPlaying ? audioEngine.getWaveformData() : null;
      const barWidth = Math.max(2, (w / this.barCount) - 3.5);
      const gap = (w - (barWidth * this.barCount)) / (this.barCount - 1);

      for (let i = 0; i < this.barCount; i++) {
        let val = this.staticWaveformData[i] || 0.3;

        // Modulate with real frequency data if playing
        if (realAudioData && realAudioData.length > 0) {
          const freqIndex = Math.floor((i / this.barCount) * realAudioData.length);
          const freqFactor = realAudioData[freqIndex] / 255;
          val = (val * 0.5) + (freqFactor * 0.7);
        }

        const barHeight = Math.max(6, val * (h * 0.85));
        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;

        const isPlayed = (i / this.barCount) <= percent;

        this.ctx.beginPath();
        this.ctx.roundRect(x, y, barWidth, barHeight, [3]);

        if (isPlayed) {
          // Vibrant Glowing Green/Cyan gradient for played region
          const grad = this.ctx.createLinearGradient(0, y, 0, y + barHeight);
          grad.addColorStop(0, '#06B6D4');
          grad.addColorStop(1, '#1ED760');
          this.ctx.fillStyle = grad;
          this.ctx.shadowColor = 'rgba(30, 215, 96, 0.4)';
          this.ctx.shadowBlur = 6;
        } else {
          // Subtle muted glass bar for unplayed region
          this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          this.ctx.shadowBlur = 0;
        }

        this.ctx.fill();
      }

      this.animationFrameId = requestAnimationFrame(draw);
    };

    draw();
  }

  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}
