import { Component, computed, signal } from '@angular/core';

type CanvasItemType = 'note' | 'checklist' | 'image' | 'file';

interface CanvasItem {
  id: number;
  type: CanvasItemType;
  title: string;
  x: number;
  y: number;

  content?: string;

  tasks?: {
    label: string;
    completed: boolean;
  }[];
}

@Component({
  selector: 'app-canvas-page',
  imports: [],
  templateUrl: './canvas-page.html',
  styleUrl: './canvas-page.css',
})
export class CanvasPage {
  readonly spaceName = signal('Wevra HR');

  readonly zoom = signal(1);

  readonly panX = signal(0);
  readonly panY = signal(0);

  readonly isPanning = signal(false);

  readonly items = signal<CanvasItem[]>([
    {
      id: 1,
      type: 'checklist',
      title: 'Q2 Hiring Checklist',
      x: 470,
      y: 130,
      tasks: [
        {
          label: 'Define roles and scopes',
          completed: true,
        },
        {
          label: 'Align with budget',
          completed: true,
        },
        {
          label: 'Post job descriptions',
          completed: false,
        },
        {
          label: 'Review applicants',
          completed: false,
        },
        {
          label: 'Schedule interviews',
          completed: false,
        },
      ],
    },

    {
      id: 2,
      type: 'note',
      title: 'Onboarding Notes',
      x: 920,
      y: 160,
      content:
        'Ideas for improving the onboarding experience. Focus on clarity, ownership and early connections across teams.',
    },

    {
      id: 3,
      type: 'file',
      title: 'Employee Handbook',
      x: 180,
      y: 500,
      content: 'Wevra_Employee_Handbook.pdf',
    },

    {
      id: 4,
      type: 'image',
      title: 'Team Space Inspiration',
      x: 760,
      y: 500,
    },

    {
      id: 5,
      type: 'note',
      title: 'HR Priorities',
      x: 420,
      y: 780,
      content:
        'Finalize headcount plan\nLaunch onboarding flow\nPlan team offsite\nUpdate compensation bands',
    },
  ]);

  readonly worldTransform = computed(() => {
    return `
      translate(${this.panX()}px, ${this.panY()}px)
      scale(${this.zoom()})
    `;
  });

  private startPointerX = 0;
  private startPointerY = 0;

  private startPanX = 0;
  private startPanY = 0;

  startPan(event: PointerEvent): void {
    const target = event.target as HTMLElement;

    // Do not pan when the user starts interacting with a card.
    if (target.closest('.board-item')) {
      return;
    }

    this.isPanning.set(true);

    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;

    this.startPanX = this.panX();
    this.startPanY = this.panY();

    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
  }

  pan(event: PointerEvent): void {
    if (!this.isPanning()) {
      return;
    }

    const differenceX = event.clientX - this.startPointerX;
    const differenceY = event.clientY - this.startPointerY;

    this.panX.set(this.startPanX + differenceX);
    this.panY.set(this.startPanY + differenceY);
  }

  stopPan(): void {
    this.isPanning.set(false);
  }

  zoomIn(): void {
    this.zoom.update((value) => {
      return Math.min(value + 0.1, 2);
    });
  }

  zoomOut(): void {
    this.zoom.update((value) => {
      return Math.max(value - 0.1, 0.4);
    });
  }

  resetView(): void {
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();

    const direction = event.deltaY > 0 ? -0.08 : 0.08;

    this.zoom.update((value) => {
      const nextZoom = value + direction;

      return Math.min(Math.max(nextZoom, 0.4), 2);
    });
  }

  addNote(): void {
    const nextId =
      Math.max(0, ...this.items().map((item) => item.id)) + 1;

    this.items.update((currentItems) => [
      ...currentItems,
      {
        id: nextId,
        type: 'note',
        title: 'Untitled note',
        content: 'Start writing...',
        x: 650,
        y: 350,
      },
    ]);
  }
}