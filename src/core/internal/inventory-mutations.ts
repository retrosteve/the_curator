import type { Car } from '@/data/car-database';
import { cloneCar } from '@/core/internal/state-clone';

export function replaceCarById(params: {
  inventory: Car[];
  updatedCar: Car;
}): boolean {
  const index = params.inventory.findIndex((car) => car.id === params.updatedCar.id);
  if (index === -1) return false;

  params.inventory[index] = cloneCar(params.updatedCar);
  return true;
}

export function removeCarById(inventory: Car[], carId: string): boolean {
  const index = inventory.findIndex((car) => car.id === carId);
  if (index === -1) return false;

  inventory.splice(index, 1);
  return true;
}
