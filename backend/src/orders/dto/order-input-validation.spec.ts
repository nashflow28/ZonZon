import { validate } from 'class-validator';

import { SendMessageDto } from '../../messages/dto/send-message.dto';
import { CreateMerchantOrderDto } from './create-merchant-order.dto';
import { CreateOrderDto } from './create-order.dto';

describe('Order and message input validation', () => {
  it('rejects whitespace-only order fields before services trim them', async () => {
    const dto = Object.assign(new CreateOrderDto(), {
      pickupAddress: '   ',
      deliveryAddress: '\t',
      description: '\n',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects whitespace-only merchant order fields', async () => {
    const dto = Object.assign(new CreateMerchantOrderDto(), {
      pickupAddress: ' ',
      deliveryAddress: ' ',
      description: ' ',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects a whitespace-only message', async () => {
    const dto = Object.assign(new SendMessageDto(), { content: '  \n  ' });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
