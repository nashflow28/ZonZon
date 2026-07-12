import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OrdersService } from './orders.service';

describe('OrdersService price negotiation', () => {
  let service: OrdersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OrdersService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OrdersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envoie la proposition du livreur', () => {
    service.proposePrice('order-1', 1250).subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url.endsWith('/orders/order-1/price-proposals'),
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ priceFcfa: 1250 });
    request.flush({ id: 'proposal-1', priceFcfa: 1250, status: 'PENDING' });
  });

  it('charge la proposition en attente', () => {
    service.pendingPriceProposal('order-1').subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url.endsWith('/orders/order-1/price-proposal'),
    );
    expect(request.request.method).toBe('GET');
    request.flush(null);
  });

  it('accepte la proposition et synchronise le cache', () => {
    service.respondToPriceProposal('order-1', 'proposal-1', true).subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url.endsWith('/orders/order-1/price-proposal/proposal-1'),
    );
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ accept: true });
    request.flush({
      accepted: true,
      order: { id: 'order-1', status: 'ACCEPTED', priceFcfa: 1250 },
    });

    expect(service.findCached('order-1')?.priceFcfa).toBe(1250);
  });
});
