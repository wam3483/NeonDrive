// Glitch animations rendered over high-elevation (purple) terrain polygons
import { Container, Text, TextStyle } from 'pixi.js';

/** Interface for animated glitch effects rendered over terrain. */
export interface GlitchAnimation {
  readonly container: Container;
  /** Advance animation state. deltaTime ≈ 1 at 60 fps (PixiJS ticker units). */
  update(deltaTime: number): void;
  destroy(): void;
}

/**
 * Renders a single string that steps forward by its own width at a slow,
 * discrete frame rate.  A trail of chromatic-aberration ghosts lingers at
 * each of the previous `trailLength` step-positions, fading out with age.
 *
 * Layer order (back → front):
 *   oldest red/blue ghost … newest red/blue ghost … white main text
 *
 * Each `stepInterval` ticks:
 *   1. The current position is pushed onto the history ring.
 *   2. The white text jumps one widthInterval forward (wrapping at endX).
 *   3. Each ghost is repositioned to its history slot with its fixed alpha.
 */
export class ScrollingTextGlitch implements GlitchAnimation {
  readonly container: Container;

  private readonly mainText: Text;
  private readonly redShadows: Text[];   // [0] = most recent, [N-1] = oldest
  private readonly blueShadows: Text[];

  private readonly startX: number;
  private readonly endX: number;
  private readonly widthInterval: number;
  private readonly stepInterval: number;
  private readonly trailLength: number;

  private currentX: number;
  private stepTimer: number = 0;
  private posHistory: number[];   // [0] = most recent past position

  constructor(
    str: string,
    startX: number,
    endX: number,
    y: number,
    /** Ticker ticks between each one-width step (higher = slower). */
    stepInterval: number = 20,
    /** How many previous step-positions to keep lit as shadow trail. */
    trailLength: number = 5,
    /** Fraction 0–1 used to pick a random starting step within the range. */
    startOffsetFraction: number = 0,
  ) {
    this.startX = startX;
    this.endX = endX;
    this.stepInterval = stepInterval;
    this.trailLength = trailLength;
    this.currentX = startX;           // overwritten below once width is known
    this.posHistory = Array(trailLength).fill(startX);

    this.container = new Container();

    const mainStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 10,
      fill: 0xffffff,
    });
    const redStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 10,
      fill: 0xff1100,
    });
    const blueStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 10,
      fill: 0x0044ff,
    });

    // Measure width once to set the step distance.
    const probe = new Text({ text: str, style: mainStyle });
    this.widthInterval = Math.max(probe.width, 1);
    probe.destroy();

    // Snap the starting position to a random step within the range.
    const numSteps = Math.max(1, Math.floor((endX - startX) / this.widthInterval));
    const offsetSteps = Math.floor(startOffsetFraction * numSteps);
    this.currentX = startX + offsetSteps * this.widthInterval;
    this.posHistory = Array(trailLength).fill(this.currentX);

    // Build shadow arrays (logical order: [0] brightest/newest, [N-1] dimmest/oldest).
    this.redShadows = [];
    this.blueShadows = [];

    for (let i = 0; i < trailLength; i++) {
      // Alpha peaks at index 0 (most recent) and falls linearly to near-zero.
      const alpha = 0.72 * ((trailLength - i) / trailLength);

      const r = new Text({ text: str, style: redStyle });
      r.anchor.set(0, 0.5);
      r.x = this.currentX - 2;
      r.y = y - 1;
      r.alpha = alpha;
      this.redShadows.push(r);

      const b = new Text({ text: str, style: blueStyle });
      b.anchor.set(0, 0.5);
      b.x = this.currentX + 2;
      b.y = y + 1;
      b.alpha = alpha;
      this.blueShadows.push(b);
    }

    // Add oldest shadows first so newer ones render on top of them.
    for (let i = trailLength - 1; i >= 0; i--) {
      this.container.addChild(this.redShadows[i]);
      this.container.addChild(this.blueShadows[i]);
    }

    // White main text on top of all shadows.
    this.mainText = new Text({ text: str, style: mainStyle });
    this.mainText.anchor.set(0, 0.5);
    this.mainText.x = this.currentX;
    this.mainText.y = y;
    this.container.addChild(this.mainText);
  }

  update(deltaTime: number): void {
    this.stepTimer += deltaTime;
    if (this.stepTimer < this.stepInterval) return;
    this.stepTimer -= this.stepInterval;

    // Record current position in history before moving.
    this.posHistory.unshift(this.currentX);
    if (this.posHistory.length > this.trailLength) this.posHistory.pop();

    // Advance main text by one character width; wrap at endX.
    this.currentX += this.widthInterval;
    if (this.currentX >= this.endX) this.currentX = this.startX;
    this.mainText.x = this.currentX;

    // Reposition each ghost to its slot in the history.
    for (let i = 0; i < this.trailLength; i++) {
      const px = this.posHistory[i] ?? this.startX;
      this.redShadows[i].x = px - 2;
      this.blueShadows[i].x = px + 2;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
