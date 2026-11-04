import { ADVANCE, GLYPHS, GLYPH_H, GLYPH_W, textWidth } from './font';

/** LCD matrix resolution. */
export const W = 40;
export const H = 32;

export class Bitmap {
  readonly px = new Uint8Array(W * H);

  clear() {
    this.px.fill(0);
  }

  set(x: number, y: number, v = 1) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.px[y * W + x] = v;
  }

  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    return this.px[y * W + x];
  }

  fill(x: number, y: number, w: number, h: number, v = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v);
  }

  frame(x: number, y: number, w: number, h: number) {
    for (let i = 0; i < w; i++) {
      this.set(x + i, y);
      this.set(x + i, y + h - 1);
    }
    for (let j = 0; j < h; j++) {
      this.set(x, y + j);
      this.set(x + w - 1, y + j);
    }
  }

  /** Horizontal gauge: 1px frame, filled proportionally. */
  bar(x: number, y: number, w: number, h: number, frac: number) {
    this.frame(x, y, w, h);
    const inner = Math.round((w - 2) * Math.max(0, Math.min(1, frac)));
    this.fill(x + 1, y + 1, inner, h - 2);
  }

  invert(x: number, y: number, w: number, h: number) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) this.set(x + i, y + j, this.get(x + i, y + j) ? 0 : 1);
  }

  /** Draw a 16-wide bitmap (row-major 0/1 array). `mirror` flips horizontally. */
  blit(src: Uint8Array, sw: number, x: number, y: number, mirror = false, v = 1) {
    const sh = src.length / sw;
    for (let j = 0; j < sh; j++)
      for (let i = 0; i < sw; i++) {
        if (src[j * sw + (mirror ? sw - 1 - i : i)]) this.set(x + i, y + j, v);
      }
  }

  text(x: number, y: number, s: string, v = 1): number {
    const str = s.toUpperCase();
    for (let c = 0; c < str.length; c++) {
      const m = GLYPHS[str[c]] ?? GLYPHS['?'];
      for (let r = 0; r < GLYPH_H; r++)
        for (let k = 0; k < GLYPH_W; k++) {
          if (m & (1 << (14 - (r * 3 + k)))) this.set(x + c * ADVANCE + k, y + r, v);
        }
    }
    return textWidth(str);
  }

  /**
   * Centered text inside [x0, x0+w). If it doesn't fit it scrolls like a
   * marquee, driven by `frame` (15 fps tick counter).
   */
  textIn(x0: number, w: number, y: number, s: string, frame = 0) {
    const tw = textWidth(s);
    if (tw <= w) {
      this.text(x0 + Math.floor((w - tw) / 2), y, s);
      return;
    }
    const gap = 8;
    const period = tw + gap;
    const off = Math.floor(frame / 2) % period;
    // Draw into a scratch row band then clip to the window.
    const tmp = new Bitmap();
    tmp.text(-off + x0, y, s);
    tmp.text(-off + x0 + period, y, s);
    for (let j = y; j < y + GLYPH_H; j++)
      for (let i = x0; i < x0 + w; i++) if (tmp.get(i, j)) this.set(i, j);
  }

  textC(y: number, s: string, frame = 0) {
    this.textIn(0, W, y, s, frame);
  }

  /**
   * SVG path of lit pixels. Horizontal runs are merged into single rects so
   * the path stays short; the LCD dot-grid is drawn as a static overlay.
   */
  toPath(): string {
    let d = '';
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!this.px[y * W + x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < W && this.px[y * W + x]) x++;
        d += `M${start} ${y}h${x - start}v1h${start - x}z`;
      }
    }
    return d;
  }
}
