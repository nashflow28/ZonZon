import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingConfig } from '../entities/pricing-config.entity';
import { UpdatePricingDto } from './dto/update-pricing.dto';

const SINGLETON_ID = 1;
const DEFAULT_PRICE_PER_KM = 200;
const CACHE_TTL_MS = 60 * 1000;

/**
 * Priorité 3 backlog V1 (Lot 1) : tarif au km configurable par l'admin.
 *
 * `pricing_config` est un singleton (une seule ligne, id=1). `getConfig()`
 * fait un get-or-create pour tolérer un environnement où la migration de
 * seed n'aurait pas encore tourné (tests, DB fraîche).
 *
 * Petit cache mémoire (~60s) sur la config pour éviter une requête DB à
 * chaque estimation de prix (`buildOrderPricing`/`estimateRoute` sont
 * appelés très fréquemment). Invalidé immédiatement sur `updateConfig`.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private cache: { config: PricingConfig; at: number } | null = null;

  constructor(
    @InjectRepository(PricingConfig)
    private readonly pricingRepo: Repository<PricingConfig>,
  ) {}

  private invalidateCache() {
    this.cache = null;
  }

  async getConfig(): Promise<PricingConfig> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.config;
    }

    let config = await this.pricingRepo.findOne({
      where: { id: SINGLETON_ID },
    });

    if (!config) {
      this.logger.warn(
        'pricing_config vide — création de la ligne par défaut (get-or-create)',
      );
      config = this.pricingRepo.create({
        id: SINGLETON_ID,
        pricePerKm: DEFAULT_PRICE_PER_KM,
        minPriceFcfa: null,
      });
      config = await this.pricingRepo.save(config);
    }

    this.cache = { config, at: Date.now() };
    return config;
  }

  async getPricePerKm(): Promise<number> {
    const config = await this.getConfig();
    return config.pricePerKm;
  }

  async getMinPriceFcfa(): Promise<number | null> {
    const config = await this.getConfig();
    return config.minPriceFcfa;
  }

  async updateConfig(dto: UpdatePricingDto): Promise<PricingConfig> {
    const config = await this.getConfig();
    if (dto.pricePerKm !== undefined) {
      config.pricePerKm = dto.pricePerKm;
    }
    if (dto.minPriceFcfa !== undefined) {
      config.minPriceFcfa = dto.minPriceFcfa;
    }
    const saved = await this.pricingRepo.save(config);
    this.invalidateCache();
    return saved;
  }
}
