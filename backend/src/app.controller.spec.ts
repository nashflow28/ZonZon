import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return a health status object with status "ok"', () => {
      const result = appController.getHealth() as {
        status: string;
        uptime: number;
        timestamp: string;
        env: string;
      };

      expect(result).toEqual(
        expect.objectContaining({
          status: 'ok',
          uptime: expect.any(Number),
          timestamp: expect.any(String),
          env: expect.any(String),
        }),
      );
    });
  });
});
