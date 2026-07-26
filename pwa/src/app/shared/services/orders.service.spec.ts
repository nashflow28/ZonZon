import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OrdersService } from './orders.service';

describe('OrdersService direct acceptance', () => {
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

  it('accepte directement la course et synchronise le cache', () => {
    service.accept('order-1').subscribe();
    const request = http.expectOne((candidate) => candidate.url.endsWith('/orders/order-1/accept'));
    expect(request.request.method).toBe('POST');
    request.flush({ id: 'order-1', status: 'ACCEPTED', priceFcfa: 500 });
    expect(service.findCached('order-1')?.priceFcfa).toBe(500);
  });
});
