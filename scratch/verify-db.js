const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('--- 1. MIGRATIONS IN _prisma_migrations ---');
  const migrations = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY started_at ASC
  `);
  console.log(migrations);

  console.log('\n--- 2. PUBLIC TABLES ---');
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log(tables.map(t => t.table_name));

  console.log('\n--- 3. CHECK CONSTRAINTS ON ORNAMENTS ---');
  const checkConstraints = await prisma.$queryRawUnsafe(`
    SELECT conname, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'ornaments' AND c.contype = 'c'
    ORDER BY conname
  `);
  console.log(checkConstraints);

  console.log('\n--- 4. FOREIGN KEYS ON NEW TABLES ---');
  const foreignKeys = await prisma.$queryRawUnsafe(`
    SELECT 
      conname,
      t.relname AS table_name,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname IN ('products', 'ornaments', 'stock_movements') AND c.contype = 'f'
    ORDER BY t.relname, conname
  `);
  console.log(foreignKeys);

  console.log('\n--- 5. INDEXES ON NEW TABLES ---');
  const indexes = await prisma.$queryRawUnsafe(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN ('products', 'ornaments', 'stock_movements')
    ORDER BY tablename, indexname
  `);
  console.log(indexes);

  console.log('\n--- 6. SEED DATA COUNTS (VERIFY UNTOUCHED) ---');
  const counts = {
    organizations: await prisma.organization.count(),
    branches: await prisma.branch.count(),
    users: await prisma.user.count(),
    members: await prisma.member.count(),
    accounts: await prisma.account.count(),
    products: await prisma.product.count(),
    ornaments: await prisma.ornament.count(),
    stockMovements: await prisma.stockMovement.count(),
  };
  console.log(counts);
}

verify()
  .catch(e => {
    console.error('Error during verification:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
