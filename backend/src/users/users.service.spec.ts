import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';

const mockUsersRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
});

const mockVehiclesRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: ReturnType<typeof mockUsersRepo>;

  beforeEach(async () => {
    usersRepository = mockUsersRepo();
    const vehiclesRepository = mockVehiclesRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Vehicle), useValue: vehiclesRepository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('softDelete', () => {
    it('appelle softDelete du repo et renvoie ok', async () => {
      usersRepository.softDelete.mockResolvedValue({ affected: 1 } as any);

      const res = await service.softDelete('user-1');

      expect(usersRepository.softDelete).toHaveBeenCalledWith('user-1');
      expect(res).toEqual({ ok: true });
    });
  });

  describe('restore', () => {
    it('appelle restore du repo et renvoie ok', async () => {
      usersRepository.restore.mockResolvedValue({ affected: 1 } as any);

      const res = await service.restore('user-1');

      expect(usersRepository.restore).toHaveBeenCalledWith('user-1');
      expect(res).toEqual({ ok: true });
    });
  });
});
