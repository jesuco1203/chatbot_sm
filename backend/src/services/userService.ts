import { pool } from './db';

export interface UserRecord {
  phoneNumber: string;
  name?: string | null;
  email?: string | null;
  address?: string | null;
}

export const upsertUser = async ({ phoneNumber, name, email, address }: UserRecord) => {
  await pool.query(
    `
    INSERT INTO users (phone_number, name, email, address)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (phone_number)
    DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      address = EXCLUDED.address,
      updated_at = NOW();
    `,
    [phoneNumber, name ?? null, email ?? null, address ?? null]
  );
};

export const getUserByPhone = async (phoneNumber: string) => {
  console.log(`👤 Buscando datos de cliente para: ${phoneNumber}...`);
  const result = await pool.query(
    'SELECT phone_number, name, email, address FROM users WHERE phone_number = $1',
    [phoneNumber]
  );
  if (result.rowCount === 0) {
    console.log('👻 Cliente no encontrado en tabla users.');
    return null;
  }
  const row = result.rows[0];
  console.log(`🎉 Cliente encontrado: ${row.name} (${row.address})`);
  return {
    phone: row.phone_number as string,
    name: row.name as string | null,
    email: row.email as string | null,
    address: row.address as string | null
  };
};
