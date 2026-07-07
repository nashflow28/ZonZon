import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OrdersService, AvailableDriver, Order } from './orders.service';
import { environment } from '../environments/environment';

describe('OrdersService', () => {
  let service: OrdersService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}${environment.apiPrefix}/orders`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(OrdersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('updatePaymentStatus envoie un PATCH sur /orders/:id/payment-status', () => {
    const orderId = 'order-123';
    const mockOrder = { id: orderId, paymentStatus: 'PAID' } as Order;

    service.updatePaymentStatus(orderId, 'PAID').subscribe((res) => {
      expect(res).toEqual(mockOrder);
    });

    const req = httpMock.expectOne(`${base}/${orderId}/payment-status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ paymentStatus: 'PAID' });
    req.flush(mockOrder);
  });

  it('assignDriver envoie un PATCH sur /orders/:id/assign avec le livreurId', () => {
    const orderId = 'order-456';
    const livreurId = 'driver-789';
    const mockOrder = { id: orderId, status: 'ACCEPTED' } as Order;

    service.assignDriver(orderId, livreurId).subscribe((res) => {
      expect(res).toEqual(mockOrder);
    });

    const req = httpMock.expectOne(`${base}/${orderId}/assign`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ livreurId });
    req.flush(mockOrder);
  });

  it('getAvailableDrivers appelle GET /orders/available-drivers sans params si lat/lng absents', () => {
    const mockDrivers: AvailableDriver[] = [
      { id: 'd1', firstName: 'Awa', lastName: 'K.', isAffiliated: false }
    ];

    service.getAvailableDrivers().subscribe((res) => {
      expect(res).toEqual(mockDrivers);
    });

    const req = httpMock.expectOne(`${base}/available-drivers`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('lat')).toBe(false);
    expect(req.request.params.has('lng')).toBe(false);
    req.flush(mockDrivers);
  });

  it('getAvailableDrivers envoie lat/lng en query params quand fournis', () => {
    const mockDrivers: AvailableDriver[] = [];

    service.getAvailableDrivers(6.13, 1.22).subscribe((res) => {
      expect(res).toEqual(mockDrivers);
    });

    const req = httpMock.expectOne(
      (r) => r.url === `${base}/available-drivers` && r.params.get('lat') === '6.13' && r.params.get('lng') === '1.22'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockDrivers);
  });
});
