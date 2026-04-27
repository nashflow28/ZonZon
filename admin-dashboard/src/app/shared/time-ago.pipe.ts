import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formatte une date ISO en texte relatif français : "il y a 5 min".
 * Léger, sans dépendance externe.
 */
@Pipe({
  name: 'timeAgo',
  standalone: true,
  pure: true
})
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return '';

    const diffMs = Date.now() - date.getTime();
    const sec = Math.round(diffMs / 1000);

    if (sec < 10) return "à l'instant";
    if (sec < 60) return `il y a ${sec} s`;

    const min = Math.round(sec / 60);
    if (min < 60) return `il y a ${min} min`;

    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;

    const d = Math.round(h / 24);
    if (d < 7) return `il y a ${d} j`;

    const w = Math.round(d / 7);
    if (w < 5) return `il y a ${w} sem.`;

    const mo = Math.round(d / 30);
    if (mo < 12) return `il y a ${mo} mois`;

    const y = Math.round(d / 365);
    return `il y a ${y} an${y > 1 ? 's' : ''}`;
  }
}
