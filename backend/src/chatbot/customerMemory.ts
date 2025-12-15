export interface CustomerRecord {
  phone: string;
  name: string;
  email: string;
  address: string;
  isNew: boolean;
}

const seedCustomers: CustomerRecord[] = [
  {
    phone: '999888777',
    name: 'Carlos Pérez',
    email: 'carlos@example.com',
    address: 'Av. Larco 123, Miraflores',
    isNew: false
  },
  {
    phone: '123456789',
    name: 'María Rodríguez',
    email: 'maria@example.com',
    address: 'Calle Las Begonias 456, San Isidro',
    isNew: false
  }
];

const customerStore = new Map<string, CustomerRecord>(
  seedCustomers.map((record) => [record.phone, record])
);

export const findCustomer = (phone: string) => customerStore.get(phone);

export const upsertCustomer = (record: CustomerRecord) => {
  customerStore.set(record.phone, { ...record, isNew: false });
  return customerStore.get(record.phone)!;
};
