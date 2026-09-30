import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PreferencesService } from './shared/preferences.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly preferences = inject(PreferencesService);
  protected readonly title = signal('thread');
}
