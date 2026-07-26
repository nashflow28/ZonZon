import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { PhoneVerification } from '../entities/phone-verification.entity';

type VerificationProof = { purpose: 'phone-verification'; phone: string };

/**
 * Le jeton de preuve OTP ne doit JAMAIS être signé avec le secret des jetons
 * d'accès : sa payload n'a pas de `sub`, et un `JwtStrategy` qui ne vérifie pas
 * la présence de `sub` l'accepterait comme un jeton d'accès valide.
 * On dérive donc un secret distinct du `JWT_SECRET` (pas de variable d'env
 * supplémentaire à provisionner) et on isole l'audience.
 */
const OTP_PROOF_AUDIENCE = 'zonzon:otp-proof';

function otpProofSecret(): string {
  const base = process.env.JWT_SECRET;
  if (!base) {
    throw new Error('JWT_SECRET manquant dans la configuration');
  }
  return `${base}::otp-proof`;
}

@Injectable()
export class WhatsappOtpService {
  private readonly logger = new Logger(WhatsappOtpService.name);

  constructor(
    @InjectRepository(PhoneVerification)
    private readonly repository: Repository<PhoneVerification>,
    private readonly jwt: JwtService,
  ) {}

  isEnabled(): boolean {
    return process.env.WHATSAPP_OTP_ENABLED === 'true';
  }

  async request(
    phone: string,
  ): Promise<{ sent: true; expiresInSeconds: number }> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        "La validation WhatsApp n'est pas encore activée",
      );
    }

    const latest = await this.repository.findOne({
      where: { phone },
      order: { createdAt: 'DESC' },
    });
    const resendDelay = Number(process.env.WHATSAPP_OTP_RESEND_SECONDS ?? 60);
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() < resendDelay * 1000
    ) {
      throw new HttpException(
        `Attendez ${resendDelay} secondes avant de renvoyer un code`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlSeconds = Number(process.env.WHATSAPP_OTP_TTL_SECONDS ?? 300);
    const challenge = this.repository.create({
      phone,
      codeHash: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      attempts: 0,
      consumedAt: null,
    });
    await this.sendViaMeta(phone, code);
    await this.repository.save(challenge);
    return { sent: true, expiresInSeconds: ttlSeconds };
  }

  async verify(
    phone: string,
    code: string,
  ): Promise<{ verificationToken: string }> {
    const challenge = await this.repository.findOne({
      where: { phone, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Code invalide ou expiré');
    }
    if (challenge.attempts >= 5) {
      throw new HttpException(
        'Trop de tentatives. Demandez un nouveau code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    challenge.attempts += 1;
    const valid = await bcrypt.compare(code, challenge.codeHash);
    if (!valid) {
      await this.repository.save(challenge);
      throw new UnauthorizedException('Code invalide ou expiré');
    }
    challenge.consumedAt = new Date();
    await this.repository.save(challenge);
    return {
      verificationToken: this.jwt.sign(
        { purpose: 'phone-verification', phone } satisfies VerificationProof,
        {
          expiresIn: '10m',
          secret: otpProofSecret(),
          audience: OTP_PROOF_AUDIENCE,
        },
      ),
    };
  }

  assertProof(phone: string, token?: string): void {
    if (!this.isEnabled()) return;
    if (!token) throw new BadRequestException('Validation WhatsApp requise');
    try {
      const payload = this.jwt.verify<VerificationProof>(token, {
        secret: otpProofSecret(),
        audience: OTP_PROOF_AUDIENCE,
      });
      if (payload.purpose !== 'phone-verification' || payload.phone !== phone) {
        throw new Error('proof mismatch');
      }
    } catch {
      throw new UnauthorizedException(
        'Validation WhatsApp invalide ou expirée',
      );
    }
  }

  private async sendViaMeta(phone: string, code: string): Promise<void> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const template = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
    if (!token || !phoneNumberId || !template) {
      this.logger.error('Secrets WhatsApp Cloud API incomplets');
      throw new ServiceUnavailableException(
        'Service WhatsApp temporairement indisponible',
      );
    }
    const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v23.0';
    const language = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE ?? 'fr';
    try {
      await axios.post(
        `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phone.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: code }] },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
      );
    } catch (error) {
      this.logger.warn(
        `Envoi OTP WhatsApp échoué: ${axios.isAxiosError(error) ? error.response?.status : 'erreur réseau'}`,
      );
      throw new ServiceUnavailableException(
        'Impossible d’envoyer le code WhatsApp',
      );
    }
  }
}
