import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('reports')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('weekly')
  weekly(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.weeklyReport(from, to);
  }

  @Post('commissions/:id/pay')
  payCommission(@Param('id') id: string) {
    return this.reportsService.markPaid(id);
  }
}
