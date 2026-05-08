const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

const seedUsers = [
  {
    name: 'Worker Test',
    email: 'worker@test.com',
    password: 'test123',
    role: 'worker',
    employeeId: 'EMP001',
    phone: '9876543210',
    department: 'Construction',
    isEmailVerified: true,
    isActive: true,
    experienceLevel: 'junior',
    safetyScore: 50,
  },
  {
    name: 'Worker Senior',
    email: 'worker2@test.com',
    password: 'test123',
    role: 'worker',
    employeeId: 'EMP005',
    phone: '9876543214',
    department: 'Construction',
    isEmailVerified: true,
    isActive: true,
    experienceLevel: 'senior',
    safetyScore: 75,
  },
  {
    name: 'Supervisor Test',
    email: 'supervisor@test.com',
    password: 'test123',
    role: 'supervisor',
    employeeId: 'EMP002',
    phone: '9876543211',
    department: 'Construction',
    isEmailVerified: true,
    isActive: true,
    experienceLevel: 'expert',
    safetyScore: 90,
  },
  {
    name: 'Safety Officer Test',
    email: 'safetyofficer@test.com',
    password: 'test123',
    role: 'safety_officer',
    employeeId: 'EMP003',
    phone: '9876543212',
    department: 'HSE',
    isEmailVerified: true,
    isActive: true,
    experienceLevel: 'senior',
    safetyScore: 80,
  },
  {
    name: 'Management Test',
    email: 'management@test.com',
    password: 'test123',
    role: 'management',
    employeeId: 'EMP004',
    phone: '9876543213',
    department: 'Management',
    isEmailVerified: true,
    isActive: true,
    experienceLevel: 'expert',
    safetyScore: 85,
  },
];

const runSeed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    await User.deleteMany({});
    console.log('🗑️  Cleared existing users');

    for (const userData of seedUsers) {
      const user = new User(userData);
      await user.save();
      console.log(`✅ Created: ${user.email} (${user.role} - ${user.experienceLevel})`);
    }

    console.log('\n─────────────────────────────────────────');
    console.log('  LOGIN CREDENTIALS');
    console.log('─────────────────────────────────────────');
    seedUsers.forEach((u) => {
      console.log(`  ${u.role.padEnd(15)} ${u.email.padEnd(28)} test123`);
    });
    console.log('─────────────────────────────────────────');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
};

runSeed();