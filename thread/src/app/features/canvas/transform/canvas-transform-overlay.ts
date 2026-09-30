import Moveable from 'moveable';

export interface TransformCallbacks {
  start(): void;
  resize(width: number, height: number, direction: number[]): void;
  rotate(degrees: number): void;
  end(): void;
}

// Moveable owns the selection box and handles. CanvasPage owns world-coordinate state.
export class CanvasTransformOverlay {
  private readonly moveable: Moveable;
  private targets: HTMLElement[] = [];

  constructor(container: HTMLElement, callbacks: TransformCallbacks) {
    this.moveable = new Moveable(container, {
      container,
      rootContainer: container,
      target: null,
      draggable: false,
      resizable: false,
      rotatable: false,
      snappable: true,
      snapThreshold: 6,
      snapGap: true,
      keepRatio: false,
      renderDirections: ['nw', 'ne', 'sw', 'se'],
      rotationPosition: 'top',
      throttleResize: 0,
      throttleRotate: 0,
      controlPadding: 10,
      className: 'thread-moveable',
    });
    this.moveable.on('resizeStart', () => callbacks.start());
    this.moveable.on('resize', event => callbacks.resize(event.width, event.height, event.direction));
    this.moveable.on('resizeEnd', () => callbacks.end());
    this.moveable.on('rotateStart', () => callbacks.start());
    this.moveable.on('rotate', event => callbacks.rotate(event.beforeRotation));
    this.moveable.on('rotateEnd', () => callbacks.end());
  }

  update(targets: HTMLElement[], otherTargets: HTMLElement[], keepRatio: boolean): void {
    this.targets = targets;
    this.moveable.target = targets.length === 1 ? targets[0] : targets;
    this.moveable.resizable = false;
    this.moveable.rotatable = false;
    this.moveable.keepRatio = keepRatio;
    this.moveable.elementGuidelines = otherTargets;
    this.moveable.updateRect();
  }

  destroy(): void { this.moveable.destroy(); }
}
