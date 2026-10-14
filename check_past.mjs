import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
mongoose.connect(process.env.MONGO_URI).then(async()=>{
  const Expo = (await import('./models/Expo.js')).default;
  const today=new Date();today.setHours(0,0,0,0);
  const past=await Expo.find({date:{$lt:today}});
  console.log(past.length);
  process.exit(0);
}).catch(e=>{console.error(e.message);process.exit(1);});
