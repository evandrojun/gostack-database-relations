import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) throw new AppError('Customer not found');

    const existingProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existingProducts.length) throw new AppError('No product was found');

    const existingProductsIds = existingProducts.map(({ id }) => id);

    const hasMissingProduct = products.filter(
      ({ id }) => !existingProductsIds.includes(id),
    );

    if (hasMissingProduct.length)
      throw new AppError(`Could not find product ${hasMissingProduct[0].id}`);

    const insufficientQuantityProducts = products.filter(
      product =>
        existingProducts.filter(prod => prod.id === product.id)[0].quantity <
        product.quantity,
    );

    if (insufficientQuantityProducts.length)
      throw new AppError(
        `Product ${insufficientQuantityProducts[0].id} with insufficient quantity`,
      );

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existingProducts.filter(prod => prod.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        existingProducts.filter(prod => prod.id === product.product_id)[0]
          .quantity - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
