require('dotenv').config()
const mongoose = require('mongoose')

let connectionPromise = null

/**
 * Connects to MongoDB exactly once and caches the promise.
 * On a serverless host (Vercel) several cold-start requests can arrive at the
 * same time — all of them await the same connection instead of opening many.
 */
const connectDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose)
  if (!connectionPromise) {
    

    connectionPromise = mongoose
      .connect('mongodb+srv://mehdi123:mehdi123@cluster0.2xfen46.mongodb.net/E-project?retryWrites=true&w=majority&appName=Cluster0')
      .then(() => {
        console.log('MongoDB connected')
        return mongoose
      })
      .catch((err) => {
        console.error('MongoDB error:', err.message)
        connectionPromise = null // allow a retry on the next request
        throw err
      })
  }
  return connectionPromise
}

module.exports = connectDB
