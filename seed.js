/**
 * Seed script — fills the database with demo data so the project can be
 * shown/evaluated immediately.
 *
 * Usage:  npm run seed        (adds/updates demo records)
 *         node seed.js --fresh (wipes all collections first)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const User = require('./models/User')
const Expo = require('./models/Expo')
const Booth = require('./models/Booth')
const Session = require('./models/Session')
const Exhibitor = require('./models/Exhibitor')
const Booking = require('./models/Booking')
const Feedback = require('./models/Feedback')
const Announcement = require('./models/Announcement')

const DAY = 24 * 60 * 60 * 1000
const at = (days, hour) => {
  const d = new Date(Date.now() + days * DAY)
  d.setHours(hour, 0, 0, 0)
  return d
}

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventsphere')
  console.log('MongoDB connected for seeding')

  if (process.argv.includes('--fresh')) {
    await Promise.all([
      User.deleteMany({}), Expo.deleteMany({}), Booth.deleteMany({}),
      Session.deleteMany({}), Exhibitor.deleteMany({}), Booking.deleteMany({}),
      Feedback.deleteMany({}), Announcement.deleteMany({})
    ])
    console.log('Existing collections cleared')
  }

  const hash = (p) => bcrypt.hash(p, 10)

  // ---------- Users (one per role) ----------
  const [admin, exhibitorUser, attendee] = await Promise.all([
    User.findOneAndUpdate(
      { email: 'admin@eventsphere.com' },
      { name: 'Alex Organizer', email: 'admin@eventsphere.com', password: await hash('Admin@123'), role: 'admin', isVerified: true },
      { upsert: true, new: true }
    ),
    User.findOneAndUpdate(
      { email: 'exhibitor@eventsphere.com' },
      { name: 'Priya Exhibitor', email: 'exhibitor@eventsphere.com', password: await hash('Exhibitor@123'), role: 'exhibitor', isVerified: true },
      { upsert: true, new: true }
    ),
    User.findOneAndUpdate(
      { email: 'attendee@eventsphere.com' },
      { name: 'Sam Attendee', email: 'attendee@eventsphere.com', password: await hash('Attendee@123'), role: 'attendee', isVerified: true },
      { upsert: true, new: true }
    )
  ])
  console.log('Users ready (admin@ / exhibitor@ / attendee@eventsphere.com)')

  // ---------- Expos ----------
  const expos = await Promise.all([
    Expo.findOneAndUpdate(
      { title: 'Global Tech Expo 2026' },
      {
        title: 'Global Tech Expo 2026',
        date: at(20, 9),
        location: 'ExCeL London, Royal Victoria Dock, London, United Kingdom',
        lat: 51.5074,
        lng: 0.0300,
        theme: 'AI, Cloud & Robotics',
        image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1600&q=80',
        description: 'Three days of keynotes, product launches and live demos from 300+ technology companies.',
        organizer: admin._id
      },
      { upsert: true, new: true }
    ),
    Expo.findOneAndUpdate(
      { title: 'Green Energy Summit' },
      {
        title: 'Green Energy Summit',
        date: at(45, 10),
        location: 'Dubai World Trade Centre, Sheikh Zayed Road, Dubai, UAE',
        lat: 25.2285,
        lng: 55.2852,
        theme: 'Sustainability & Renewables',
        image: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=1600&q=80',
        description: 'A summit for renewable energy leaders, investors and start-ups reshaping the grid.',
        organizer: admin._id
      },
      { upsert: true, new: true }
    )
  ])
  const expo = expos[0]
  console.log('Expos ready')

  // ---------- Booths ----------
  await Booth.deleteMany({ expo: expo._id })
  const booths = await Booth.insertMany(
    ['A1', 'A2', 'A3', 'B1', 'B2', 'C1'].map((number, i) => ({
      expo: expo._id,
      number,
      size: i % 3 === 0 ? 'Large' : i % 3 === 1 ? 'Medium' : 'Small',
      status: 'available'
    }))
  )
  console.log(`Booths ready (${booths.length})`)

  // ---------- Sessions ----------
  await Session.deleteMany({ expo: expo._id })
  const sessions = await Session.insertMany([
    {
      expo: expo._id, title: 'Opening Keynote: The AI Decade', speaker: 'Dr. Maya Chen',
      topic: 'How generative AI changes product teams.', location: 'Main Hall',
      capacity: 2, startTime: at(20, 10), endTime: at(20, 11)
    },
    {
      expo: expo._id, title: 'Cloud Cost Optimisation Clinic', speaker: 'Rahul Verma',
      topic: 'Practical ways to cut cloud spend.', location: 'Hall B',
      capacity: 50, startTime: at(20, 12), endTime: at(20, 13)
    },
    {
      expo: expo._id, title: 'Robotics Demo Stage', speaker: 'Team Atlas',
      topic: 'Live autonomous robot demos.', location: 'Demo Zone',
      capacity: 0, startTime: at(21, 11), endTime: at(21, 13)
    }
  ])
  console.log(`Sessions ready (${sessions.length})`)

  // ---------- Exhibitor profile (approved) ----------
  const exhibitor = await Exhibitor.findOneAndUpdate(
    { user: exhibitorUser._id, expo: expo._id },
    {
      user: exhibitorUser._id,
      expo: expo._id,
      company: 'Nimbus Robotics',
      description: 'Autonomous warehouse robots and vision systems.',
      products: 'PickBot X1, VisionGrid SDK',
      contact: 'hello@nimbusrobotics.com',
      logo: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=300&q=80',
      status: 'approved'
    },
    { upsert: true, new: true }
  )

  // Give the demo exhibitor a reserved booth
  await Booth.findOneAndUpdate(
    { expo: expo._id, number: 'A1' },
    { status: 'reserved', exhibitor: exhibitorUser._id }
  )

  // ---------- Attendee booking + feedback ----------
  await Booking.findOneAndUpdate(
    { user: attendee._id, session: sessions[1]._id },
    { user: attendee._id, expo: expo._id, session: sessions[1]._id },
    { upsert: true, new: true }
  )

  await Feedback.findOneAndUpdate(
    { user: attendee._id, message: 'Loved the agenda page — please add a downloadable timetable.' },
    {
      user: attendee._id,
      type: 'suggestion',
      message: 'Loved the agenda page — please add a downloadable timetable.',
      reply: 'Great idea! A PDF export is on our roadmap.',
      repliedAt: new Date(),
      status: 'resolved'
    },
    { upsert: true, new: true }
  )

  if (expo) {
    await Announcement.deleteMany({ expo: expo._id })
    await Announcement.create({
      expo: expo._id,
      author: admin._id,
      title: 'Doors open at 9:00 AM',
      message: 'Registration desks are in the North Foyer. Bring your QR confirmation email.'
    })
  }

  console.log('Demo exhibitor, booking, feedback and announcement ready')
  console.log('\nLogin credentials:')
  console.log('  Admin      admin@eventsphere.com      / Admin@123')
  console.log('  Exhibitor  exhibitor@eventsphere.com  / Exhibitor@123')
  console.log('  Attendee   attendee@eventsphere.com   / Attendee@123')

  await mongoose.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
