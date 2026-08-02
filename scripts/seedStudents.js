require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Class = require('../models/Class');
const Student = require('../models/Student');

const firstNames = [
  'Aarav', 'Bipul', 'Chiring', 'Dipesh', 'Elina',
  'Gaurav', 'Isha', 'Kushal', 'Manish', 'Nisha',
  'Pooja', 'Rohan', 'Sankalpa', 'Trishna', 'Umesh'
];

const lastNames = [
  'Sharma', 'Shrestha', 'Thapa', 'Karki', 'Adhikari',
  'Rai', 'Gurung', 'Tamang', 'Bhattarai', 'Maharjan'
];

const fatherNames = [
  'Ram Bahadur', 'Shyam Prasad', 'Hari Kumar', 'Bishnu Prasad', 'Krishna Man',
  'Ganesh Prasad', 'Deepak Kumar', 'Suresh Man', 'Rameshwor', 'Tek Bahadur'
];

const seedStudents = async () => {
  try {
    // If process.env.MONGO_URI is missing, try process.env.DATABASE_URL or fallback
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'ypss_school_secret_key_2026';
    await connectDB();

    // Drop legacy unique index on admissionNo if it exists
    try {
      await Student.collection.dropIndex('admissionNo_1');
      console.log('Dropped legacy index admissionNo_1');
    } catch (e) {
      // Index did not exist or already dropped
    }

    const classes = await Class.find({}).sort({ name: 1 });
    if (!classes.length) {
      console.log('No classes found in database! Creating standard default classes first...');
      const defaultClasses = [
        'Nursery', 'LKG', 'UKG',
        'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
        'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
      ];
      for (const className of defaultClasses) {
        await Class.create({ name: className, subjects: [] });
      }
    }

    const allClasses = await Class.find({}).sort({ name: 1 });
    console.log(`Found ${allClasses.length} classes in database. Creating 10 students for each class...`);

    let createdCount = 0;
    let existingCount = 0;

    for (const classItem of allClasses) {
      const cleanClassName = classItem.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      for (let i = 1; i <= 10; i++) {
        const rollStr = String(i);
        const username = `student_${cleanClassName}_${i < 10 ? '0' + i : i}`;
        
        // Check if user or student already exists
        let existingUser = await User.findOne({ username });

        if (!existingUser) {
          const fname = firstNames[(i + allClasses.indexOf(classItem)) % firstNames.length];
          const lname = lastNames[(i * 3) % lastNames.length];
          const fullName = `${fname} ${lname}`;
          const father = `${fatherNames[(i + allClasses.indexOf(classItem)) % fatherNames.length]} ${lname}`;

          const user = await User.create({
            name: fullName,
            username,
            password: 'password123',
            role: 'student',
            phone: `9841${Math.floor(100000 + Math.random() * 900000)}`,
          });

          await Student.create({
            user: user._id,
            class: classItem._id,
            rollNumber: rollStr,
            fatherName: father,
            admissionNo: `ADM-${cleanClassName}-${i}`,
            academicYear: '2026',
          });

          createdCount++;
        } else {
          // Ensure student record exists for existing user
          const existingStudent = await Student.findOne({ user: existingUser._id });
          if (!existingStudent) {
            const lname = lastNames[(i * 3) % lastNames.length];
            const father = `${fatherNames[(i + allClasses.indexOf(classItem)) % fatherNames.length]} ${lname}`;
            await Student.create({
              user: existingUser._id,
              class: classItem._id,
              rollNumber: rollStr,
              fatherName: father,
              admissionNo: `ADM-${cleanClassName}-${i}`,
              academicYear: '2026',
            });
            createdCount++;
          } else {
            existingCount++;
          }
        }
      }
      console.log(`✓ Processed 10 students for class ${classItem.name}`);
    }

    console.log('\n==================================================');
    console.log(`🎉 STUDENT SEEDING COMPLETE!`);
    console.log(`New Students Created: ${createdCount}`);
    console.log(`Existing Students Preserved: ${existingCount}`);
    console.log(`Total Students Active: ${createdCount + existingCount}`);
    console.log('==================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding students:', error);
    process.exit(1);
  }
};

seedStudents();
