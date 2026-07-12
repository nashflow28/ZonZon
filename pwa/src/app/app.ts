import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { UpdateToastComponent } from './shared/components/update-toast/update-toast.component';
import { SwUpdateService } from './shared/services/sw-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, OfflineBannerComponent, UpdateToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private swUpdateService = inject(SwUpdateService);

  constructor() {
    this.swUpdateService.init();
  }
}
