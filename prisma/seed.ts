import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // SAFETY CHECK: NEVER RUN SEED IN PRODUCTION
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: Database seed script must NEVER be executed in a production environment.');
  }

  console.log('Seeding development database with fictional test personas...');

  // 1. Clean existing test data in reverse dependency order
  await prisma.auditLog.deleteMany();
  await prisma.membershipBranchAccess.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.member.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  // 2. Primary Test Tenant: Suvarna Jewellers Mumbai
  const suvarnaOrg = await prisma.organization.create({
    data: {
      name: 'Suvarna Jewellers Mumbai',
      slug: 'suvarna-mumbai',
      legalName: 'Suvarna Jewellery Retail Pvt. Ltd.',
      gstin: '27AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      currency: 'INR',
    },
  });

  // 3. Branches for Suvarna
  const fortBranch = await prisma.branch.create({
    data: {
      organizationId: suvarnaOrg.id,
      name: 'Fort Main Showroom',
      code: 'FORT',
      addressLine1: '124 Heritage Chambers, Fort',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '+91 22 2200 0001',
      isMainBranch: true,
      isActive: true,
    },
  });

  const vashiBranch = await prisma.branch.create({
    data: {
      organizationId: suvarnaOrg.id,
      name: 'Navi Mumbai Studio',
      code: 'VASHI',
      addressLine1: 'Sector 17, Vashi',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      pincode: '400703',
      phone: '+91 22 2789 0002',
      isMainBranch: false,
      isActive: true,
    },
  });

  // 4. Test Personas for Suvarna
  // Note: Password hashes are development-only placeholders for local automated verification.
  const users = [
    {
      name: 'Anil Mehta (Owner)',
      email: 'owner@suvarna.test',
      role: 'OWNER',
      branches: [fortBranch.id, vashiBranch.id],
      defaultBranch: fortBranch.id,
    },
    {
      name: 'Pooja Verma (Store Manager)',
      email: 'manager@suvarna.test',
      role: 'MANAGER',
      branches: [fortBranch.id],
      defaultBranch: fortBranch.id,
    },
    {
      name: 'Ramesh Iyer (Chartered Accountant)',
      email: 'accountant@suvarna.test',
      role: 'ACCOUNTANT',
      branches: [fortBranch.id, vashiBranch.id],
      defaultBranch: fortBranch.id,
    },
    {
      name: 'Maya Patil (Sales Associate)',
      email: 'sales@suvarna.test',
      role: 'SALES_STAFF',
      branches: [fortBranch.id],
      defaultBranch: fortBranch.id,
    },
  ];

  for (const u of users) {
    const user = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        emailVerified: true,
      },
    });

    const member = await prisma.member.create({
      data: {
        organizationId: suvarnaOrg.id,
        userId: user.id,
        role: u.role,
        status: 'ACTIVE',
      },
    });

    for (const bId of u.branches) {
      await prisma.membershipBranchAccess.create({
        data: {
          memberId: member.id,
          branchId: bId,
          isDefault: bId === u.defaultBranch,
        },
      });
    }
  }

  // 5. Secondary Tenant (For Cross-Tenant Boundary Security Tests)
  const otherOrg = await prisma.organization.create({
    data: {
      name: 'Kalyan Test Jewellers',
      slug: 'kalyan-test',
      legalName: 'Kalyan Test Enterprises LLP',
      gstin: '27BBBBB1111B1Z2',
      pan: 'BBBBB1111B',
      currency: 'INR',
    },
  });

  const thaneBranch = await prisma.branch.create({
    data: {
      organizationId: otherOrg.id,
      name: 'Thane Store',
      code: 'THANE',
      city: 'Thane',
      state: 'Maharashtra',
      isMainBranch: true,
      isActive: true,
    },
  });

  const otherUser = await prisma.user.create({
    data: {
      name: 'Dev Test (Other Tenant Owner)',
      email: 'owner@kalyan.test',
      emailVerified: true,
    },
  });

  const otherMember = await prisma.member.create({
    data: {
      organizationId: otherOrg.id,
      userId: otherUser.id,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  await prisma.membershipBranchAccess.create({
    data: {
      memberId: otherMember.id,
      branchId: thaneBranch.id,
      isDefault: true,
    },
  });

  console.log('Seeding completed successfully!');
  console.log(`- Tenant 1: ${suvarnaOrg.name} (${suvarnaOrg.id}) with 2 branches and 4 staff personas`);
  console.log(`- Tenant 2: ${otherOrg.name} (${otherOrg.id}) with 1 branch for isolation testing`);
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
