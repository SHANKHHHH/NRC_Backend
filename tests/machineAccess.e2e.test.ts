import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';

describe('Machine Access Control & High-Demand Mode (Corrugation)', () => {
  const machineC01 = { id: 'C01', unit: 'U1', machineCode: 'CR-01', machineType: 'corrugation', description: 'Corrugation 01', type: 'corrugator', capacity: 100 };
  const machineC02 = { id: 'C02', unit: 'U1', machineCode: 'CR-02', machineType: 'corrugation', description: 'Corrugation 02', type: 'corrugator', capacity: 100 };

  const userX = { id: 'USER_X', email: `corrx_${Date.now()}@test.com`, password: 'pass1234', roles: ['corrugator'], name: 'Corr X' };
  const userY = { id: 'USER_Y', email: `corry_${Date.now()}@test.com`, password: 'pass1234', roles: ['corrugator'], name: 'Corr Y' };

  let tokenX = '';
  let tokenY = '';

  let nrcA = '';
  let nrcB = '';

  beforeAll(async () => {
    // Clean minimal related data
    await prisma.userMachine.deleteMany({});
    await prisma.jobStep.deleteMany({});
    await prisma.jobPlanning.deleteMany({});
    await prisma.purchaseOrderMachine.deleteMany({});
    await prisma.purchaseOrder.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.machine.deleteMany({});
    await prisma.user.deleteMany({});

    // Create machines
    await prisma.machine.create({ data: machineC01 });
    await prisma.machine.create({ data: machineC02 });

    // Seed users with bcrypt password and JSON roles
    const pwHashX = await bcrypt.hash(userX.password, 12);
    const pwHashY = await bcrypt.hash(userY.password, 12);
    await prisma.user.create({ data: { id: userX.id, email: userX.email, password: pwHashX, role: JSON.stringify(userX.roles), isActive: true, name: userX.name } });
    await prisma.user.create({ data: { id: userY.id, email: userY.email, password: pwHashY, role: JSON.stringify(userY.roles), isActive: true, name: userY.name } });

    // Assign machines to users
    await prisma.userMachine.create({ data: { userId: userX.id, machineId: machineC01.id } });
    await prisma.userMachine.create({ data: { userId: userY.id, machineId: machineC02.id } });

    // Create two jobs
    const jobA = await prisma.job.create({ data: { nrcJobNo: `TEST-CORR-A-${Date.now()}`, styleItemSKU: 'SKU-A', customerName: 'CustA', jobDemand: 'medium' } });
    const jobB = await prisma.job.create({ data: { nrcJobNo: `TEST-CORR-B-${Date.now()}`, styleItemSKU: 'SKU-B', customerName: 'CustB', jobDemand: 'medium' } });
    nrcA = jobA.nrcJobNo;
    nrcB = jobB.nrcJobNo;

    // Create JobPlanning for both with Corrugation step bound to machine C01/C02
    await prisma.jobPlanning.create({
      data: {
        nrcJobNo: nrcA,
        jobDemand: 'medium',
        steps: {
          create: [
            { stepNo: 1, stepName: 'Corrugation', machineDetails: [{ machineId: machineC01.id, unit: machineC01.unit, machineCode: machineC01.machineCode, machineType: machineC01.machineType }] },
          ]
        }
      }
    });

    await prisma.jobPlanning.create({
      data: {
        nrcJobNo: nrcB,
        jobDemand: 'medium',
        steps: {
          create: [
            { stepNo: 1, stepName: 'Corrugation', machineDetails: [{ machineId: machineC02.id, unit: machineC02.unit, machineCode: machineC02.machineCode, machineType: machineC02.machineType }] },
          ]
        }
      }
    });

    // Login user X & Y
    const resX = await request(app).post('/api/auth/login').send({ email: userX.email, password: userX.password });
    tokenX = resX.body && (resX.body.acessToken || resX.body.accessToken || '');
    const resY = await request(app).post('/api/auth/login').send({ email: userY.email, password: userY.password });
    tokenY = resY.body && (resY.body.acessToken || resY.body.accessToken || '');
    expect(tokenX).toBeTruthy();
    expect(tokenY).toBeTruthy();
  });

  afterAll(async () => {
    await prisma.userMachine.deleteMany({});
    await prisma.jobStep.deleteMany({});
    await prisma.jobPlanning.deleteMany({});
    await prisma.purchaseOrderMachine.deleteMany({});
    await prisma.purchaseOrder.deleteMany({});
    await prisma.job.deleteMany({ where: { nrcJobNo: { startsWith: 'TEST-CORR-' } } });
    await prisma.machine.deleteMany({ where: { id: { in: [machineC01.id, machineC02.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userX.id, userY.id] } } });
    await prisma.$disconnect();
  });

  test('Normal mode: User X sees only C01 job (nrcA); User Y sees only C02 job (nrcB)', async () => {
    // User X
    const listX = await request(app)
      .get('/api/job-planning')
      .set('Authorization', `Bearer ${tokenX}`)
      .expect(200);
    const jobsX = (listX.body && listX.body.data) || [];
    const jobNosX = jobsX.map((p) => p.nrcJobNo);
    expect(jobNosX).toContain(nrcA);
    expect(jobNosX).not.toContain(nrcB);

    // User Y
    const listY = await request(app)
      .get('/api/job-planning')
      .set('Authorization', `Bearer ${tokenY}`)
      .expect(200);
    const jobsY = (listY.body && listY.body.data) || [];
    const jobNosY = jobsY.map((p) => p.nrcJobNo);
    expect(jobNosY).toContain(nrcB);
    expect(jobNosY).not.toContain(nrcA);
  });

  test('High-demand: Both users see both Corrugation jobs', async () => {
    // Enable high-demand on both jobs
    await prisma.job.update({ where: { nrcJobNo: nrcA }, data: { jobDemand: 'high' } });
    await prisma.job.update({ where: { nrcJobNo: nrcB }, data: { jobDemand: 'high' } });

    // User X now sees both
    const listX = await request(app)
      .get('/api/job-planning')
      .set('Authorization', `Bearer ${tokenX}`)
      .expect(200);
    const jobNosX = ((listX.body && listX.body.data) || []).map((p) => p.nrcJobNo);
    expect(jobNosX).toEqual(expect.arrayContaining([nrcA, nrcB]));

    // User Y now sees both
    const listY = await request(app)
      .get('/api/job-planning')
      .set('Authorization', `Bearer ${tokenY}`)
      .expect(200);
    const jobNosY = ((listY.body && listY.body.data) || []).map((p) => p.nrcJobNo);
    expect(jobNosY).toEqual(expect.arrayContaining([nrcA, nrcB]));
  });
});


