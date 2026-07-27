import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../auth/auth.service';

/**
 * Suppression définitive du compte, partagée par les profils client, livreur
 * et commerçant. Exigence des stores : l'utilisateur doit pouvoir initier la
 * suppression depuis l'application elle-même.
 *
 * Confirmation en deux temps :
 * 1. `info` — ce qui est supprimé (données personnelles) et ce qui est
 *    conservé (historique anonymisé) ;
 * 2. `confirm` — saisie du mot de passe actuel.
 */
@Component({
  selector: 'app-delete-account',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delete-account.component.html',
  styleUrl: './delete-account.component.css',
})
export class DeleteAccountComponent {
  private authService = inject(AuthService);

  readonly step = signal<'idle' | 'info' | 'confirm'>('idle');
  readonly deleting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  password = '';

  openInfo(): void {
    this.step.set('info');
    this.errorMessage.set(null);
  }

  goToConfirm(): void {
    this.step.set('confirm');
    this.errorMessage.set(null);
  }

  /** Retour à l'explication depuis l'étape mot de passe. */
  back(): void {
    if (this.deleting()) return;
    this.step.set('info');
    this.password = '';
    this.errorMessage.set(null);
  }

  cancel(): void {
    if (this.deleting()) return;
    this.step.set('idle');
    this.password = '';
    this.errorMessage.set(null);
  }

  confirmDelete(): void {
    // Garde-fou anti double suppression (le bouton est aussi désactivé).
    if (this.deleting()) return;
    if (!this.password) {
      this.errorMessage.set('Saisissez votre mot de passe pour confirmer.');
      return;
    }
    this.deleting.set(true);
    this.errorMessage.set(null);
    this.authService.deleteAccount(this.password).subscribe({
      next: () => {
        // La purge de session et la redirection vers /login sont faites par
        // AuthService : on ne laisse jamais l'utilisateur sur un écran
        // authentifié avec un compte supprimé.
        this.password = '';
      },
      error: (err: HttpErrorResponse) => {
        this.deleting.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  /**
   * Affiche tel quel le message du backend (403 mot de passe incorrect,
   * 409 course en cours) — surtout le 409, sans quoi l'utilisateur croirait à
   * un bug alors qu'il a simplement une course à terminer.
   */
  private extractMessage(err: HttpErrorResponse): string {
    const message = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message;
    if (err.status === 0) {
      return 'Connexion impossible. Vérifiez votre connexion internet, puis réessayez.';
    }
    return 'La suppression du compte a échoué. Réessayez.';
  }
}
