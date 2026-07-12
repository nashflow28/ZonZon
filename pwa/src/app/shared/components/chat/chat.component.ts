import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { ChatMessage } from '../../models/order.model';
import { MessagesService } from '../../services/messages.service';
import { SocketService } from '../../services/socket.service';

/**
 * Conversation d'une livraison — réutilisable client/livreur/commerçant.
 * Charge l'historique HTTP, envoie via POST, écoute `chat:message` en direct
 * (après `chat:join`), marque lu à l'ouverture et à la réception.
 */
@Component({
  selector: 'app-order-chat',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat">
      <div class="messages zz-scroll" #scrollEl>
        @if (loading()) {
          <p class="hint">Chargement de la conversation…</p>
        } @else if (messages().length === 0) {
          <p class="hint">Aucun message pour l'instant. Dites bonjour !</p>
        } @else {
          @for (m of messages(); track m.id) {
            <div class="bubble-row" [class.bubble-row--mine]="isMine(m)">
              <div class="bubble" [class.bubble--mine]="isMine(m)">
                @if (!isMine(m)) {
                  <span class="sender">{{ senderName(m) }}</span>
                }
                <span class="content">{{ m.content }}</span>
              </div>
            </div>
          }
        }
      </div>

      @if (closed()) {
        <div class="closed-banner">Conversation fermée (course terminée).</div>
      } @else {
        <form class="composer" (ngSubmit)="send()">
          <input
            type="text"
            placeholder="Écrire un message…"
            [(ngModel)]="draft"
            name="draft"
            autocomplete="off"
          />
          <button type="submit" [disabled]="!draft.trim() || sending()">Envoyer</button>
        </form>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }

      .chat {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }

      .messages {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 4px;
      }

      .hint {
        text-align: center;
        color: var(--zz-text-mut);
        font-size: 13px;
        margin-top: 20px;
      }

      .bubble-row {
        display: flex;
      }

      .bubble-row--mine {
        justify-content: flex-end;
      }

      .bubble {
        max-width: 78%;
        background: var(--zz-card);
        border: 1px solid var(--zz-line);
        border-radius: 16px;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .bubble--mine {
        background: color-mix(in srgb, var(--zz-go) 20%, var(--zz-card));
        border-color: color-mix(in srgb, var(--zz-go) 40%, transparent);
      }

      .sender {
        font-size: 11px;
        font-weight: 700;
        color: var(--zz-sky);
      }

      .content {
        font-size: 14px;
        color: var(--zz-text-hi);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .composer {
        flex: 0 0 auto;
        display: flex;
        gap: 8px;
        padding: 10px 4px;
        border-top: 1px solid var(--zz-line);
      }

      .composer input {
        flex: 1;
        appearance: none;
        background: var(--zz-card);
        border: 1px solid var(--zz-line);
        border-radius: 14px;
        padding: 10px 14px;
        font-size: 15px;
        color: var(--zz-text-hi);
        outline: none;
      }

      .composer input:focus {
        border-color: var(--zz-go);
      }

      .composer button {
        border: none;
        border-radius: 14px;
        padding: 0 16px;
        font-weight: 700;
        background: var(--zz-go);
        color: #06231a;
      }

      .composer button:disabled {
        opacity: 0.5;
      }

      .closed-banner {
        padding: 12px 14px;
        text-align: center;
        font-size: 13px;
        color: var(--zz-text-mut);
        border-top: 1px solid var(--zz-line);
      }
    `,
  ],
})
export class OrderChatComponent implements OnInit, OnDestroy {
  readonly orderId = input.required<string>();
  /** Statut vivant de la course : ferme la saisie quand il devient terminal. */
  readonly orderStatus = input<string | null | undefined>(null);

  @ViewChild('scrollEl') scrollEl?: ElementRef<HTMLDivElement>;

  private messagesService = inject(MessagesService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly loading = signal(true);
  readonly sending = signal(false);
  draft = '';

  readonly closed = computed(() =>
    ['COMPLETED', 'CANCELLED', 'FAILED'].includes(this.orderStatus() ?? '')
  );

  private sub = new Subscription();
  private joinedOrderId: string | null = null;

  ngOnInit(): void {
    const orderId = this.orderId();
    this.joinedOrderId = orderId;
    this.socketService.joinOrderRoom(orderId);

    this.loadHistory();

    this.sub.add(
      this.socketService.on$<{ orderId: string; message: ChatMessage }>('chat:message').subscribe((evt) => {
        if (evt.orderId !== orderId) return;
        this.messages.update((list) => [...list, evt.message]);
        this.scrollToBottom();
        this.messagesService.markRead(orderId).subscribe();
      })
    );
  }

  ngOnDestroy(): void {
    if (this.joinedOrderId) this.socketService.leaveOrderRoom(this.joinedOrderId);
    this.sub.unsubscribe();
  }

  private loadHistory(): void {
    this.loading.set(true);
    this.messagesService.list(this.orderId()).subscribe({
      next: (msgs) => {
        this.messages.set(msgs);
        this.loading.set(false);
        this.scrollToBottom();
        this.messagesService.markRead(this.orderId()).subscribe();
      },
      error: () => this.loading.set(false),
    });
  }

  send(): void {
    const content = this.draft.trim();
    if (!content || this.sending()) return;
    this.sending.set(true);
    this.messagesService.send(this.orderId(), content).subscribe({
      next: (msg) => {
        this.messages.update((list) => [...list, msg]);
        this.draft = '';
        this.sending.set(false);
        this.scrollToBottom();
      },
      error: () => this.sending.set(false),
    });
  }

  isMine(m: ChatMessage): boolean {
    return m.senderId === this.authService.getCurrentUser()?.id;
  }

  senderName(m: ChatMessage): string {
    const first = m.sender?.firstName;
    return first ?? 'Interlocuteur';
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.scrollEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
