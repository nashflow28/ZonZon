import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';

export interface MapLatLng {
  lat: number;
  lng: number;
}

/**
 * Carte réutilisable Leaflet/OpenStreetMap (CDC §12 : OSM/Leaflet accepté
 * pour le web). Affiche retrait/livraison/position livreur + tracé, et peut
 * être rendue "cliquable" pour poser un marqueur (écran Accueil).
 *
 * Icônes en `divIcon` (SVG inline) plutôt que les images par défaut Leaflet :
 * évite les soucis classiques de résolution de chemin des assets
 * `marker-icon.png` sous un bundler esbuild/Angular, et permet de reprendre
 * directement les couleurs `--zz-*` de la marque.
 */
@Component({
  selector: 'app-order-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #mapEl class="map-root" [class.map-root--tappable]="tappable"></div>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .map-root {
        width: 100%;
        height: 100%;
        min-height: 220px;
        border-radius: 16px;
        overflow: hidden;
        background: var(--zz-card);
      }
    `,
  ],
})
export class OrderMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  @Input() pickup: MapLatLng | null = null;
  @Input() delivery: MapLatLng | null = null;
  @Input() driverPosition: MapLatLng | null = null;
  /** Tracé routier — paires [lat, lng] (format renvoyé par `POST /orders/estimate`). */
  @Input() polyline: number[][] | null = null;
  /** Si `true`, un tap sur la carte émet `mapTap`. */
  @Input() tappable = false;

  @Output() mapTap = new EventEmitter<MapLatLng>();

  private map: L.Map | null = null;
  private pickupMarker: L.Marker | null = null;
  private deliveryMarker: L.Marker | null = null;
  private driverMarker: L.Marker | null = null;
  private polylineLayer: L.Polyline | null = null;
  private viewFitted = false;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      zoomControl: true,
      attributionControl: true,
    }).setView([6.1319, 1.2228], 13); // Lomé par défaut tant qu'aucun point n'est connu.

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (!this.tappable) return;
      this.mapTap.emit({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    this.redraw();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.map) this.redraw();
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  private redraw(): void {
    if (!this.map) return;

    this.pickupMarker?.remove();
    this.pickupMarker = this.pickup
      ? L.marker([this.pickup.lat, this.pickup.lng], {
          icon: this.dotIcon('var(--zz-sky, #2E90FA)'),
        }).addTo(this.map)
      : null;

    this.deliveryMarker?.remove();
    this.deliveryMarker = this.delivery
      ? L.marker([this.delivery.lat, this.delivery.lng], {
          icon: this.dotIcon('var(--zz-go, #0FB271)'),
        }).addTo(this.map)
      : null;

    this.driverMarker?.remove();
    this.driverMarker = this.driverPosition
      ? L.marker([this.driverPosition.lat, this.driverPosition.lng], {
          icon: this.dotIcon('var(--zz-mango, #FF9E1B)', true),
        }).addTo(this.map)
      : null;

    this.polylineLayer?.remove();
    this.polylineLayer =
      this.polyline && this.polyline.length > 1
        ? L.polyline(
            this.polyline.map(([lat, lng]) => [lat, lng] as [number, number]),
            { color: '#2E90FA', weight: 4, opacity: 0.85 }
          ).addTo(this.map)
        : null;

    this.fitToContent();
  }

  private fitToContent(): void {
    if (!this.map) return;
    const points: L.LatLngExpression[] = [];
    if (this.pickup) points.push([this.pickup.lat, this.pickup.lng]);
    if (this.delivery) points.push([this.delivery.lat, this.delivery.lng]);
    if (this.driverPosition) points.push([this.driverPosition.lat, this.driverPosition.lng]);

    if (points.length === 0) return;
    if (points.length === 1) {
      this.map.setView(points[0], 15);
      return;
    }
    this.map.fitBounds(L.latLngBounds(points), { padding: [32, 32] });
    this.viewFitted = true;
  }

  private dotIcon(color: string, pulse = false): L.DivIcon {
    const size = pulse ? 20 : 26;
    return L.divIcon({
      className: 'zz-map-marker',
      html: `<span style="
        display:block;width:${size}px;height:${size}px;border-radius:50%;
        background:${color};border:3px solid #0C1A22;
        box-shadow:0 0 0 2px ${color}55;
      "></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }
}
