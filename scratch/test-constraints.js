const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runConstraintTests() {
  console.log('=== STARTING CONTROLLED DATABASE CONSTRAINT VERIFICATION ===');
  
  // Resolve test organizations & branches
  const suvarnaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } });
  const kalyanOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'kalyan-test' } });
  
  const fortBranch = await prisma.branch.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'FORT' } }
  });
  const thaneBranch = await prisma.branch.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: kalyanOrg.id, code: 'THANE' } }
  });

  const results = [];

  // Helper to test an operation inside an isolated raw transaction that always rolls back
  async function testConstraint({ name, expectedErrorPattern, sql, params }) {
    let caughtError = null;
    try {
      await prisma.$transaction(async (tx) => {
        // Run test query
        await tx.$queryRawUnsafe(sql, ...params);
        // If query unexpectedly succeeded, force rollback
        throw new Error('UNEXPECTED_SUCCESS_SHOULD_HAVE_FAILED');
      });
    } catch (err) {
      caughtError = err.message;
    }

    const passed = caughtError && caughtError.includes(expectedErrorPattern);
    results.push({
      test: name,
      passed: Boolean(passed),
      expectedErrorPattern,
      actualError: caughtError?.split('\n')[0] || 'NONE',
    });
    console.log(`${passed ? '✓' : '✗'} [${name}]: ${passed ? 'REJECTED AS EXPECTED' : 'FAILED'}`);
    if (!passed) {
      console.log('  Actual error:', caughtError);
    }
  }

  // Pre-create a temporary product for ornament FK tests
  const testProduct = await prisma.product.create({
    data: {
      organizationId: suvarnaOrg.id,
      sku: 'TEST-SKU-999',
      name: 'Constraint Test Pendant',
      category: 'Pendants',
    }
  });

  try {
    // 1. Zero gross weight rejection
    await testConstraint({
      name: '1. Rejection of zero gross weight (grossWeight = 0)',
      expectedErrorPattern: 'ornaments_gross_weight_gt_zero',
      sql: `
        INSERT INTO ornaments ("id", "organizationId", "branchId", "productId", "tagCode", "grossWeight", "stoneWeight", "netWeight", "status", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, 'TAG-TEST-1', 0.000, 0.000, 0.000, 'AVAILABLE', NOW())
      `,
      params: [suvarnaOrg.id, fortBranch.id, testProduct.id],
    });

    // 2. Negative gross weight rejection
    await testConstraint({
      name: '2. Rejection of negative gross weight (grossWeight = -5.000)',
      expectedErrorPattern: 'ornaments_gross_weight_gt_zero',
      sql: `
        INSERT INTO ornaments ("id", "organizationId", "branchId", "productId", "tagCode", "grossWeight", "stoneWeight", "netWeight", "status", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, 'TAG-TEST-2', -5.000, 0.000, -5.000, 'AVAILABLE', NOW())
      `,
      params: [suvarnaOrg.id, fortBranch.id, testProduct.id],
    });

    // 3. Negative stone weight rejection
    await testConstraint({
      name: '3. Rejection of negative stone weight (stoneWeight = -1.000)',
      expectedErrorPattern: 'ornaments_stone_weight_gte_zero',
      sql: `
        INSERT INTO ornaments ("id", "organizationId", "branchId", "productId", "tagCode", "grossWeight", "stoneWeight", "netWeight", "status", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, 'TAG-TEST-3', 10.000, -1.000, 11.000, 'AVAILABLE', NOW())
      `,
      params: [suvarnaOrg.id, fortBranch.id, testProduct.id],
    });

    // 4. Stone weight greater than gross weight rejection
    await testConstraint({
      name: '4. Rejection of stone weight > gross weight (stone: 8g, gross: 5g)',
      expectedErrorPattern: 'ornaments_weights_integrity',
      sql: `
        INSERT INTO ornaments ("id", "organizationId", "branchId", "productId", "tagCode", "grossWeight", "stoneWeight", "netWeight", "status", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, 'TAG-TEST-4', 5.000, 8.000, -3.000, 'AVAILABLE', NOW())
      `,
      params: [suvarnaOrg.id, fortBranch.id, testProduct.id],
    });

    // 5. Net weight mismatch rejection (net != gross - stone)
    await testConstraint({
      name: '5. Rejection of net weight mismatch (gross: 10g, stone: 2g, net: 7g)',
      expectedErrorPattern: 'ornaments_weights_integrity',
      sql: `
        INSERT INTO ornaments ("id", "organizationId", "branchId", "productId", "tagCode", "grossWeight", "stoneWeight", "netWeight", "status", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, 'TAG-TEST-5', 10.000, 2.000, 7.000, 'AVAILABLE', NOW())
      `,
      params: [suvarnaOrg.id, fortBranch.id, testProduct.id],
    });

    // 6. Cross-tenant branch reference rejection
    // Try to insert ornament for Suvarna org, but referencing Kalyan's Thane branch
    await testConstraint({
      name: '6. Rejection of cross-tenant branch reference (Suvarna org + Kalyan Thane branch)',
      expectedErrorPattern: 'ornaments_organizationId_branchId_fkey',
      sql: `
        INSERT INTO ornaments ("id", "organizationId", "branchId", "productId", "tagCode", "grossWeight", "stoneWeight", "netWeight", "status", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, 'TAG-TEST-6', 10.000, 0.000, 10.000, 'AVAILABLE', NOW())
      `,
      params: [suvarnaOrg.id, thaneBranch.id, testProduct.id],
    });

    // 7. Cross-tenant product reference rejection
    // Try to insert ornament for Kalyan org, referencing Suvarna's product
    await testConstraint({
      name: '7. Rejection of cross-tenant product reference (Kalyan org + Suvarna product)',
      expectedErrorPattern: 'ornaments_organizationId_productId_fkey',
      sql: `
        INSERT INTO ornaments ("id", "organizationId", "branchId", "productId", "tagCode", "grossWeight", "stoneWeight", "netWeight", "status", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, 'TAG-TEST-7', 10.000, 0.000, 10.000, 'AVAILABLE', NOW())
      `,
      params: [kalyanOrg.id, thaneBranch.id, testProduct.id],
    });

    // 8. Cross-tenant stock movement reference rejection
    // First create a valid ornament
    const validOrnament = await prisma.ornament.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        productId: testProduct.id,
        tagCode: 'TAG-VALID-1',
        grossWeight: 15.500,
        stoneWeight: 0.500,
        netWeight: 15.000,
        status: 'AVAILABLE',
      }
    });

    // Try to record stock movement under Kalyan org for Suvarna ornament
    await testConstraint({
      name: '8. Rejection of cross-tenant stock movement reference (Kalyan org + Suvarna ornament)',
      expectedErrorPattern: 'stock_movements_organizationId_ornamentId_fkey',
      sql: `
        INSERT INTO stock_movements ("id", "organizationId", "ornamentId", "movementType", "toBranchId")
        VALUES (gen_random_uuid()::text, $1, $2, 'INWARD', $3)
      `,
      params: [kalyanOrg.id, validOrnament.id, thaneBranch.id],
    });

    // Clean up valid ornament
    await prisma.ornament.delete({ where: { id: validOrnament.id } });

  } finally {
    // Clean up temporary test product
    await prisma.product.delete({ where: { id: testProduct.id } });
  }

  // Final check: confirm 0 test products, ornaments, or movements remain
  const remainingCounts = {
    products: await prisma.product.count(),
    ornaments: await prisma.ornament.count(),
    stockMovements: await prisma.stockMovement.count(),
  };

  console.log('\n=== VERIFICATION CLEANUP CONFIRMATION ===');
  console.log('Remaining inventory records in DB (MUST BE ALL 0):', remainingCounts);

  const allPassed = results.every(r => r.passed) && 
                    remainingCounts.products === 0 && 
                    remainingCounts.ornaments === 0 && 
                    remainingCounts.stockMovements === 0;

  console.log(`\nALL 8 CONTROLLED CONSTRAINT TESTS PASSED: ${allPassed ? 'YES ✓' : 'NO ✗'}`);
}

runConstraintTests()
  .catch(e => {
    console.error('Constraint test failed with unexpected error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
