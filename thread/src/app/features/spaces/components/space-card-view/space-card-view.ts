import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SpaceCard, SpaceTool } from '../../space.model';

@Component({
  selector: 'app-space-card',
  standalone: true,
  templateUrl: './space-card-view.html',
  styleUrl: './space-card-view.css',
})
export class SpaceCardView {
  @Input({ required: true }) space!: SpaceCard;
  @Input() selected = false;
  @Input() dragging = false;
  @Input() panning = false;
  @Input() tool: SpaceTool = 'select';
  @Output() cardPointerDown = new EventEmitter<PointerEvent>();
  @Output() cardPointerMove = new EventEmitter<PointerEvent>();
  @Output() cardPointerUp = new EventEmitter<PointerEvent>();
  @Output() cardPointerCancel = new EventEmitter<PointerEvent>();
  @Output() open = new EventEmitter<void>();
}
