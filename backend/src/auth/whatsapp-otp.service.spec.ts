import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { WhatsappOtpService } from './whatsapp-otp.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('WhatsappOtpService', () => {
  const repository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const jwt = { sign: jest.fn(), verify: jest.fn() };
  let service: WhatsappOtpService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WHATSAPP_OTP_ENABLED;
    service = new WhatsappOtpService(repository as never, jwt as never);
  });

  it('reste désactivé par défaut et ne contacte pas Meta', async () => {
    expect(service.isEnabled()).toBe(false);
    await expect(service.request('+22890000000')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('refuse un challenge expiré', async () => {
    repository.findOne.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1),
      consumedAt: null,
    });
    await expect(
      service.verify('+22890000000', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('consomme le challenge et retourne une preuve courte', async () => {
    const challenge = {
      phone: '+22890000000',
      codeHash: 'hash',
      attempts: 0,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    repository.findOne.mockResolvedValue(challenge);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwt.sign.mockReturnValue('proof.jwt');

    await expect(service.verify(challenge.phone, '123456')).resolves.toEqual({
      verificationToken: 'proof.jwt',
    });
    expect(challenge.consumedAt).toBeInstanceOf(Date);
    expect(jwt.sign).toHaveBeenCalledWith(
      { purpose: 'phone-verification', phone: challenge.phone },
      { expiresIn: '10m' },
    );
  });

  it('lie la preuve au numéro exact lorsque le contrôle est activé', () => {
    process.env.WHATSAPP_OTP_ENABLED = 'true';
    jwt.verify.mockReturnValue({
      purpose: 'phone-verification',
      phone: '+22890000000',
    });
    expect(() => service.assertProof('+22891111111', 'proof.jwt')).toThrow(
      UnauthorizedException,
    );
  });
});
