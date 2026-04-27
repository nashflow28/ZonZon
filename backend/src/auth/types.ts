export interface AuthenticatedUser {
  id: string;
  role: 'ADMIN' | 'CLIENT' | 'LIVREUR' | 'COMMERCANT';
  phone: string;
  firstName: string;
  lastName: string;
  // sub utilisé dans certains payloads JWT bruts
  sub?: string;
}
